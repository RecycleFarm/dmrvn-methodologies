'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { ethers } = require('ethers');
const Ajv2020 = require('ajv/dist/2020').default;
const { assertBoundedWasmMemory } = require('./wasm-limits');
const { resolveBuildToolchain } = require('./rust-toolchain');

const JSON_SCHEMA_URI = 'https://json-schema.org/draft/2020-12/schema';
const MAX_WASM_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const ajv = new Ajv2020({ strict: true, allErrors: false, validateFormats: false });

function canonicalize(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error('JSON numbers must be safe integers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error('Expected plain JSON data');
}

const hashJson = value => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(canonicalize(value)));
const hashBytes = value => ethers.utils.keccak256(value);

function validator(schema) {
  if (!schema || schema.$schema !== JSON_SCHEMA_URI || schema.type !== 'object') {
    throw new Error('JSON WASM input/output schemas must be draft 2020-12 object schemas');
  }
  const walk = (value, visited = new Set()) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) return value.forEach(child => walk(child, visited));
    for (const [key, child] of Object.entries(value)) {
      if ((key === '$ref' || key === '$dynamicRef') && (typeof child !== 'string' || !child.startsWith('#')))
        throw new Error('Remote JSON Schema references are forbidden');
      walk(child, visited);
    }
  };
  walk(schema);
  return ajv.compile(schema);
}

function runWasm(wasmBytes, inputBytes, timeoutMs = 1000) {
  const worker = new Worker(path.join(__dirname, 'json-abi-worker.js'), { workerData: { wasmBytes, inputBytes },
    resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 } });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`JSON WASM vector timed out after ${timeoutMs}ms`)), timeoutMs);
    worker.once('message', message => {
      clearTimeout(timer);
      if (message && !ArrayBuffer.isView(message) && message.error) reject(new Error(message.error));
      else resolve(Buffer.from(message));
    });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => {
      if (code !== 0) { clearTimeout(timer); reject(new Error(`JSON WASM worker exited with code ${code}`)); }
    });
  }).finally(() => worker.terminate());
}

async function verifyPackage({ manifest, wasmBytes, vectors }) {
  if (!Buffer.isBuffer(wasmBytes) || wasmBytes.length === 0 || wasmBytes.length > MAX_WASM_BYTES
    || !WebAssembly.validate(wasmBytes)) throw new Error('Invalid or oversized JSON WASM package');
  assertBoundedWasmMemory(wasmBytes);
  if (hashBytes(wasmBytes).toLowerCase() !== String(manifest.wasmHash).toLowerCase()) throw new Error('WASM hash mismatch');
  if (manifest.schemaVersion !== 2 || manifest.evidenceSchema !== 'DMRVN_EVIDENCE_V4'
    || manifest.evidenceValidation?.kind !== 'METHODOLOGY_JSON_SCHEMA_V1' || manifest.evidenceValidation.version !== 1
    || manifest.runtime?.kind !== 'JSON_WASM_V2' || manifest.runtime.abiVersion !== 2
    || manifest.runtime.export !== 'compute' || manifest.devicePolicyHash) throw new Error('Invalid JSON WASM v2 manifest');
  const validateInput = validator(manifest.inputSchema);
  const validateOutput = validator(manifest.outputSchema);
  const module = await WebAssembly.compile(wasmBytes);
  if (WebAssembly.Module.imports(module).length) throw new Error('Methodology WASM imports are forbidden');
  if (!Array.isArray(vectors) || vectors.length < 1 || vectors.length > 100) throw new Error('Provide 1..100 test vectors');
  for (const vector of vectors) {
    if (!vector || !vector.inputs || !validateInput(vector.inputs)) throw new Error('Vector input does not satisfy its JSON Schema');
    if (!vector.expectedOutputs || !validateOutput(vector.expectedOutputs)) throw new Error('Expected output does not satisfy its JSON Schema');
    const inputBytes = Buffer.from(canonicalize(vector.inputs), 'utf8');
    if (inputBytes.length > MAX_JSON_BYTES) throw new Error('JSON WASM input exceeds 512 KiB');
    const outputBytes = await runWasm(wasmBytes, inputBytes);
    if (!outputBytes.length || outputBytes.length > MAX_JSON_BYTES) throw new Error('JSON WASM output exceeds 512 KiB');
    const outputText = new TextDecoder('utf-8', { fatal: true }).decode(outputBytes);
    const actual = JSON.parse(outputText);
    if (canonicalize(actual) !== outputText) throw new Error('WASM output must be canonical JSON without duplicate keys');
    if (!validateOutput(actual)) throw new Error('WASM output does not satisfy its JSON Schema');
    if (canonicalize(actual) !== canonicalize(vector.expectedOutputs)) {
      throw new Error(`JSON WASM vector mismatch for ${JSON.stringify(vector.inputs)}`);
    }
  }
  return { methodologyHash: hashJson(manifest), wasmHash: manifest.wasmHash, vectors: vectors.length };
}

