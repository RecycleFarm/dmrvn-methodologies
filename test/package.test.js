'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { compile, verifyPackage, hashJson, buildPackage } = require('../scripts/package');
const { ethers } = require('ethers');
const dir = path.join(__dirname, '../methodologies/tumbler/2001-v3');
test('v3 source is deterministic and calculates all boundary vectors', async () => {
  const source = await fs.readFile(path.join(dir, 'methodology.wat'), 'utf8');
  const bytes = await compile(source);
  assert.deepEqual(bytes, await compile(source));
  const policy = { testOnly: true };
  const definition = JSON.parse(await fs.readFile(path.join(dir, 'definition.json'), 'utf8'));
  const manifest = { ...definition, wasmHash: ethers.utils.keccak256(bytes), devicePolicyHash: hashJson(policy) };
  const vectors = JSON.parse(await fs.readFile(path.join(dir, 'vectors.json'), 'utf8'));
  assert.equal((await verifyPackage({ manifest, wasmBytes: bytes, policy, vectors })).vectors, 6);
  await assert.rejects(verifyPackage({ manifest, wasmBytes: Buffer.from([0]), policy, vectors }), /Invalid|hash/);
  await assert.rejects(verifyPackage({ manifest, wasmBytes: bytes, policy: {}, vectors }), /Policy hash/);
  await assert.rejects(verifyPackage({ manifest, wasmBytes: bytes, policy, vectors: [{ inputs: { waterIntakeMl: 850 }, expected: 24 }] }), /Vector mismatch/);
});
test('hash uses sorted JSON and rejects ambiguous values', () => {
  assert.equal(hashJson({ b: 2, a: 1 }), hashJson({ a: 1, b: 2 }));
  for (const bad of [undefined, NaN, -0, { n: undefined }, '\ud800']) assert.throws(() => hashJson(bad));
});
test('public v3 baseline reproduces the approved manifest and exact WASM bytes', async () => {
  const baseline = path.join(__dirname, '../packages/tumbler-2001-v3');
  const built = await buildPackage(dir, path.join(baseline, 'device-policy.json'));
  const approvedManifest = JSON.parse(await fs.readFile(path.join(baseline, 'manifest.json'), 'utf8'));
  const publication = JSON.parse(await fs.readFile(path.join(baseline, 'publication.json'), 'utf8'));
  assert.deepEqual(built.wasmBytes, await fs.readFile(path.join(baseline, 'methodology.wasm')));
  assert.equal(built.verification.methodologyHash, hashJson(approvedManifest));
  assert.equal(built.verification.methodologyHash, publication.methodologyHash);
});
test('rejects unbounded memory and terminates an infinite computation', async () => {
  const definition = JSON.parse(await fs.readFile(path.join(dir, 'definition.json'), 'utf8'));
  const policy = { testOnly: true };
  const vectors = [{ inputs: { waterIntakeMl: 850 }, expected: 20 }];
  const unbounded = await compile('(module (memory 1) (func (export "compute") (param i32) (result i32) i32.const 20))');
  await assert.rejects(verifyPackage({ manifest: { ...definition, wasmHash: ethers.utils.keccak256(unbounded),
    devicePolicyHash: hashJson(policy) }, wasmBytes: unbounded, policy, vectors }), /maximum required/);
  const infinite = await compile('(module (func (export "compute") (param i32) (result i32) (loop $forever br $forever) i32.const 0))');
  await assert.rejects(verifyPackage({ manifest: { ...definition, wasmHash: ethers.utils.keccak256(infinite),
    devicePolicyHash: hashJson(policy) }, wasmBytes: infinite, policy, vectors }), /timed out/);
});
