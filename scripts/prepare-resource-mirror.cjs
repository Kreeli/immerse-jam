const fs = require('node:fs'),
  path = require('node:path');
const { manifest, copyVerified, hash } = require('../desktop/installer-assets.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const target = path.join(root, 'release/resource-mirror-v1');
  fs.mkdirSync(target, { recursive: true });
  const entries = [];
  for (const item of manifest.assets.filter((item) => item.asset)) {
    const file = path.join(target, item.asset);
    await copyVerified(path.join(root, '.runtime', item.cached), file, item.sha256);
    entries.push({
      file: item.asset,
      size: fs.statSync(file).size,
      sha256: item.sha256,
      upstream: item.url,
      license: item.license,
    });
  }
  const licenses = path.join(root, 'release/installer-payload/licenses');
  for (const name of fs.readdirSync(licenses)) {
    const file = path.join(target, name);
    fs.copyFileSync(path.join(licenses, name), file);
    entries.push({ file: name, size: fs.statSync(file).size, sha256: await hash(file) });
  }
  fs.writeFileSync(
    path.join(target, 'manifest.json'),
    JSON.stringify({ version: 1, files: entries }, null, 2) + '\n',
  );
  entries.push({ file: 'manifest.json', sha256: await hash(path.join(target, 'manifest.json')) });
  fs.writeFileSync(
    path.join(target, 'SHA256SUMS.txt'),
    entries.map((entry) => entry.sha256 + '  ' + entry.file).join('\n') + '\n',
  );
  console.log('Prepared owned resource mirror: ' + target);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
