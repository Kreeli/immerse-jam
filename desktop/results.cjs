const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const modes = {
  basic: '基础四轨',
  six: '完整六轨',
  guitarist: '主奏与节奏吉他',
  singer: '主唱与和声',
  drummer: '鼓',
  bassist: '贝斯',
};
function safeName(name) {
  return (
    String(name)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 72) || '分离结果'
  );
}
function relativeFolder(name, id) {
  return 'results/' + safeName(name) + '--' + id.slice(0, 8);
}
function copyTrack(source, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.linkSync(source, dest);
  } catch {
    fs.copyFileSync(source, dest);
  }
}
function resultInfo(p, result, asset, writeJson) {
  const location = asset(p.id, result.directory + '/result.json');
  writeJson(location, {
    schemaVersion: 1,
    id: result.id,
    name: result.name,
    modelId: result.modelId,
    modelName: result.modelName,
    mode: result.mode,
    createdAt: result.createdAt,
    tracks: result.tracks.map((t) => ({ ...t, file: 'tracks/' + path.basename(t.file) })),
  });
}
function materialize(p, tracks, metadata, asset, writeJson) {
  if (!tracks.length || new Set(tracks.map((t) => t.id)).size !== tracks.length)
    throw new Error('分离结果的音轨为空或编号重复');
  for (const track of tracks) {
    if (!fs.statSync(asset(p.id, track.file)).isFile()) throw new Error('分离结果缺少音轨');
  }
  const id = metadata.id || crypto.randomUUID(),
    name =
      metadata.name ||
      `${metadata.modelName || '已有分离结果'} · ${modes[metadata.mode] || tracks.length + ' 轨'}`;
  const directory = relativeFolder(name, id);
  const created = [];
  try {
    const output = tracks.map((track, index) => {
      const filename = safeName(track.name || track.id || String(index)) + path.extname(track.file);
      const file = directory + '/tracks/' + filename;
      const dest = asset(p.id, file);
      if (fs.existsSync(dest)) throw new Error('结果文件已存在');
      copyTrack(asset(p.id, track.file), dest);
      created.push(dest);
      return { ...track, file };
    });
    const result = {
      ...metadata,
      id,
      name,
      modelId: metadata.modelId || 'legacy',
      modelName: metadata.modelName || '历史模型（名称未记录）',
      mode: metadata.mode || '',
      createdAt: metadata.createdAt || new Date().toISOString(),
      directory,
      tracks: output,
    };
    resultInfo(p, result, asset, writeJson);
    return result;
  } catch (error) {
    for (const file of created) fs.rmSync(file, { force: true });
    throw error;
  }
}
function inferredMode(names) {
  const keys = [...names].sort().join(',');
  for (const [mode, stems] of Object.entries({
    six: ['bass', 'drums', 'other', 'vocals', 'guitar', 'piano'],
    basic: ['vocals', 'drums', 'bass', 'other'],
    guitarist: ['lead', 'rhythm', 'other'],
    singer: ['lead_vocals', 'backing_vocals', 'other'],
    drummer: ['drums', 'other'],
    bassist: ['bass', 'other'],
  }))
    if (stems.sort().join(',') === keys) return mode;
  return '';
}
function upgrade(p, asset, writeJson) {
  if (Array.isArray(p.results)) return p;
  const remapped = new Map(),
    results = [],
    current = p.tracks || [],
    currentFiles = new Set(current.map((t) => t.file.replaceAll('\\', '/')));
  if (current.length) {
    const result = materialize(
      p,
      current,
      {
        name: '已有分离结果 · ' + current.length + ' 轨',
        modelId: p.separation?.model || 'legacy',
        modelName: p.separation?.model || '已有分离结果',
        mode: p.separation?.mode || inferredMode(current.map((t) => t.name)),
        createdAt: p.updatedAt,
      },
      asset,
      writeJson,
    );
    results.push(result);
    current.forEach((track, index) => remapped.set(track.file, result.tracks[index].file));
  }
  const old = asset(p.id, 'separations');
  if (fs.existsSync(old))
    for (const entry of fs.readdirSync(old, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const folder = path.join(old, entry.name);
      const names = fs
        .readdirSync(folder)
        .filter((file) =>
          /^(bass|drums|other|vocals|guitar|piano|lead|rhythm|lead_vocals|backing_vocals)\.wav$/i.test(
            file,
          ),
        );
      const mode = inferredMode(names.map((file) => path.basename(file, '.wav')));
      if (!mode) continue;
      const files = names.map((file) => 'separations/' + entry.name + '/' + file);
      if (files.some((file) => currentFiles.has(file))) continue;
      const sizes = files.map((file) => fs.statSync(asset(p.id, file)).size);
      if (Math.min(...sizes) < 64 || Math.max(...sizes) - Math.min(...sizes) > 4096) continue;
      const tracks = files.map((file) => ({
        id: path.basename(file, '.wav'),
        name: path.basename(file, '.wav'),
        file,
        gain: 1,
        pan: 0,
        mute: false,
        solo: false,
      }));
      results.push(
        materialize(
          p,
          tracks,
          {
            name: `历史分离结果 ${results.length + 1} · ${modes[mode]}`,
            mode,
            createdAt: fs.statSync(folder).mtime.toISOString(),
          },
          asset,
          writeJson,
        ),
      );
    }
  const presets = (p.presets || []).map((preset) => ({
    ...preset,
    tracks: preset.tracks.map((track) => ({
      ...track,
      file: remapped.get(track.file) || track.file,
    })),
  }));
  const upgraded = {
    ...p,
    presets,
    results,
    activeResultId: results[0]?.id || null,
    tracks: results[0]?.tracks || [],
  };
  return upgraded;
}
module.exports = { materialize, upgrade, resultInfo, safeName, relativeFolder };
