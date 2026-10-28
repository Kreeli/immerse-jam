const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { contained } = require('./store.cjs');
const { fromAudioJam } = require('./archive.cjs');
function open(folder) {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(path.join(folder, 'index.db'), { readOnly: true });
}
function ids(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return String(value || '')
    .split(',')
    .filter(Boolean);
}
function inventory(folder) {
  const assets = path.join(folder, 'assets'),
    files = fs.readdirSync(assets),
    map = new Map();
  for (const f of files) {
    if (fs.statSync(contained(assets, f)).isFile()) map.set(path.basename(f, path.extname(f)), f);
  }
  return { assets, map };
}
function scanDatabase(folder) {
  const db = open(folder);
  try {
    const { map } = inventory(folder);
    const items = db
      .prepare('SELECT id,name,duration,trackIdsStr FROM music WHERE isDeleted=0')
      .all()
      .map((m) => {
        const tracks = ids(m.trackIdsStr)
          .map((id) =>
            db.prepare('SELECT name,audioId,videoId FROM track WHERE id=? AND isDeleted=0').get(id),
          )
          .filter(Boolean);
        const main = tracks.find((t) => t.name === 'main'),
          missing = tracks.filter((t) => !map.has(t.videoId || t.audioId));
        return {
          id: m.id,
          name: m.name,
          duration: m.duration / 1000,
          available: !!main && map.has(main.videoId || main.audioId),
          tracks: tracks.filter((t) => t.name !== 'main' && map.has(t.audioId)).length,
          missing: missing.map((t) => t.name),
        };
      });
    return { folder, database: true, items };
  } finally {
    db.close();
  }
}
function importDatabase(store, folder, selected) {
  const db = open(folder),
    results = [];
  try {
    const { assets, map } = inventory(folder);
    for (const id of selected) {
      const duplicate = store.list().find((p) => p.originId === id);
      if (duplicate) {
        results.push({ ...duplicate, duplicate: true });
        continue;
      }
      const m = db.prepare('SELECT * FROM music WHERE id=? AND isDeleted=0').get(id);
      if (!m) throw new Error('未找到所选歌曲');
      const sourceTracks = ids(m.trackIdsStr)
        .map((key) => db.prepare('SELECT * FROM track WHERE id=? AND isDeleted=0').get(key))
        .filter(Boolean);
      const main = sourceTracks.find((t) => t.name === 'main');
      if (!main || !map.has(main.videoId || main.audioId))
        throw new Error(m.name + ' 的原曲尚未下载到本机');
      const sourceAttachments = db
        .prepare('SELECT id,title,name,remark FROM attachment WHERE musicId=? AND isDeleted=0')
        .all();
      const marks = ids(m.markIdsStr)
        .map((key) =>
          db.prepare('SELECT id,title,start,end FROM mark WHERE id=? AND isDeleted=0').get(key),
        )
        .filter(Boolean);
      const tracks = sourceTracks
        .filter((t) => map.has(t.name === 'main' ? t.videoId || t.audioId : t.audioId))
        .map((t) => ({
          ...t,
          audio_file: map.get(t.name === 'main' ? t.videoId || t.audioId : t.audioId),
          speed: t.speed,
          pitch_key: t.pitchKey,
        }));
      const attachments = sourceAttachments
        .filter(
          (a) =>
            /\.(gp[345x]?|gtp|midi?|mxl|musicxml|xml|pdf|png|jpe?g|txt)$/i.test(a.name) &&
            fs.existsSync(contained(assets, a.name)),
        )
        .map((a) => ({ name: a.title || a.name, file: a.name, remark: a.remark }));
      const staging = path.join(store.base, 'incoming', crypto.randomUUID());
      fs.mkdirSync(path.join(staging, 'assets'), { recursive: true });
      const files = new Set([
        ...tracks.map((t) => t.audio_file),
        ...attachments.map((a) => a.file),
      ]);
      if (map.has(m.beatInfoId)) files.add(map.get(m.beatInfoId));
      for (const file of files)
        fs.copyFileSync(contained(assets, file), contained(path.join(staging, 'assets'), file));
      const p = fromAudioJam(
        { ...m, tracks, attachments, position_marks: marks, create_time: m.createdDate },
        staging,
      );
      p.id = crypto.randomUUID();
      p.originId = id;
      p.starred = !!m.like;
      p.practice.countIn = !!m.countdown;
      p.practice.master = Math.max(0, Math.min(1, (m.volume ?? 100) / 100));
      try {
        p.practice.eq = JSON.parse(main.equilizerStr)
          .map((e) => e.value)
          .slice(0, 3);
      } catch {}
      p.tracks = p.tracks.map((t) => ({
        ...t,
        pan: Math.max(-1, Math.min(1, sourceTracks.find((s) => s.name === t.name)?.pan || 0)),
      }));
      p.migration = {
        source: 'Audio Jam',
        missingTracks: sourceTracks.filter((t) => !map.has(t.audioId)).map((t) => t.name),
        at: new Date().toISOString(),
      };
      const folderInfo = db.prepare('SELECT title FROM folder WHERE id=?').get(m.parentId);
      if (folderInfo) p.playlist = folderInfo.title;
      fs.renameSync(staging, store.dir(p.id));
      results.push(store.save(p));
    }
    return results;
  } finally {
    db.close();
  }
}
module.exports = { scanDatabase, importDatabase };
