const { chromium } = require('playwright'),
  cp = require('node:child_process'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const adb =
  JSON.parse(fs.readFileSync('.runtime/android/config.json')).sdk + '/platform-tools/adb.exe';
const cmd = (...args) => cp.execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
(async () => {
  const pid = cmd('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
  cmd('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
  try {
    const p = b.contexts()[0].pages()[0];
    await p.reload();
    await p.evaluate(() => {
      const original = window.AudioContext;
      window.AudioContext = class extends original {
        constructor(...args) {
          super(...args);
          window.__ctx = this;
        }
      };
    });
    await p.getByRole('button', { name: '打开导航', exact: true }).click();
    await p.getByRole('button', { name: '跟练/创作', exact: true }).click();
    await p.getByRole('button', { name: '打开 手机跟练验收', exact: true }).first().click();
    await p.waitForFunction(() => !document.querySelector('.play-main').disabled);
    await p.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const c = window.__ctx,
          d = c.createMediaStreamDestination(),
          o = c.createOscillator();
        o.frequency.value = 880;
        o.connect(d);
        o.start();
        return d.stream;
      };
    });
    await p.getByRole('button', { name: '练琴录音', exact: true }).click();
    if (await p.locator('.recorder-dialog').count())
      await p.getByRole('button', { name: '开始录音', exact: true }).click();
    await p.waitForSelector('.recording-bar');
    await p.waitForTimeout(1100);
    await p.getByRole('button', { name: '停止并保存', exact: true }).click();
    await p.waitForSelector('.recording-bar', { state: 'detached' });
    const project = await p.evaluate(async () =>
      (await window.jam.call('library')).find((p) => p.title === '手机跟练验收'),
    );
    assert.ok(project.takes.length > 0);
    assert.ok(project.takes.at(-1).duration > 0.7);
    await p.waitForFunction(() => window.__ctx.state === 'suspended');
    console.log(
      'ANDROID_RECORDING_CHECK_PASSED',
      JSON.stringify({
        takes: project.takes.length,
        duration: project.takes.at(-1).duration,
        pausedAudioReleased: true,
      }),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
