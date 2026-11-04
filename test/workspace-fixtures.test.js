'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { utils } = require('ethers');
const { syncWorkspaceFixtures } = require('../scripts/sync-workspace-fixtures');

const packages = [
  {
    source: 'pet/2003-v3', identity: { id: 2003, version: 3 },
    targets: [
      'recyclefarm-serverless/functions/tests/fixtures/dmrvn-json-abi/pet/2003-v3',
      'recyclefarm-attestor-desktop/tests/fixtures/json-methodologies/pet-2003-v3',
    ],
  },
  {
    source: 'solar/2004-v2', identity: { id: 2004, version: 2 },
    targets: [
      'recyclefarm-serverless/functions/tests/fixtures/dmrvn-json-abi/solar/2004-v2',
      'recyclefarm-attestor-desktop/tests/fixtures/json-methodologies/solar-2004-v2',
    ],
  },
  {
    source: 'tumbler/2001-v4', identity: { id: 2001, version: 4 },
    targets: [
      'recyclefarm-serverless/functions/tests/fixtures/dmrvn-json-abi/tumbler/2001-v4',
      'recyclefarm-attestor-desktop/tests/fixtures/json-methodologies/tumbler-2001-v4',
    ],
  },
];

test('syncs exact verified package bytes to serverless and Attestor fixtures and detects later drift', async t => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dmrvn-workspace-fixtures-'));
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const repositoryRoot = path.join(temporaryRoot, 'dmrvn-methodologies');
  const workspaceRoot = path.join(temporaryRoot, 'workspace');

  for (const [index, item] of packages.entries()) {
    const sourceDirectory = path.join(repositoryRoot, 'dist', item.source);
    await fs.mkdir(sourceDirectory, { recursive: true });
    const wasm = Buffer.from(`verified-wasm-${index}`);
    const manifest = {
      methodology: item.identity,
      wasmHash: utils.keccak256(wasm),
      ...(item.identity.id === 2001 ? { devicePolicyHash: '0xpolicy' } : {}),
    };
    await fs.writeFile(path.join(sourceDirectory, 'manifest.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(sourceDirectory, 'methodology.wasm'), wasm);
    await fs.writeFile(path.join(sourceDirectory, 'vectors.json'), '[]');
    if (item.identity.id === 2001) await fs.writeFile(path.join(sourceDirectory, 'device-policy.json'), '{"kind":"test-policy"}');
  }

  await syncWorkspaceFixtures({ repositoryRoot, workspaceRoot });
  await syncWorkspaceFixtures({ repositoryRoot, workspaceRoot, check: true });

  const staleFixture = path.join(workspaceRoot, packages[0].targets[0], 'methodology.wasm');
  await fs.writeFile(staleFixture, 'stale');
  await assert.rejects(
    syncWorkspaceFixtures({ repositoryRoot, workspaceRoot, check: true }),
    /Fixture drift/,
  );
  const syncedPolicy = path.join(workspaceRoot, packages[2].targets[0], 'device-policy.json');
  assert.equal(await fs.readFile(syncedPolicy, 'utf8'), '{"kind":"test-policy"}');
});
