'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { utils } = require('ethers');

const packages = [
  {
    identity: { id: 2003, version: 3 },
    source: 'pet/2003-v3',
    targets: [
      'recyclefarm-serverless/functions/tests/fixtures/dmrvn-json-abi/pet/2003-v3',
      'recyclefarm-attestor-desktop/tests/fixtures/json-methodologies/pet-2003-v3',
    ],
  },
  {
    identity: { id: 2004, version: 2 },
    source: 'solar/2004-v2',
    targets: [
      'recyclefarm-serverless/functions/tests/fixtures/dmrvn-json-abi/solar/2004-v2',
      'recyclefarm-attestor-desktop/tests/fixtures/json-methodologies/solar-2004-v2',
    ],
  },
  {
    identity: { id: 2001, version: 4 },
    source: 'tumbler/2001-v4',
    targets: [
      'recyclefarm-serverless/functions/tests/fixtures/dmrvn-json-abi/tumbler/2001-v4',
      'recyclefarm-attestor-desktop/tests/fixtures/json-methodologies/tumbler-2001-v4',
    ],
  },
  {
    identity: { id: 2001, version: 5 },
    source: 'tumbler/2001-v5',
    targets: [
      'recyclefarm-serverless/functions/tests/fixtures/dmrvn-json-abi/tumbler/2001-v5',
      'recyclefarm-attestor-desktop/tests/fixtures/json-methodologies/tumbler-2001-v5',
    ],
  },
];

const packageFiles = ['manifest.json', 'methodology.wasm', 'vectors.json', 'device-policy.json'];

async function syncWorkspaceFixtures({ repositoryRoot, workspaceRoot, check = false }) {
  const root = path.resolve(repositoryRoot);
  const workspace = path.resolve(workspaceRoot || path.dirname(root));

  for (const item of packages) {
    const sourceDirectory = path.join(root, 'dist', item.source);
    const manifest = JSON.parse(await fs.readFile(path.join(sourceDirectory, 'manifest.json'), 'utf8'));
    const wasm = await fs.readFile(path.join(sourceDirectory, 'methodology.wasm'));
    const actualWasmHash = utils.keccak256(wasm);

    if (manifest.methodology?.id !== item.identity.id || manifest.methodology?.version !== item.identity.version) {
      throw new Error(`Unexpected methodology identity in ${sourceDirectory}`);
    }
    if (manifest.wasmHash !== actualWasmHash) {
      throw new Error(`WASM hash does not match manifest in ${sourceDirectory}`);
    }

    for (const relativeTarget of item.targets) {
      const targetDirectory = path.join(workspace, relativeTarget);
      const files = manifest.devicePolicyHash ? packageFiles : packageFiles.filter(file => file !== 'device-policy.json');
      for (const file of files) {
        const sourcePath = path.join(sourceDirectory, file);
        const targetPath = path.join(targetDirectory, file);
        const sourceBytes = await fs.readFile(sourcePath);

        if (check) {
          let targetBytes;
          try {
            targetBytes = await fs.readFile(targetPath);
          } catch (_) {
            throw new Error(`Missing ${targetPath}; run npm run sync:workspace-fixtures`);
          }
          if (!sourceBytes.equals(targetBytes)) {
            throw new Error(`Fixture drift at ${targetPath}; run npm run sync:workspace-fixtures`);
          }
        } else {
          await fs.mkdir(targetDirectory, { recursive: true });
          await fs.copyFile(sourcePath, targetPath);
        }
      }
    }

    console.info(`[${check ? 'PASS' : 'SYNC'}] Workspace fixtures | methodology=${item.identity.id}/v${item.identity.version} | wasmHash=${actualWasmHash}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter(argument => argument !== '--check');
  if (unknown.length) throw new Error(`Unsupported argument: ${unknown[0]}`);
  await syncWorkspaceFixtures({
    repositoryRoot: path.resolve(__dirname, '..'),
    check: argv.includes('--check'),
  });
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { syncWorkspaceFixtures };
