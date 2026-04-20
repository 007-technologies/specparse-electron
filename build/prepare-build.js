#!/usr/bin/env node
/**
 * prepare-build.js — pre-electron-builder hook
 *
 * Runs before electron-builder. Intentionally does NOT write the API key to any source
 * file — the key flows env var → electron-builder CLI --extraMetadata → asar-bundled
 * package.json, and main.js reads it via `require('./package.json').anthropicKey`.
 *
 * This script only:
 *   1. Writes/resets src/embeddedConfig.js to an empty stub (so stale pre-v1.0.1 builds
 *      don't override the new injection path)
 *   2. Auto-generates assets/icon.ico if missing (one-time, from assets/icon_base.png)
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const buildDate = new Date().toISOString();

// Reset embeddedConfig.js to an empty stub on every build. The real key goes via
// electron-builder --extraMetadata (see scripts/build-and-ship.sh). This ensures no
// stale key from a previous build lingers in source, AND keeps the mount notification
// contents free of any secret value.
const stubPath = path.join(projectRoot, 'src', 'embeddedConfig.js');
const stub = `// AUTO-GENERATED stub. Real API key is injected at build time via electron-builder
// extraMetadata into the asar-bundled package.json — not into this file. Do not add a key
// here by hand.
module.exports = {
  embeddedApiKey: '',
  buildDate: ${JSON.stringify(buildDate)},
  version: ${JSON.stringify(pkg.version)},
};
`;
fs.writeFileSync(stubPath, stub, { mode: 0o600 });
console.log('[prepare-build] Reset src/embeddedConfig.js to empty stub');

// Windows icon auto-generation (only if missing)
const icoPath = path.join(projectRoot, 'assets', 'icon.ico');
const pngPath = path.join(projectRoot, 'assets', 'icon_base.png');
if (!fs.existsSync(icoPath) && fs.existsSync(pngPath)) {
  console.log('[prepare-build] assets/icon.ico missing — generating from icon_base.png');
  const { spawnSync } = require('child_process');
  const res = spawnSync('npx', ['--yes', 'png-to-ico', pngPath], {
    stdio: ['ignore', 'pipe', 'inherit'],
    cwd: projectRoot,
  });
  if (res.status === 0 && res.stdout && res.stdout.length > 0) {
    fs.writeFileSync(icoPath, res.stdout);
    console.log('[prepare-build] Generated assets/icon.ico (' + res.stdout.length + ' bytes)');
  } else {
    console.warn('[prepare-build] WARNING: could not generate assets/icon.ico automatically.');
    console.warn('[prepare-build] Run manually: npx --yes png-to-ico assets/icon_base.png > assets/icon.ico');
  }
}

console.log('[prepare-build] Build date: ' + buildDate + ' — Version: ' + pkg.version);
