// Isolated synthetic session: verify start/stop without rebuilding backing audio.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createInteractionFixture } = require('./fixtures.cjs');
const { createSession } = require('../desktop/sessions.cjs');
const { data, store, p: source } = createInteractionFixture(60);
source.tracks[1].mute = true; // the fixture's second track cancels the first
source.practice.countIn = false;
source.practice.metronome = false;
store.save(source);
let project = createSession(store, {
  kind: 'practice',
  sourceId: source.id,
  title: '录音连续性验收',
});
project.recordingSettings = {
  mode: 'instrument',
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  channel: 'mono',
  latencyMs: 0,
};
store.save(project);
fs.copyFileSync('scripts/audio-monitor-worklet.js', 'dist/assets/qa-audio-monitor.js');
let app;
(async () => {
  app = await electron.launch({
    executablePath: require('electron'),
    args: [
      '.',
      '--mute-audio',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=' + path.join(data, 'positive.wav'),
    ],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.join(data, 'profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: '跟练/创作', exact: true }).click();
  await page.getByRole('button', { name: '打开 录音连续性验收', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.evaluate(async () => {
    const el = document.querySelector('.transport');
    let fiber = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
    while (fiber && !fiber.memoizedProps?.player) fiber = fiber.return;
    const player = (window.__player = fiber.memoizedProps.player);
    window.__backing = [...player.channels];
    window.__loads = 0;
    const load = player.load.bind(player);
    player.load = (...args) => {
      window.__loads++;
      return load(...args);
    };
    await player.context.audioWorklet.addModule(
      new URL('./assets/qa-audio-monitor.js', location.href),
    );
    const monitor = new AudioWorkletNode(player.context, 'regression-monitor');
    player.limiter.connect(monitor);
    monitor.connect(player.context.destination);
    window.__blocks = [];
    monitor.port.onmessage = ({ data }) => window.__blocks.push(data);
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(500);
  for (let n = 0; n < 3; n++) {
    const before = await page.evaluate(() => {
      window.__testStart = window.__player.context.currentTime;
      return window.__player.position();
    });
    await page.getByRole('button', { name: '练琴录音', exact: true }).click();
    await page.waitForSelector('.recording-bar');
    await page.waitForTimeout(650);
    const stopPosition = await page.evaluate(() => window.__player.position());
    await page.getByRole('button', { name: '停止并保存', exact: true }).click();
    await page.waitForSelector('.recording-bar', { state: 'detached' });
    await page.waitForFunction(() => !window.__player.appendTask);
    await page.waitForTimeout(350);
    const state = await page.evaluate(() => {
      const p = window.__player;
      const blocks = window.__blocks.filter(
        (b) => b.time > window.__testStart + 0.02 && b.time < p.context.currentTime - 0.02,
      );
      let longest = 0,
        run = 0;
      for (const block of blocks) {
        run = block.peak < 0.0001 ? run + 128 / p.context.sampleRate : 0;
        longest = Math.max(longest, run);
      }
      return {
        playing: p.playing,
        position: p.position(),
        loads: window.__loads,
        unchanged: window.__backing.every((c, i) => p.channels[i] === c),
        longestSilentSeconds: longest,
        channels: p.channels.length,
        takes: p.project.takes.length,
        selected: p.project.selectedTakeIds.length,
      };
    });
    assert.equal(state.playing, true);
    assert.ok(state.position > stopPosition && stopPosition > before);
    assert.equal(state.loads, 0, 'stop must not reload the project');
    assert.equal(state.unchanged, true, 'backing channels remain connected');
    assert.ok(state.longestSilentSeconds < 0.02, JSON.stringify(state));
    console.log('RECORDING_CONTINUITY', n + 1, JSON.stringify(state));
  }
  await page.screenshot({ path: path.join(data, 'desktop-dark.png') });
  await app.browserWindow(page).then((w) => w.evaluate((w) => w.setSize(1024, 700)));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(data, 'desktop-small.png') });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await page.screenshot({ path: path.join(data, 'desktop-light.png') });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('RECORDING_CONTINUITY_CHECK_PASSED', data);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
