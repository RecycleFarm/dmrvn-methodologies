'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { discoverPackages } = require('./verify-all');
const { verifyDirectory } = require('./verify');

async function updateCatalog(root, metadata) {
  const packages = await discoverPackages(root);
  const catalog = [];
  for (const item of packages) {
    const relative = path.relative(path.join(root, 'methodologies'), item.source);
    const dist = path.join(root, 'dist', relative);
    await verifyDirectory(dist);
    const manifest = JSON.parse(await fs.readFile(path.join(dist, 'manifest.json'), 'utf8'));
    const build = JSON.parse(await fs.readFile(path.join(dist, 'build-info.json'), 'utf8'));
    const target = path.join(root, 'builds', relative);
    await fs.mkdir(target, { recursive: true });
    for (const name of ['manifest.json', 'methodology.wasm', ...(manifest.devicePolicyHash ? ['device-policy.json'] : []), 'vectors.json', 'build-info.json']) {
      await fs.copyFile(path.join(dist, name), path.join(target, name));
    }
    catalog.push({ methodology: manifest.methodology, activityId: manifest.activityId,
      path: `builds/${relative.split(path.sep).join('/')}`, wasmBytes: (await fs.stat(path.join(dist, 'methodology.wasm'))).size,
      wasmHash: manifest.wasmHash, methodologyHash: build.methodologyHash,
      compiler: `${build.compiler} ${build.compilerVersion}`, vectors: build.vectors,
      inputSchema: manifest.inputSchema, outputSchema: manifest.outputSchema, runtime: manifest.runtime,
      ...(manifest.evidenceValidation ? { evidenceValidation: manifest.evidenceValidation } : {}),
      hasDevicePolicy: Boolean(manifest.devicePolicyHash) });
  }
  const record = { ...metadata, packages: catalog };
  await fs.writeFile(path.join(root, 'builds/catalog.json'), `${JSON.stringify(record, null, 2)}\n`);
  const lines = [`검증 시각: ${metadata.builtAt} (UTC)`,
    `소스 커밋: \`${metadata.sourceCommit}\` · Node ${metadata.nodeVersion}`,
    ...(metadata.runUrl ? [`[GitHub Actions 실행 기록](${metadata.runUrl})`] : []),
    '[기계 판독용 catalog.json](builds/catalog.json)', '',
    '| 방법론 | 활동 | WASM | manifest | 정책 | 빌드 정보 |',
    '|---|---|---|---|---|---|'];
  for (const item of catalog) {
    lines.push(`| ${item.methodology.id}/v${item.methodology.version} | ${item.activityId} | [${item.wasmBytes} bytes](${item.path}/methodology.wasm) | [JSON](${item.path}/manifest.json) | ${item.hasDevicePolicy ? `[JSON](${item.path}/device-policy.json)` : 'Not required (declared inputs)'} | [${item.compiler}, ${item.vectors} vectors](${item.path}/build-info.json) |`);
  }
  for (const item of catalog) {
    lines.push('', `### ${item.methodology.id}/v${item.methodology.version}`, '',
      `- wasmHash: \`${item.wasmHash}\``, `- methodologyHash: \`${item.methodologyHash}\``);
  }
  const readmePath = path.join(root, 'README.md');
  const readme = await fs.readFile(readmePath, 'utf8');
  const block = /<!-- builds:start -->[\s\S]*?<!-- builds:end -->/;
  if (!block.test(readme)) throw new Error('README build catalog markers are missing');
  await fs.writeFile(readmePath, readme.replace(block, `<!-- builds:start -->\n${lines.join('\n')}\n<!-- builds:end -->`));
  return record;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  updateCatalog(root, { builtAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    nodeVersion: process.version,
    ...(process.env.GITHUB_RUN_ID ? { runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` } : {})
  }).catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
}
module.exports = { updateCatalog };
