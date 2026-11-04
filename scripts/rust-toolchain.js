'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

async function resolveBuildToolchain(crateDirectory, options = {}) {
  const toolchainFile = path.join(crateDirectory, 'rust-toolchain.toml');
  let channel;
  let config;
  try {
    config = await fs.readFile(toolchainFile, 'utf8');
    channel = /^\s*channel\s*=\s*"([^"]+)"\s*$/m.exec(config)?.[1];
  } catch (error) {
    throw new Error(`Cannot read pinned Rust toolchain file ${toolchainFile}: ${error.message}`);
  }
  if (!channel) throw new Error(`Missing channel in pinned Rust toolchain file: ${toolchainFile}`);
  const targets = /^\s*targets\s*=\s*\[([^\]]*)\]/m.exec(config)?.[1] || '';
  if (!targets.split(',').some(item => item.trim().replace(/^"|"$/g, '') === 'wasm32-unknown-unknown'))
    throw new Error(`rust-toolchain.toml must include wasm32-unknown-unknown in targets: ${toolchainFile}`);

  const rustupHome = options.rustupHome || process.env.RUSTUP_HOME || path.join(os.homedir(), '.rustup');
  const toolchainsDirectory = path.join(rustupHome, 'toolchains');
  let candidates;
  try {
    candidates = await fs.readdir(toolchainsDirectory, { withFileTypes: true });
  } catch (_) {
    throw new Error(`Pinned Rust ${channel} is not installed. Install it with: rustup toolchain install ${channel} --profile minimal --target wasm32-unknown-unknown`);
  }

  const prefix = `${channel}-`;
  const toolchainDirectories = candidates.filter(entry => entry.isDirectory() && entry.name.startsWith(prefix));
  const binary = process.platform === 'win32' ? name => `${name}.exe` : name => name;
  for (const entry of toolchainDirectories) {
    const binDirectory = path.join(toolchainsDirectory, entry.name, 'bin');
    const pinnedCargo = path.join(binDirectory, binary('cargo'));
    const pinnedRustc = path.join(binDirectory, binary('rustc'));
    try {
      await Promise.all([fs.access(pinnedCargo), fs.access(pinnedRustc)]);
    } catch (_) {
      continue;
    }

    const rustcProbe = spawnSync(pinnedRustc, ['-vV'], { encoding: 'utf8' });
    const host = rustcProbe.status === 0 ? /^host:\s*(\S+)\s*$/m.exec(rustcProbe.stdout || '')?.[1] : null;
    if (!host) continue;

    const targetLibdir = spawnSync(pinnedRustc,
      ['--print', 'target-libdir', '--target', 'wasm32-unknown-unknown'], { encoding: 'utf8' });
    if (targetLibdir.status !== 0 || !targetLibdir.stdout.trim()) {
      throw new Error(`Pinned Rust ${channel} cannot locate wasm32-unknown-unknown. Install it with: rustup target add wasm32-unknown-unknown --toolchain ${channel}`);
    }
    try {
      await fs.access(targetLibdir.stdout.trim());
    } catch (_) {
      throw new Error(`Rust target wasm32-unknown-unknown is missing. Install it with: rustup target add wasm32-unknown-unknown --toolchain ${channel}`);
    }
    return { cargo: pinnedCargo, rustc: pinnedRustc, channel, host };
  }

  throw new Error(`Pinned Rust ${channel} is not installed for this host. Install it with: rustup toolchain install ${channel} --profile minimal --target wasm32-unknown-unknown`);
}

module.exports = { resolveBuildToolchain };
