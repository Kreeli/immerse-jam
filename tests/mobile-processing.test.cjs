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
test('slow and transposed phone recordings normalize to source duration and pitch', async () => {
  const api = await apiPromise,
    rate = 22050;
  for (const [recordedTempo, recordedPitch] of [
    [0.25, -12],
    [0.5, 0],
    [1.5, 5],
    [2, 12],
  ]) {
    const frames = Math.round((rate * 3) / recordedTempo);
    let cursor = 0,
      parts = [];
    await api.processAudio(
      { sampleRate: rate, frames, tempo: 1 / recordedTempo, pitch: -recordedPitch },
      async () => {
        const n = Math.min(8192, frames - cursor),
          values = new Float32Array(n * 2);
        for (let i = 0; i < n; i++)
          values[2 * i] = values[2 * i + 1] =
            0.2 * Math.sin((2 * Math.PI * 440 * 2 ** (recordedPitch / 12) * (cursor + i)) / rate);
        cursor += n;
        return values;
      },
      async (values) => parts.push(values),
    );
    const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      all.set(part, offset);
      offset += part.length;
    }
    assert.equal(all.length / 2, Math.round(frames * recordedTempo));
    let crossings = 0;
    for (let i = rate; i < rate * 2; i++) if (all[i * 2] <= 0 && all[i * 2 + 2] > 0) crossings++;
    assert.ok(Math.abs(crossings - 440) < 5, `${recordedTempo}x ${recordedPitch}: ${crossings}Hz`);
  }
});
test('phone finish/recovery streams data and preserves raw recovery on a processing failure', async () => {
  const api = await apiPromise;
  function module(file, imports) {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        require: (name) => imports[name],
        Float32Array,
        Uint8Array,
        atob,
        btoa,
        Number,
        Math,
        Error,
      },
    );
    return exports;
  }
  const binary = module('src/platform/android/binary.ts', {}),
    render = module('src/platform/android/render.ts', {
      '../../audio/offline-stream': api,
      './binary': binary,
    });
  const calls = [];
  let read = 0,
    written = 0;
  const call = async (method, data) => {
    calls.push(method);
    if (method === 'android-take-normalize')
      return { id: 'render-session', frames: 22050, sampleRate: 22050, tempo: 2, pitch: 0 };
    if (method === 'android-render-read') {
      const n = Math.min(8192, 22050 - read);
      read += n;
      return binary.encodeBytes(new Uint8Array(new Float32Array(n * 2).buffer));
    }
    if (method === 'android-render-append') {
      written += binary.decodeBytes(data.chunk).length / 8;
      return true;
    }
    if (method === 'android-render-finish') return { id: 'project', takes: [{ id: 'recording' }] };
    if (method === 'android-render-abort') return true;
    throw new Error(method);
  };
  const project = await render.finishTake({ sessionId: 'recording' }, call);
  assert.equal(project.takes[0].id, 'recording');
  assert.equal(written, 11025);
  assert.equal(calls.at(-1), 'android-render-abort');
  let aborted = false;
  await assert.rejects(
    render.finishTake({ sessionId: 'recording' }, async (method) => {
      if (method === 'android-take-normalize')
        return { id: 'failure', frames: 22050, sampleRate: 22050, tempo: 2, pitch: 0 };
      if (method === 'android-render-abort') {
        aborted = true;
        return true;
      }
      throw new Error('read interrupted');
    }),
    /interrupted/,
  );
  assert.ok(aborted);
  let normalized = false;
  const empty = await render.recoverTakes({ id: 'project' }, async (method) => {
    if (method === 'android-take-recovery-list') return ['pending'];
    if (method === 'android-take-normalize') {
      normalized = true;
      return { project: { id: 'project' } };
    }
    throw new Error(method);
  });
  assert.equal(empty.id, 'project');
  assert.ok(normalized);
});
