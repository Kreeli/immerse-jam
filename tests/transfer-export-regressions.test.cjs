const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Zip = require('adm-zip');
const { Store } = require('../desktop/store.cjs');
const { pack, importArchive } = require('../desktop/archive.cjs');
const { createSession } = require('../desktop/sessions.cjs');
const { removeContent } = require('../desktop/content-removal.cjs');
const { exportStems, exportMix } = require('../desktop/export-audio.cjs');
const { wavHeader, wavDuration } = require('../desktop/takes.cjs');
const { createInteractionFixture } = require('../scripts/fixtures.cjs');

function fixture(t) {
  const f = createInteractionFixture(1);
  t.after(() => fs.rmSync(f.data, { recursive: true, force: true }));
  return f;
}

test('disconnecting during B leaves verified A available for import after reconnecting', async (t) => {
  const { data, store, p } = fixture(t);
  const receiver = new Store(path.join(data, 'receiver'));
  const { PeerFiles } = require('../desktop/peer-files.cjs');
  const events = [];
  const peer = new PeerFiles(receiver, (event) => events.push(event.type));
  t.after(() => peer.close());
  const archive = path.join(data, 'A.ijam');
  await pack(store, p.id, archive, true);
  const bytes = fs.readFileSync(archive);
  const item = {
    name: 'A.ijam',
    size: bytes.length,
    sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'),
  };
  const a = peer.begin(item);
  for (let offset = 0; offset < bytes.length; offset += 32768)
    peer.append({ id: a, offset, chunk: bytes.subarray(offset, offset + 32768) });
  peer.finish({ id: a });
  const b = peer.begin({ ...item, name: 'B.ijam' });
  const partial = peer.incoming.get(b).file;
  peer.append({ id: b, offset: 0, chunk: bytes.subarray(0, 1) });
  peer.disconnect();
  peer.disconnect();
  assert.deepEqual(events, ['incoming']);
  assert.ok(!fs.existsSync(partial));
  assert.equal((await importArchive(receiver, peer.pending.get(a).file)).title, p.title);
});

test('derived sessions copy distinct originalMix media and old sessions use their local original', async (t) => {
  const { data, store, p } = fixture(t);
  p.playback = 'media/playback.wav';
  fs.copyFileSync(store.asset(p.id, p.original), store.asset(p.id, p.playback));
  p.originalMix = {
    id: 'original',
    name: 'original',
    file: p.playback,
    gain: 0.7,
    pan: 0,
    solo: false,
    mute: false,
  };
  store.save(p);
  const full = path.join(data, 'source.ijam');
  await pack(store, p.id, full, true);
  const receiver = new Store(path.join(data, 'receiver')),
    source = await importArchive(receiver, full);
  assert.equal(source.playback, undefined);
  for (const kind of ['creation', 'practice']) {
    const derived = createSession(receiver, { kind, title: kind, sourceId: source.id });
    const copy = receiver.asset(derived.id, p.playback);
    assert.deepEqual(fs.readFileSync(copy), fs.readFileSync(store.asset(p.id, p.playback)));
    const output = path.join(data, kind + '.ijam');
    await pack(receiver, derived.id, output, true);
    fs.unlinkSync(copy);
    assert.equal(receiver.get(derived.id).originalMix.file, derived.original);
    await pack(receiver, derived.id, output, true);
  }
});

test('detaching a source retries locked files and preserves shared media and recovery', (t) => {
  const { store, p } = fixture(t);
  const c = createSession(store, { kind: 'creation', title: 'cleanup', sourceId: p.id });
  c.attachments = [{ id: 'shared', name: 'recording.wav', file: c.tracks[0].file }];
  store.save(c);
  const locked = store.asset(c.id, c.original);
  const unlink = fs.unlinkSync;
  const error = t.mock.method(fs, 'unlinkSync', function (file) {
    if (file === locked) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    return unlink(file);
  });
  removeContent(store, c.id, 'source', 'group');
  assert.ok(fs.existsSync(locked));
  store.update(c.id, { title: 'renamed' });
  error.mock.restore();
  const saved = store.get(c.id);
  assert.ok(!fs.existsSync(locked));
  assert.ok(fs.existsSync(store.asset(c.id, saved.attachments[0].file)));
  assert.equal(store.recover(c.id).original, saved.original);
  assert.ok(fs.existsSync(store.asset(p.id, p.original)));
});

