const { chromium } = require('playwright'),
  cp = require('node:child_process'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const adb =
  JSON.parse(fs.readFileSync('.runtime/android/config.json')).sdk + '/platform-tools/adb.exe';
const cmd = (...args) => cp.execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
(async () => {
  try {
    cmd('shell', 'wm', 'size', '2560x1600');
    cmd('shell', 'wm', 'density', '240');
    await wait(1600);
    cmd('shell', 'am', 'start', '-n', 'app.immersejam.mobile/.MainActivity');
    await wait(600);
    const pid = cmd('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
    cmd('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
    const p = browser.contexts()[0].pages()[0];
    await p.reload();
    await p.locator('.song-info').filter({ hasText: 'Android 验收' }).first().click();
    await p.waitForFunction(() => !document.querySelector('.play-main').disabled);
    const bounds = await p.evaluate(() => {
      const rect = (s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { x: r.x, width: r.width, right: r.right };
      };
      return {
        viewport: innerWidth,
        body: document.body.scrollWidth,
        sidebar: rect('.sidebar'),
        wave: rect('.waveform'),
        mixer: rect('.mixer-shell'),
      };
    });
    assert.ok(bounds.viewport > 1000);
    assert.ok(bounds.body <= bounds.viewport + 1);
    assert.ok(bounds.wave.width > 700, JSON.stringify(bounds));
    assert.ok(bounds.wave.right <= bounds.mixer.x + 5, JSON.stringify(bounds));
    fs.writeFileSync(
      'test-output/android-tablet.png',
      cp.execFileSync(adb, ['exec-out', 'screencap', '-p'], { windowsHide: true }),
    );
    cmd('shell', 'input', 'keyevent', '4');
    await p.locator('.browse-content').waitFor({ state: 'visible' });
    cmd('shell', 'input', 'keyevent', '4');
    await wait(350);
    assert.ok(
      cmd('shell', 'dumpsys', 'activity', 'activities').includes(
        'topResumedActivity=ActivityRecord',
      ),
    );
    cmd('shell', 'input', 'keyevent', '4');
    await wait(500);
    const state = cmd('shell', 'dumpsys', 'activity', 'activities')
      .split('\n')
      .find((l) => l.includes('topResumedActivity='));
    assert.ok(!state.includes('app.immersejam.mobile'), state);
    console.log(
      'ANDROID_TABLET_BACK_CHECK_PASSED',
      JSON.stringify({ bounds, doubleBackExit: true }),
    );
  } finally {
    await browser?.close();
    cmd('shell', 'wm', 'size', 'reset');
    cmd('shell', 'wm', 'density', 'reset');
    cmd('shell', 'am', 'start', '-n', 'app.immersejam.mobile/.MainActivity');
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
