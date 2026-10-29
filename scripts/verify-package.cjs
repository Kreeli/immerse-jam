const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  asar = require('@electron/asar');
const resources = path.resolve('release/win-unpacked/resources'),
  archive = path.join(resources, 'app.asar');
const entries = asar
  .listPackage(archive)
  .map((file) => file.replaceAll('\\', '/').replace(/^\//, ''));
const manifest = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(manifest.version, require('../package.json').version);
for (const file of [
  'shared/locales/en.json',
  'shared/ipc-methods.json',
  'desktop/ipc/recordings.cjs',
  'desktop/audio-tools.cjs',
  'desktop/groups.cjs',
])
  assert.ok(entries.includes(file), file);
assert.ok(entries.some((file) => /capture-processor.*\.js$/.test(file)));
assert.ok(entries.some((file) => /waveform-worker.*\.js$/.test(file)));
assert.ok(
  !entries.some((file) =>
    /node_modules\/ffmpeg-static|(?:^|\/)(?:\.runtime|\.research|test-output)(?:\/|$)|\.(?:wav|mp3|ijam|aum|ckpt|safetensors)$/i.test(
      file,
    ),
  ),
);
for (const file of [
  'backend/worker.py',
  'assets/app-icon.ico',
  'assets/licenses/IMMERSE_JAM_LICENSE.txt',
  'assets/licenses/THIRD_PARTY_NOTICES.txt',
])
  assert.ok(fs.existsSync(path.join(resources, file)), file);
assert.ok(!fs.existsSync(path.join(resources, 'vendor/uv.exe')));
const installer = path.resolve('release', `Immerse Jam Setup ${manifest.version}.exe`),
  hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(installer));
const sha256 = hash.digest('hex');
fs.writeFileSync(
  path.resolve('release', `SHA256SUMS-${manifest.version}.txt`),
  // GitHub normalizes spaces in uploaded asset names to periods.
  `${sha256}  ${path.basename(installer).replaceAll(' ', '.')}\n`,
);
console.log(
  JSON.stringify(
    {
      version: manifest.version,
      installerBytes: fs.statSync(installer).size,
      sha256,
      archiveEntries: entries.length,
      privateMedia: false,
      modelWeights: false,
      bundledFFmpeg: false,
    },
    null,
    2,
  ),
);
