const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
function kernel() {
  let Processor;
  const scope = {
    sampleRate: 48000,
    currentFrame: 0,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = {};
      }
    },
    registerProcessor: (_name, p) => {
      Processor = p;
    },
  };
  vm.runInNewContext(fs.readFileSync('src/audio/stream-processor.js', 'utf8'), scope);
  return { scope, processor: new Processor() };
}
test('offset recording tracks cross disk windows on one sample clock without joins or negative starts', () => {
  for (const [offset, start, tempo] of [
    [0, 0.456789, 1],
    [130.123456789, 0.13333333333333, 0.8],
    [1, -0.000000000000001, 1.2],
  ]) {
    const { scope, processor } = kernel(),
      origin = 256;
    const first = Math.max(0, Math.floor(offset - start));
    for (let index = first; index < first + 8; index++) {
      const samples = Float32Array.from(
        { length: 48002 },
        (_, i) => Math.sin(((index * 48000 + i) * 2 * Math.PI * 220) / 48000) * 0.2,
      );
      const pcm = new Float32Array(samples.length * 2);
      for (let i = 0; i < samples.length; i++) pcm[i * 2] = pcm[i * 2 + 1] = samples[i];
      processor.port.onmessage({
        data:
          index % 2
            ? { type: 'window', index, pcm }
            : { type: 'window', index, channels: [samples, samples] },
      });
    }
    processor.port.onmessage({
      data: { type: 'play', frame: origin, offset, tempo, start, duration: 200, loop: null },
    });
    let error = 0,
      jump = 0,
      previous = 0;
    for (let block = 0; block < 1500; block++) {
      scope.currentFrame = block * 128;
      const out = [new Float32Array(128), new Float32Array(128)];
      processor.process([], [out]);
      for (let i = 0; i < 128; i++) {
        const frame = block * 128 + i,
          local = offset + ((frame - origin) * tempo) / 48000 - start;
        if (frame < origin || local < 0.004) continue;
        const position = local * 48000,
          a = Math.floor(position),
          t = position - a;
        const expected =
          (Math.sin((a * 2 * Math.PI * 220) / 48000) * (1 - t) +
            Math.sin(((a + 1) * 2 * Math.PI * 220) / 48000) * t) *
          0.2;
        error = Math.max(error, Math.abs(out[0][i] - expected));
        if (previous) jump = Math.max(jump, Math.abs(out[0][i] - previous));
        previous = out[0][i];
      }
    }
    assert.ok(error < 1e-6, `offset=${offset} start=${start} error=${error}`);
    assert.ok(jump < 0.012, `unexpected sample jump ${jump}`);
  }
});
test('a short primed range crosses a disk-window boundary continuously', () => {
  const { scope, processor } = kernel(),
    first = 47500,
    samples = new Float32Array(9602 * 2);
  for (let i = 0; i < samples.length / 2; i++)
    samples[i * 2] = samples[i * 2 + 1] = Math.sin(((first + i) * 2 * Math.PI * 220) / 48000) * 0.2;
  processor.port.onmessage({ data: { type: 'head', first, pcm: samples } });
  processor.port.onmessage({
    data: {
      type: 'play',
      frame: 0,
      offset: first / 48000,
      tempo: 1,
      start: 0,
      duration: 200,
      loop: null,
    },
  });
  let error = 0;
  for (let block = 0; block < 60; block++) {
    scope.currentFrame = block * 128;
    const out = [new Float32Array(128), new Float32Array(128)];
    processor.process([], [out]);
    for (let i = 0; i < 128; i++)
      error = Math.max(error, Math.abs(out[0][i] - samples[(block * 128 + i) * 2]));
  }
  assert.ok(error < 1e-6, `primed window seam ${error}`);
});
test('mobile calibration detects quiet gradual attacks despite a loud isolated noise', () => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/audio/latency.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports });
  const rate = 48000,
    targets = Array.from({ length: 8 }, (_, i) => 3 + (i * 2) / 3),
    samples = new Float32Array(rate * 10 * 2);
  for (let i = 0; i < samples.length / 2; i++) {
    const time = i / rate;
    let value = Math.sin(i * 0.077) * 0.000004;
    for (const target of targets) {
      const at = time - target - 0.085;
      if (at >= 0 && at < 0.17)
        value +=
          Math.sin(i * 0.17) *
          0.0012 *
          Math.min(1, at / 0.035) *
          Math.exp(-Math.max(0, at - 0.035) * 35);
    }
    if (time > 1 && time < 1.006) value += Math.sin(i * 0.3) * 0.2;
    samples[i * 2] = samples[i * 2 + 1] = value;
  }
  const result = exports.analyzeLatency([{ time: 0, samples }], rate, targets, true);
  assert.ok(result.accepted >= 7, JSON.stringify(result));
  assert.ok(result.offsetMs >= 75 && result.offsetMs <= 110, JSON.stringify(result));
  assert.ok(result.spreadMs < 15, JSON.stringify(result));
});

test('a scheduled seek keeps the old clock audible until a click-free transition, and stop cancels it', () => {
  const { scope, processor } = kernel();
  const post = (data) => processor.port.onmessage({ data });
  for (const [index, level] of [
    [0, 0.2],
    [10, 0.6],
  ])
    post({ type: 'window', index, pcm: new Float32Array(48002 * 2).fill(level) });
  const play = (frame, offset) => ({
    type: 'play',
    frame,
    offset,
    tempo: 1,
    start: 0,
    duration: 20,
    loop: null,
  });
  post(play(0, 0.1));
  post(play(1024, 10.1));
  let previous = 0.2;
  for (let block = 0; block < 16; block++) {
    scope.currentFrame = block * 128;
    const out = [new Float32Array(128), new Float32Array(128)];
    processor.process([], [out]);
    for (let i = 0; i < 128; i++) {
      const frame = block * 128 + i;
      const expected = frame < 1024 ? 0.2 : 0.2 + 0.4 * Math.min(1, (frame - 1024) / 144);
      assert.ok(Math.abs(out[0][i] - expected) < 1e-6, `frame ${frame}: ${out[0][i]}`);
      assert.ok(Math.abs(out[0][i] - previous) < 0.003);
      previous = out[0][i];
    }
  }
  post(play(2304, 0.2));
  post({ type: 'stop', frame: 2176 });
  scope.currentFrame = 2304;
  const out = [new Float32Array(128), new Float32Array(128)];
  processor.process([], [out]);
  assert.ok(out[0].every((v) => v === 0));

  // A DSP reset must receive only the new stream on the transition quantum.
  post(play(2560, 0.1));
  post({ ...play(2688, 10.1), crossfade: false });
  scope.currentFrame = 2560;
  processor.process([], [out]);
  assert.ok(out[0].every((v) => Math.abs(v - 0.2) < 1e-6));
  scope.currentFrame = 2688;
  processor.process([], [out]);
  assert.ok(out[0].every((v) => Math.abs(v - 0.6) < 1e-6));
});
