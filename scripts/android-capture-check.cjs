// Focused local-emulator check. Uses Android AudioRecord, never a fake microphone.
// Creates a new empty project; no existing projects/media are edited.
const { chromium } = require('playwright');
const cp = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const sdk = JSON.parse(fs.readFileSync('.runtime/android/config.json')).sdk;
const adb = (...args) =>
  cp
    .execFileSync(sdk + '/platform-tools/adb.exe', ['-s', 'emulator-5554', ...args], {
      encoding: 'utf8',
      windowsHide: true,
    })
    .trim();
let browser;
(async () => {
  adb('shell', 'pm', 'grant', 'app.immersejam.mobile', 'android.permission.RECORD_AUDIO');
  adb('shell', 'am', 'start', '-n', 'app.immersejam.mobile/.MainActivity');
  for (let i = 0; i < 30; i++) {
    try {
      const pid = adb('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
      adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
      browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
      if (browser.contexts()[0]?.pages().length) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(browser, 'emulator WebView');
  const page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(20000);
  await page.waitForFunction(() => window.jam);
  await page.evaluate(() =>
    localStorage.setItem(
      'immerse.preferences',
      JSON.stringify({ language: 'zh-CN', theme: 'dark', accent: 'rose' }),
    ),
  );
  await page.reload();
  const title = '原生录音验收 ' + Date.now();
  const project = await page.evaluate(async (title) => {
    const project = await window.jam.call('session-create', { kind: 'creation', title });
    await window.jam.call('update', {
      id: project.id,
      patch: {
        recordingSettings: {
          mode: 'instrument',
          inputDeviceId: 'default',
          outputDeviceId: 'default',
          channel: 'mono',
          latencyMs: 0,
        },
      },
    });
    return project;
  }, title);
  await page.reload();
  await page.locator('.mobile-project-open').filter({ hasText: title }).click();
  await page.waitForFunction(() => !document.querySelector('.transport-record').disabled);
  const devices = await page.evaluate(() =>
    window.jam.call('android-capture-devices', { permission: true }),
  );
  assert.ok(
    devices.some((device) => device.kind === 'audioinput' && device.label),
    'native input enumeration',
  );
  await page.getByRole('button', { name: '录音', exact: true }).click();
  await page.getByRole('button', { name: '停止并保存', exact: true }).waitFor();
  await page.waitForTimeout(1400);
  await page.getByRole('button', { name: '停止并保存', exact: true }).click();
  await page.getByRole('button', { name: '录音', exact: true }).waitFor();
  const result = await page.evaluate(async (id) => {
    const p = (await window.jam.call('library')).find((p) => p.id === id);
    const take = p.takes?.at(-1);
    if (!take) return { p };
    const response = await fetch('/projects/' + id + '/' + take.rawFile);
    return {
      duration: take.duration,
      takes: p.takes.length,
      bytes: (await response.arrayBuffer()).byteLength,
      take,
    };
  }, project.id);
  assert.equal(result.takes, 1, JSON.stringify(result));
  assert.ok(result.duration > 0.7, JSON.stringify(result));
  assert.ok(result.bytes > 48000 * 8 * 0.5, JSON.stringify(result));
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
  await page.waitForFunction(() => Number(document.querySelector('.seek').value) > 0.25);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  // Calibration opens the same native input path, then cancellation must free
  // the device so another input can start immediately.
  await page.getByRole('button', { name: '更多工具', exact: true }).click();
  await page.getByRole('button', { name: '录音设置', exact: true }).click();
  await page.getByRole('button', { name: '测试并估计延迟', exact: true }).click();
  await page.getByRole('button', { name: '取消校准', exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '取消校准', exact: true }).click();
  await page.getByRole('button', { name: '测试并估计延迟', exact: true }).waitFor();
  const reopened = await page.evaluate(async () => {
    const s = await window.jam.call('android-capture-open', { device: 'default', channel: 'mono' });
    await window.jam.call('android-capture-stop', { session: s.id });
    await window.jam.call('android-capture-close', { session: s.id });
    return s.channels;
  });
  console.log(
    'ANDROID_NATIVE_CAPTURE_PASSED',
    JSON.stringify({
      inputDevices: devices.length,
      duration: result.duration,
      bytes: result.bytes,
      calibrationCancelled: true,
      reopenedChannels: reopened,
    }),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
  });
