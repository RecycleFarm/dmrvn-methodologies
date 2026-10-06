'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { verifyPackage } = require('./package');
async function main() {
  if (!process.argv[2]) throw new Error('Usage: npm run verify -- <package-directory>');
  const dir = path.resolve(process.argv[2]);
  const json = name => fs.readFile(path.join(dir, name), 'utf8').then(JSON.parse);
  const [manifest, wasmBytes, policy, vectors] = await Promise.all([
    json('manifest.json'), fs.readFile(path.join(dir, 'methodology.wasm')), json('device-policy.json'), json('vectors.json'),
  ]);
  const verified = await verifyPackage({ manifest, wasmBytes, policy, vectors });
  console.info(`[INFO] Package verified | methodologyHash=${verified.methodologyHash} | wasmHash=${verified.wasmHash} | vectors=${verified.vectors}`);
}
main().catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
