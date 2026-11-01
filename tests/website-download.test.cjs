const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { prepareDownloads } = require('../scripts/prepare-website-downloads.cjs');
const base = 'https://github.com/Kreeli/immerse-jam/releases/download/';
function fixture(t) {
  const tmp = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tmp, 'immerse-download-test-'));
  const files = [
    'index.html',
    'download/index.html',
    'download/windows/index.html',
    'download/android/index.html',
    'download/android-x64/index.html',
  ];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../docs/site', file), path.join(root, file));
  }
  t.after(() => {
    if (path.dirname(root) === tmp && path.basename(root).startsWith('immerse-download-test-'))
      fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function release(tag, names, draft = false) {
  return {
    tag_name: tag,
    draft,
    assets: names.map((name) => ({
      name,
      state: 'uploaded',
      browser_download_url: base + tag + '/' + name,
    })),
  };
}
test('download generation skips drafts and preserves the newest available build of each platform', (t) => {
  const root = fixture(t);
  const urls = prepareDownloads(
    [
      release('draft', ['Setup.exe', 'arm64.apk', 'x86_64.apk'], true),
      release('new', ['Setup.exe']),
      release('preview', ['app-arm64.apk', 'app-x86_64.apk']),
    ],
    root,
  );
  assert.equal(urls.windows, base + 'new/Setup.exe');
  assert.equal(urls['android-arm64'], base + 'preview/app-arm64.apk');
  assert.equal(urls['android-x64'], base + 'preview/app-x86_64.apk');
  const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(homepage.includes('href="' + urls.windows + '"'));
  const manual = fs.readFileSync(path.join(root, 'download/android/index.html'), 'utf8');
  assert.ok(manual.includes('href="' + urls['android-arm64'] + '"'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'download/releases.json'))).length, 2);
});
test('missing builds or foreign download destinations leave existing links untouched', (t) => {
  const root = fixture(t);
  const before = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.throws(() => prepareDownloads([release('bad', ['Setup.exe'])], root), /android-arm64/);
  const bad = release('bad', ['Setup.exe', 'arm64.apk', 'x64.apk']);
  bad.assets[0].browser_download_url = 'https://untrusted.example/Setup.exe';
  assert.throws(() => prepareDownloads([bad], root), /windows/);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), before);
});
