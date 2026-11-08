const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function source(file, globals) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    DOMException,
    AbortController,
    ...globals,
  });
  return module.exports;
}
test('Android bridge keeps queued jobs pending until native completion', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [];
  const native = {
    postMessage(message) {
      requests.push(JSON.parse(message));
    },
  };
  const window = { ImmerseNative: native };
  source('src/platform/android/bridge.ts', {
    window,
    document: { documentElement: { dataset: {} } },
    setTimeout,
    clearTimeout,
    require: (id) => (id.endsWith('ipc-methods.json') ? { default: ['update'] } : {}),
  });
  const complete = (method, result) =>
    native.onmessage({
      data: JSON.stringify({
        id: requests.find((request) => request.method === method).id,
        result,
      }),
    });
  const transfer = window.jam.call('android-lan-upload', { ids: ['example'] });
  const save = window.jam.call('update', { id: 'example' });
  const playback = assert.rejects(window.jam.call('android-playback-state'), /长时间未响应/);
  t.mock.timers.tick(11 * 60 * 1000);
  await playback;
  complete('android-lan-upload', true);
  complete('update', 'saved');
  assert.equal(await transfer, true);
  assert.equal(await save, 'saved');
});
test('Android recording cancellation releases an input granted after the dialog closes', async () => {
  let grant;
  const calls = [];
  const { NativeCapture } = source('src/platform/android/NativeCapture.ts', {
    window: {
      jam: {
        call(method, data) {
          calls.push({ method, data });
          if (method === 'android-capture-open')
            return new Promise((resolve) => {
              grant = resolve;
            });
          return Promise.resolve(true);
        },
      },
    },
  });
  const controller = new AbortController();
  const pending = NativeCapture.open(
    {},
    { inputDeviceId: 'default', channel: 'mono' },
    () => {},
    () => {},
    () => {},
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  grant({ id: 'late-permission' });
  await new Promise(setImmediate);
  assert.equal(calls.at(-1).method, 'android-capture-close');
  assert.equal(calls.at(-1).data.session, 'late-permission');
});
test('a distant seek discards old PCM reads without exceeding three simultaneous fetches', async () => {
  let active = 0,
    peak = 0;
  const network = [];
  const { StreamingAudio } = source('src/platform/android/StreamingAudio.ts', {
    window: { jam: { call: () => Promise.resolve() } },
    fetch(url, { signal }) {
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve, reject) => {
        const abort = () => {
          active--;
          reject(new DOMException('Cancelled', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        network.push({
          url,
          finish() {
            signal.removeEventListener('abort', abort);
            active--;
            resolve({ ok: true, arrayBuffer: async () => new Float32Array([0.2, 0.2]).buffer });
          },
        });
      });
    },
  });
  const stream = new StreamingAudio('session', [{ id: 'track' }], [{ id: 'track', duration: 60 }]);
  const context = {
    createBuffer: (_channels, length) => ({
      length,
      getChannelData: () => new Float32Array(length),
    }),
  };
  const tasks = Array.from({ length: 10 }, (_, index) => stream.read(context, 'track', index));
  const settled = Promise.allSettled(tasks);
  stream.retain([{ track: 'track', index: 9 }]);
  await new Promise(setImmediate);
  assert.ok(peak <= 3, 'cancelled queued work must not release an unowned slot');
  assert.equal(network.length, 4, 'only the first three and the new position read disk');
  assert.ok(network.at(-1).url.endsWith('/432000'));
  network.at(-1).finish();
  const results = await settled;
  assert.equal(results.filter((r) => r.status === 'rejected').length, 9);
  assert.equal(results.at(-1).status, 'fulfilled');
  stream.close();
});
