'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { resolveBuildToolchain } = require('../scripts/rust-toolchain');
const { assertPinnedVersion, encodedRustFlags, assertNoBuildPaths, verifyPackage, verifyBuiltPackage,
  readPackageDefinition } = require('../scripts/json-abi-package');

test('JSON WASM build resolves the repository-pinned Rust toolchain without PATH rustc', async () => {
  const crateDirectory = path.join(__dirname, '../wasm/json-abi');
  const config = await fs.readFile(path.join(crateDirectory, 'rust-toolchain.toml'), 'utf8');
  const channel = /^\s*channel\s*=\s*"([^"]+)"\s*$/m.exec(config)?.[1];
  const resolved = await resolveBuildToolchain(crateDirectory);

  assert.equal(resolved.channel, channel);
  assert.equal(path.basename(path.dirname(resolved.cargo)), 'bin');
  assert.equal(resolved.cargo, path.join(path.dirname(resolved.rustc), process.platform === 'win32' ? 'cargo.exe' : 'cargo'));

  for (const [binary, tool] of [[resolved.cargo, 'cargo'], [resolved.rustc, 'rustc']]) {
    const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotThrow(() => assertPinnedVersion(result.stdout.trim(), tool, channel));
  }
});

test('JSON WASM build rejects a compiler version that differs from the pin', () => {
  assert.throws(() => assertPinnedVersion('cargo 1.84.0 (9fc6b4312 2025-01-07)', 'cargo', '1.85.1'), /requires cargo 1\.85\.1/);
  assert.throws(() => assertPinnedVersion('rustc 1.84.0 (9fc6b4312 2025-01-07)', 'rustc', '1.85.1'), /requires rustc 1\.85\.1/);
});

test('JSON WASM Rust flags remap local paths to stable package paths', () => {
  const flagsA = encodedRustFlags({ root: '/tmp/agent-a/workspace/dmrvn-methodologies',
    cargoHome: '/tmp/agent-a/cargo', targetDirectory: '/tmp/agent-a/target' });
  const flagsB = encodedRustFlags({ root: '/Users/other/project/dmrvn-methodologies',
    cargoHome: '/Users/other/cargo-home', targetDirectory: '/Users/other/target-dir' });

  const remapTargets = flags => flags.split('\x1f')
    .filter(flag => flag.startsWith('--remap-path-prefix='))
    .map(flag => flag.slice(flag.lastIndexOf('=') + 1)).sort();
  assert.deepEqual(flagsA.split('\x1f').filter(flag => !flag.startsWith('--remap-path-prefix=')),
    ['-C', 'link-arg=--max-memory=16777216']);
  assert.deepEqual(remapTargets(flagsA), ['/cargo', '/dmrvn-methodologies', '/target']);
  assert.deepEqual(remapTargets(flagsB), remapTargets(flagsA));
});

test('JSON WASM build rejects artifacts that embed local build paths', () => {
  const paths = { root: '/Users/test/repo', cargoHome: '/Users/test/repo/.cargo-home', targetDirectory: '/tmp/wasm-target' };

  assert.doesNotThrow(() => assertNoBuildPaths(Buffer.from('wasm:/cargo/registry/src'), paths));
  assert.throws(() => assertNoBuildPaths(Buffer.from('wasm:/Users/test/repo/.cargo-home/registry/src'), paths),
    /WASM contains local build paths/);
});

test('tumbler v4 binds its signed-device policy while using the shared JSON WASM ABI', async () => {
  const root = path.join(__dirname, '..');
  const source = path.join(root, 'methodologies/tumbler/2001-v4');
  const definition = await readPackageDefinition(source);
  assert.equal(definition.definition.runtime.kind, 'JSON_WASM_V2');
  assert.equal(definition.definition.evidenceValidation.kind, 'TUMBLER_SIGNED_PAIRS_V1');
  assert.equal(definition.devicePolicy.kind, 'TUMBLER_SIGNED_PAIRS_V1');

  const built = await verifyBuiltPackage(source, root);
  assert.equal(built.verification.vectors, 6);
  assert.ok(built.manifest.devicePolicyHash);
  await assert.rejects(verifyPackage({ manifest: built.manifest, wasmBytes: built.wasmBytes,
    vectors: JSON.parse(await fs.readFile(path.join(built.outDir, 'vectors.json'), 'utf8')),
    devicePolicy: { ...built.devicePolicy, models: {} } }), /Device policy hash mismatch/);
});

test('toolchain setup does not invoke rustup when the pinned toolchain is ready', () => {
  const root = path.join(__dirname, '..');
  const missingRustup = path.join(os.tmpdir(), 'dmrvn-rustup-must-not-run');
  const result = spawnSync(process.execPath, ['scripts/setup-json-wasm-toolchain.js'], {
    cwd: root, env: { ...process.env, RUSTUP: missingRustup }, encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /toolchain already ready/);
});

test('toolchain setup runs without loading npm dependencies', () => {
  const root = path.join(__dirname, '..');
  const setupPath = path.join(root, 'scripts/setup-json-wasm-toolchain.js');
  const source = `
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request !== ${JSON.stringify(setupPath)} && !request.startsWith('node:') && !request.startsWith('.')) {
        throw new Error('Unexpected external module: ' + request);
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    require(${JSON.stringify(setupPath)}).setup().catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  `;
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /toolchain already ready/);
});
