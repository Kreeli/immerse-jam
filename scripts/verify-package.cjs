const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  asar = require('@electron/asar');
const application = path.resolve(process.argv[2] || 'release/win-unpacked'),
  resources = path.join(application, 'resources'),
  archive = path.join(resources, 'app.asar');
const entries = asar
  .listPackage(archive)
  .map((file) => file.replaceAll('\\', '/').replace(/^\//, ''));
const manifest = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(manifest.version, require('../package.json').version);
const resedit = require('resedit'),
  executable = resedit.NtExecutable.from(
    fs.readFileSync(path.join(application, 'Immerse Jam.exe')),
  ),
  resource = resedit.NtExecutableResource.from(executable);
const actualIcons = resedit.Resource.IconGroupEntry.fromEntries(
    resource.entries,
  )[0].getIconItemsFromEntries(resource.entries),
  expectedIcons = resedit.Data.IconFile.from(fs.readFileSync('assets/app-icon.ico')).icons;
const iconBytes = (image) => Buffer.from(image.isRaw() ? image.bin : image.generate());
assert.deepEqual(
  actualIcons.map(iconBytes),
  expectedIcons.map((icon) => iconBytes(icon.data)),
  'executable icon pixels match the supplied icon at every size',
);
for (const file of [
  'shared/locales/en.json',
  'shared/ipc-methods.json',
  'desktop/ipc/recordings.cjs',
  'desktop/audio-tools.cjs',
  'desktop/groups.cjs',
  'desktop/application.cjs',
  'desktop/folders.cjs',
  'desktop/installation.cjs',
  'desktop/locations.cjs',
])
  assert.ok(entries.includes(file), file);
assert.ok(entries.some((file) => /capture-processor.*\.js$/.test(file)));
assert.ok(entries.some((file) => /waveform-worker.*\.js$/.test(file)));
assert.ok(entries.some((file) => /playback-processor.*\.js$/.test(file)));
assert.ok(
  !entries.some((file) =>
    /node_modules\/ffmpeg-static|(?:^|\/)(?:\.runtime|\.research|test-output)(?:\/|$)|\.(?:wav|mp3|ijam|aum|ckpt|safetensors)$/i.test(
      file,
    ),
  ),
);
for (const file of [
  'backend/worker.py',
  'backend/model_safety.py',
  'assets/app-icon.ico',
  'assets/licenses/IMMERSE_JAM_LICENSE.txt',
  'assets/licenses/THIRD_PARTY_NOTICES.txt',
])
  assert.ok(fs.existsSync(path.join(resources, file)), file);
for (const asset of require('../shared/installer-assets.json').assets.filter((asset) =>
  ['uv', 'beat-this', 'python-bootstrap', 'ffmpeg'].includes(asset.id),
)) {
  const file = path.join(resources, 'vendor', asset.file);
  assert.equal(
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    asset.sha256,
  );
}
assert.ok(fs.existsSync(path.join(resources, 'vendor/licenses/ffmpeg.exe.LICENSE')));
const installer = path.resolve(
    process.argv[3] || path.join('release', `Immerse Jam Setup ${manifest.version}.exe`),
  ),
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
      bundledModelWeights: ['beat-this'],
      bundledUv: true,
      bundledPythonBootstrap: true,
      bundledFFmpeg: true,
    },
    null,
    2,
  ),
);
