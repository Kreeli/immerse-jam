const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  vm = require('node:vm'),
  ts = require('typescript');
function modules(t, initial = {}) {
  const previous = global.localStorage,
    values = new Map(Object.entries(initial));
  let failing = '';
  global.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (key === failing) throw new Error('disk full');
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
  };
  t.after(() => {
    if (previous === undefined) delete global.localStorage;
    else global.localStorage = previous;
  });
  const cache = new Map();
  const load = (file) => {
    const filename = path.resolve(file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, mod);
    const original = mod.require.bind(mod);
    mod.require = (name) =>
      name === './device-preferences' ? load('src/audio/device-preferences.ts') : original(name);
    mod._compile(
      ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      filename,
    );
    return mod.exports;
  };
  return {
    engine: load('src/audio/engine-preferences.ts'),
    audio: load('src/audio/device-preferences.ts'),
    values,
    fail: (key) => {
      failing = key;
    },
  };
}
test('engine preferences validate output systems, supported rates and ASIO driver selection', (t) => {
  const { engine } = modules(t, { 'immerse.audio.engine': '{"backend":"invalid","sampleRate":0}' });
  assert.deepEqual(engine.getEnginePreferences(), engine.DEFAULT_ENGINE);
  for (const sampleRate of [44100, 48000, 88200, 96000])
    assert.equal(
      engine.validateEngine({ backend: 'web-audio', deviceId: 'default', sampleRate }).sampleRate,
      sampleRate,
    );
  for (const value of [
    null,
    { backend: 'asio', deviceId: 'default', sampleRate: 48000 },
    { backend: 'web-audio', deviceId: 'default', sampleRate: 12345 },
  ])
    assert.throws(() => engine.validateEngine(value), /无效/);
});
test('calibration is separated by engine/device/rate and explicit project corrections survive', (t) => {
  const base = 'immerse.recording.latency.default|default';
  const { engine, audio, values } = modules(t, {
    [base]: '23',
    [base + '|asio:Realtek ASIO:48000']: '64',
  });
  assert.equal(audio.effectiveRecordingSettings({ kind: 'creation' }).latencyMs, 23);
  engine.setEnginePreferences({ backend: 'asio', deviceId: 'Realtek ASIO', sampleRate: 48000 });
  assert.equal(audio.getAudioDefaults().latencyMs, 64);
  assert.equal(
    audio.effectiveRecordingSettings({ kind: 'creation', recordingSettings: { latencyMs: 12 } })
      .latencyMs,
    12,
  );
  audio.setAudioDefaults({ latencyMs: 81 });
  assert.equal(values.get(base), '23');
  assert.equal(values.get(base + '|asio:Realtek ASIO:48000'), '81');
  engine.setEnginePreferences({ ...engine.DEFAULT_ENGINE, sampleRate: 44100 });
  assert.equal(audio.getAudioDefaults().latencyMs, 0);
  engine.setEnginePreferences({ ...engine.DEFAULT_ENGINE });
  assert.equal(audio.getAudioDefaults().latencyMs, 23);
});
test('failed engine persistence keeps the selected system and calibration route unchanged', (t) => {
  const { engine, audio, fail } = modules(t);
  const key = audio.calibrationKey('input', 'output');
  fail('immerse.audio.engine');
  assert.throws(
    () =>
      engine.setEnginePreferences({
        backend: 'wasapi-exclusive',
        deviceId: 'default',
        sampleRate: 96000,
      }),
    /disk full/,
  );
  assert.deepEqual(engine.getEnginePreferences(), engine.DEFAULT_ENGINE);
  assert.equal(audio.calibrationKey('input', 'output'), key);
});
test('PCM bridge emits interleaved bounded stereo, silences browser output and discards suspended partial blocks', () => {
  let Processor;
  const packets = [];
  class Base {
    constructor() {
      this.port = {
        postMessage: (data, transfer) => {
          assert.equal(transfer[0], data);
          packets.push(data);
        },
        onmessage: null,
      };
    }
  }
  vm.runInNewContext(fs.readFileSync('src/audio/native-output-processor.js', 'utf8'), {
    AudioWorkletProcessor: Base,
    registerProcessor: (name, type) => {
      assert.equal(name, 'immerse-native-output');
      Processor = type;
    },
  });
  const processor = new Processor();
  const left = new Float32Array(128).fill(0.25),
    right = new Float32Array(128).fill(-0.5);
  const output = new Float32Array(128).fill(1);
  processor.process([[left, right]], [[output]]);
  assert.ok(output.every((v) => v === 0));
  assert.equal(packets.length, 0);
  processor.port.onmessage({ data: { enabled: true } });
  left[1] = NaN;
  right[1] = 2;
  for (let i = 0; i < 4; i++) processor.process([[left, right]], [[output]]);
  const pcm = new Float32Array(packets[0]);
  assert.equal(pcm.length, 1024);
  assert.equal(pcm[0], 0.25);
  assert.equal(pcm[1], -0.5);
  assert.equal(pcm[2], 0);
  assert.ok(Math.abs(pcm[3] - 0.98) < 1e-6);
  processor.process([[left, right]], [[output]]);
  processor.port.onmessage({ data: { enabled: false } });
  processor.port.onmessage({ data: { enabled: true } });
  for (let i = 0; i < 3; i++) processor.process([[left, right]], [[output]]);
  assert.equal(packets.length, 1);
  processor.process([[left, right]], [[output]]);
  assert.equal(packets.length, 2);
});
