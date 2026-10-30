// Creates synthetic .ijam data for local Android instrumentation, never personal songs.
const fs = require('node:fs'),
  path = require('node:path'),
  { Midi } = require('@tonejs/midi');
const { pack } = require('../desktop/archive.cjs');
(async () => {
  const source = path.resolve('.runtime/android/beat-parity'),
    dest = path.resolve('.runtime/android/device-fixtures');
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(path.join(source, 'input.wav')))
    throw new Error('Run scripts/android-beat-fixtures.py first.');
  const { store, p } = require('./fixtures.cjs').createInteractionFixture(1);
  fs.copyFileSync(path.join(source, 'input.wav'), store.asset(p.id, p.original));
  Object.assign(p, {
    title: 'Android 节拍与对齐验收',
    duration: 36,
    tracks: [],
    results: [],
    attachments: [],
    bookmarks: [],
    takes: [],
    selectedTakeIds: [],
    presets: [],
  });
  delete p.activeResultId;
  delete p.sourceGroups;
  p.originalMix = {
    id: 'original',
    name: '原曲',
    file: p.original,
    gain: 1,
    pan: 0,
    mute: false,
    solo: false,
  };
  const read = (name) =>
    fs.readFileSync(path.join(source, name), 'utf8').trim().split(/\s+/).map(Number);
  p.analysis = {
    key: 'C',
    bpm: 120.123,
    beats: read('beats.txt'),
    downbeats: read('downbeats.txt'),
    beatsPerBar: 4,
    downbeat: 1.92,
    tempoMethod: 'beat-this',
    tempoReviewed: true,
    method: 'desktop-parity-fixture',
    chords: [
      { start: 0, end: 12, label: 'C', confidence: 1 },
      { start: 12, end: 24, label: 'F', confidence: 1 },
      { start: 24, end: 36, label: 'G', confidence: 1 },
    ],
  };
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  track.name = 'Synthetic harmony';
  [
    [48, 60, 64, 67],
    [53, 60, 65, 69],
    [55, 59, 62, 67],
  ].forEach((notes, index) =>
    notes.forEach((pitch) =>
      track.addNote({ midi: pitch, time: index * 12, duration: 12, velocity: 0.8 }),
    ),
  );
  p.scoreMidi = 'attachments/score.mid';
  const file = store.asset(p.id, p.scoreMidi);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, midi.toArray());
  p.attachments = [{ id: 'score-fixture', name: 'score.mid', file: p.scoreMidi }];
  store.save(p);
  await pack(store, p.id, path.join(dest, 'source.ijam'), true);
  console.log(
    'ANDROID_DEVICE_FIXTURE',
    JSON.stringify({
      title: p.title,
      beats: p.analysis.beats.length,
      downbeats: p.analysis.downbeats.length,
      archive: path.join(dest, 'source.ijam'),
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
