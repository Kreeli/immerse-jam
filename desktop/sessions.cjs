const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { wavHeader } = require('./takes.cjs');
const { resultInfo } = require('./results.cjs');
const { atomicJson } = require('./store.cjs');
function createSession(store, options) {
  const { kind, sourceId, resultId, mode = 'instrument' } = options;
  if (!['practice', 'creation'].includes(kind) || !['instrument', 'mixed'].includes(mode))
    throw new Error('内容类型无效');
  const title = typeof options.title === 'string' ? options.title.trim() : '';
  if (!title || title.length > 120) throw new Error('请输入 1–120 字的名称');
  const source = sourceId ? store.get(sourceId) : null;
  if (source?.kind) throw new Error('请选择音乐库歌曲');
  const result = source
    ? (source.results || []).find((item) => item.id === (resultId || source.activeResultId))
    : null;
  if (resultId && !result) throw new Error('分离结果不存在');
  if (kind === 'practice' && !result?.tracks.length) throw new Error('跟练需要选择已分轨的歌曲');
  const id = crypto.randomUUID(),
    folder = store.dir(id);
  try {
    const now = new Date().toISOString();
    let project;
    if (source) {
      project = {
        ...structuredClone(source),
        id,
        kind,
        title,
        results: result ? [structuredClone(result)] : [],
        activeResultId: result?.id || null,
        tracks: structuredClone(result?.tracks || []),
        takes: [],
        selectedTakeIds: [],
        presets: [],
        playlist: undefined,
        recordingSettings: undefined,
        starred: false,
        createdAt: now,
        updatedAt: now,
        practice: { ...source.practice, lastPlayedAt: undefined },
        sessionSource: { projectId: source.id, title: source.title, resultId: result?.id || null },
        practiceMode: kind === 'practice' ? mode : undefined,
      };
      const files = new Set([
        source.original,
        ...(source.playback ? [source.playback] : []),
        ...project.tracks.map((track) => track.file),
        ...(source.attachments || []).map((item) => item.file),
        ...(source.scoreMidi ? [source.scoreMidi] : []),
      ]);
      for (const file of files) {
        const dest = store.asset(id, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(store.asset(source.id, file), dest, fs.constants.COPYFILE_FICLONE);
      }
      if (result) resultInfo(project, project.results[0], store.asset.bind(store), atomicJson);
    } else {
      fs.mkdirSync(path.join(folder, 'media'), { recursive: true });
      fs.writeFileSync(path.join(folder, 'media/original.wav'), wavHeader(0, 48000));
      project = {
        schemaVersion: 1,
        id,
        kind,
        title,
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
        createdAt: now,
        updatedAt: now,
      };
    }
    return store.save(project);
  } catch (error) {
    if (path.dirname(path.resolve(folder)) === path.resolve(store.projects))
      fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { createSession };
