'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildPackage, canonicalize } = require('./package');
const root = path.resolve(__dirname, '..');
async function buildDirectory(source, policy, outputDirectory) {
  const built = await buildPackage(source, policy);
  const category = path.basename(path.dirname(source));
  const out = path.resolve(outputDirectory || path.join(root, `dist/${category}-${built.manifest.methodology.id}-v${built.manifest.methodology.version}`));
  await fs.mkdir(out, { recursive: true });
  for (const [name, value] of Object.entries({ 'manifest.json': built.manifest,
    ...(built.policy ? { 'device-policy.json': built.policy } : {}),
    'vectors.json': built.vectors, 'build-info.json': built.buildInfo })) await fs.writeFile(path.join(out, name), `${canonicalize(value)}\n`);
  await fs.writeFile(path.join(out, 'methodology.wasm'), built.wasmBytes);
  console.info(`[INFO] WASM package built | output=${out} | methodology=${built.manifest.methodology.id}/v${built.manifest.methodology.version} | wasmHash=${built.verification.wasmHash} | methodologyHash=${built.verification.methodologyHash} | vectors=${built.verification.vectors}`);
  return { out, built };
}
async function main() {
  const source = path.resolve(process.argv[2] || path.join(root, 'methodologies/tumbler/2001-v3'));
  const definition = JSON.parse(await fs.readFile(path.join(source, 'definition.json'), 'utf8'));
  const policy = definition.evidenceValidation?.kind === 'DECLARED_INPUTS_V1' ? null
    : path.resolve(process.argv[3] || path.join(root, 'packages/tumbler-2001-v3/device-policy.json'));
  await buildDirectory(source, policy, process.argv[4]);
}
if (require.main === module) main().catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
module.exports = { buildDirectory };
