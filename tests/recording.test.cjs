require('node:fs').mkdirSync(require('node:path').resolve('.runtime/test-workspaces'), {
  recursive: true,
});
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm');
const { Store } = require('../desktop/store.cjs'),
  { Takes, wavHeader, wavDuration } = require('../desktop/takes.cjs'),
  { pack, importArchive } = require('../desktop/archive.cjs');
test('follow-along calibration estimates a stable offset and rejects silence', async () => {
  const { analyzeLatency } = await import('../src/audio/latency.ts');
  const sampleRate = 48000,
    targets = Array.from({ length: 8 }, (_, i) => 1 + (i * 2) / 3),
    samples = new Float32Array(sampleRate * 8 * 2);
  for (let i = 0; i < targets.length; i++) {
    const delay = i === 6 ? 0.3 : 0.18 + ((i % 3) - 1) * 0.005;
    for (let frame = 0; frame < 1800; frame++) {
      const index = Math.round((targets[i] + delay) * sampleRate) + frame;
      const value = 0.3 * Math.sin(frame * 0.2) * Math.exp(-frame / 240);
      samples[index * 2] = value;
      samples[index * 2 + 1] = value;
    }
  }
  const result = analyzeLatency([{ time: 0, samples }], sampleRate, targets);
  assert.ok(Math.abs(result.offsetMs - 180) < 8, JSON.stringify(result));
  assert.ok(result.accepted >= 6);
  assert.ok(result.spreadMs < 10);
  assert.throws(
    () =>
      analyzeLatency([{ time: 0, samples: new Float32Array(samples.length) }], sampleRate, targets),
    /不足/,
  );
});
test('capture worklet gates on the exact audio frame, selects input channels, and flushes without monitoring input', () => {
  let Processor;
  const messages = [];
  const context = {
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (data) => messages.push(data) };
      }
    },
    registerProcessor: (_, type) => (Processor = type),
    sampleRate: 48000,
    currentFrame: 0,
    Float32Array,
    Math,
    Infinity,
  };
  vm.runInNewContext(fs.readFileSync('src/audio/capture-processor.js', 'utf8'), context);
  const processor = new Processor({ processorOptions: { channel: 'right' } });
  processor.port.onmessage({ data: { type: 'arm', at: 64 / 48000 } });
  const output = [[new Float32Array(128).fill(1), new Float32Array(128).fill(1)]],
    input = [[new Float32Array(128).fill(0.2), new Float32Array(128).fill(0.7)]];
  processor.process(input, output);
  processor.port.onmessage({ data: { type: 'stop' } });
  const chunk = messages.find((m) => m.type === 'chunk');
  assert.equal(chunk.frames, 64);
  assert.equal(chunk.contextTime, 64 / 48000);
  assert.equal(chunk.samples.length, 128);
  assert.ok(chunk.samples.every((value) => Math.abs(value - 0.7) < 1e-6));
  assert.ok(
    output[0].every((channel) => channel.every((value) => value === 0)),
    'input is never sent to speakers',
  );
});
test('practice slots, variable-length takes, compensation, normalization, archive and interrupted recovery preserve independent audio', async (t) => {
  const root = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/takes-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new Store(path.join(root, 'data')),
    ffmpeg = require('ffmpeg-static'),
    manager = new Takes(store, ffmpeg),
    source = path.join(root, 'backing.wav');
  fs.writeFileSync(source, Buffer.concat([wavHeader(48000, 48000), Buffer.alloc(48000 * 8)]));
  let p = store.create(source);
  function pcm(seconds) {
    const samples = new Float32Array(Math.round(48000 * seconds) * 2);
    for (let frame = 0; frame < samples.length / 2; frame++) {
      samples[frame * 2] = 0.1 * Math.sin((frame / 48000) * 2 * Math.PI * 440);
      samples[frame * 2 + 1] = samples[frame * 2];
    }
    return new Uint8Array(samples.buffer);
  }
  async function record(seconds, tempo = 1) {
    const session = manager.start(p.id, {
      anchorTime: 10,
      anchorPosition: 2,
      tempo,
      pitch: 0,
      latencyMs: 100,
      sampleRate: 48000,
      mode: 'instrument',
    });
    assert.throws(() => manager.append(session.id, 1, 10, pcm(0.01)), /顺序/);
    manager.append(session.id, 0, 10.02, pcm(seconds));
    return manager.finish(session.id);
  }
  p = await record(1, 0.5);
  const first = p.takes[0];
  assert.ok(Math.abs(first.start - 1.96) < 0.0001);
  assert.ok(Math.abs(first.duration - 0.5) < 0.04);
  assert.equal(p.selectedTakeIds.length, 1);
  assert.ok(wavDuration(store.asset(p.id, first.rawFile)) > 0.99);
  p = await record(0.7);
  p = await record(0.3);
  assert.equal(p.takes.length, 3);
  assert.equal(p.selectedTakeIds.length, 2);
  assert.throws(
    () =>
      manager.select(
        p.id,
        p.takes.map((t) => t.id),
      ),
    /最多加入 2/,
  );
  p = manager.select(p.id, [p.takes[2].id]);
  p.takes[2].offsetMs = -37;
  p = store.save(p);
  const archive = path.join(root, 'recordings.ijam');
  await pack(store, p.id, archive, true);
  const imported = await importArchive(new Store(path.join(root, 'receiver')), archive);
  assert.equal(imported.takes.length, 3);
  assert.equal(imported.takes[2].offsetMs, -37);
  for (const take of imported.takes)
    assert.ok(fs.existsSync(path.join(root, 'receiver/projects', imported.id, take.file)));
  const partial = manager.start(p.id, {
    anchorTime: 0,
    anchorPosition: 0,
    tempo: 1,
    pitch: 0,
    latencyMs: 0,
    sampleRate: 48000,
    mode: 'mixed',
  });
  manager.append(partial.id, 0, 0, pcm(0.2));
  manager.close();
  p = await manager.recover(p.id);
  assert.equal(p.takes.length, 4);
  assert.equal(p.takes[3].mode, 'mixed');
  assert.equal(p.takes[3].mute, true);
  const active = p.takes[0];
  assert.throws(
    () =>
      store.update(p.id, {
        takes: p.takes.map((t) => (t.id === active.id ? { ...t, file: p.original } : t)),
      }),
    /录音库/,
  );
  p.kind = 'creation';
  p.selectedTakeIds = [];
  store.save(p);
  const { sourceTracks, sessionDuration } = await import('../src/audio/performance.ts');
  assert.equal(sourceTracks(p).length, 4);
  assert.ok(sessionDuration(p, 0) > 2);
  const beforeImport = p.takes.length;
  p = await manager.import(p.id, [source], 4, 'instrument');
  assert.equal(p.takes.length, beforeImport + 1);
  assert.equal(p.takes.at(-1).name, 'backing');
  assert.equal(p.takes.at(-1).start, 4);
  assert.ok(Math.abs(p.takes.at(-1).duration - 1) < 0.01);
  const take = {
    ...p.takes[0],
    start: 0.5,
    offsetMs: 100,
    gain: 0.5,
    pan: -1,
    mute: false,
    solo: false,
  };
  store.save({ ...p, takes: [take], practice: { ...p.practice, tempo: 1, pitch: 0, master: 0.8 } });
  const mix = path.join(root, 'creation-mix.wav');
  await require('../desktop/export-audio.cjs').exportMix(store, p.id, ffmpeg, mix);
  const decoded = require('node:child_process').spawnSync(
    ffmpeg,
    ['-v', 'error', '-i', mix, '-f', 'f32le', '-ar', '48000', '-ac', '2', 'pipe:1'],
    { windowsHide: true },
  );
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  let left = 0,
    right = 0,
    before = 0;
  for (let frame = 0; frame < decoded.stdout.length / 8; frame++) {
    const l = decoded.stdout.readFloatLE(frame * 8),
      r = decoded.stdout.readFloatLE(frame * 8 + 4);
    if (frame < 48000 * 0.55) before = Math.max(before, Math.abs(l), Math.abs(r));
    if (frame > 48000 * 0.7) {
      left = Math.max(left, Math.abs(l));
      right = Math.max(right, Math.abs(r));
    }
  }
  assert.ok(before < 1e-4, 'export retains leading silence and timing offset');
  assert.ok(left > 0.02 && right < 1e-4, 'export retains recording pan and gain');
});
test('metronome follows detected beats, snaps within loop bounds and keeps offset envelopes on the song timeline', async () => {
  const { beatGrid, nearestBeat, localInterval, strongBeat } =
    await import('../src/audio/metronome.ts');
  const p = {
    duration: 5,
    practice: { tempo: 1 },
    analysis: {
      bpm: 120,
      beats: [0.2, 0.7, 1.22, 1.75, 2.3, 2.86, 3.44, 4.03, 4.64],
      downbeats: [0.2, 2.3, 4.64],
      downbeat: 0.2,
      beatsPerBar: 4,
    },
  };
  const beats = beatGrid(p);
  assert.equal(nearestBeat(beats, 1.1), 1.22);
  assert.equal(nearestBeat(beats, 0.51, { a: 0.71, b: 2 }), 1.22);
  assert.ok(localInterval(beats, 1.22) > 0.5);
  assert.equal(strongBeat(p, beats, 4), true);
  const { placeEnvelope } = await import('../src/audio/envelope.ts');
  const delayed = placeEnvelope([1, 0.5], 0.02, 0.01, 0.05);
  assert.deepEqual(delayed, [0, 1, 0.5, 0, 0]);
  const early = placeEnvelope([1, 0.5], 0.02, -0.01, 0.03);
  assert.deepEqual(early, [0.5, 0, 0]);
});
