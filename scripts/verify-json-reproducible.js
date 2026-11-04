'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { discoverPackages } = require('./json-abi-package');

const FILES = ['manifest.json', 'methodology.wasm', 'vectors.json', 'build-info.json'];

async function snapshotPackages(root, directory) {
  const packages = await discoverPackages(root);
  if (!packages.length) throw new Error('No JSON WASM methodology packages found');

  for (const source of packages) {
    const relative = path.relative(path.join(root, 'methodologies'), source);
    const built = path.join(root, 'dist', relative);
    const snapshot = path.join(directory, relative);
    await fs.mkdir(snapshot, { recursive: true });
    for (const file of FILES) await fs.copyFile(path.join(built, file), path.join(snapshot, file));
  }
  return packages;
}

function build(root, env) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/json-abi-package.js')], {
    cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`JSON WASM build could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`JSON WASM build failed (exit=${result.status ?? 'unknown'}): ${(result.stderr || result.stdout || '').trim()}`);
  }
}

async function verifyReproducibleBuild(root = path.resolve(__dirname, '..')) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'dmrvn-json-wasm-repro-'));
  try {
    build(root, process.env);
    const snapshotDirectory = path.join(temporaryDirectory, 'baseline');
    const packages = await snapshotPackages(root, snapshotDirectory);
    const cargoHome = process.env.DMRVN_CARGO_HOME
      ? path.resolve(root, process.env.DMRVN_CARGO_HOME) : path.join(root, '.cargo-home');
    const alternateCargoHome = path.join(temporaryDirectory, 'cargo-home');
    const alternateTarget = path.join(temporaryDirectory, 'target');
    await fs.cp(cargoHome, alternateCargoHome, { recursive: true });

    build(root, { ...process.env, DMRVN_CARGO_HOME: alternateCargoHome, DMRVN_WASM_TARGET_DIR: alternateTarget });

    for (const source of packages) {
      const relative = path.relative(path.join(root, 'methodologies'), source);
      const baseline = path.join(snapshotDirectory, relative);
      const rebuilt = path.join(root, 'dist', relative);
      for (const file of FILES) {
        const [expected, actual] = await Promise.all([
          fs.readFile(path.join(baseline, file)), fs.readFile(path.join(rebuilt, file)),
        ]);
        if (!expected.equals(actual)) throw new Error(`Non-reproducible JSON WASM package: ${relative}/${file}`);
      }
      const manifest = JSON.parse(await fs.readFile(path.join(rebuilt, 'manifest.json'), 'utf8'));
      console.info(`[PASS] Reproducible JSON WASM | package=${relative} | wasmHash=${manifest.wasmHash}`);
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  verifyReproducibleBuild().catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
}

module.exports = { verifyReproducibleBuild };
