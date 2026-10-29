const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ID = /^[a-f0-9-]{36}$/;
function normalizePlayback(p) {
  let changed = false;
  if (!p.practice || typeof p.practice !== 'object' || Array.isArray(p.practice)) {
    p.practice = { tempo: 1, pitch: 0, master: 0.8, eq: [0, 0, 0] };
    changed = true;
  }
  for (const [key, min, max, fallback] of [
    ['tempo', 0.25, 2, 1],
    ['pitch', -24, 24, 0],
    ['master', 0, 1, 0.8],
  ]) {
    const value = p.practice[key],
      normalized = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    if (value !== normalized) {
      p.practice[key] = normalized;
      changed = true;
    }
  }
  for (const track of [
    ...(p.tracks || []),
    ...(p.results || []).flatMap((result) => result.tracks || []),
    ...(p.originalMix ? [p.originalMix] : []),
    ...(p.takes || []),
    ...(p.sourceGroups || []),
    ...(p.sourceGroups || []).flatMap((group) => group.tracks),
    ...(p.sourceMix ? [p.sourceMix] : []),
  ])
    if (track.mute && track.solo) {
      track.solo = false;
      changed = true;
    }
  return changed;
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
function contained(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\0')) throw new Error('无效文件路径');
  const p = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), p);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))
    throw new Error('文件超出项目范围');
  return p;
}
class Store {
  constructor(base) {
    this.base = base;
    this.projects = path.join(base, 'projects');
    fs.mkdirSync(this.projects, { recursive: true });
  }
  dir(id) {
    if (!ID.test(id)) throw new Error('无效项目编号');
    return path.join(this.projects, id);
  }
  get(id) {
    const file = path.join(this.dir(id), 'project.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const normalized = normalizePlayback(raw);
    if (Array.isArray(raw.results)) {
      if (normalized) atomicJson(file, raw);
      return raw;
    }
    const upgraded = require('./results.cjs').upgrade(raw, this.asset.bind(this), atomicJson);
    const backup = path.join(this.dir(id), 'project.before-results.json');
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    atomicJson(file, upgraded);
    return upgraded;
  }
  save(p) {
    normalizePlayback(p);
    require('./groups.cjs').validateGroups(p);
    if (p.takes) {
      const { validateTakes, validateSelection } = require('./takes.cjs');
      validateTakes(p.takes);
      validateSelection(p);
    }
    if (p.chordCharts) require('./charts.cjs').validateCharts(p.chordCharts);
    if (Array.isArray(p.results)) {
      const active = p.results.find((result) => result.id === p.activeResultId);
      if (active) active.tracks = p.tracks;
    }
    atomicJson(path.join(this.dir(p.id), 'project.json'), {
      ...p,
      updatedAt: new Date().toISOString(),
    });
    return this.get(p.id);
  }
  list() {
    return fs
      .readdirSync(this.projects)
      .filter((s) => ID.test(s))
      .flatMap((id) => {
        try {
          return [this.get(id)];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  create(source, title) {
    const id = crypto.randomUUID(),
      dir = this.dir(id);
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const ext = path.extname(source).toLowerCase();
    const original = 'media/original' + ext;
    fs.copyFileSync(source, path.join(dir, original));
    return this.save({
      schemaVersion: 1,
      id,
      title: title || path.basename(source, ext),
      artist: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      original,
      results: [],
      activeResultId: null,
      tracks: [],
      attachments: [],
      bookmarks: [],
      practice: { tempo: 1, pitch: 0, master: 0.8, eq: [0, 0, 0] },
      duration: 0,
      starred: false,
    });
  }
  update(id, patch) {
    const p = this.get(id);
    let changedTracks = false;
    for (const key of [
      'title',
      'artist',
      'starred',
      'bookmarks',
      'practice',
      'alignment',
      'analysis',
      'attachments',
      'tracks',
      'duration',
      'waveform',
      'playlist',
      'notes',
      'originalMix',
      'presets',
      'chordCharts',
      'activeChordChartId',
      'takes',
      'selectedTakeIds',
      'recordingSettings',
      'practiceMode',
      'sourceMix',
      'sourceGroups',
    ])
      if (Object.hasOwn(patch, key)) {
        if (key === 'sourceGroups') {
          const expected = new Map(
            (p.sourceGroups || []).map((group) => [
              group.id,
              group.tracks.map((track) => [track.id, track.file]),
            ]),
          );
          if (
            !Array.isArray(patch.sourceGroups) ||
            patch.sourceGroups.length !== expected.size ||
            patch.sourceGroups.some(
              (group) =>
                JSON.stringify(expected.get(group.id)) !==
                JSON.stringify(group.tracks?.map((track) => [track.id, track.file])),
            )
          )
            throw new Error('分轨分组已变化，请重新打开工程');
        }
        if (key === 'practiceMode' && !['instrument', 'mixed'].includes(patch[key]))
          throw new Error('跟练方式无效');
        if (key === 'takes' && patch[key] === undefined) continue;
        if (key === 'takes') {
          const expected = new Map((p.takes || []).map((t) => [t.id, t]));
          if (
            !Array.isArray(patch.takes) ||
            patch.takes.length !== expected.size ||
            patch.takes.some(
              (t) =>
                !expected.has(t.id) ||
                t.file !== expected.get(t.id).file ||
                t.rawFile !== expected.get(t.id).rawFile ||
                t.duration !== expected.get(t.id).duration,
            )
          )
            throw new Error('录音库发生变化，请重新打开项目');
        }
        if (key === 'tracks') {
          if (Object.hasOwn(patch, 'activeResultId') && patch.activeResultId !== p.activeResultId)
            continue;
          const active = p.results.find((result) => result.id === p.activeResultId);
          if (!Array.isArray(patch.tracks)) throw new Error('音轨数据无效');
          if (active) {
            const expected = new Map(active.tracks.map((track) => [track.id, track.file]));
            if (
              patch.tracks.length !== expected.size ||
              new Set(patch.tracks.map((track) => track.id)).size !== expected.size ||
              patch.tracks.some((track) => expected.get(track.id) !== track.file)
            )
              throw new Error('此混音属于另一组分离结果，请先切换到对应结果');
          }
          changedTracks = true;
        }
        p[key] = patch[key];
      }
    const saved = this.save(p);
    if (changedTracks) {
      const active = saved.results.find((result) => result.id === saved.activeResultId);
      if (active)
        require('./results.cjs').resultInfo(saved, active, this.asset.bind(this), atomicJson);
    }
    return saved;
  }
  addResult(id, data, metadata) {
    const p = this.get(id);
    const result = require('./results.cjs').materialize(
      p,
      data.tracks,
      { ...metadata, separation: data.separation },
      this.asset.bind(this),
      atomicJson,
    );
    p.results.push(result);
    p.activeResultId = result.id;
    p.tracks = result.tracks;
    p.separation = data.separation;
    const saved = this.save(p);
    const working = path.dirname(this.asset(id, data.tracks[0].file));
    if (
      path.dirname(working) === this.asset(id, '.work') &&
      ID.test(path.basename(working)) &&
      data.tracks.every((track) => path.dirname(this.asset(id, track.file)) === working)
    ) {
      try {
        fs.rmSync(working, { recursive: true, force: true });
      } catch {
        /* Completed results remain valid if temporary cleanup is delayed. */
      }
    }
    return saved;
  }
  selectResult(id, resultId) {
    const p = this.get(id);
    const result = resultId ? p.results.find((item) => item.id === resultId) : null;
    if (resultId && !result) throw new Error('分离结果不存在');
    p.activeResultId = result?.id || null;
    p.tracks = result?.tracks || [];
    return this.save(p);
  }
  renameResult(id, resultId, name) {
    if (typeof name !== 'string' || !name.trim() || name.length > 120)
      throw new Error('请输入 1–120 字的结果名称');
    const p = this.get(id),
      result = p.results.find((item) => item.id === resultId);
    if (!result) throw new Error('分离结果不存在');
    const { relativeFolder, resultInfo } = require('./results.cjs'),
      before = structuredClone(result),
      directory = relativeFolder(name.trim(), result.id),
      source = this.asset(id, result.directory),
      dest = this.asset(id, directory);
    const moved = source.toLowerCase() !== dest.toLowerCase();
    let committed = false;
    if (moved) {
      if (fs.existsSync(dest)) throw new Error('同名结果文件夹已存在');
      fs.renameSync(source, dest);
    }
    try {
      const rewrite = (track) => ({
        ...track,
        file: track.file.startsWith(before.directory + '/')
          ? directory + track.file.slice(before.directory.length)
          : track.file,
      });
      result.name = name.trim();
      result.directory = directory;
      result.tracks = result.tracks.map(rewrite);
      if (p.activeResultId === resultId) p.tracks = result.tracks;
      for (const preset of p.presets || []) preset.tracks = preset.tracks.map(rewrite);
      resultInfo(p, result, this.asset.bind(this), atomicJson);
      atomicJson(path.join(this.dir(id), 'project.json'), {
        ...p,
        updatedAt: new Date().toISOString(),
      });
      committed = true;
      return this.get(id);
    } finally {
      if (!committed && moved) {
        fs.renameSync(dest, source);
        resultInfo(p, before, this.asset.bind(this), atomicJson);
      }
    }
  }
  asset(id, relative) {
    return contained(this.dir(id), relative);
  }
}
module.exports = { Store, contained, atomicJson };