test('missing muted or non-solo media leaves an audible mix with its stored timeline', async (t) => {
  const { store, p, data } = fixture(t);
  fs.unlinkSync(store.asset(p.id, p.tracks[1].file));
  p.duration = 4;
  for (const solo of [false, true]) {
    p.tracks[1].mute = !solo;
    p.tracks[0].solo = solo;
    store.save(p);
    const out = path.join(data, 'mix.wav');
    await exportMix(store, p.id, require('ffmpeg-static'), out);
    assert.equal(wavDuration(out), 4);
    await exportMix(store, p.id, require('ffmpeg-static'), out, { a: 2, b: 4 });
    assert.equal(wavDuration(out), 2);
  }
  p.tracks[0].solo = false;
  store.save(p);
  await assert.rejects(
    exportMix(store, p.id, require('ffmpeg-static'), path.join(data, 'failed.wav')),
  );
});

test('six-channel WAV and FLAC budgets include all decoded channels at the output rate', async (t) => {
  const { store, data } = fixture(t);
  const ffmpeg = require('ffmpeg-static'),
    { check } = require('../desktop/playback-budget.cjs');
  const wav = path.join(data, 'surround.wav'),
    flac = path.join(data, 'surround.flac');
  fs.writeFileSync(wav, Buffer.concat([wavHeader(48000, 48000, 6), Buffer.alloc(48000 * 6 * 4)]));
  require('node:child_process').execFileSync(ffmpeg, ['-v', 'error', '-i', wav, flac], {
    windowsHide: true,
  });
  for (const input of [wav, flac]) {
    const p = store.create(input);
    assert.equal((await check(store, p.id, [p.original], ffmpeg, 96000)).bytes, 6 * 96000 * 4);
  }
});

test('removed source stays out of the project and stem exports, including legacy projects', async (t) => {
  const { data, store, p } = fixture(t);
  const creation = createSession(store, { kind: 'creation', title: 'test', sourceId: p.id });
  const old = structuredClone(creation);
  delete old.sessionSource;
  const instruments = creation.tracks.map((track) => store.asset(creation.id, track.file));
  const saved = removeContent(store, creation.id, 'source', 'group');
  assert.ok(instruments.every((file) => !fs.existsSync(file)));
  assert.ok(!fs.existsSync(store.asset(creation.id, creation.original)));
  assert.deepEqual(saved.tracks, []);
  assert.equal(wavDuration(store.asset(saved.id, saved.original)), 0);
  for (const project of [saved, old]) {
    store.save(project);
    const file = path.join(data, 'export.ijam');
    await pack(store, project.id, file, true);
    const zip = new Zip(file);
    const manifest = JSON.parse(zip.readAsText('project.json'));
    assert.deepEqual(manifest.results, []);
    assert.deepEqual(manifest.tracks, []);
    assert.equal(zip.readFile(manifest.original).length, 44);
    assert.ok(!zip.getEntry(p.tracks[0].file));
    assert.deepEqual(fs.readdirSync(exportStems(store, project.id, data)), []);
  }
  assert.ok(wavDuration(store.asset(p.id, p.original)) > 0);
});