async function readPackageDefinition(sourceDir) {
  const [definition, vectors, config] = await Promise.all([
    fs.readFile(path.join(sourceDir, 'definition.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(sourceDir, 'vectors.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(sourceDir, 'package-config.json'), 'utf8').then(JSON.parse),
  ]);
  const crateDirectoryName = config.jsonAbi?.crateDirectory;
  if (config.jsonAbi?.runtime !== 'JSON_WASM_V2' || typeof crateDirectoryName !== 'string'
    || !crateDirectoryName || path.isAbsolute(crateDirectoryName)) {
    throw new Error(`Invalid JSON WASM crate configuration: ${sourceDir}`);
  }
  const crateDirectory = path.resolve(sourceDir, crateDirectoryName);
  const relativeCrateDirectory = path.relative(sourceDir, crateDirectory);
  if (!relativeCrateDirectory || relativeCrateDirectory.startsWith(`..${path.sep}`) || relativeCrateDirectory === '..') {
    throw new Error(`JSON WASM crate must be inside its methodology package: ${sourceDir}`);
  }
  const [packageRealPath, crateRealPath] = await Promise.all([fs.realpath(sourceDir), fs.realpath(crateDirectory)]);
  const realRelativeCrateDirectory = path.relative(packageRealPath, crateRealPath);
  if (!realRelativeCrateDirectory || realRelativeCrateDirectory.startsWith(`..${path.sep}`) || realRelativeCrateDirectory === '..') {
    throw new Error(`JSON WASM crate must resolve inside its methodology package: ${sourceDir}`);
  }
  const crate = path.join(crateDirectory, 'Cargo.toml');
  await fs.access(crate);
  if (definition.runtime?.kind !== 'JSON_WASM_V2') throw new Error(`Expected JSON_WASM_V2 definition: ${sourceDir}`);
  const { id, version } = definition.methodology || {};
  if (![id, version, definition.activityId].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error(`Invalid JSON WASM methodology identity: ${sourceDir}`);
  }
  return { definition, vectors, crate, crateDirectory, config };
}

function findCdylibTarget(cargo, manifestPath, env) {
  const metadata = commandOutput(cargo,
    ['metadata', '--no-deps', '--format-version', '1', '--manifest-path', manifestPath], 'Cargo metadata', { env });
  const parsed = JSON.parse(metadata);
  const manifest = path.resolve(manifestPath);
  const cargoPackage = parsed.packages?.find(item => path.resolve(item.manifest_path) === manifest);
  const targets = cargoPackage?.targets?.filter(item => item.crate_types?.includes('cdylib')) || [];
  if (targets.length !== 1 || !targets[0].name) throw new Error(`Methodology crate must define exactly one cdylib target: ${manifestPath}`);
  return targets[0].name;
}

async function buildPackage(sourceDir, root, options = {}) {
  const { definition, vectors, crate, crateDirectory, config } = await readPackageDefinition(sourceDir);
  const packageRelative = path.relative(path.join(root, 'methodologies'), sourceDir);
  const targetBase = process.env.DMRVN_WASM_TARGET_DIR
    ? path.resolve(root, process.env.DMRVN_WASM_TARGET_DIR) : path.join(crateDirectory, 'target');
  const targetDirectory = process.env.DMRVN_WASM_TARGET_DIR
    ? path.join(targetBase, packageRelative) : targetBase;
  const toolchain = await resolveBuildToolchain(path.join(root, 'wasm', 'json-abi'), options);
  const cargo = options.cargo || toolchain.cargo;
  const cargoHome = process.env.DMRVN_CARGO_HOME
    ? path.resolve(root, process.env.DMRVN_CARGO_HOME) : path.join(root, '.cargo-home');
  const env = { ...process.env, CARGO_HOME: cargoHome,
    CARGO_TARGET_DIR: targetDirectory,
    CARGO_ENCODED_RUSTFLAGS: encodedRustFlags({ root, cargoHome, targetDirectory }) };
  delete env.RUSTFLAGS;
  env.RUSTC = options.rustc || toolchain.rustc;
  const targetName = findCdylibTarget(cargo, crate, env);
  const cargoVersion = commandOutput(cargo, ['--version'], 'Cargo');
  const rustcVersion = commandOutput(env.RUSTC, ['--version'], 'rustc');
  assertPinnedVersion(cargoVersion, 'cargo', toolchain.channel);
  assertPinnedVersion(rustcVersion, 'rustc', toolchain.channel);
  const result = spawnSync(cargo, ['build', '--locked', '--manifest-path', crate, '--target', 'wasm32-unknown-unknown',
    '--release'], {
    cwd: crateDirectory, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Cargo build could not start for ${packageRelative}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`Cargo build failed for ${packageRelative} (exit=${result.status ?? 'unknown'}${result.signal ? `, signal=${result.signal}` : ''}): ${detail || 'no compiler output'}`);
  }
  const target = path.join(targetDirectory, 'wasm32-unknown-unknown', 'release', `${targetName}.wasm`);
  const wasmBytes = await fs.readFile(target);
  assertNoBuildPaths(wasmBytes, { root, cargoHome, targetDirectory });
  const manifest = { ...definition, wasmHash: hashBytes(wasmBytes) };
  const verification = await verifyPackage({ manifest, wasmBytes, vectors });
  const outDir = path.join(root, 'dist', packageRelative);
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(outDir, 'methodology.wasm'), wasmBytes),
    fs.writeFile(path.join(outDir, 'vectors.json'), `${JSON.stringify(vectors, null, 2)}\n`),
    fs.writeFile(path.join(outDir, 'build-info.json'), `${JSON.stringify({ compiler: 'rustc', compilerVersion: rustcVersion,
      cargoVersion, toolchain: toolchain.channel, target: 'wasm32-unknown-unknown', crateDirectory: config.jsonAbi.crateDirectory,
      abiVersion: 2, ...verification }, null, 2)}\n`),
  ]);
  return { outDir, manifest, wasmBytes, verification };
}

