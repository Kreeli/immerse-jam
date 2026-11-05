const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs'),
  path = require('node:path');
const { NativeAudio, validate, hostCommand } = require('../desktop/native-audio.cjs');
const config = { backend: 'wasapi', deviceId: 'default', sampleRate: 48000 };
function harness(options = {}) {
  const children = [],
    events = [];
  const spawnProcess = (executable, args, settings) => {
    const child = new EventEmitter();
    Object.assign(child, {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      writes: [],
      killed: false,
      ended: false,
    });
    const input = new EventEmitter();
    Object.assign(input, {
      writableLength: 0,
      write: (bytes) => {
        child.writes.push(Buffer.from(bytes));
        return true;
      },
      end: () => {
        child.ended = true;
        child.exitCode = 0;
        setImmediate(() => child.emit('close', 0));
      },
    });
    child.stdin = input;
    child.kill = () => {
      child.killed = true;
      child.exitCode = -1;
      setImmediate(() => child.emit('close', -1));
    };
    children.push({ child, executable, args, settings });
    setImmediate(() => {
      if (args.includes('--list')) {
        child.stdout.write(JSON.stringify({ devices: [], available: true }));
        child.exitCode = 0;
        child.emit('close', 0);
      } else if (options.failure)
        child.stdout.write(JSON.stringify({ type: 'error', message: options.failure }) + '\n');
      else
        child.stdout.write(
          JSON.stringify({
            type: 'ready',
            ...config,
            deviceSampleRate: 48000,
            deviceBufferFrames: 480,
          }) + '\n',
        );
    });
    return child;
  };
  const service = new NativeAudio({
    executable: 'test/dotnet.exe',
    assembly: 'test/host.dll',
    spawnProcess,
    exists: () => true,
    platform: 'win32',
    emit: (e) => events.push(e),
  });
  return { service, children, events };
}
test('native output accepts only supported systems/rates and bounded device identifiers', () => {
  assert.deepEqual(validate(config), config);
  for (const input of [
    null,
    {},
    { ...config, backend: 'shell' },
    { ...config, sampleRate: NaN },
    { ...config, sampleRate: 96001 },
    { ...config, deviceId: '' },
    { ...config, deviceId: '\0' },
    { ...config, deviceId: 'a'.repeat(2049) },
  ])
    assert.throws(() => validate(input), /无效/);
});
test('native host paths keep malformed version pointers inside the application cache', (t) => {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'native-audio-path-'));
  t.after(() => {
    if (path.dirname(root) !== parent || !path.basename(root).startsWith('native-audio-path-'))
      throw new Error('Invalid fixture path');
    fs.rmSync(root, { recursive: true, force: true });
  });
  const manifest = path.join(root, '.runtime/native-audio/current.json');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, JSON.stringify({ revision: '../../other' }));
  assert.equal(
    hostCommand(root, false).executable,
    path.join(root, '.runtime/native-audio/versions/unbuilt/dotnet.exe'),
  );
  fs.writeFileSync(manifest, JSON.stringify({ revision: 'a'.repeat(20) }));
  assert.equal(
    hostCommand(root, false).assembly,
    path.join(root, '.runtime/native-audio/versions', 'a'.repeat(20), 'ImmerseAudioHost.dll'),
  );
  assert.equal(
    hostCommand(root, true, path.join(root, 'resources')).assembly,
    path.join(root, 'resources/native-audio/ImmerseAudioHost.dll'),
  );
});
test('native output uses argument-based invocation, ordered PCM and stream-scoped stop', async () => {
  const { service, children, events } = harness();
  const device = 'Device "quoted" & unchanged';
  const first = await service.start({ ...config, deviceId: device });
  const launched = children[0];
  assert.equal(launched.settings.windowsHide, true);
  assert.equal(launched.args[0], 'test/host.dll');
  assert.equal(JSON.parse(Buffer.from(launched.args[2], 'base64')).deviceId, device);
  const pcm = new Float32Array([0.25, -0.5, 0, 0]);
  assert.deepEqual(await service.write({ streamId: first.streamId, samples: pcm.buffer }), {
    accepted: true,
  });
  assert.equal(launched.child.writes[0].readFloatLE(0), 0.25);
  assert.equal(launched.child.writes[0].readFloatLE(4), -0.5);
  assert.deepEqual(await service.write({ streamId: 'stale', samples: pcm.buffer }), {
    accepted: false,
    stale: true,
  });
  await service.stop('stale');
  assert.equal(launched.child.ended, false);
  const second = await service.start(config);
  assert.equal(launched.child.ended, true);
  await service.stop(first.streamId);
  assert.equal(children[1].child.ended, false);
  await service.stop(second.streamId);
  assert.equal(children[1].child.ended, true);
  assert.deepEqual(events, []);
});
test('native PCM rejects invalid samples, frame boundaries and unbounded buffering', async () => {
  const { service, children } = harness();
  const ready = await service.start(config);
  for (const samples of [
    new ArrayBuffer(7),
    new ArrayBuffer(32776),
    new Float32Array([NaN, 0]).buffer,
    new Float32Array([Infinity, 0]).buffer,
    new Float32Array([1.5, 0]).buffer,
    'not PCM',
  ])
    await assert.rejects(service.write({ streamId: ready.streamId, samples }), /无效/);
  assert.equal(children[0].child.writes.length, 0);
  children[0].child.stdin.writableLength = 48000 * 8;
  await assert.rejects(
    service.write({ streamId: ready.streamId, samples: new Float32Array(2).buffer }),
    /积压/,
  );
  await service.stop();
});
test('driver startup failure closes the owned child and leaves no writable stream', async () => {
  const { service, children, events } = harness({ failure: 'Driver unavailable' });
  await assert.rejects(
    service.start({ ...config, backend: 'asio', deviceId: 'Missing ASIO' }),
    /Driver unavailable/,
  );
  assert.equal(service.session, null);
  assert.equal(children[0].child.ended, true);
  assert.ok(events.some((e) => e.scope === 'native-audio' && e.message === 'Driver unavailable'));
});
test('unsupported hosts expose compatibility fallback without launching a process', async () => {
  let launched = false;
  const service = new NativeAudio({
    executable: 'none',
    platform: 'linux',
    exists: () => true,
    spawnProcess: () => {
      launched = true;
    },
  });
  assert.equal((await service.info()).available, false);
  await assert.rejects(service.start(config), /不支持/);
  assert.equal(launched, false);
});
