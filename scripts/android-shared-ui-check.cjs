// Shared Android UI/bridge check, independent of SDK, model weights and personal media.
const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { store, p } = require('./fixtures.cjs').createInteractionFixture(8);
p.analysis.tempoMethod = 'beat-this';
p.analysis.tempoReviewed = true;
store.save(p);
const models = require('../platforms/android/model-catalog.json').map((m) => ({
  ...m,
  installed: !!m.bundled,
}));
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
      parts = pathname.split('/');
    const media = pathname.startsWith('/projects/');
    const file = media
      ? store.asset(parts[2], parts.slice(3).join('/'))
      : path.resolve('dist-android', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!media && !file.startsWith(path.resolve('dist-android') + path.sep))
      throw new Error('Path');
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.wav': 'audio/wav',
        '.wasm': 'application/wasm',
      }[path.extname(file)] || 'application/octet-stream',
    );
    fs.createReadStream(file)
      .on('error', () => {
        res.statusCode = 404;
        res.end();
      })
      .pipe(res);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
let browser;
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ project, models }) => {
      localStorage.setItem(
        'immerse.preferences',
        JSON.stringify({ language: 'zh-CN', theme: 'dark', accent: 'rose' }),
      );
      window.__nativeCalls = [];
      window.ImmerseNative = {
        onmessage: null,
        postMessage(text) {
          const { id, method, data } = JSON.parse(text);
          window.__nativeCalls.push({ method, data });
          let result;
          if (method === 'library') result = [project];
          else if (method === 'models') result = models;
          else if (method === 'folders-list') result = [];
          else if (method === 'runtime-status') result = { ready: true };
          else if (method === 'update') result = Object.assign(project, data.patch);
          else if (method === 'run') result = { jobId: 'mobile-job' };
          else if (
            method === 'android-playback-budget' ||
            method === 'ui-language' ||
            method === 'android-share-projects' ||
            method === 'peer-close'
          )
            result = true;
          else if (method === 'cancel') {
            result = true;
            setTimeout(
              () =>
                window.ImmerseNative.onmessage({
                  data: JSON.stringify({ event: { type: 'cancelled', jobId: 'mobile-job' } }),
                }),
              10,
            );
          } else throw new Error('Unexpected mobile method ' + method);
          queueMicrotask(() =>
            window.ImmerseNative.onmessage({ data: JSON.stringify({ id, result }) }),
          );
        },
      };
    },
    { project: p, models },
  );
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('.song-info').filter({ hasText: p.title }).click();
  await page.waitForFunction(
    () => document.querySelector('.play-main') && !document.querySelector('.play-main').disabled,
  );
  for (const refresh of [false, true]) {
    await page.getByRole('button', { name: '开始分析', exact: true }).click();
    const checkbox = page.getByRole('checkbox', { name: '重新识别节拍（替换已有节拍）' });
    assert.equal(await checkbox.isChecked(), false);
    if (refresh) await checkbox.check();
    await page.locator('.analysis-only').click();
    await page.waitForFunction(
      (n) => window.__nativeCalls.filter((c) => c.method === 'run').length === n,
      refresh ? 2 : 1,
    );
    assert.equal(
      await page.evaluate(
        () => window.__nativeCalls.filter((c) => c.method === 'run').at(-1).data.refreshRhythm,
      ),
      refresh,
    );
    await page.locator('.job-card button').click();
    await page.locator('.job-card').waitFor({ state: 'detached' });
    assert.equal(
      await page.evaluate(
        () => window.__nativeCalls.filter((c) => c.method === 'cancel').at(-1).data.jobId,
      ),
      'mobile-job',
    );
  }
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('button', { name: '设备互传', exact: true }).click();
  await page.locator('.selection-list input').first().check();
  await page.getByRole('button', { name: '分享选中的完整歌曲', exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => window.__nativeCalls.filter((c) => c.method === 'android-share-projects').length,
    ),
    1,
  );
  assert.equal(await page.getByRole('button', { name: '生成配对二维码', exact: true }).count(), 0);
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1));
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log(
    'ANDROID_SHARED_UI_PASSED preserveImportedBeats=true explicitReplace=true cancellation=true share=true phoneAndTablet=true',
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