test('lite, full and derived projects retain independent import identities', async (t) => {
  const { data, store, p } = fixture(t);
  const receiver = new Store(path.join(data, 'receiver'));
  const lite = path.join(data, 'lite.ijam'),
    full = path.join(data, 'full.ijam');
  await pack(store, p.id, lite);
  await pack(store, p.id, full, true);
  const partial = await importArchive(receiver, lite);
  const complete = await importArchive(receiver, full);
  assert.notEqual(partial.id, complete.id);
  assert.deepEqual(complete.analysis, p.analysis);
  // Earlier importers kept the original manifest and checksum file but no fingerprint.
  const previousFile = path.join(receiver.dir(complete.id), 'project.json');
  const previous = JSON.parse(fs.readFileSync(previousFile));
  delete previous.importFingerprint;
  fs.writeFileSync(previousFile, JSON.stringify(previous));
  receiver.update(complete.id, { starred: true });
  assert.ok(receiver.get(complete.id).importFingerprint);
  // Simulate a favorite saved by the old app, after its only source snapshot rotated.
  const edited = receiver.get(complete.id);
  delete edited.importFingerprint;
  fs.writeFileSync(previousFile, JSON.stringify(edited));
  const session = createSession(receiver, {
    kind: 'practice',
    sourceId: complete.id,
    title: 'Practice',
  });
  assert.equal(session.originId, undefined);
  assert.equal((await importArchive(receiver, full)).id, complete.id);
  assert.equal((await importArchive(receiver, lite)).id, partial.id);
  const own = path.join(data, 'from-receiver.ijam');
  await pack(receiver, complete.id, own, true);
  assert.equal((await importArchive(receiver, own)).id, complete.id);
  const oldLite = receiver.get(partial.id);
  delete oldLite.importFingerprint;
  fs.writeFileSync(path.join(receiver.dir(partial.id), 'project.json'), JSON.stringify(oldLite));
  fs.writeFileSync(
    path.join(receiver.dir(partial.id), 'project.previous.json'),
    JSON.stringify(oldLite),
  );
  assert.equal((await importArchive(receiver, full)).id, complete.id);
});

test('repeated Audio Jam import deduplicates while changed media creates another revision', async (t) => {
  const { data } = fixture(t),
    store = new Store(path.join(data, 'receiver'));
  const zip = new Zip(),
    file = path.join(data, 'song.aum');
  zip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify({
        id: 'legacy-song',
        name: 'Legacy',
        duration: 1000,
        tracks: [{ name: 'main', audio_file: 'song.wav' }],
      }),
    ),
  );
  zip.addFile('assets/song.wav', Buffer.from('first'));
  zip.writeZip(file);
  const first = await importArchive(store, file);
  assert.equal((await importArchive(store, file)).id, first.id);
  delete first.importFingerprint;
  first.importRevision = first.createdAt;
  store.save(first);
  assert.equal((await importArchive(store, file)).id, first.id);
  zip.updateFile('assets/song.wav', Buffer.from('second'));
  zip.writeZip(file);
  assert.notEqual((await importArchive(store, file)).id, first.id);
});

test('muted tail and loops preserve timeline length even at double speed', async (t) => {
  const { data, store, p } = fixture(t);
  const frames = 48000 * 4;
  const long = store.asset(p.id, p.tracks[1].file);
  fs.writeFileSync(long, Buffer.concat([wavHeader(frames, 48000), Buffer.alloc(frames * 8)]));
  p.tracks[1].mute = true;
  p.duration = 4;
  for (const tempo of [1, 2]) {
    p.practice.tempo = tempo;
    store.save(p);
    const file = path.join(data, 'mix.wav');
    await exportMix(store, p.id, require('ffmpeg-static'), file);
    assert.ok(Math.abs(wavDuration(file) - 4 / tempo) < 1 / 44100);
    await exportMix(store, p.id, require('ffmpeg-static'), file, { a: 2, b: 4 });
    assert.ok(Math.abs(wavDuration(file) - 2 / tempo) < 1 / 44100);
    const silent = fs.readFileSync(file);
    assert.ok(silent.subarray(silent.indexOf('data') + 8).every((byte) => byte === 0));
    await exportMix(store, p.id, require('ffmpeg-static'), file, { a: 0.25, b: 0.75 });
    const audible = fs.readFileSync(file);
    assert.ok(audible.subarray(audible.indexOf('data') + 8).some((byte) => byte !== 0));
  }
});

