// Runs the built shared UI without private models, libraries or a local Python runtime.
const { chromium } = require('playwright'),
  http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createInteractionFixture } = require('./fixtures.cjs');
const { store, p } = createInteractionFixture(8);
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = pathname.startsWith('/media/')
      ? store.asset(p.id, pathname.slice(7))
      : path.resolve('dist', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!pathname.startsWith('/media/') && !file.startsWith(path.resolve('dist') + path.sep))
      throw new Error('Invalid path');
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.wasm': 'application/wasm',
      '.wav': 'audio/wav',
    };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((project) => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input, init) =>
      fetchOriginal(
        typeof input === 'string' && input.startsWith('immerse://asset/')
          ? '/media/' + input.split('/').slice(4).join('/')
          : input,
        init,
      );
    window.jam = {
      language: 'zh-CN',
      filePath: () => '',
      onEvent: () => () => {},
      call: async (method, data) => {
        if (method === 'library') return [project];
        if (method === 'folders-list' || method === 'models') return [];
        if (method === 'runtime-status') return { ready: true };
        if (method === 'update') return Object.assign(project, data.patch);
        if (method === 'playback-budget') return {};
        if (method === 'ui-language') return true;
        throw new Error('Unexpected CI UI operation: ' + method);
      },
    };
  }, p);
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page
    .getByRole('button', { name: /交互验收/ })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelector('.play-main') && !document.querySelector('.play-main').disabled,
  );
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).check();
  for (const message of [
    '预备拍与音乐使用同一播放时钟和音频路径。',
    '导入乐谱 / MIDI 并自动对齐后生效',
  ])
    assert.ok(
      await page
        .getByText(message, { exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 14),
    );
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).uncheck();
  await page.getByRole('button', { name: '和弦', exact: true }).click();
  assert.ok(
    await page
      .locator('.chart-help')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 14),
  );
  assert.ok(
    await page
      .locator('.measure-number')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 14),
  );
  fs.mkdirSync('test-output', { recursive: true });
  await page.screenshot({ path: 'test-output/current-chords-readable.png' });
  await page.getByRole('button', { name: '波形', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: 'test-output/current-player-1024.png' });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
  await page.getByRole('button', { name: '音乐库', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  assert.equal(
    await page.locator('.library-header').evaluate((el) => getComputedStyle(el).userSelect),
    'none',
  );
  assert.equal(
    await page.locator('.search input').evaluate((el) => getComputedStyle(el).userSelect),
    'text',
  );
  assert.deepEqual(errors, []);
  console.log('CI_UI_CHECK_PASSED');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
