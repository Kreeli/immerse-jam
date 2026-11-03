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
  await page.exposeFunction('__qaUpdate', (data) => store.update(data.id, data.patch));
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
        if (method === 'download-settings') return { source: 'auto' };
        if (method === 'update') return (project = await window.__qaUpdate(data));
        if (method === 'playback-budget') {
          await new Promise((resolve) => (window.__releaseLoad = resolve));
          return {};
        }
        if (method === 'ui-language') return true;
        throw new Error('Unexpected CI UI operation: ' + method);
      },
    };
  }, p);
  await page.goto('http://127.0.0.1:' + server.address().port);
  assert.equal(await page.locator('.practice-guide, .brand small').count(), 0);
  await page.getByRole('button', { name: '第一次使用？', exact: true }).first().click();
  await page.getByRole('img', { name: '练习界面图解', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.screenshot({ path: '.runtime/review-desktop-library.png' });
  await page
    .getByRole('button', { name: /交互验收/ })
    .first()
    .click();
  await page.locator('.audio-loading[role="status"]').waitFor();
  assert.ok((await page.locator('.audio-loading').textContent()).includes('正在准备音轨'));
  await page.evaluate(() => window.__releaseLoad());
  await page.waitForFunction(
    () => document.querySelector('.play-main') && !document.querySelector('.play-main').disabled,
  );
  await page
    .locator('.track-meter-wrap > small')
    .first()
    .evaluate((el) => {
      el.textContent = '-42 dB';
    });
  assert.ok(
    await page
      .locator('.track-meter-wrap > small')
      .first()
      .evaluate(
        (el) =>
          getComputedStyle(el).whiteSpace === 'nowrap' && el.scrollWidth <= el.clientWidth + 1,
      ),
  );
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).check();
  for (const message of [
    '预备拍与音乐使用同一播放时钟和音频路径。',
    '导入乐谱 / MIDI 并自动对齐后生效',
  ])
    assert.ok(
      await page
        .getByText(message, { exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 12),
    );
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).uncheck();
  await page.getByRole('button', { name: '和弦', exact: true }).click();
  assert.ok(
    await page
      .locator('.chart-help')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 12),
  );
  assert.ok(
    await page
      .locator('.measure-number')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 12),
  );
  fs.mkdirSync('test-output', { recursive: true });
  await page.screenshot({ path: 'test-output/current-chords-readable.png' });
  await page.getByRole('button', { name: '波形', exact: true }).click();
  const waveform = page.locator('.main-wave-lane .waveform');
  const bounds = await waveform.boundingBox();
  const beforeWindow = await waveform.evaluate(
    (n) => +n.dataset.windowEnd - +n.dataset.windowStart,
  );
  const beforeSeek = await page.locator('.seek').inputValue();
  await waveform.click({ position: { x: bounds.width * 0.8, y: bounds.height * 0.5 } });
  assert.equal(await page.locator('.seek').inputValue(), beforeSeek);
  await waveform.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -150);
  await page.keyboard.up('Control');
  await page.waitForFunction((before) => {
    const n = document.querySelector('.main-wave-lane .waveform');
    return +n.dataset.windowEnd - +n.dataset.windowStart < before;
  }, beforeWindow);
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.5, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(() => +document.querySelector('.seek').value > 0);
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
    await page
      .getByPlaceholder('搜索歌曲、艺术家…', { exact: true })
      .evaluate((el) => getComputedStyle(el).userSelect),
    'text',
  );
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page
        .locator('.donate-label')
        .evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth + 1 && getComputedStyle(el).whiteSpace === 'nowrap',
        ),
    );
  }
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
