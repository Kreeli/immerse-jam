// The same file inventory is used for validation and archive checksum coverage.
const MAX_SECONDS = 14400;
// Audio Jam sometimes stores a trailing N chord just beyond the media end.
// Repair only that known migration artifact; arbitrary malformed data stays invalid.
function repairLegacyAnalysis(p) {
  const a = p.analysis,
    duration = p.duration;
  if (
    a?.method !== 'audiojam-migration' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Array.isArray(a.chords)
  )
    return false;
  let changed = false;
  a.chords = a.chords.filter((c) => {
    if (!c || !Number.isFinite(c.start) || !Number.isFinite(c.end)) return true;
    if (
      c.label === 'N' &&
      c.start >= duration &&
      c.start <= duration + 2 &&
      c.end <= c.start &&
      Math.abs(c.end - duration) < 1
    ) {
      changed = true;
      return false;
    }
    if (c.start >= 0 && c.start < duration && c.end > duration && c.end <= duration + 2) {
      c.end = duration;
      changed = true;
    }
    return true;
  });
  return changed;
}
function fail(field) {
  throw new Error('歌曲数据无效：' + field);
}
function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field);
  return value;
}
function number(value, field, min = -MAX_SECONDS, max = MAX_SECONDS, optional = false) {
  if (value === undefined && optional) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(field);
}
function text(value, field, max = 1000, optional = false) {
  if (value === undefined && optional) return;
  if (typeof value !== 'string' || value.length > max) fail(field);
}
function array(value, field, max = 1000) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) fail(field);
  return value;
}
function file(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    /(^[/\\]|^[A-Za-z]:|\0)/.test(value) ||
    value
      .replaceAll('\\', '/')
      .split('/')
      .some((p) => p === '..' || p === '.')
  )
    fail('媒体路径');
}
function tracks(values, field) {
  const ids = new Set();
  for (const t of array(values, field, 1000)) {
    object(t, field);
    text(t.id, field + '.id', 200);
    if (!t.id || ids.has(t.id)) fail(field + '.id');
    ids.add(t.id);
    file(t.file);
    if (t.name != null) text(t.name, field + '.name', 1000);
    if (t.label != null) text(t.label, field + '.label', 1000);
    number(t.gain, field + '.gain', 0, 1.5);
    number(t.pan, field + '.pan', -1, 1);
    number(t.start, field + '.start', -MAX_SECONDS, MAX_SECONDS, true);
    for (const key of ['mute', 'solo']) if (typeof t[key] !== 'boolean') fail(field + '.' + key);
  }
}
function referencedFiles(p) {
  return [
    ...new Set(
      [
        p.original,
        p.playback,
        p.scoreMidi,
        ...(p.tracks || []).map((t) => t.file),
        ...(p.originalMix ? [p.originalMix.file] : []),
        ...(p.results || []).flatMap((r) => r.tracks.map((t) => t.file)),
        ...(p.sourceGroups || []).flatMap((g) => g.tracks.map((t) => t.file)),
        ...(p.takes || []).flatMap((t) => [t.file, t.rawFile]),
        ...(p.attachments || []).map((a) => a.file),
      ].filter(Boolean),
    ),
  ];
}
function validateProject(p) {
  object(p, 'project');
  if (![1, 2].includes(p.schemaVersion)) fail('schemaVersion');
  text(p.id, 'id', 200);
  text(p.title, 'title', 1000);
  text(p.artist, 'artist', 1000, true);
  if (p.kind !== undefined && !['practice', 'creation'].includes(p.kind)) fail('kind');
  number(p.duration, 'duration', 0, MAX_SECONDS);
  const practice = object(p.practice, 'practice');
  number(practice.tempo, 'practice.tempo', 0.25, 2);
  number(practice.pitch, 'practice.pitch', -24, 24);
  number(practice.master, 'practice.master', 0, 1);
  number(practice.metronomeVolume, 'practice.metronomeVolume', 0, 1, true);
  number(practice.countInBpm, 'practice.countInBpm', 20, 350, true);
  number(practice.countInBeats, 'practice.countInBeats', 1, 16, true);
  for (const flag of ['metronome', 'midi', 'countIn', 'snapCountIn'])
    if (practice[flag] !== undefined && typeof practice[flag] !== 'boolean')
      fail('practice.' + flag);
  tracks(p.tracks, 'tracks');
  if (p.originalMix) tracks([p.originalMix], 'originalMix');
  tracks(p.takes, 'takes');
  const resultIds = new Set();
  for (const r of array(p.results, 'results', 200)) {
    object(r, 'result');
    text(r.id, 'result.id', 200);
    if (resultIds.has(r.id)) fail('result.id');
    resultIds.add(r.id);
    file(r.directory);
    text(r.name, 'result.name', 1000);
    tracks(r.tracks, 'result.tracks');
  }
  if (p.activeResultId != null && !resultIds.has(p.activeResultId)) fail('activeResultId');
  for (const g of array(p.sourceGroups, 'sourceGroups', 100)) {
    object(g, 'group');
    tracks(g.tracks, 'group.tracks');
  }
  for (const t of array(p.takes, 'takes')) {
    number(t.duration, 'take.duration', 0, MAX_SECONDS);
    number(t.offsetMs, 'take.offsetMs', -3600000, 3600000, true);
  }
  for (const a of array(p.attachments, 'attachments')) {
    object(a, 'attachment');
    text(a.name, 'attachment.name', 1000);
    file(a.file);
  }
  for (const b of array(p.bookmarks, 'bookmarks', 10000)) {
    object(b, 'bookmark');
    text(b.id, 'bookmark.id', 200);
    text(b.title, 'bookmark.title', 1000);
    number(b.start, 'bookmark.start', 0);
    number(b.end, 'bookmark.end', b.start, MAX_SECONDS, true);
  }
  if (p.analysis) {
    const a = object(p.analysis, 'analysis');
    number(a.bpm, 'analysis.bpm', 0, 350);
    for (const key of ['beats', 'downbeats']) {
      let last = -1;
      for (const value of array(a[key], key, 300000)) {
        number(value, key, last);
        last = value;
      }
    }
    for (const c of array(a.chords, 'chords', 100000)) {
      object(c, 'chord');
      number(c.start, 'chord.start', 0);
      number(c.end, 'chord.end', c.start);
      text(c.label, 'chord.label', 100);
      number(c.confidence, 'chord.confidence', 0, 1);
    }
  }
  if (p.alignment) {
    const a = object(p.alignment, 'alignment');
    let score = -1,
      audio = -1;
    for (const q of array(a.points, 'alignment.points', 100000)) {
      object(q, 'point');
      number(q.scoreTime, 'scoreTime', score);
      number(q.audioTime, 'audioTime', audio);
      number(q.confidence, 'confidence', 0, 1);
      score = q.scoreTime;
      audio = q.audioTime;
    }
    for (const n of array(a.notes, 'notes', 500000)) {
      object(n, 'note');
      number(n.start, 'note.start', 0);
      number(n.end, 'note.end', n.start);
      number(n.pitch, 'note.pitch', 0, 127);
      number(n.velocity, 'note.velocity', 0, 127);
    }
  }
  for (const preset of array(p.presets, 'presets', 200)) {
    object(preset, 'preset');
    tracks(preset.tracks, 'preset.tracks');
  }
  array(p.chordCharts, 'chordCharts', 100);
  if (
    p.createdAt !== undefined &&
    (typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt)))
  )
    fail('createdAt');
  if (
    p.updatedAt !== undefined &&
    (typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt)))
  )
    fail('updatedAt');
  for (const name of referencedFiles(p)) file(name);
  return p;
}
module.exports = { validateProject, referencedFiles, repairLegacyAnalysis, MAX_SECONDS };
