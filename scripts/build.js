'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildPackage, canonicalize } = require('./package');
const root = path.resolve(__dirname, '..');
async function main() {
  const source = path.resolve(process.argv[2] || path.join(root, 'methodologies/tumbler/2001-v3'));
  const policy = path.resolve(process.argv[3] || path.join(root, 'packages/tumbler-2001-v3/device-policy.json'));
  const built = await buildPackage(source, policy);
  const out = path.resolve(process.argv[4] || path.join(root, `dist/tumbler-${built.manifest.methodology.id}-v${built.manifest.methodology.version}`));
  await fs.mkdir(out, { recursive: true });
  for (const [name, value] of Object.entries({ 'manifest.json': built.manifest, 'device-policy.json': built.policy,
    'vectors.json': built.vectors, 'build-info.json': built.buildInfo })) await fs.writeFile(path.join(out, name), `${canonicalize(value)}\n`);
  await fs.writeFile(path.join(out, 'methodology.wasm'), built.wasmBytes);
  console.info(`[INFO] WASM package built | output=${out} | methodology=${built.manifest.methodology.id}/v${built.manifest.methodology.version} | wasmHash=${built.verification.wasmHash} | methodologyHash=${built.verification.methodologyHash} | vectors=${built.verification.vectors}`);
}
main().catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
