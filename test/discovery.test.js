'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { discoverPackages, verifyAll } = require('../scripts/verify-all');
const { updateCatalog } = require('../scripts/update-build-catalog');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dmrvn-discovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  async function add(category, id, version) {
    const dir = path.join(root, 'methodologies', category, `${id}-v${version}`);
    await fs.cp(path.join(__dirname, '../methodologies/tumbler/2001-v3'), dir, { recursive: true });
    const definition = JSON.parse(await fs.readFile(path.join(dir, 'definition.json'), 'utf8'));
    definition.methodology = { id, version };
    await fs.writeFile(path.join(dir, 'definition.json'), JSON.stringify(definition));
    await fs.writeFile(path.join(dir, 'package-config.json'), JSON.stringify({ policyFile: 'device-policy.json' }));
    await fs.writeFile(path.join(dir, 'device-policy.json'), JSON.stringify({ testOnly: true }));
    return dir;
  }
  return { root, add };
}
test('discovers and verifies every version and category without a hardcoded list', async t => {
  const { root, add } = await fixture(t);
  await add('tumbler', 2001, 3); await add('tumbler', 2001, 4); await add('new-category', 3001, 1);
  assert.equal((await discoverPackages(root)).length, 3);
  assert.equal(await verifyAll(root), 3);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'dist/new-category/3001-v1/manifest.json'), 'utf8')).methodology.id, 3001);
});
test('fails instead of silently skipping an incomplete methodology', async t => {
  const { root, add } = await fixture(t); const dir = await add('tumbler', 2001, 3);
  await fs.unlink(path.join(dir, 'vectors.json'));
  await assert.rejects(discoverPackages(root), /Incomplete methodology/);
});
test('rejects duplicate identities and policies outside the repository', async t => {
  const { root, add } = await fixture(t); const first = await add('tumbler', 2001, 3);
  const duplicate = await add('other', 2001, 3);
  await assert.rejects(discoverPackages(root), /Duplicate methodology/);
  await fs.rm(duplicate, { recursive: true });
  await fs.writeFile(path.join(first, 'package-config.json'), JSON.stringify({ policyFile: '../../../../outside.json' }));
  await assert.rejects(discoverPackages(root), /inside repository/);
});
test('rejects an empty registry and missing policy files', async t => {
  const { root, add } = await fixture(t);
  await fs.mkdir(path.join(root, 'methodologies'));
  await assert.rejects(discoverPackages(root), /No methodologies found/);
  const dir = await add('tumbler', 2001, 3);
  await fs.unlink(path.join(dir, 'device-policy.json'));
  await assert.rejects(discoverPackages(root), { code: 'ENOENT' });
});
test('rejects invalid identities and malformed WASM source', async t => {
  const { root, add } = await fixture(t);
  const dir = await add('tumbler', 2001, 0);
  await assert.rejects(discoverPackages(root), /Invalid methodology identity/);
  await fs.rm(dir, { recursive: true });
  const valid = await add('tumbler', 2001, 3);
  await fs.writeFile(path.join(valid, 'methodology.wat'), '(module invalid)');
  await assert.rejects(verifyAll(root), /parseWat/);
});
test('rejects changed calculations until expected vectors are updated', async t => {
  const { root, add } = await fixture(t);
  const dir = await add('tumbler', 2001, 4);
  const file = path.join(dir, 'methodology.wat');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('i32.const 20', 'i32.const 24'));
  await assert.rejects(verifyAll(root), /vector/i);
  const vectors = JSON.parse(await fs.readFile(path.join(dir, 'vectors.json'), 'utf8'));
  for (const vector of vectors) vector.expected = Math.floor(vector.inputs.waterIntakeMl / 500) * 24;
  await fs.writeFile(path.join(dir, 'vectors.json'), JSON.stringify(vectors));
  assert.equal(await verifyAll(root), 1);
});
test('real verification CLI exits successfully or fails the job on bad vectors', async t => {
  const { root, add } = await fixture(t);
  const dir = await add('tumbler', 2001, 3);
  await fs.cp(path.join(__dirname, '../scripts'), path.join(root, 'scripts'), { recursive: true });
  await fs.symlink(path.join(__dirname, '../node_modules'), path.join(root, 'node_modules'), 'dir');
  const run = () => spawnSync(process.execPath, ['scripts/verify-all.js'], {
    cwd: root, encoding: 'utf8', timeout: 20000,
  });
  const success = run();
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /All methodology packages verified \| count=1/);
  await fs.writeFile(path.join(dir, 'vectors.json'), JSON.stringify([
    { inputs: { waterIntakeMl: 850 }, expected: 999 },
  ]));
  const failure = run();
  assert.equal(failure.status, 1, failure.stdout);
  assert.match(failure.stderr, /\[ERROR\]/);
});
test('publishes verified WASM files and updates only the README catalog', async t => {
  const { root, add } = await fixture(t);
  await add('tumbler', 2001, 3);
  await verifyAll(root);
  await fs.writeFile(path.join(root, 'README.md'), 'Intro\n<!-- builds:start -->\nold\n<!-- builds:end -->\nFooter\n');
  const metadata = { builtAt: '2026-10-06T00:00:00.000Z', sourceCommit: 'abc123', nodeVersion: 'v22', runUrl: 'https://github.com/example/repo/actions/runs/1' };
  const result = await updateCatalog(root, metadata);
  assert.equal(result.packages.length, 1);
  const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /^Intro\n/);
  assert.match(readme, /Footer\n$/);
  assert.match(readme, /2001\/v3/);
  assert.match(readme, /abc123/);
  assert.match(readme, /2026-10-06T00:00:00.000Z/);
  const module = await fs.readFile(path.join(root, 'builds/tumbler/2001-v3/methodology.wasm'));
  assert.deepEqual(module, await fs.readFile(path.join(root, 'dist/tumbler/2001-v3/methodology.wasm')));
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'builds/catalog.json'), 'utf8')).sourceCommit, 'abc123');
  await updateCatalog(root, metadata);
  assert.equal(await fs.readFile(path.join(root, 'README.md'), 'utf8'), readme);
});
test('does not publish a corrupted WASM package or update the README', async t => {
  const { root, add } = await fixture(t);
  await add('tumbler', 2001, 3);
  await verifyAll(root);
  const original = '<!-- builds:start -->\nold\n<!-- builds:end -->';
  await fs.writeFile(path.join(root, 'README.md'), original);
  await fs.writeFile(path.join(root, 'dist/tumbler/2001-v3/methodology.wasm'), Buffer.from('invalid'));
  await assert.rejects(updateCatalog(root, {}));
  assert.equal(await fs.readFile(path.join(root, 'README.md'), 'utf8'), original);
  await assert.rejects(fs.access(path.join(root, 'builds')), { code: 'ENOENT' });
});
