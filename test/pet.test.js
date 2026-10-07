'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildPackage, verifyPackage } = require('../scripts/package');
test('PET builds without a device policy and keeps its fixed hashes', async () => {
  const pkg = await buildPackage(path.join(__dirname, '../methodologies/pet/2003-v1'), null);
  assert.equal(pkg.policy, null);
  assert.equal(pkg.verification.methodologyHash, '0xdcc09ee621f2e388dd858f8f7399dbf2725cbec3526d52b0dd06909da892ff77');
  assert.equal(pkg.manifest.wasmHash, '0x60265f20ca003ae4b20f0bca18f73d0d4e9bb7c9497627d7f680113dac4c91d9');
  for (const value of [0, -1, 1.5, '3', undefined, 100001]) {
    await assert.rejects(verifyPackage({ ...pkg, vectors: [{ inputs: { petBottleCount: value }, expected: 60 }] }), /Invalid input/);
  }
  await assert.rejects(verifyPackage({ ...pkg, policy: {} }), /validation profile/);
  await assert.rejects(verifyPackage({ ...pkg, manifest: { ...pkg.manifest, wasmHash: 'bad' } }), /WASM hash/);
});
