const fs = require('node:fs'),
  path = require('node:path');
const { Store } = require('../desktop/store.cjs');
function createInteractionFixture(seconds = 90, modulated = false) {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const data = fs.mkdtempSync(path.join(parent, 'interaction-')),
    store = new Store(data),
    sr = 11025;
  function wav(file, sign) {
    const frames = sr * seconds,
      buffer = Buffer.alloc(44 + frames * 4);
    buffer.write('RIFF');
    buffer.writeUInt32LE(buffer.length - 8, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(2, 22);
    buffer.writeUInt32LE(sr, 24);
    buffer.writeUInt32LE(sr * 4, 28);
    buffer.writeUInt16LE(4, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(frames * 4, 40);
    for (let i = 0; i < frames; i++) {
      const t = i / sr,
        scale = modulated ? (t >= 4 && t < 5 ? 0 : t >= 5 && t < 8 ? 0.1 : 1) : 1,
        sample = Math.round(Math.sin(2 * Math.PI * 220 * t) * 6500 * sign * scale);
      buffer.writeInt16LE(sample, 44 + i * 4);
      buffer.writeInt16LE(sample, 46 + i * 4);
    }
    fs.writeFileSync(file, buffer);
  }
  const positive = path.join(data, 'positive.wav'),
    negative = path.join(data, 'negative.wav'),
    silence = path.join(data, 'silence.wav');
  wav(positive, 1);
  wav(negative, -1);
  wav(silence, 0);
  let p = store.create(positive, '交互验收');
  function makeTracks(names, tag, cancel) {
    return names.map((name, index) => {
      const file = `fixtures/${tag}/${name}.wav`,
        dest = store.asset(p.id, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const original = cancel
        ? index === 0
          ? positive
          : index === 1
            ? negative
            : silence
        : positive;
      try {
        fs.linkSync(original, dest);
      } catch {
        fs.copyFileSync(original, dest);
      }
      return { id: name, name, file, gain: 1, pan: 0, mute: false, solo: false };
    });
  }
  p = store.addResult(
    p.id,
    { tracks: makeTracks(['vocals', 'drums', 'bass', 'other'], 'A', true) },
    { modelId: 'A', modelName: '模型 A', mode: 'basic' },
  );
  const resultA = p.activeResultId;
  p = store.addResult(
    p.id,
    { tracks: makeTracks(['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'], 'B', false) },
    { modelId: 'B', modelName: '模型 B', mode: 'six' },
  );
  const resultB = p.activeResultId;
  p = store.selectResult(p.id, resultA);
  p.duration = seconds;
  p.practice = {
    ...p.practice,
    tempo: 1,
    pitch: 0,
    countIn: false,
    midi: false,
    metronome: modulated,
    master: modulated ? 0.05 : 0.8,
  };
  p.analysis = {
    bpm: 120,
    key: 'C',
    downbeat: 0,
    beatsPerBar: 4,
    beats: Array.from({ length: seconds * 2 }, (_, i) => i * 0.5),
    method: 'test',
    chords: [{ start: 0, end: seconds, label: 'C', confidence: 1 }],
  };
  p = store.save(p);
  return { data, store, p, resultA, resultB };
}
module.exports = { createInteractionFixture };