function commandOutput(command, args, label, options = {}) {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new Error(`${label} command could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} command failed: ${(result.stderr || result.stdout || '').trim()}`);
  return (result.stdout || '').trim();
}

function assertPinnedVersion(versionOutput, tool, channel) {
  if (!/^\d+\.\d+\.\d+$/.test(channel)) return;
  const actual = new RegExp(`^${tool}\\s+(\\d+\\.\\d+\\.\\d+)\\b`).exec(versionOutput)?.[1];
  if (actual !== channel) throw new Error(`Pinned Rust ${channel} requires ${tool} ${channel}; found ${versionOutput}`);
}

function encodedRustFlags({ root, cargoHome, targetDirectory }) {
  const remaps = [
    [path.resolve(cargoHome), '/cargo'],
    [path.resolve(targetDirectory), '/target'],
    [path.resolve(root), '/dmrvn-methodologies'],
  ].sort(([left], [right]) => left.length - right.length);
  return ['-C', 'link-arg=--max-memory=16777216',
    ...remaps.map(([from, to]) => `--remap-path-prefix=${from}=${to}`)].join('\x1f');
}

function assertNoBuildPaths(wasmBytes, paths) {
  const leaked = Object.entries(paths)
    .filter(([, value]) => value && wasmBytes.includes(Buffer.from(path.resolve(value))))
    .map(([name]) => name);
  if (leaked.length) throw new Error(`WASM contains local build paths: ${leaked.join(', ')}`);
}

async function discoverPackages(root) {
  const found = [];
  const identities = new Set();
  async function visit(directory) {
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    const files = new Set(entries.filter(entry => entry.isFile()).map(entry => entry.name));
    if (files.has('package-config.json')) {
      const config = JSON.parse(await fs.readFile(path.join(directory, 'package-config.json'), 'utf8'));
      if (config.jsonAbi) {
        const { definition } = await readPackageDefinition(directory);
        const identity = `${definition.methodology.id}/v${definition.methodology.version}`;
        if (identities.has(identity)) throw new Error(`Duplicate JSON ABI methodology identity: ${identity}`);
        identities.add(identity);
        found.push(directory);
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) await visit(path.join(directory, entry.name));
    }
  }
  await visit(path.join(root, 'methodologies'));
  return found;
}

async function buildAll(root = path.resolve(__dirname, '..')) {
  const packages = await discoverPackages(root);
  if (!packages.length) throw new Error('No JSON WASM methodology packages found');
  const results = [];
  for (const sourceDir of packages) {
    const result = await buildPackage(sourceDir, root);
    results.push(result);
    console.info(`[INFO] JSON WASM verified | package=${path.relative(root, sourceDir)} | vectors=${result.verification.vectors}`);
  }
  return results;
}

async function verifyBuiltPackage(sourceDir, root) {
  const relative = path.relative(path.join(root, 'methodologies'), sourceDir);
  const outDir = path.join(root, 'dist', relative);
  const [manifest, wasmBytes, vectors] = await Promise.all([
    fs.readFile(path.join(outDir, 'manifest.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(outDir, 'methodology.wasm')),
    fs.readFile(path.join(outDir, 'vectors.json'), 'utf8').then(JSON.parse),
  ]);
  const verification = await verifyPackage({ manifest, wasmBytes, vectors });
  return { outDir, manifest, wasmBytes, verification };
}

async function verifyAllBuilt(root = path.resolve(__dirname, '..')) {
  const packages = await discoverPackages(root);
  if (!packages.length) throw new Error('No JSON WASM methodology packages found');
  const results = [];
  for (const sourceDir of packages) {
    const result = await verifyBuiltPackage(sourceDir, root);
    results.push(result);
    console.info(`[INFO] Existing JSON WASM verified | package=${path.relative(root, sourceDir)} | vectors=${result.verification.vectors}`);
  }
  return results;
}

if (require.main === module) {
  const operation = process.argv.includes('--verify') ? verifyAllBuilt : buildAll;
  operation().catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
}
module.exports = { canonicalize, hashJson, validator, verifyPackage, buildPackage, discoverPackages,
  buildAll, verifyBuiltPackage, verifyAllBuilt, resolveBuildToolchain, assertPinnedVersion, encodedRustFlags,
  assertNoBuildPaths, readPackageDefinition, findCdylibTarget };
