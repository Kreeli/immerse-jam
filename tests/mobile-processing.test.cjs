const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/audio/offline-stream.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const apiPromise = Promise.all([
  import('@soundtouchjs/core'),
  import('@soundtouchjs/interpolation-strategy-lanczos'),
]).then(([core, lanczos]) => {
  const api = {};
  vm.runInNewContext(code, {
    exports: api,
    require: (name) =>
      name === '@soundtouchjs/core'
        ? core
        : name === '@soundtouchjs/interpolation-strategy-lanczos'
          ? lanczos
          : require(name),
    Float32Array,
    Number,
    Math,
    Error,
  });
  return api;
});
test('offline mobile processing preserves stereo, duration and independent tempo/pitch', async () => {
  const api = await apiPromise;
  const rate = 22050,
    frames = rate * 3;
  for (const [tempo, pitch] of [
    [1, 0],
    [0.5, 0],
    [1, 12],
    [2, -12],
  ]) {
    let cursor = 0,
      parts = [];
    await api.processAudio(
      { sampleRate: rate, frames, tempo, pitch },
      async () => {
        const count = Math.min(8192, frames - cursor),
          samples = new Float32Array(count * 2);
        for (let i = 0; i < count; i++)
          samples[i * 2] = Math.sin((2 * Math.PI * 440 * (cursor + i)) / rate) * 0.2;
        cursor += count;
        return samples;
      },
      async (out) => parts.push(out),
    );
    const result = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      result.set(p, offset);
      offset += p.length;
    }
    assert.equal(result.length / 2, Math.round(frames / tempo));
    let crossings = 0,
      peak = 0,
      right = 0;
    const begin = Math.round(rate * 0.5),
      end = Math.min(result.length / 2 - 1, begin + rate);
    for (let i = begin; i < end; i++) {
      if (result[i * 2] <= 0 && result[(i + 1) * 2] > 0) crossings++;
      peak = Math.max(peak, Math.abs(result[i * 2]));
      right = Math.max(right, Math.abs(result[i * 2 + 1]));
    }
    assert.ok(peak > 0.1);
    assert.ok(right < 1e-7);
    assert.ok(
      Math.abs((crossings * rate) / (end - begin) - 440 * 2 ** (pitch / 12)) < 5,
      `${tempo},${pitch}: frequency ${crossings}`,
    );
  }
});
test('mobile export rejects corrupt settings and truncated reads', async () => {
  const api = await apiPromise;
  await assert.rejects(
    api.processAudio(
      { sampleRate: 44100, frames: 10, tempo: 0, pitch: 0 },
      async () => new Float32Array(),
      async () => {},
    ),
  );
  await assert.rejects(
    api.processAudio(
      { sampleRate: 44100, frames: 10, tempo: 1, pitch: 0 },
      async () => new Float32Array(),
      async () => {},
    ),
  );
});
