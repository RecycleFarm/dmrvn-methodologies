'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildDirectory } = require('./build');
const { verifyDirectory } = require('./verify');
const { buildAll: buildJsonPackages, discoverPackages: discoverJsonPackages } = require('./json-abi-package');
const REQUIRED_FILES = ['definition.json', 'methodology.wat', 'vectors.json'];

async function discoverPackages(root) {
  const packages = [];
  const identities = new Set();
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const names = new Set(entries.filter(entry => entry.isFile()).map(entry => entry.name));
    const config = names.has('package-config.json')
      ? JSON.parse(await fs.readFile(path.join(directory, 'package-config.json'), 'utf8')) : {};
    if (!config.jsonAbi && (REQUIRED_FILES.some(name => names.has(name)) || names.has('package-config.json'))) {
      const missing = REQUIRED_FILES.filter(name => !names.has(name));
      if (missing.length) throw new Error(`Incomplete methodology: ${directory}; missing ${missing.join(', ')}`);
      const definition = JSON.parse(await fs.readFile(path.join(directory, 'definition.json'), 'utf8'));
      const { id, version } = definition.methodology || {};
      if (![id, version, definition.activityId].every(value => Number.isSafeInteger(value) && value > 0)) {
        throw new Error(`Invalid methodology identity: ${directory}`);
      }
      const identity = `${id}/v${version}`;
      if (identities.has(identity)) throw new Error(`Duplicate methodology identity: ${identity}`);
      identities.add(identity);
      const declared = definition.evidenceValidation?.kind === 'DECLARED_INPUTS_V1';
      const policyFile = config.policyFile || 'device-policy.json';
      if (typeof policyFile !== 'string' || path.isAbsolute(policyFile)) throw new Error(`Policy path must be relative: ${directory}`);
      const policy = path.resolve(directory, policyFile);
      const relative = path.relative(root, policy);
      if (relative.startsWith(`..${path.sep}`) || relative === '..') throw new Error(`Policy must be inside repository: ${directory}`);
      if (!declared) await fs.access(policy);
      packages.push({ source: directory, policy: declared ? null : policy, identity });
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) await visit(path.join(directory, entry.name));
    }
  }
  await visit(path.join(root, 'methodologies'));
  if (!packages.length) throw new Error('No methodologies found');
  return packages;
}

async function verifyAll(root = path.resolve(__dirname, '..'), dependencies = {}) {
  const packages = await discoverPackages(root);
  const identities = new Set(packages.map(item => item.identity));
  for (const item of packages) {
    console.info(`[INFO] Verifying methodology | source=${path.relative(root, item.source)} | methodology=${item.identity}`);
    const { out } = await buildDirectory(item.source, item.policy,
      path.join(root, 'dist', path.relative(path.join(root, 'methodologies'), item.source)));
    await verifyDirectory(out);
  }
  const jsonSources = await discoverJsonPackages(root);
  for (const source of jsonSources) {
    const definition = JSON.parse(await fs.readFile(path.join(source, 'definition.json'), 'utf8'));
    const identity = `${definition.methodology.id}/v${definition.methodology.version}`;
    if (identities.has(identity)) throw new Error(`Duplicate methodology identity across ABI versions: ${identity}`);
    identities.add(identity);
  }
  const jsonResults = jsonSources.length
    ? await (dependencies.buildJsonPackages || buildJsonPackages)(root)
    : [];
  if (jsonResults.length !== jsonSources.length) {
    throw new Error(`JSON WASM verification count mismatch: discovered=${jsonSources.length}, verified=${jsonResults.length}`);
  }
  const count = packages.length + jsonResults.length;
  console.info(`[INFO] All methodology packages verified | count=${count}`);
  return count;
}
if (require.main === module) verifyAll().catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
module.exports = { discoverPackages, verifyAll };
