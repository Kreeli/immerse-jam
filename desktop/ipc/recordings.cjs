const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { shell } = require('electron');
const { text: t } = require('../locale.cjs');
const { ensureAudioTools } = require('../audio-tools.cjs');
module.exports = function registerRecordings({
  handle,
  store,
  takes,
  emit,
  pick,
  runtimeBase,
  base,
}) {
  handle('creation-new', () => {
    const id = crypto.randomUUID(),
      folder = store.dir(id);
    fs.mkdirSync(path.join(folder, 'media'), { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'media/original.wav'),
      require('../takes.cjs').wavHeader(0, 48000),
    );
    const p = store.save({
      schemaVersion: 1,
      id,
      kind: 'creation',
      title:
        t('新建创作') +
        ' ' +
        (store.list().filter((project) => project.kind === 'creation').length + 1),
      artist: '',
      original: 'media/original.wav',
      results: [],
      activeResultId: null,
      tracks: [],
      takes: [],
      selectedTakeIds: [],
      attachments: [],
      bookmarks: [],
      duration: 0,
      starred: false,
      practice: { tempo: 1, pitch: 0, master: 0.8, eq: [0, 0, 0] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    emit({ type: 'library-changed' });
    return p;
  });
  handle('audio-tools-ensure', () =>
    ensureAudioTools(runtimeBase, (e) => emit({ ...e, scope: 'audio-tools' })),
  );
  handle('take-start', (data) => takes.start(data.id, data.options));
  handle('take-append', (data) =>
    takes.append(data.sessionId, data.sequence, data.contextTime, data.bytes),
  );
  handle('take-finish', (data) => takes.finish(data.sessionId));
  handle('take-select', (data) => takes.select(data.id, data.takeIds));
  handle('take-delete', (data) => takes.remove(data.id, data.takeId));
  handle('take-recover', (data) => takes.recover(data.id));
  handle('take-open', async (data) => {
    const directory = store.asset(data.id, 'recordings');
    fs.mkdirSync(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
    return true;
  });
  handle('take-import', async (data) => {
    let files = data.paths;
    if (!files) {
      const selected = await pick([
        {
          name: '演奏录音',
          extensions: ['wav', 'mp3', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'webm'],
        },
      ]);
      if (selected.canceled) return null;
      files = selected.filePaths;
    }
    if (!Array.isArray(files) || files.length > 100) throw new Error('一次最多导入 100 条录音');
    await ensureAudioTools(runtimeBase, (e) => emit({ ...e, scope: 'audio-tools' }));
    return takes.import(data.id, files, data.position || 0, data.mode || 'instrument');
  });
  handle('recording-import', async (data) => {
    if (!Array.isArray(data.bytes) || data.bytes.length > 512 * 1024 ** 2)
      throw new Error('录音过大');
    const dir = path.join(base, 'recordings');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, crypto.randomUUID() + '.webm');
    fs.writeFileSync(file, Buffer.from(data.bytes));
    const p = store.create(file, '录音 ' + new Date().toLocaleString('zh-CN'));
    emit({ type: 'library-changed' });
    return p;
  });
};
