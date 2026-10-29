const { chromium } = require('playwright'),
  cp = require('node:child_process'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const config = JSON.parse(fs.readFileSync('.runtime/android/config.json')),
  adb = config.sdk + '/platform-tools/adb.exe';
const cmd = (...args) => cp.execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
(async () => {
  cmd('shell', 'am', 'start', '-n', 'app.immersejam.mobile/.MainActivity');
  const pid = cmd('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
  cmd('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.reload();
    await page.waitForFunction(() => window.jam);
    const completed = await page.evaluate(async () => {
      const source = (await window.jam.call('library')).find((p) => p.title === 'Android 验收');
      const before = source.results.length;
      let id;
      const done = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          off();
          reject(new Error('Inference timeout'));
        }, 240000);
        const off = window.jam.onEvent((e) => {
          if (e.jobId !== id) return;
          if (['complete', 'error', 'cancelled'].includes(e.type)) {
            clearTimeout(timeout);
            off();
            e.type === 'complete' ? resolve(e.result) : reject(new Error(e.message || e.type));
          }
        });
      });
      id = (
        await window.jam.call('run', {
          id: source.id,
          operation: 'separate',
          modelId: 'scnet-mobile',
          mode: 'drummer',
        })
      ).jobId;
      const p = await done;
      return { before, after: p.results.length, result: p.results.at(-1) };
    });
    assert.equal(completed.after, completed.before + 1);
    assert.equal(completed.result.mode, 'drummer');
    assert.deepEqual(
      completed.result.tracks.map((t) => t.id),
      ['drums', 'other'],
    );
    const cancelled = await page.evaluate(async () => {
      const p = (await window.jam.call('library')).find((p) => p.title === 'Android 验收');
      let id;
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            off();
            reject(new Error('Cancel timeout'));
          }, 30000),
          off = window.jam.onEvent((e) => {
            if (e.jobId === id && ['complete', 'error', 'cancelled'].includes(e.type)) {
              clearTimeout(timer);
              off();
              resolve(e.type);
            }
          });
      });
      id = (
        await window.jam.call('run', {
          id: p.id,
          operation: 'separate',
          modelId: 'uvr-mobile',
          mode: 'vocal',
        })
      ).jobId;
      await window.jam.call('cancel', { jobId: id });
      const type = await done;
      const after = (await window.jam.call('library')).find((x) => x.id === p.id);
      return { type, before: p.results.length, after: after.results.length };
    });
    assert.equal(cancelled.type, 'cancelled');
    assert.equal(cancelled.after, cancelled.before);
    console.log(
      'ANDROID_INFERENCE_CHECK_PASSED',
      JSON.stringify({
        drumMode: {
          before: completed.before,
          after: completed.after,
          tracks: completed.result.tracks.length,
        },
        cancelled,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
