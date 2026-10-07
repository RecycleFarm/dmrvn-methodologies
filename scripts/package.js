'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { ethers } = require('ethers');
const wabtFactory = require('wabt');
const { Worker } = require('node:worker_threads');
const { assertBoundedWasmMemory } = require('./wasm-limits');

function canonicalize(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error('Invalid Unicode');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error('Safe integers only');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${canonicalize(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error('Plain JSON only');
}
const hashJson = value => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(canonicalize(value)));

async function compile(source) {
  const wabt = await wabtFactory();
  const module = wabt.parseWat('methodology.wat', source);
  try {
    module.validate();
    return Buffer.from(module.toBinary({ canonicalize_lebs: true, write_debug_names: false }).buffer);
  } finally { module.destroy(); }
}

async function verifyPackage({ manifest, wasmBytes, policy, vectors }) {
  if (wasmBytes.length > 65536 || !WebAssembly.validate(wasmBytes)) throw new Error('Invalid or oversized WASM');
  assertBoundedWasmMemory(wasmBytes);
  if (ethers.utils.keccak256(wasmBytes) !== manifest.wasmHash) throw new Error('WASM hash mismatch');
  if (manifest.evidenceValidation?.kind === 'DECLARED_INPUTS_V1') {
    if (manifest.evidenceValidation.version !== 1 || manifest.evidenceSchema !== 'PARTNER_DECLARED_INPUTS_V1'
      || manifest.devicePolicyHash || policy) throw new Error('Invalid declared-input validation profile');
  } else if (!policy || hashJson(policy) !== manifest.devicePolicyHash) throw new Error('Policy hash mismatch');
  if (manifest.runtime.kind !== 'WASM_V1' || manifest.runtime.abiVersion !== 1 || manifest.runtime.export !== 'compute') throw new Error('Unsupported ABI');
  const module = await WebAssembly.compile(wasmBytes);
  if (WebAssembly.Module.imports(module).length) throw new Error('Imports are not allowed');
  if (!Array.isArray(vectors) || vectors.length === 0 || vectors.length > 100) throw new Error('Provide 1..100 test vectors');
  const argsOrder = manifest.runtime.inputOrder;
  if (!Array.isArray(argsOrder) || !argsOrder.length || argsOrder.length > 8
    || new Set(argsOrder).size !== argsOrder.length) throw new Error('Invalid input order');
  for (const vector of vectors) {
    const args = argsOrder.map(name => {
      const n = vector.inputs[name]; const schema = manifest.inputSchema[name];
      if (!schema || schema.type !== 'integer' || !Number.isSafeInteger(n) || n < 0 || n > 2147483647
        || n < schema.min || n > schema.max) throw new Error(`Invalid input: ${name}`);
      return n;
    });
    const actual = await execute(wasmBytes, args);
    if (actual !== vector.expected) throw new Error(`Vector mismatch: ${JSON.stringify(vector.inputs)} expected=${vector.expected} actual=${actual}`);
  }
  return { methodologyHash: hashJson(manifest), wasmHash: manifest.wasmHash, vectors: vectors.length };
}

async function execute(bytes, args) {
  const worker = new Worker(path.join(__dirname, 'execute-worker.js'), { workerData: { bytes, args },
    resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 } });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WASM execution timed out')), 1000);
      worker.once('message', message => { clearTimeout(timer);
        if (message.error) reject(new Error(message.error)); else resolve(message.value); });
      worker.once('error', error => { clearTimeout(timer); reject(error); });
      worker.once('exit', code => { if (code !== 0) { clearTimeout(timer); reject(new Error(`WASM worker exited: ${code}`)); } });
    });
  } finally { await worker.terminate(); }
}

async function buildPackage(sourceDir, policyFile) {
  const [definition, source, vectors, policy] = await Promise.all([
    fs.readFile(path.join(sourceDir, 'definition.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(sourceDir, 'methodology.wat'), 'utf8'),
    fs.readFile(path.join(sourceDir, 'vectors.json'), 'utf8').then(JSON.parse),
    policyFile ? fs.readFile(policyFile, 'utf8').then(JSON.parse) : Promise.resolve(null),
  ]);
  const wasmBytes = await compile(source);
  const manifest = { ...definition, wasmHash: ethers.utils.keccak256(wasmBytes),
    ...(policy ? { devicePolicyHash: hashJson(policy) } : {}) };
  const verification = await verifyPackage({ manifest, wasmBytes, policy, vectors });
  return { manifest, wasmBytes, policy, vectors, verification, buildInfo: {
    compiler: 'wabt', compilerVersion: require('wabt/package.json').version,
    options: { canonicalize_lebs: true, write_debug_names: false },
    sourceHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(source)),
    definitionHash: hashJson(definition), ...verification,
  } };
}
module.exports = { canonicalize, hashJson, compile, verifyPackage, buildPackage };
