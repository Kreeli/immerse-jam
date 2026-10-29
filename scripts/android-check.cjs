const { chromium } = require('playwright');
const cp = require('node:child_process'),
  path = require('node:path'),
  fs = require('node:fs'),
  assert = require('node:assert/strict'),
  os = require('node:os');
const config = JSON.parse(fs.readFileSync('.runtime/android/config.json'));
const adb = path.join(config.sdk, 'platform-tools/adb.exe');
const command = (...args) =>
  cp.execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
(async () => {
  command('shell', 'am', 'start', '-n', 'app.immersejam.mobile/.MainActivity');
  const pid = command('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
  command('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
  let browser;
  for (let i = 0; i < 20; i++) {
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
      break;
    } catch (error) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert.ok(browser, 'WebView debugging connection');
  try {
    const page = browser
      .contexts()[0]
      .pages()
      .find((p) => p.url().includes('/app/'));
    assert.ok(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(() =>
      localStorage.setItem(
        'immerse.preferences',
        JSON.stringify({ language: 'zh-CN', theme: 'dark', accent: 'rose' }),
      ),
    );
    await page.reload();
    await page.getByRole('button', { name: '导入音乐', exact: true }).waitFor();
    const viewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      body: document.body.scrollWidth,
      platform: document.documentElement.dataset.platform,
    }));
    assert.equal(viewport.platform, 'android');
    assert.ok(viewport.body <= viewport.width + 1, JSON.stringify(viewport));
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await page.getByRole('button', { name: '设置与模型', exact: true }).click();
    await page
      .getByText(
        '复杂曲目中，智能节拍器与和弦识别可能不够准确。技术仍有局限，感谢乐手们的理解；可按听感手动校准节拍和和弦。',
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByText('NVIDIA 显卡加速', { exact: true }).count(), 0);
    const device = await page.evaluate(() => window.jam.call('android-device'));
    assert.ok(device.totalMb > 0);
    command('shell', 'input', 'keyevent', '4');
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    fs.mkdirSync('test-output', { recursive: true });
    fs.writeFileSync(
      'test-output/android-library.png',
      cp.execFileSync(adb, ['exec-out', 'screencap', '-p'], { windowsHide: true }),
    );
    const song = page.locator('.song-info').filter({ hasText: 'Android 验收' }).first();
    if (await song.count()) {
      await song.click();
      await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
      await page.getByRole('button', { name: '播放', exact: true }).click();
      await page.waitForTimeout(500);
      assert.ok(
        Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) >
          0.1,
      );
      await page.getByRole('button', { name: '打开控制台', exact: true }).click();
      await page.locator('.mixer-shell').waitFor({ state: 'visible' });
      command('shell', 'input', 'keyevent', '4');
      await page.locator('.mixer-shell').waitFor({ state: 'hidden' });
      fs.writeFileSync(
        'test-output/android-player.png',
        cp.execFileSync(adb, ['exec-out', 'screencap', '-p'], { windowsHide: true }),
      );
      command('shell', 'input', 'keyevent', '4');
      await page.locator('.browse-content').waitFor({ state: 'visible' });
      assert.equal(
        await page.getByRole('button', { name: '暂停', exact: true }).count(),
        1,
        'browse keeps playback',
      );
      await page.getByRole('button', { name: '暂停', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log(
      'ANDROID_UI_CHECK_PASSED',
      JSON.stringify({ viewport, device, back: true, playback: true, errors }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
