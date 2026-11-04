const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const output = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const targetKind = args.find((arg) => !arg.startsWith('--')) || 'nsis';
if (
  !['nsis', 'dir'].includes(targetKind) ||
  args.some((arg) => arg.startsWith('--') && !arg.startsWith('--output='))
)
  throw new Error('Usage: package.cjs [nsis|dir] [--output=.runtime/candidate]');
const { packagePaths, checkPackagePaths } = require('./package-paths.cjs');
const paths = packagePaths(root, output);
const { release, staging, prepared, target, previous } = paths;
const temp = path.join(root, '.runtime', 'build-temp');
fs.mkdirSync(temp, { recursive: true });
const env = {
  ...process.env,
  TEMP: temp,
  TMP: temp,
  ELECTRON_BUILDER_CACHE: path.join(root, '.runtime', 'builder-cache'),
};
const payload = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/prepare-installer-assets.cjs')],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env,
  },
);
if (payload.status !== 0) process.exit(payload.status ?? 1);
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'electron-builder', 'cli.js'),
    '--win',
    targetKind,
    '--x64',
    '--publish',
    'never',
    '--config.directories.output=' + staging,
  ],
  { cwd: root, stdio: 'inherit', windowsHide: true, env },
);
if (result.status !== 0) process.exit(result.status ?? 1);

// electron-builder clears its output before packing. It must never pack over
// the working test application: a locked file or failed build leaves it broken.
checkPackagePaths(paths);
for (const file of ['Immerse Jam.exe', 'icudtl.dat', 'resources.pak', 'resources/app.asar'])
  if (!fs.existsSync(path.join(prepared, file)))
    throw new Error('Incomplete desktop build: ' + file);

const running = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    'if (Get-Process | Where-Object { $_.Path -eq $env:IMMERSE_PACKAGE_TARGET }) { exit 2 }',
  ],
  {
    windowsHide: true,
    env: { ...env, IMMERSE_PACKAGE_TARGET: path.join(target, 'Immerse Jam.exe') },
  },
);
if (running.status !== 0) {
  console.log('Build complete at ' + staging + '. Close the test application before updating it.');
} else {
  // Both rename targets are fixed children of this workspace. Keep the old
  // complete application until the new directory has been installed successfully.
  if (path.dirname(previous) !== staging || path.dirname(target) !== release)
    throw new Error('Invalid package target');
  checkPackagePaths(paths);
  if (fs.existsSync(previous)) fs.rmSync(previous, { recursive: true, force: true });
  const hadPrevious = fs.existsSync(target);
  if (hadPrevious) fs.renameSync(target, previous);
  try {
    fs.renameSync(prepared, target);
  } catch (error) {
    if (hadPrevious) fs.renameSync(previous, target);
    throw error;
  }
  console.log('Updated desktop test application: ' + target);
}
// Keep the usual installer location; signed/public release folders are untouched.
for (const file of fs.readdirSync(staging, { withFileTypes: true }))
  if (file.isFile()) fs.copyFileSync(path.join(staging, file.name), path.join(release, file.name));
