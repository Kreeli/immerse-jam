const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { Store } = require('../desktop/store.cjs'),
  { Folders } = require('../desktop/folders.cjs'),
  { createSession } = require('../desktop/sessions.cjs');
const { prepare, options } = require('../desktop/installation.cjs'),
  { validateRoot, configure } = require('../desktop/locations.cjs');
test('folder membership preserves independent project types, empty folders, migration and media on deletion', () => {
  fs.mkdirSync(path.resolve('.runtime/test-workspaces'), { recursive: true });
  const root = fs.mkdtempSync(
      path.join(path.resolve('.runtime/test-workspaces'), 'immerse-folders-'),
    ),
    store = new Store(root),
    audio = path.join(root, 'source.wav');
  fs.writeFileSync(audio, require('../desktop/takes.cjs').wavHeader(0, 48000));
  let song = store.create(audio, 'song');
  const resultId = require('node:crypto').randomUUID();
  song.tracks = [
    {
      id: 'vocals',
      name: 'vocals',
      file: song.original,
      gain: 1,
      pan: 0,
      mute: false,
      solo: false,
    },
  ];
  song.results = [
    {
      id: resultId,
      name: 'fixture',
      directory: 'media',
      tracks: song.tracks,
      modelId: 'fixture',
      modelName: 'fixture',
      mode: 'basic',
      createdAt: song.createdAt,
    },
  ];
  song.activeResultId = resultId;
  song.playlist = '未分类项目';
  store.save(song);
  const practice = createSession(store, { kind: 'practice', sourceId: song.id, title: 'practice' }),
    creation = createSession(store, { kind: 'creation', title: 'creation' }),
    folders = new Folders(store);
  assert.deepEqual(folders.list(), []);
  let list = folders.edit({ action: 'create', name: 'Band' }),
    id = list[0].id;
  assert.equal(new Folders(store).list()[0].projectIds.length, 0);
  for (const project of [song, practice, creation])
    list = folders.edit({ action: 'move', id, projectId: project.id });
  assert.equal(list[0].projectIds.length, 3);
  assert.throws(() => folders.edit({ action: 'create', name: 'band' }));
  folders.edit({ action: 'rename', id, name: 'Weekend' });
  assert.equal(folders.list()[0].name, 'Weekend');
  folders.edit({ action: 'create', name: 'Other' });
  const other = folders.list()[1].id;
  folders.edit({ action: 'move', id: other, projectId: song.id });
  assert.equal(folders.list()[0].projectIds.length, 2);
  folders.edit({ action: 'delete', id });
  assert.equal(store.list().length, 3);
  assert.ok(fs.existsSync(store.asset(song.id, song.original)));
  assert.throws(() => folders.edit({ action: 'move', id: other, projectId: 'missing' }));
});
test('installation validates locations, commits only after dependencies and models succeed, and pins all application paths', async () => {
  const area = fs.mkdtempSync(path.join(path.resolve('.runtime'), 'installation-unit-')),
    app = path.join(area, 'app'),
    data = path.join(area, 'data');
  fs.mkdirSync(app);
  assert.throws(() => validateRoot(app, app, true));
  assert.throws(() => validateRoot(path.parse(app).root, app, true));
  assert.throws(() => validateRoot('relative', app));
  assert.throws(() => validateRoot(path.join(app, 'data'), app, true));
  assert.throws(() => options(['--runtime-mode=unknown']));
  const calls = [],
    input = {
      dataRoot: data,
      installRoot: app,
      mode: 'cpu',
      models: ['beat-this'],
      allowSystemDrive: true,
    },
    services = {
      runtime: async (root, mode) => {
        calls.push(['runtime', root, mode]);
      },
      audio: async (root) => calls.push(['audio', root]),
      models: { ensure: async (id) => calls.push(['model', id]) },
    };
  await assert.rejects(
    prepare(input, {
      ...services,
      models: {
        ensure: async () => {
          throw Error('offline');
        },
      },
    }),
    /offline/,
  );
  assert.ok(!fs.existsSync(path.join(app, 'installation.json')));
  const result = await prepare(input, services);
  assert.equal(result.dataRoot, data);
  assert.equal(result.runtimeMode, 'cpu');
  assert.deepEqual(calls.at(-1), ['model', 'beat-this']);
  const paths = {},
    saved = { data: process.env.IMMERSE_DATA_DIR, runtime: process.env.IMMERSE_RUNTIME_DIR };
  delete process.env.IMMERSE_DATA_DIR;
  configure({ setPath: (key, value) => (paths[key] = value) }, app);
  assert.equal(paths.userData, path.join(data, 'profile'));
  assert.equal(process.env.IMMERSE_RUNTIME_DIR, path.join(data, 'runtime'));
  for (const [key, old] of [
    ['IMMERSE_DATA_DIR', saved.data],
    ['IMMERSE_RUNTIME_DIR', saved.runtime],
  ]) {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
  }
});
