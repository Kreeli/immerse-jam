// Run only against a dedicated synthetic project, never a user's existing song.
const { chromium } = require('playwright');
const cp = require('node:child_process'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const adb =
  JSON.parse(fs.readFileSync('.runtime/android/config.json')).sdk + '/platform-tools/adb.exe';
const serial = process.env.ADB_SERIAL,
  title = 'PR6 连续录音临时验收';
if (!serial) throw new Error('Set ADB_SERIAL to the authorized test tablet.');
const run = (...a) =>
  cp.execFileSync(adb, ['-s', serial, ...a], { encoding: 'utf8', windowsHide: true }).trim();
let browser, cdp, page;
(async () => {
  const pid = run('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
  run('forward', 'tcp:9234', 'localabstract:webview_devtools_remote_' + pid);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9234', { noDefaults: true });
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setBypassCSP', { enabled: true });
  await page.reload();
  await page.getByRole('button', { name: title, exact: false }).first().click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.evaluate(async () => {
    const el = document.querySelector('.practice-record-actions');
    let fiber = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
    while (fiber && !fiber.memoizedProps?.onSaved) fiber = fiber.return;
    const props = fiber.memoizedProps;
    // Empty only this synthetic project's comparison slots so both new takes
    // exercise live append rather than the full-library fallback.
    props.onSaved(await window.jam.call('take-select', { id: props.project.id, takeIds: [] }));
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('.mobile-transport');
    let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
    while (f && !f.memoizedProps?.player) f = f.return;
    return f.memoizedProps.player.channels.length === 6 && !f.memoizedProps.player.appendTask;
  });
  await page.evaluate(async () => {
    const el = document.querySelector('.mobile-transport');
    let fiber = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
    while (fiber && !fiber.memoizedProps?.player) fiber = fiber.return;
    const p = (window.__qaPlayer = fiber.memoizedProps.player),
      c = p.context;
    window.__qaBacking = [...p.channels];
    window.__qaStream = p.streaming;
    window.__qaLoads = 0;
    window.__qaTasks = [];
    new PerformanceObserver((list) =>
      window.__qaTasks.push(
        ...list.getEntries().map((e) => ({ phase: window.__qaPhase, ms: e.duration })),
      ),
    ).observe({ type: 'longtask' });
    const load = p.load.bind(p);
    p.load = (...args) => {
      window.__qaLoads++;
      return load(...args);
    };
    const source = `class Probe extends AudioWorkletProcessor {constructor(){super();this.active=false;this.gap=0;this.max=0;this.blocks=0;this.port.onmessage=({data})=>{if(data==='start'){this.active=true;this.gap=0;this.max=0;this.blocks=0}if(data==='stats'){this.port.postMessage({blocks:this.blocks,maxSilentSeconds:this.max/sampleRate})}if(data==='stop')this.active=false}} process(inputs){if(this.active){let peak=0;for(const ch of inputs[0]||[])for(const v of ch)peak=Math.max(peak,Math.abs(v));this.gap=peak<.000001?this.gap+128:0;this.max=Math.max(this.max,this.gap);this.blocks++}return true}} registerProcessor('recording-probe',Probe)`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    await c.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const probe = (window.__qaProbe = new AudioWorkletNode(c, 'recording-probe')),
      mute = (window.__qaMute = c.createGain());
    mute.gain.value = 0;
    p.limiter.connect(probe);
    probe.connect(mute);
    mute.connect(c.destination);
    probe.port.onmessage = ({ data }) => (window.__qaProbeResult = data);
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => {
    window.__qaProbe.port.postMessage('start');
    return window.__qaPlayer.context.playbackStats?.toJSON();
  });
  const rounds = [];
  for (let n = 0; n < 2; n++) {
    const phases = [];
    const phase = async (name) =>
      phases.push(
        await page.evaluate((name) => {
          window.__qaPhase = name;
          return { name, stats: window.__qaPlayer.context.playbackStats?.toJSON() };
        }, name),
      );
    const start = await page.evaluate(() => window.__qaPlayer.position());
    await phase('before-start');
    await page.getByRole('button', { name: '练琴录音', exact: true }).click();
    await page.waitForSelector('.transport-record.active');
    await phase('recording');
    await page.waitForTimeout(1200);
    const stop = await page.evaluate(() => window.__qaPlayer.position());
    await phase('before-stop');
    await page.getByRole('button', { name: '停止并保存', exact: true }).click();
    await page.waitForSelector('.transport-record.active', { state: 'detached' });
    await page.waitForFunction(() => !window.__qaPlayer.appendTask);
    await phase('saved');
    await page.waitForTimeout(350);
    const state = await page.evaluate(() => {
      const p = window.__qaPlayer;
      return {
        playing: p.playing,
        position: p.position(),
        loads: window.__qaLoads,
        backingIntact: window.__qaBacking.every((c, i) => p.channels[i] === c),
        sameStream: window.__qaStream === p.streaming,
        takes: p.project.takes.length,
      };
    });
    assert.ok(state.playing && state.position > stop && stop > start, JSON.stringify(state));
    assert.equal(state.loads, 0);
    assert.equal(state.backingIntact, true);
    assert.equal(state.sameStream, true);
    rounds.push({ ...state, phases });
  }
  await page.evaluate(() => window.__qaProbe.port.postMessage('stats'));
  await page.waitForTimeout(100);
  const metrics = await page.evaluate(() => ({
    stats: window.__qaPlayer.context.playbackStats?.toJSON(),
    probe: window.__qaProbeResult,
    viewport: { w: innerWidth, h: innerHeight },
    overflow: document.body.scrollWidth > innerWidth + 1,
  }));
  fs.writeFileSync(
    '.runtime/pr6-pad-diagnostics.json',
    JSON.stringify(
      { before, metrics, rounds, errors, tasks: await page.evaluate(() => window.__qaTasks) },
      null,
      2,
    ),
  );
  assert.ok(metrics.probe.blocks > 500);
  assert.ok(metrics.probe.maxSilentSeconds < 0.02, JSON.stringify(metrics));
  assert.equal(metrics.overflow, false);
  await page.screenshot({ path: '.runtime/pr6-pad-wave.png' });
  await page.getByRole('tab', { name: '和弦', exact: true }).click();
  await page.screenshot({ path: '.runtime/pr6-pad-chords.png' });
  await page.getByRole('tab', { name: '波形', exact: true }).click();
  await page.getByRole('button', { name: '调整倍速', exact: true }).click();
  await page.screenshot({ path: '.runtime/pr6-pad-speed.png' });
  await page.getByRole('button', { name: '调整倍速', exact: true }).click();
  await page.evaluate(() => {
    const p = window.__qaPlayer;
    p.pause();
    p.limiter.disconnect(window.__qaProbe);
    window.__qaProbe.disconnect();
    window.__qaMute.disconnect();
    p.seek(0);
  });
  const result = {
    before,
    ...metrics,
    rounds,
    errors,
    tasks: await page.evaluate(() => window.__qaTasks),
    underrunEvents: metrics.stats?.underrunEvents - before?.underrunEvents,
  };
  fs.writeFileSync('.runtime/pr6-pad-recording.json', JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  console.log('ANDROID_RECORDING_CONTINUITY_CHECK_PASSED', JSON.stringify(result));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await page?.evaluate(() => window.__qaPlayer?.pause()).catch(() => {});
    await cdp?.send('Page.setBypassCSP', { enabled: false }).catch(() => {});
    await browser?.close();
  });
