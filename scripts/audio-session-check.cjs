const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'),
  path = require('node:path');
const { createInteractionFixture } = require('./fixtures.cjs'),
  { createSession } = require('../desktop/sessions.cjs');
const { data, store, p } = createInteractionFixture(15, true);
require('node:fs').copyFileSync(
  'scripts/audio-monitor-worklet.js',
  'dist/assets/qa-audio-monitor.js',
);
p.tracks[1].mute = true;
p.practice.master = 0.8;
p.practice.metronome = false;
store.save(p);
createSession(store, { kind: 'practice', sourceId: p.id, title: '音频会话验收' });
let app, page;
(async () => {
  app = await electron.launch({
    executablePath: process.env.TEST_PACKAGED
      ? path.resolve('release/win-unpacked/Immerse Jam.exe')
      : require('electron'),
    args: process.env.TEST_PACKAGED ? ['--mute-audio'] : ['.', '--mute-audio'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.join(data, 'profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    const Original = AudioContext,
      connect = AudioNode.prototype.connect;
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__context = this;
      }
    };
    AudioNode.prototype.connect = function (...args) {
      if (this instanceof DynamicsCompressorNode && args[0] instanceof GainNode) {
        window.__meter = this.context.createAnalyser();
        window.__meter.fftSize = 2048;
        connect.call(args[0], window.__meter);
      }
      return connect.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '跟练/创作', exact: true }).click();
  await page.getByRole('button', { name: '打开 音频会话验收', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.waitForFunction(() => window.__context.state === 'suspended');
  console.log('AUDIO_SESSION_STEP initialized');
  await page.evaluate(async () => {
    const context = window.__context;
    window.__resumePeak = 0;
    window.__resumeBlocks = [];
    await context.audioWorklet.addModule(new URL('./assets/qa-audio-monitor.js', location.href));
    const sink = new AudioWorkletNode(context, 'regression-monitor');
    window.__meter.connect(sink);
    sink.connect(context.destination);
    sink.port.onmessage = ({ data }) => {
      if (window.__measureSilent && data.time >= window.__silentAfter) {
        window.__resumePeak = Math.max(window.__resumePeak, data.peak);
        window.__resumeBlocks.push(data);
      }
    };
  });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForFunction(() => window.__context.state === 'running');
    await page.waitForTimeout(120);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.waitForFunction(() => window.__context.state === 'suspended');
  }
  console.log('AUDIO_SESSION_STEP repeated resume');
  // Start in sound, pause and jump into a known silent span. No sample from
  // the previous DSP/compressor state may leak into the resumed silent span.
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('slider', { name: '播放进度', exact: true }).evaluate((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '4.15');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    window.__silentAfter = window.__context.currentTime + 0.04;
    window.__measureSilent = true;
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  assert.ok(
    Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) >= 4.14,
    'seek must target silence',
  );
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const residualPeak = await page.evaluate(() => {
    window.__measureSilent = false;
    return window.__resumePeak;
  });
  if (residualPeak >= 0.00001)
    console.log(
      'RESUME_DIAGNOSTICS',
      JSON.stringify(
        await page.evaluate(() => ({
          after: window.__silentAfter,
          blocks: window.__resumeBlocks.filter((b) => b.peak > 0.00001),
          position: document.querySelector('[aria-label="播放进度"]').value,
        })),
      ),
    );
  assert.ok(residualPeak < 0.00001, 'stale audio leaked into a silent resume: ' + residualPeak);
  console.log('AUDIO_SESSION_STEP silent resume', residualPeak);
  await page.getByRole('button', { name: '练琴录音', exact: true }).click();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.__permissionReply = resolve;
      });
  });
  await page.getByRole('button', { name: '测试并估计延迟', exact: true }).click();
  await page.waitForFunction(() => window.__permissionReply);
  await page.getByRole('button', { name: '取消校准', exact: true }).click();
  await page
    .getByRole('button', { name: '测试并估计延迟', exact: true })
    .waitFor({ timeout: 1500 });
  await page.evaluate(() => {
    const stream = window.__context.createMediaStreamDestination().stream;
    window.__lateTrack = stream.getTracks()[0];
    window.__permissionReply(stream);
  });
  await page.waitForFunction(() => window.__lateTrack.readyState === 'ended');
  console.log('AUDIO_SESSION_STEP pending permission cancelled');
  await page.evaluate(() => {
    const context = window.__context;
    let destination;
    navigator.mediaDevices.getUserMedia = async () => {
      destination = context.createMediaStreamDestination();
      return destination.stream;
    };
    const create = context.createOscillator.bind(context);
    context.createOscillator = function (...args) {
      const oscillator = create(...args),
        start = oscillator.start.bind(oscillator);
      oscillator.start = function (at) {
        const buffer = context.createBuffer(1, 4800, context.sampleRate),
          samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = 0.3 * Math.sin(i * 0.2) * Math.exp(-i / 500);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        source.start(at + 0.18);
        return start(at);
      };
      return oscillator;
    };
    window.__previewPeak = 0;
    window.__monitor = setInterval(() => {
      const samples = new Float32Array(2048);
      window.__meter.getFloatTimeDomainData(samples);
      for (const v of samples) window.__previewPeak = Math.max(window.__previewPeak, Math.abs(v));
    }, 10);
  });
  await page.getByRole('button', { name: '测试并估计延迟', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '取消校准', exact: true }).click();
  await page
    .getByRole('button', { name: '测试并估计延迟', exact: true })
    .waitFor({ timeout: 2000 });
  await page.getByRole('button', { name: '测试并估计延迟', exact: true }).click();
  await page.waitForSelector('.calibration-result', { timeout: 20000 });
  const peak = await page.evaluate(() => {
    clearInterval(window.__monitor);
    return window.__previewPeak;
  });
  assert.ok(peak > 0.005, 'calibration must pass through the actual output gate: ' + peak);
  await page.waitForFunction(() => window.__context.state === 'suspended');
  const clock = await page.evaluate(() => window.__context.currentTime);
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => window.__context.currentTime),
    clock,
    'paused audio rendering is suspended',
  );
  assert.deepEqual(errors, []);
  console.log(
    'AUDIO_SESSION_CHECK_PASSED',
    JSON.stringify({
      pauseReleasesAudio: true,
      repeatResume: true,
      silentResumePeak: residualPeak,
      cancelPendingPermission: true,
      lateStreamReleased: true,
      cancelRunningCalibration: true,
      calibrationOutputPeak: peak,
      clockStopped: true,
      errors,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
