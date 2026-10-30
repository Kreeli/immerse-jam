// Local, opt-in simulator acceptance. Requires android-device-fixtures.cjs and instrumentation.
const { chromium } = require('playwright'),
  cp = require('node:child_process'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const adb =
  JSON.parse(fs.readFileSync('.runtime/android/config.json')).sdk + '/platform-tools/adb.exe';
const cmd = (...args) => cp.execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
let browser, page;
async function connect() {
  cmd('shell', 'am', 'start', '-n', 'app.immersejam.mobile/.MainActivity');
  for (let i = 0; i < 30; i++) {
    try {
      const pid = cmd('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
      cmd('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
      browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
      page = browser
        .contexts()[0]
        .pages()
        .find((p) => p.url().includes('/app/'));
      if (page) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(page);
  page.on('console', (m) => {
    if (m.text().startsWith('DEVICE_')) console.log(m.text());
  });
  await page.waitForFunction(() => window.jam);
  return page;
}
async function run(request) {
  return page.evaluate(async (request) => {
    let jobId,
      last = -1;
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('Native job timeout'));
      }, 300000);
      const off = window.jam.onEvent((e) => {
        if (e.jobId !== jobId) return;
        if (e.type === 'progress' && Math.floor(e.progress * 10) !== last) {
          last = Math.floor(e.progress * 10);
          console.log(
            'DEVICE_JOB ' +
              request.operation +
              ' ' +
              Math.round(e.progress * 100) +
              '% ' +
              e.message,
          );
        }
        if (['complete', 'error', 'cancelled'].includes(e.type)) {
          clearTimeout(timer);
          off();
          e.type === 'complete' ? resolve(e.result) : reject(new Error(e.message || e.type));
        }
      });
    });
    jobId = (await window.jam.call('run', request)).jobId;
    return done;
  }, request);
}
async function appendTone(id, options, seconds, frequency) {
  await page.evaluate(
    async ({ id, options, seconds, frequency }) => {
      const rate = options.sampleRate,
        frames = Math.round(rate * seconds);
      for (let start = 0, sequence = 0; start < frames; start += 8192, sequence++) {
        const n = Math.min(8192, frames - start),
          samples = new Float32Array(n * 2);
        for (let i = 0; i < n; i++)
          samples[i * 2] = samples[i * 2 + 1] =
            0.2 * Math.sin((2 * Math.PI * frequency * (start + i)) / rate);
        await window.jam.call('take-append', {
          sessionId: id,
          sequence,
          contextTime: options.anchorTime + 0.02 + start / rate,
          bytes: new Uint8Array(samples.buffer),
        });
      }
    },
    { id, options, seconds, frequency },
  );
}
async function frequency(project, take) {
  return page.evaluate(
    async ({ project, take }) => {
      const path =
          '/projects/' + project.id + '/' + take.file.split('/').map(encodeURIComponent).join('/'),
        data = await (await fetch(path)).arrayBuffer(),
        view = new DataView(data);
      const rate = view.getUint32(24, true),
        bits = view.getUint16(34, true),
        frames = (data.byteLength - 44) / ((bits / 8) * 2);
      if (bits !== 32) throw new Error('Expected float normalization');
      let crossings = 0;
      const start = Math.round(rate * 0.3),
        end = Math.min(frames - 2, start + Math.round(rate * 0.5));
      for (let i = start; i < end; i++)
        if (view.getFloat32(44 + i * 8, true) <= 0 && view.getFloat32(44 + (i + 1) * 8, true) > 0)
          crossings++;
      return {
        frequency: (crossings * rate) / (end - start),
        duration: frames / rate,
        format: view.getUint16(20, true),
      };
    },
    { project, take },
  );
}
(async () => {
  await connect();
  const source = await page.evaluate(async () =>
    (await window.jam.call('library')).find((p) => p.title === 'Android 节拍与对齐验收'),
  );
  assert.ok(source, 'Run device fixture instrumentation');
  // Reset this synthetic fixture's reviewed timing so repeat runs test preservation too.
  source.analysis.bpm = 120.123;
  source.analysis.tempoReviewed = true;
  await page.evaluate(
    ({ id, analysis }) => window.jam.call('update', { id, patch: { analysis } }),
    source,
  );
  console.log(
    'DEVICE_MEMORY',
    JSON.stringify(await page.evaluate(() => window.jam.call('android-device'))),
  );
  const kept = await run({ id: source.id, operation: 'analyze' });
  assert.equal(kept.analysis.bpm, 120.123);
  assert.equal(kept.analysis.tempoReviewed, true);
  assert.deepEqual(kept.analysis.beats, source.analysis.beats);
  const analyzed = await run({ id: source.id, operation: 'analyze', refreshRhythm: true });
  assert.equal(analyzed.analysis.tempoMethod, 'beat-this');
  assert.equal(analyzed.analysis.beats.length, 72);
  assert.equal(analyzed.analysis.downbeats.length, 18);
  assert.ok(Math.abs(analyzed.analysis.bpm - 120) < 0.1);
  const error = Math.max(
    ...analyzed.analysis.beats.map((t, i) => Math.abs(t - source.analysis.beats[i])),
  );
  assert.ok(error <= 0.021);
  const aligned = await run({ id: source.id, operation: 'align' });
  assert.equal(aligned.alignment.notes.length, 12);
  assert.ok(aligned.alignment.points.at(-1).audioTime > 34);
  assert.equal(aligned.alignment.transpose, 0);
  for (let i = 1; i < aligned.alignment.points.length; i++)
    assert.ok(aligned.alignment.points[i].audioTime >= aligned.alignment.points[i - 1].audioTime);
  const project = await page.evaluate(
    (sourceId) =>
      window.jam.call('session-create', {
        kind: 'creation',
        sourceId,
        title: 'Android 变速录音验收',
      }),
    source.id,
  );
  const options = {
    sampleRate: 22050,
    tempo: 0.5,
    pitch: 12,
    anchorPosition: 4,
    anchorTime: 10,
    latencyMs: 100,
    mode: 'instrument',
  };
  const session = await page.evaluate(
    ({ id, options }) => window.jam.call('take-start', { id, options }),
    { id: project.id, options },
  );
  await appendTone(session.id, options, 2, 880);
  const saved = await page.evaluate(
      (sessionId) => window.jam.call('take-finish', { sessionId }),
      session.id,
    ),
    take = saved.takes.find((t) => t.id === session.id),
    signal = await frequency(saved, take);
  assert.ok(Math.abs(signal.frequency - 440) < 5);
  assert.equal(take.duration, 1);
  assert.ok(Math.abs(take.start - 3.96) < 1e-8);
  assert.equal(take.recordedTempo, 0.5);
  assert.notEqual(take.file, take.rawFile);
  const recoveryOptions = {
    ...options,
    tempo: 1.5,
    pitch: -5,
    anchorPosition: 2,
    anchorTime: 20,
    latencyMs: 0,
  };
  const pending = await page.evaluate(
    ({ id, options }) => window.jam.call('take-start', { id, options }),
    { id: project.id, options: recoveryOptions },
  );
  await appendTone(pending.id, recoveryOptions, 1, 440 * 2 ** (-5 / 12));
  await browser.close();
  browser = null;
  page = null;
  cmd('shell', 'am', 'force-stop', 'app.immersejam.mobile');
  await connect();
  const recovered = await page.evaluate(
      (id) => window.jam.call('take-recover', { id }),
      project.id,
    ),
    restored = recovered.takes.find((t) => t.id === pending.id),
    restoredSignal = await frequency(recovered, restored);
  assert.equal(restored.duration, 1.5);
  assert.ok(Math.abs(restoredSignal.frequency - 440) < 5);
  assert.ok(Math.abs(restored.start - 2.03) < 1e-8);
  console.log(
    'ANDROID_NATIVE_PARITY_PASSED',
    JSON.stringify({
      beats: 72,
      downbeats: 18,
      bpm: analyzed.analysis.bpm,
      maximumBeatError: error,
      alignmentPoints: aligned.alignment.points.length,
      alignmentConfidence: aligned.alignment.confidence,
      normalization: signal,
      recovered: restoredSignal,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
  });
