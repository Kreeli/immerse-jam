const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
function load(t, initial = {}) {
  const previous = global.localStorage,
    values = new Map(Object.entries(initial));
  let fail = false,
    failingKey = '';
  global.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      if (fail || k === failingKey) throw new Error('disk full');
      values.set(k, String(v));
    },
    removeItem: (k) => values.delete(k),
  };
  t.after(() => {
    if (previous === undefined) delete global.localStorage;
    else global.localStorage = previous;
  });
  const filename = path.resolve('src/audio/device-preferences.ts'),
    mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
  return {
    api: mod.exports,
    values,
    fail: () => {
      fail = true;
    },
    failKey: (key) => {
      failingKey = key;
    },
  };
}
test('global audio defaults seed new projects and preserve explicit project choices', (t) => {
  const { api } = load(t, { 'immerse.recording.latency.piano|speaker': '88' });
  api.setAudioDefaults({
    inputDeviceId: 'usb',
    outputDeviceId: 'phones',
    channel: 'left',
    latencyMs: 35,
  });
  const inherited = api.effectiveRecordingSettings({ kind: 'creation' });
  assert.equal(inherited.inputDeviceId, 'usb');
  assert.equal(inherited.outputDeviceId, 'phones');
  const explicit = api.effectiveRecordingSettings({
    kind: 'practice',
    practiceMode: 'mixed',
    recordingSettings: {
      mode: 'instrument',
      inputDeviceId: 'piano',
      outputDeviceId: 'speaker',
      channel: 'stereo',
      latencyMs: 12,
    },
  });
  assert.equal(explicit.inputDeviceId, 'piano');
  assert.equal(explicit.outputDeviceId, 'speaker');
  assert.equal(explicit.mode, 'mixed');
  assert.equal(explicit.latencyMs, 12);
  api.rememberCalibration(explicit, 160);
  assert.equal(
    api.effectiveRecordingSettings({ kind: 'practice', recordingSettings: explicit }).latencyMs,
    12,
  );
});
test('calibration uses the existing per-device-pair storage key', (t) => {
  const { api } = load(t, { 'immerse.recording.latency.usb|phones': '42' });
  api.setAudioDefaults({ inputDeviceId: 'usb', outputDeviceId: 'phones' });
  assert.equal(api.getAudioDefaults().latencyMs, 42);
  api.setAudioDefaults({ outputDeviceId: 'speaker' });
  assert.equal(api.getAudioDefaults().latencyMs, 0);
  api.rememberCalibration(
    { inputDeviceId: 'usb', outputDeviceId: 'speaker', channel: 'left', latencyMs: 0 },
    -20,
  );
  assert.equal(api.effectiveRecordingSettings({ kind: 'creation' }).latencyMs, -20);
});
test('failed default persistence restores the previous device-pair calibration', (t) => {
  const key = 'immerse.recording.latency.default|default';
  const { api, values, failKey } = load(t, { [key]: '12' });
  failKey('immerse.audio.defaults');
  assert.throws(() => api.setAudioDefaults({ latencyMs: 220 }), /disk full/);
  assert.equal(api.getAudioDefaults().latencyMs, 0);
  assert.equal(values.get(key), '12');
  values.delete(key);
  assert.throws(() => api.setAudioDefaults({ latencyMs: 220 }), /disk full/);
  assert.equal(values.has(key), false);
});
test('invalid defaults and failed persistence leave the committed audio settings unchanged', (t) => {
  const { api, fail } = load(t, {
    'immerse.audio.defaults': '{"channel":"wrong","latencyMs":99999}',
  });
  assert.deepEqual(api.getAudioDefaults(), api.DEFAULT_AUDIO);
  assert.throws(() => api.setAudioDefaults({ latencyMs: NaN }), /录音设置无效/);
  assert.throws(() => api.setAudioDefaults({ latencyMs: 2001 }), /录音设置无效/);
  fail();
  assert.throws(() => api.setAudioDefaults({ outputDeviceId: 'headphones' }), /disk full/);
  assert.equal(api.getAudioDefaults().outputDeviceId, 'default');
});
