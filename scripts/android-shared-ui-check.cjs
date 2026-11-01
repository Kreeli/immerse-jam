// Shared Android UI/bridge check, independent of SDK, model weights and personal media.
const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { store, p } = require('./fixtures.cjs').createInteractionFixture(12, true);
p.kind = 'practice';
p.tracks[1].mute = true;
p.analysis.tempoMethod = 'beat-this';
p.analysis.tempoReviewed = true;
p.practice.metronome = false;
p.takes = [-0.123456789, 0.23456789].map((start, i) => {
  const id = require('node:crypto').randomUUID(),
    file = `recordings/${id}/audio.wav`;
  fs.mkdirSync(path.dirname(store.asset(p.id, file)), { recursive: true });
  fs.copyFileSync(store.asset(p.id, p.tracks[0].file), store.asset(p.id, file));
  return {
    id,
    name: '演奏录音 ' + (i + 1),
    file,
    start,
    offsetMs: 0,
    duration: 12,
    gain: 0.4,
    pan: 0,
    mute: false,
    solo: false,
    mode: 'instrument',
  };
});
p.selectedTakeIds = p.takes.map((t) => t.id);
store.save(p);
const { StreamFixture } = require('./android-stream-fixture.cjs');
const streaming = new StreamFixture(store);
fs.copyFileSync('scripts/audio-monitor-worklet.js', 'dist-android/assets/qa-audio-monitor.js');
const models = require('../platforms/android/model-catalog.json').map((m) => ({
  ...m,
  installed: !!m.bundled,
}));
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
      parts = pathname.split('/');
    if (pathname.startsWith('/stream/')) return streaming.serve(pathname, res);
    const media = pathname.startsWith('/projects/');
    const file = media
      ? store.asset(parts[2], parts.slice(3).join('/'))
      : path.resolve('dist-android', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!media && !file.startsWith(path.resolve('dist-android') + path.sep))
      throw new Error('Path');
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.wav': 'audio/wav',
        '.wasm': 'application/wasm',
      }[path.extname(file)] || 'application/octet-stream',
    );
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
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.exposeFunction('__qaStream', (method, data) => streaming.call(method, data));
  await page.exposeFunction('__qaUpdate', (data) => store.update(data.id, data.patch));
  await page.addInitScript(
    ({ project, models }) => {
      localStorage.setItem(
        'immerse.preferences',
        JSON.stringify({ language: 'zh-CN', theme: 'dark', accent: 'rose' }),
      );
      const text = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (label, x, y, ...rest) {
        if (window.__tickLabels && /^\d+:\d{2}$/.test(label))
          window.__tickLabels.push({
            x,
            width: this.measureText(label).width,
            bound: this.canvas.clientWidth,
          });
        return text.call(this, label, x, y, ...rest);
      };
      window.__largestBuffer = 0;
      const Context = AudioContext,
        connect = AudioNode.prototype.connect;
      window.AudioContext = class extends Context {
        constructor(...args) {
          super(...args);
          window.__context = this;
        }
      };
      const createBuffer = Context.prototype.createBuffer;
      Context.prototype.createBuffer = function (channels, frames, rate) {
        window.__largestBuffer = Math.max(window.__largestBuffer, frames);
        return createBuffer.call(this, channels, frames, rate);
      };
      Context.prototype.decodeAudioData = () => {
        throw new Error('Whole-file decoding must never run on Android');
      };
      AudioNode.prototype.connect = function (...args) {
        if (this instanceof WaveShaperNode && args[0] instanceof AudioDestinationNode) {
          window.__meter = this.context.createAnalyser();
          connect.call(this, window.__meter);
        }
        return connect.apply(this, args);
      };
      window.__nativeCalls = [];
      window.ImmerseNative = {
        onmessage: null,
        async postMessage(text) {
          const { id, method, data } = JSON.parse(text);
          window.__nativeCalls.push({ method, data });
          let result;
          if (method.startsWith('android-stream-')) result = await window.__qaStream(method, data);
          else if (method === 'library') result = [project];
          else if (method === 'android-capture-devices')
            result = [{ deviceId: 'android:1', kind: 'audioinput', label: '设备输入' }];
          else if (method === 'models') result = models;
          else if (method === 'folders-list') result = [];
          else if (method === 'runtime-status') result = { ready: true };
          else if (method === 'update') result = project = await window.__qaUpdate(data);
          else if (method === 'run') result = { jobId: 'mobile-job' };
          else if (method === 'android-scan-pair')
            result = 'http://192.168.1.2/?token=' + 'a'.repeat(48);
          else if (method === 'android-lan-list')
            result = [{ id: project.id, title: project.title }];
          else if (method === 'android-lan-download') result = [project];
          else if (
            method === 'android-playback-budget' ||
            method === 'android-playback-state' ||
            method === 'ui-language' ||
            method === 'android-share-projects' ||
            method === 'peer-close' ||
            method === 'android-lan-cancel' ||
            method === 'android-lan-upload'
          )
            result = true;
          else if (method === 'cancel') {
            result = true;
            setTimeout(
              () =>
                window.ImmerseNative.onmessage({
                  data: JSON.stringify({ event: { type: 'cancelled', jobId: 'mobile-job' } }),
                }),
              10,
            );
          } else throw new Error('Unexpected mobile method ' + method);
          queueMicrotask(() =>
            window.ImmerseNative.onmessage({ data: JSON.stringify({ id, result }) }),
          );
        },
      };
    },
    { project: p, models },
  );
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('.mobile-project-open').waitFor();
  assert.equal(await page.locator('.mobile-chrome, .sidebar, .practice-guide').count(), 0);
  await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-home.png' });
  await page.getByRole('button', { name: '第一次使用？', exact: true }).click();
  await page.getByRole('img', { name: '练习界面图解', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('.mobile-settings-nav').waitFor();
  await page.getByRole('combobox', { name: '界面语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).waitFor();
  await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-select.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: '明暗主题', exact: true }).click();
  await page.getByRole('option', { name: '浅色', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.screenshot({
    animations: 'disabled',
    path: '.runtime/review-android-settings-light.png',
  });
  await page.getByRole('combobox', { name: '明暗主题', exact: true }).click();
  await page.getByRole('option', { name: '暗色', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.locator('.mobile-project-open').click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  assert.equal(await page.getByRole('button', { name: '开始分析', exact: true }).count(), 0);
  await page.evaluate(async () => {
    const context = window.__context;
    await context.audioWorklet.addModule('/assets/qa-audio-monitor.js');
    const monitor = new AudioWorkletNode(context, 'regression-monitor');
    window.__meter.connect(monitor);
    monitor.connect(context.destination);
    window.__peak = 0;
    window.__windows = [];
    monitor.port.onmessage = ({ data }) => {
      if (window.__checkContinuity) window.__windows.push(data);
      if (window.__measure && data.time >= window.__after)
        window.__peak = Math.max(window.__peak, data.peak);
    };
  });
  const wave = await page.locator('.main-wave-lane .waveform').boundingBox();
  assert.ok(
    wave.height >= 120,
    'waveform must receive most of the phone height: ' + JSON.stringify(wave),
  );
  await page.waitForFunction(
    () => Number(document.querySelector('.main-wave-lane .waveform').dataset.peakCount) > 0,
  );
  const waveElement = page.locator('.main-wave-lane .waveform');
  const windowBefore = await waveElement.evaluate(
    (n) => +n.dataset.windowEnd - +n.dataset.windowStart,
  );
  await waveElement.click({ position: { x: wave.width * 0.8, y: wave.height * 0.5 } });
  assert.equal(await page.locator('.seek').inputValue(), '0', 'clicking a waveform does not seek');
  await waveElement.evaluate((el) => {
    const capture = el.setPointerCapture;
    el.setPointerCapture = () => {};
    const emit = (type, id, x) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: id,
          pointerType: 'touch',
          button: 0,
          clientX: x,
          clientY: 200,
        }),
      );
    emit('pointerdown', 11, 100);
    emit('pointerdown', 12, 200);
    emit('pointermove', 12, 300);
    emit('pointerup', 12, 300);
    emit('pointerup', 11, 100);
    el.setPointerCapture = capture;
  });
  await page.waitForFunction((before) => {
    const n = document.querySelector('.main-wave-lane .waveform');
    return Math.abs(+n.dataset.windowEnd - +n.dataset.windowStart - before / 2) < 0.01;
  }, windowBefore);
  assert.equal(
    await page.locator('.seek').inputValue(),
    '0',
    'pinching changes zoom without seeking',
  );
  // Returning to the wave tab preserves the renderer and its envelope buffer.
  await waveElement.evaluate((el) => (el.dataset.testIdentity = 'retained'));
  assert.equal(await page.locator('.mobile-actions > button').count(), 4);
  assert.equal(await page.locator('.mobile-player-tabs > button').count(), 4);
  const lanes = await page.locator('.practice-wave-comparison .waveform').evaluateAll((nodes) =>
    nodes.map((n) => ({
      top: n.getBoundingClientRect().top,
      bottom: n.getBoundingClientRect().bottom,
      height: n.getBoundingClientRect().height,
    })),
  );
  assert.equal(lanes.length, 3);
  assert.ok(lanes.every((l) => l.height > 70));
  assert.ok(
    lanes.at(-1).bottom <= (await page.locator('.mobile-practice-tools').boundingBox()).y + 1,
    'all three waves fit above tools',
  );
  assert.equal(
    await page
      .locator('.practice-record-actions')
      .evaluate((n) => getComputedStyle(n).borderTopWidth),
    '0px',
  );
  const seekBox = await page.locator('.seek').boundingBox(),
    playBox = await page.locator('.play-main').boundingBox();
  assert.ok(seekBox.y < playBox.y, 'progress is above playback controls');
  const controls = await page.locator('.mobile-practice-tools > button').all();
  assert.equal(await controls[0].getAttribute('aria-label'), '打开控制台');
  await page.getByRole('button', { name: '导入与导出', exact: true }).click();
  await page.getByRole('button', { name: '导入项目或音频', exact: true }).waitFor();
  await page.getByRole('button', { name: '导出音乐', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-player.png' });
  await page.getByRole('button', { name: '调整倍速', exact: true }).click();
  await page.getByRole('button', { name: '重置', exact: true }).waitFor();
  await page.getByRole('slider', { name: '播放速度', exact: true }).waitFor();
  await page.getByRole('button', { name: '调整倍速', exact: true }).click();
  await page.getByRole('button', { name: '打开控制台', exact: true }).click();
  const before = await page.evaluate(
    () => window.__nativeCalls.filter((c) => c.method === 'update').length,
  );
  await page
    .locator('.track-slider input')
    .first()
    .evaluate((slider) => {
      for (let i = 0; i < 20; i++) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
          slider,
          String(0.5 + i / 100),
        );
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      window.dispatchEvent(new Event('pointerup'));
    });
  await page.waitForTimeout(300);
  assert.ok(
    await page.evaluate(
      (before) => window.__nativeCalls.filter((c) => c.method === 'update').length - before <= 2,
      before,
    ),
  );
  await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-phone.png' });
  await page.getByRole('button', { name: '关闭控制台', exact: true }).click();
  for (const name of ['和弦', '乐谱', '附件', '波形']) {
    await page.getByRole('tab', { name, exact: true }).click();
    if (name === '和弦') {
      const rows = page.locator('.chart-row:not(.pickup-row)');
      assert.equal(await rows.first().locator('.chart-measure').count(), 4);
      assert.ok((await page.locator('.chart-header').boundingBox()).height <= 54);
      await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-chords.png' });
      assert.equal(await page.getByRole('button', { name: '和弦谱设置', exact: true }).count(), 0);
      assert.equal(await page.locator('.chord-bank').count(), 0);
      await page.getByRole('button', { name: '当前和弦谱', exact: true }).click();
      await page.getByRole('menuitem', { name: '新建和弦谱', exact: true }).click();
      await page.getByRole('textbox', { name: '和弦谱名称', exact: true }).fill('练习自制谱');
      await page.getByRole('button', { name: '创建', exact: true }).click();
      await page.locator('.chord-token.empty-slot').first().click();
      await page.getByRole('textbox', { name: '和弦名称', exact: true }).fill('自由文字 / Cmaj9');
      await page.getByRole('textbox', { name: '和弦名称', exact: true }).press('Enter');
      await page.getByRole('button', { name: '当前和弦谱', exact: true }).click();
      await page.getByRole('menuitem', { name: '删除和弦谱 练习自制谱', exact: true }).waitFor();
      await page.screenshot({
        animations: 'disabled',
        path: '.runtime/review-android-chord-menu.png',
      });
      await page.keyboard.press('Escape');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  assert.equal(await waveElement.getAttribute('data-test-identity'), 'retained');
  await page.getByRole('button', { name: '更多工具', exact: true }).click();
  await page.getByRole('button', { name: '录音设置', exact: true }).click();
  await page.getByRole('dialog', { name: '练琴录音设置', exact: true }).waitFor();
  await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-recording.png' });
  await page.getByRole('button', { name: '关闭录音窗口', exact: true }).click();
  await page.getByRole('button', { name: '调整倍速', exact: true }).click();
  await page.getByRole('slider', { name: '播放速度', exact: true }).evaluate((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '.8');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByRole('button', { name: '调整倍速', exact: true }).click();
  await page.getByRole('button', { name: '打开控制台', exact: true }).click();
  await page.locator('.pitch-buttons button').last().click();
  await page.locator('.pitch-buttons button').last().click();
  await page.getByRole('button', { name: '关闭控制台', exact: true }).click();
  await page.evaluate(() => {
    window.__checkContinuity = true;
    window.__continuityStart = window.__context.currentTime;
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const until = performance.now() + 1200;
    while (performance.now() < until) {}
  });
  await page.waitForTimeout(50);
  const continuity = await page.evaluate(() => {
    window.__checkContinuity = false;
    const first = window.__windows.find((v) => v.peak > 0.001)?.time;
    const active = window.__windows.filter((v) => v.time > first + 0.1 && v.time < first + 1.3);
    const gaps = active.filter((v) => v.peak <= 0.0005);
    return {
      total: window.__windows.length,
      max: Math.max(...window.__windows.map((v) => v.peak)),
      first,
      count: active.length,
      gaps: gaps.length,
      gapStart: gaps[0]?.time,
      gapEnd: gaps.at(-1)?.time,
      min: Math.min(...active.map((v) => v.peak)),
      end: window.__context.currentTime,
      state: window.__context.state,
    };
  });
  console.log('CONTINUITY', JSON.stringify(continuity), 'PCM windows', streaming.requests.length);
  assert.ok(
    continuity.count > 100 && continuity.gaps === 0,
    'audio must continue while UI thread is busy',
  );
  await page.waitForFunction(() => Number(document.querySelector('.seek').value) > 2.2);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('slider', { name: '播放进度', exact: true }).evaluate((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '4.4');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    window.__peak = 0;
    window.__after = window.__context.currentTime + 0.04;
    window.__measure = true;
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(350);
  const residual = await page.evaluate(() => {
    window.__measure = false;
    return window.__peak;
  });
  assert.ok(residual < 0.00001, 'streaming silent seek residual ' + residual);
  assert.ok(
    await page.evaluate(() => window.__largestBuffer <= 48002),
    'PCM allocation must stay within one window',
  );
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('slider', { name: '播放进度', exact: true }).evaluate((el) => {
    window.__tickLabels = [];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '10.7');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => window.__tickLabels.some((v) => v.x < 0 && v.x + v.width > 0));
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  assert.equal(await page.locator('.mobile-transport').count(), 0, 'home has no mini player');
  await page.waitForFunction(
    () =>
      window.__nativeCalls.filter((c) => c.method === 'android-playback-state').at(-1).data
        .playing === false,
  );
  await page.getByRole('button', { name: '设备互传', exact: true }).click();
  await page.locator('.selection-list input').first().check();
  await page.getByRole('button', { name: '分享选中的完整歌曲', exact: true }).click();
  await page.getByRole('button', { name: '扫描配对二维码', exact: true }).click();
  await page.getByText('已连接，可选择接收或发送歌曲', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 740 });
  await page.locator('.mobile-project-open').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-small.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ animations: 'disabled', path: '.runtime/review-android-tablet.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log(
    'ANDROID_STREAM_UI_PASSED wholeFileDecode=false boundedBuffers=true tempo=.8 pitch=2 silentResume=true fourChordColumns=true waveformHeight=' +
      wave.height +
      ' compactTransport=true homeStopsPlayback=true help=true phoneAndTablet=true',
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