test('file approval is bound to the selected manifest and consumed only once', async () => {
  const { readOffer, takeAcceptedFile } = await import('../src/features/transfer/receive-offer.ts');
  const [file] = readOffer([{ id: 'one', name: 'song.ijam', size: 123, sha256: 'a'.repeat(64) }]);
  const accepted = new Map([[file.id, file]]);
  for (const change of [
    { id: 'two' },
    { size: 124 },
    { name: 'other' },
    { sha256: 'b'.repeat(64) },
  ])
    assert.throws(() => takeAcceptedFile(accepted, { ...file, ...change }));
  assert.deepEqual(takeAcceptedFile(accepted, file), file);
  assert.throws(() => takeAcceptedFile(accepted, file));
  assert.throws(() => readOffer([file, file]));
});

test('database migration uses available audio and updates an existing folder catalog', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const { scanDatabase, importDatabase } = require('../desktop/migration.cjs');
  const { Folders } = require('../desktop/folders.cjs');
  const { store, data } = fixture(t),
    catalog = new Folders(store);
  const [folder] = catalog.edit({ action: 'create', name: 'Set list' });
  const db = new DatabaseSync(path.join(data, 'index.db'));
  try {
    db.exec(`CREATE TABLE music (id TEXT, name TEXT, duration INTEGER, trackIdsStr TEXT, isDeleted INTEGER, parentId TEXT);
      CREATE TABLE track (id TEXT, name TEXT, audioId TEXT, videoId TEXT, isDeleted INTEGER);
      CREATE TABLE attachment (id TEXT, title TEXT, name TEXT, remark TEXT, musicId TEXT, isDeleted INTEGER);
      CREATE TABLE folder (id TEXT, title TEXT);
      INSERT INTO folder VALUES ('f','Set list');
      INSERT INTO music VALUES ('song','Legacy',1000,'t',0,'f');
      INSERT INTO track VALUES ('t','main','audio','missing-video',0);`);
  } finally {
    db.close();
  }
  fs.mkdirSync(path.join(data, 'assets'));
  fs.copyFileSync(path.join(data, 'positive.wav'), path.join(data, 'assets/audio.wav'));
  assert.equal(scanDatabase(data).items[0].available, true);
  // Stop after the project commit, then retry the same import in the parent.
  const interrupted = require('node:child_process').spawnSync(
    process.execPath,
    [
      '-e',
      "require('./desktop/folders.cjs').Folders.prototype.addMigrated = () => process.exit(79);" +
        "const {Store} = require('./desktop/store.cjs');" +
        "require('./desktop/migration.cjs').importDatabase(new Store(process.argv[1]), process.argv[1], ['song']);",
      data,
    ],
    { windowsHide: true },
  );
  assert.equal(interrupted.status, 79, interrupted.stderr.toString());
  const [song] = importDatabase(store, data, ['song']);
  assert.equal(song.duplicate, true);
  assert.equal(song.migration.folderImportCommitted, true);
  importDatabase(store, data, ['song']);
  assert.equal(song.original, 'assets/audio.wav');
  assert.deepEqual(catalog.list().find((item) => item.id === folder.id).projectIds, [song.id]);
  catalog.edit({ action: 'move', projectId: song.id });
  importDatabase(store, data, ['song']);
  assert.deepEqual(catalog.list()[0].projectIds, []);
  const old = store.get(song.id);
  delete old.migration.folderImportCommitted;
  old.migration.folderImported = true;
  store.save(old);
  importDatabase(store, data, ['song']);
  assert.deepEqual(catalog.list()[0].projectIds, [song.id]);
});
