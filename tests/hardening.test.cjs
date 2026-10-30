const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  http = require('node:http'),
  vm = require('node:vm'),
  ts = require('typescript');
const { createInteractionFixture } = require('../scripts/fixtures.cjs'),
  { Store, atomicJson } = require('../desktop/store.cjs'),
  { pack, importArchive, extract } = require('../desktop/archive.cjs'),
  { PeerFiles } = require('../desktop/peer-files.cjs'),
  { Transfer } = require('../desktop/transfer.cjs'),
  { Folders } = require('../desktop/folders.cjs');
const { validateProject, repairLegacyAnalysis } = require('../shared/project-validation.cjs');
test('legacy Audio Jam trailing empty chord is repaired with the original manifest backed up', () => {
  const { store, p } = createInteractionFixture(1);
  p.analysis.method = 'audiojam-migration';
  p.analysis.chords = [
    { start: 0, end: 1.3, label: 'C', confidence: 1 },
    { start: 1.3, end: 1, label: 'N', confidence: 1 },
  ];
  const manifest = path.join(store.dir(p.id), 'project.json');
  fs.writeFileSync(manifest, JSON.stringify(p));
  const recovered = store.get(p.id);
  assert.deepEqual(recovered.analysis.chords, [{ start: 0, end: 1, label: 'C', confidence: 1 }]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(store.dir(p.id), 'project.before-legacy-analysis.json')))
      .analysis.chords.length,
    2,
  );
  recovered.analysis.chords[0].end = -1;
  repairLegacyAnalysis(recovered);
  assert.throws(() => validateProject(recovered), /chord.end/);
});
test('project schema rejects nonnumeric mix values, malformed arrays and invalid analysis/alignment', () => {
  const { p } = createInteractionFixture(1);
  for (const mutate of [
    (q) => (q.practice.tempo = 0),
    (q) => (q.practice.tempo = -1),
    (q) => (q.practice.tempo = NaN),
    (q) => (q.practice.pitch = Infinity),
    (q) => (q.tracks[0].gain = 'not-a-number'),
    (q) => (q.tracks[0].pan = 2),
    (q) => (q.results = {}),
    (q) => (q.bookmarks = [{ id: 'x', title: 'x', start: 2, end: 1 }]),
    (q) => (q.analysis.beats = [2, 1]),
    (q) =>
      (q.alignment = { points: [{ scoreTime: 0, audioTime: Infinity, confidence: 1 }], notes: [] }),
  ]) {
    const q = structuredClone(p);
    mutate(q);
    assert.throws(() => validateProject(q));
  }
});
test('archives require valid schema and checksum coverage, and roll back failed final commit', async () => {
  const { store, p, data } = createInteractionFixture(1),
    archive = path.join(data, 'source.ijam');
  await pack(store, p.id, archive, true);
  const b = new Store(path.join(data, 'target')),
    Zip = require('adm-zip');
  for (const kind of ['schema', 'checksum']) {
    const z = new Zip(archive);
    if (kind === 'schema') {
      const manifest = JSON.parse(z.readAsText('project.json'));
      manifest.tracks[0].gain = 'bad';
      z.updateFile('project.json', Buffer.from(JSON.stringify(manifest)));
    } else {
      const hashes = JSON.parse(z.readAsText('checksums.json'));
      delete hashes[p.original];
      z.updateFile('checksums.json', Buffer.from(JSON.stringify(hashes)));
    }
    const bad = path.join(data, kind + '.ijam');
    z.writeZip(bad);
    await assert.rejects(importArchive(b, bad));
    assert.deepEqual(b.list(), []);
  }
  b.save = () => {
    throw new Error('simulated commit failure');
  };
  await assert.rejects(importArchive(b, archive), /simulated/);
  assert.deepEqual(fs.readdirSync(b.projects), []);
});
test('archive extraction runs off the main thread and cancellation settles before cleanup', async () => {
  const { data } = createInteractionFixture(1),
    zip = new (require('adm-zip'))(),
    file = path.join(data, 'large.ijam'),
    dir = path.join(data, 'staging');
  zip.addFile('large.bin', Buffer.alloc(16 * 1048576, 65));
  zip.writeZip(file);
  fs.mkdirSync(dir);
  const abort = new AbortController();
  const task = extract(file, dir, { signal: abort.signal });
  abort.abort();
  await assert.rejects(task, /取消|中断/);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('broken project remains visible and restores a checked automatic backup', () => {
  const { store, p } = createInteractionFixture(1),
    file = path.join(store.dir(p.id), 'project.json');
  store.save({ ...p, title: 'latest title' });
  fs.writeFileSync(file, '{broken');
  const list = store.list();
  assert.equal(list.length, 1);
  assert.ok(list[0].broken);
  const recovered = store.recover(p.id);
  assert.equal(recovered.id, p.id);
  assert.ok(!recovered.broken);
  assert.ok(fs.readdirSync(store.dir(p.id)).some((name) => name.startsWith('project.corrupt.')));
});
test('damaged categories are backed up without hiding a healthy library', () => {
  const { store } = createInteractionFixture(1),
    folders = new Folders(store);
  fs.writeFileSync(folders.file, '{broken');
  assert.deepEqual(folders.list(), []);
  assert.equal(store.list().length, 1);
  assert.ok(fs.readdirSync(store.base).some((name) => name.startsWith('folders.json.corrupt.')));
});
test('peer close removes pending archives and duplicate starts cannot orphan a receive', () => {
  const { store } = createInteractionFixture(1),
    peer = new PeerFiles(store, () => {}),
    bytes = Buffer.from('payload'),
    item = {
      name: 'test.ijam',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  const id = peer.begin(item);
  assert.throws(() => peer.begin(item));
  peer.append({ id, offset: 0, chunk: bytes.toString('base64') });
  peer.finish({ id });
  const file = peer.pending.get(id).file;
  peer.close();
  peer.close();
  assert.equal(peer.pending.size, 0);
  assert.ok(!fs.existsSync(file));
});
test('interrupted LAN upload and unaccepted upload leave no file after stop', async (t) => {
  const { store, p } = createInteractionFixture(1),
    transfer = new Transfer(store, () => {});
  await transfer.start([p.id]);
  t.after(() => transfer.stop());
  const url = `http://127.0.0.1:${transfer.server.address().port}/api/upload?token=${transfer.token}&name=test.wav`;
  await new Promise((resolve) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Length': 1000000 } });
    req.on('error', resolve);
    req.write(Buffer.alloc(1024));
    setTimeout(() => req.destroy(), 25);
  });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(fs.readdirSync(path.join(store.base, 'incoming-files')), []);
  assert.equal((await fetch(url, { method: 'POST', body: Buffer.from('content') })).status, 200);
  const file = [...transfer.pending.values()][0].file;
  transfer.stop();
  assert.ok(!fs.existsSync(file));
  assert.equal(transfer.pending.size, 0);
});
test('connection codes reject expansion bombs before parsing SDP', () => {
  const code = ts.transpileModule(
      fs.readFileSync('src/features/transfer/connection-code.ts', 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    exports = {};
  vm.runInNewContext(code, { exports, require, btoa, atob, Uint8Array, JSON, Error });
  const valid = { type: 'offer', sdp: 'v=0\r\n' };
  assert.equal(exports.decode(exports.encode(valid)).sdp, valid.sdp);
  const f = require('fflate'),
    bomb =
      'IJ1.' +
      Buffer.from(
        f.compressSync(f.strToU8(JSON.stringify({ type: 'offer', sdp: 'x'.repeat(2000000) }))),
      ).toString('base64');
  assert.throws(() => exports.decode(bomb), /过大/);
});
test('reinstall migration follows the last custom data folder and retains configuration on failure', async () => {
  const { data, store, p } = createInteractionFixture(1),
    app = path.join(data, 'app'),
    old = path.join(data, 'old'),
    next = path.join(data, 'next');
  fs.mkdirSync(app);
  fs.mkdirSync(old);
  fs.cpSync(store.projects, path.join(old, 'library/projects'), { recursive: true });
  atomicJson(path.join(app, 'installation.json'), { schemaVersion: 1, dataRoot: old });
  const input = {
    dataRoot: next,
    installRoot: app,
    mode: 'cpu',
    models: [],
    allowSystemDrive: true,
  };
  await require('../desktop/installation.cjs').prepare(input, {
    runtime: async () => {},
    audio: async () => {},
    models: { ensure: async () => {} },
  });
  assert.ok(fs.existsSync(path.join(next, 'library/projects', p.id, 'project.json')));
  assert.ok(fs.existsSync(path.join(old, 'library/projects', p.id, 'project.json')));
});

test('corrupt or inconsistent download range state is rejected for a clean restart', () => {
  const { validRanges } = require('../desktop/runtime.cjs');
  const total = 800,
    state = {
      url: 'fixture',
      total,
      existing: 0,
      ranges: Array.from({ length: 8 }, (_, i) => ({
        start: i * 100,
        end: i * 100 + 99,
        received: 0,
      })),
    };
  assert.ok(validRanges(state, 'fixture', total, 0));
  for (const mutate of [
    (s) => (s.ranges[0] = null),
    (s) => (s.existing = '0'),
    (s) => (s.ranges[1].start = 0),
    (s) => (s.ranges[0].received = 100),
  ]) {
    const bad = structuredClone(state);
    mutate(bad);
    assert.equal(validRanges(bad, 'fixture', total, 0), false);
  }
});

test('RF64 duration reads ds64 sizes and recording headers reject RIFF overflow', () => {
  const { data } = createInteractionFixture(1),
    { wavHeader, wavDuration } = require('../desktop/takes.cjs');
  assert.throws(() => wavHeader(0x20000000, 48000), /WAV/);
  const header = Buffer.alloc(80),
    file = path.join(data, 'rf64.wav');
  header.write('RF64');
  header.writeUInt32LE(0xffffffff, 4);
  header.write('WAVEds64', 8);
  header.writeUInt32LE(28, 16);
  header.writeBigUInt64LE(80n + 48000n * 8n - 8n, 20);
  header.writeBigUInt64LE(48000n * 8n, 28);
  header.writeBigUInt64LE(48000n, 36);
  const fmt = wavHeader(48000, 48000);
  fmt.copy(header, 48, 12, 36);
  header.write('data', 72);
  header.writeUInt32LE(0xffffffff, 76);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.alloc(48000 * 8)]));
  assert.equal(wavDuration(file), 1);
});

test('desktop playback estimates actual file duration before decoding', async () => {
  const { store, p } = createInteractionFixture(1),
    { check, decodeBudget } = require('../desktop/playback-budget.cjs');
  const result = await check(store, p.id, [p.original], 'unused-for-wav');
  assert.equal(result.bytes, 48000 * 2 * 4);
  const repeated = await check(store, p.id, [p.original, p.original], 'unused-for-wav');
  assert.equal(repeated.bytes, result.bytes * 2);
  assert.equal(decodeBudget(1000), 400);
  assert.ok(decodeBudget(16 * 1024 ** 3) <= 1536 * 1048576);
  await assert.rejects(check(store, p.id, ['missing.wav'], 'unused'), /无效/);
});
test('binary peer chunks avoid base64 on desktop while preserving integrity', async () => {
  const { store, p } = createInteractionFixture(1),
    sender = new PeerFiles(store, () => {}),
    receiver = new PeerFiles(store, () => {});
  try {
    const [file] = await sender.prepare([p.id]);
    const id = receiver.begin(file);
    let offset = 0;
    while (offset < file.size) {
      const chunk = sender.read({ id: file.id, offset, binary: true });
      assert.ok(chunk instanceof Uint8Array);
      offset = receiver.append({ id, offset, chunk });
    }
    receiver.finish({ id });
    assert.equal(receiver.pending.size, 1);
    const zip = new (require('adm-zip'))(receiver.pending.get(id).file);
    const shared = JSON.parse(zip.readAsText('project.json'));
    assert.deepEqual(shared.analysis, p.analysis);
  } finally {
    sender.close();
    receiver.close();
  }
});
test('mobile empty group arrays round-trip without permitting groups on music entries', async () => {
  const { store, p, data } = createInteractionFixture(1);
  p.sourceGroups = [];
  store.save(p);
  const file = path.join(data, 'mobile-shape.ijam');
  await pack(store, p.id, file, true);
  const target = new Store(path.join(data, 'receiver')),
    copy = await importArchive(target, file);
  assert.deepEqual(copy.sourceGroups, []);
  assert.throws(() => store.save({ ...p, sourceGroups: [{ tracks: [] }] }), /分轨分组/);
});

test('reset drains SoundTouch circular adapter history while preserving the worklet instance', async () => {
  const registry = await import('@soundtouchjs/core');
  const { registerLanczosStrategy } = await import('@soundtouchjs/interpolation-strategy-lanczos');
  global.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage() {}, onmessage: null };
    }
  };
  const { SoundTouchProcessorBase } = await import('@soundtouchjs/worklet-base');
  delete global.AudioWorkletProcessor;
  let Processor;
  const scope = {
    SoundTouchProcessorBase,
    registry,
    registerLanczosStrategy,
    sampleRate: 48000,
    currentTime: 0,
    registerProcessor: (_name, constructor) => {
      Processor = constructor;
    },
  };
  vm.runInNewContext(
    fs
      .readFileSync('src/audio/playback-processor.js', 'utf8')
      .replace(/^import[\s\S]*?from '[^']+';/gm, ''),
    scope,
  );
  const processor = new Processor(),
    parameters = { pitch: [1], pitchSemitones: [0], playbackRate: [1] };
  const render = (value) => {
    const input = new Float32Array(128).fill(value),
      output = [new Float32Array(128), new Float32Array(128)];
    processor.process([[input, input]], [output], parameters);
    scope.currentTime += 128 / 48000;
    return Math.max(...output[0].map(Math.abs));
  };
  const reset = () => {
    processor.port.onmessage({ data: { type: 'reset', at: scope.currentTime, active: true } });
    render(0);
  };
  reset();
  let peak = 0;
  for (let i = 0; i < 100; i++) peak = Math.max(peak, render(0.4));
  assert.ok(peak > 0.3);
  assert.ok(
    processor._pipe.stretch.getInputBufferAdapter().frameCount > 0,
    'test must leave buffered old samples',
  );
  const pipe = processor._pipe;
  reset();
  for (let i = 0; i < 150; i++) assert.ok(render(0) < 1e-7);
  assert.equal(processor._pipe, pipe);
});
