'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveBuildToolchain } = require('./rust-toolchain');

async function setup() {
  const root = path.resolve(__dirname, '..');
  const toolchainPath = path.join(root, 'wasm/json-abi/rust-toolchain.toml');
  const config = await fs.readFile(toolchainPath, 'utf8');
  const channel = /^\s*channel\s*=\s*"([^"]+)"\s*$/m.exec(config)?.[1];
  const targets = /^\s*targets\s*=\s*\[([^\]]*)\]/m.exec(config)?.[1] || '';
  if (!channel || !targets.split(',').some(item => item.trim().replace(/^"|"$/g, '') === 'wasm32-unknown-unknown')) {
    throw new Error(`Invalid pinned Rust toolchain configuration: ${toolchainPath}`);
  }

  try {
    const installed = await resolveBuildToolchain(path.join(root, 'wasm/json-abi'));
    console.info(`[INFO] Pinned JSON WASM toolchain already ready | rust=${installed.channel} | host=${installed.host} | target=wasm32-unknown-unknown`);
    return;
  } catch (_) {
    // Install only when the pinned compiler or target is missing.
  }

  const rustup = process.env.RUSTUP || (process.platform === 'win32' ? 'rustup.exe' : 'rustup');
  const result = spawnSync(rustup, ['toolchain', 'install', channel, '--profile', 'minimal', '--target', 'wasm32-unknown-unknown', '--no-self-update'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Cannot run rustup: ${result.error.message}. Install rustup and retry npm run setup:wasm.`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`Could not install Rust ${channel} with wasm32-unknown-unknown (exit=${result.status ?? 'unknown'}): ${detail || 'no rustup output'}`);
  }

  const resolved = await resolveBuildToolchain(path.join(root, 'wasm/json-abi'));
  console.info(`[INFO] Pinned JSON WASM toolchain ready | rust=${resolved.channel} | host=${resolved.host} | target=wasm32-unknown-unknown`);
}

if (require.main === module) setup().catch(error => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
module.exports = { setup };
