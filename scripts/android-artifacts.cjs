const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const version = '0.1.0-preview.1';
fs.mkdirSync('release', { recursive: true });
const sums = [];
for (const abi of ['arm64-v8a', 'x86_64']) {
  const source = path.resolve(
      'platforms/android/app/build/outputs/apk/debug',
      `app-${abi}-debug.apk`,
    ),
    name = `Immerse-Jam-Android-${version}-${abi}.apk`,
    dest = path.resolve('release', name);
  fs.copyFileSync(source, dest);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
  sums.push(`${sha}  ${name}`);
  console.log(JSON.stringify({ name, bytes: fs.statSync(dest).size, sha256: sha }));
}
fs.writeFileSync(`release/SHA256SUMS-Android-${version}.txt`, sums.join('\n') + '\n');
