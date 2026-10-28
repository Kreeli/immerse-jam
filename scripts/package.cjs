const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  temp = path.join(root, '.runtime', 'build-temp');
fs.mkdirSync(temp, { recursive: true });
const env = {
  ...process.env,
  TEMP: temp,
  TMP: temp,
  ELECTRON_BUILDER_CACHE: path.join(root, '.runtime', 'builder-cache'),
};
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'electron-builder', 'cli.js'),
    '--win',
    process.argv[2] || 'nsis',
    '--x64',
  ],
  { cwd: root, stdio: 'inherit', windowsHide: true, env },
);
process.exit(result.status ?? 1);
