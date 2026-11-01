const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const releaseModule = { exports: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../docs/site/download/release.js'), 'utf8'),
  { module: releaseModule },
);
const RF = releaseModule.exports;

const kinds = ['windows', 'android-arm64', 'android-x64'];
const prefix = 'https://github.com/Kreeli/immerse-jam/releases/';
function prepareDownloads(releases, root) {
  if (!Array.isArray(releases)) throw new Error('Expected release list');
  const catalog = releases
    .filter((r) => r && !r.draft)
    .map((r) => ({
      tag_name: r.tag_name,
      name: r.name,
      published_at: r.published_at,
      html_url: r.html_url,
      body: r.body,
      prerelease: !!r.prerelease,
      draft: false,
      assets: (r.assets || [])
        .filter((a) => a.state === 'uploaded' || !a.state)
        .map((a) => ({
          name: a.name,
          size: a.size,
          browser_download_url: a.browser_download_url,
        })),
    }));
  const urls = {};
  for (const kind of kinds) {
    const found = RF.findAsset(catalog, kind);
    const url = found && found.asset.browser_download_url;
    if (!url || !url.startsWith(prefix + 'download/') || /["<>\s]/.test(url)) {
      throw new Error('Missing or invalid download for ' + kind);
    }
    urls[kind] = url;
  }
  // Prepare every output before writing, so invalid release data cannot partially update the site.
  const files = [
    'index.html',
    'download/index.html',
    'download/windows/index.html',
    'download/android/index.html',
    'download/android-x64/index.html',
  ];
  const outputs = files.map((file) => {
    const target = path.join(root, file);
    const html = fs
      .readFileSync(target, 'utf8')
      .replace(/<a\b[^>]*\bdata-download-kind="([^"]+)"[^>]*>/g, (tag, kind) => {
        if (!urls[kind]) throw new Error('Unknown download kind: ' + kind);
        return tag.replace(/\bhref="[^"]*"/, 'href="' + urls[kind] + '"');
      });
    return [target, html];
  });
  for (const [target, html] of outputs) fs.writeFileSync(target, html);
  fs.writeFileSync(
    path.join(root, 'download/releases.json'),
    JSON.stringify(catalog, null, 2) + '\n',
  );
  return urls;
}

async function main() {
  let releases;
  if (process.argv[2]) releases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  else {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'immerse-jam-website' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
    const response = await fetch(RF.API_URL, { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Release catalog HTTP ' + response.status);
    releases = await response.json();
  }
  const urls = prepareDownloads(releases, path.resolve(__dirname, '../docs/site'));
  console.log('Prepared direct downloads for ' + Object.keys(urls).join(', '));
}
module.exports = { prepareDownloads };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
