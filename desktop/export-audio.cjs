const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
function atempo(value) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('播放速度必须是有限的正数');
  if (Math.abs(value - 1) < 1e-8) return 'anull';
  const chain = [];
  while (value < 0.5) {
    chain.push('atempo=0.5');
    value /= 0.5;
  }
  while (value > 2) {
    chain.push('atempo=2');
    value /= 2;
  }
  chain.push('atempo=' + value.toFixed(8));
  return chain.join(',');
}
function pan(value) {
  const p = Math.max(-1, Math.min(1, Number(value) || 0));
  return p <= 0
    ? `pan=stereo|c0=c0+${Math.cos(((p + 1) * Math.PI) / 2).toFixed(8)}*c1|c1=${Math.sin(((p + 1) * Math.PI) / 2).toFixed(8)}*c1`
    : `pan=stereo|c0=${Math.cos((p * Math.PI) / 2).toFixed(8)}*c0|c1=c1+${Math.sin((p * Math.PI) / 2).toFixed(8)}*c0`;
}
function exportMix(store, id, ffmpeg, dest, region) {
  const p = store.get(id);
  if (
    !Number.isFinite(p.practice?.tempo) ||
    p.practice.tempo < 0.25 ||
    p.practice.tempo > 2 ||
    !Number.isFinite(p.practice.pitch) ||
    Math.abs(p.practice.pitch) > 24 ||
    !Number.isFinite(p.practice.master) ||
    p.practice.master < 0 ||
    p.practice.master > 1
  )
    throw new Error('播放设置无效，请重新设置速度、音调和音量');
  let tracks = [
    ...(p.kind === 'creation' && !p.sessionSource
      ? []
      : p.tracks.length
        ? p.tracks
        : [p.originalMix || { file: p.playback || p.original, gain: 1, pan: 0 }]),
    ...(p.takes || [])
      .filter((t) => p.kind === 'creation' || (p.selectedTakeIds || []).includes(t.id))
      .map((t) => ({ ...t, start: (t.start || 0) + (t.offsetMs || 0) / 1000 })),
  ];
  if (p.kind === 'creation') tracks = require('./groups.cjs').creationTracks(p);
  if (p.kind === 'practice' && p.practiceMode === 'mixed' && (p.selectedTakeIds || []).length) {
    const takeIds = new Set(p.selectedTakeIds);
    tracks = tracks.map((track) => ({ ...track, mute: track.mute || !takeIds.has(track.id) }));
  }
  const solo = tracks.some((t) => t.solo && !t.mute);
  tracks = tracks.filter((t) => !t.mute && (!solo || t.solo));
  if (!tracks.length) throw new Error('当前所有音轨都已关闭声音');
  const args = ['-nostdin', '-v', 'error', '-y'];
  for (const t of tracks) args.push('-i', store.asset(id, t.file));
  const filters = tracks.map(
    (t, i) =>
      `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,${t.start < 0 ? 'atrim=start=' + -t.start + ',asetpts=PTS-STARTPTS,' : t.start > 0 ? 'adelay=' + Math.round(t.start * 1000) + ':all=1,' : ''}${pan(t.pan)},volume=${Math.max(0, Math.min(1.5, t.gain))}[a${i}]`,
  );
  const pitch = 2 ** (p.practice.pitch / 12);
  filters.push(
    tracks.map((_, i) => `[a${i}]`).join('') +
      `amix=inputs=${tracks.length}:normalize=0,asetrate=${44100 * pitch},aresample=44100,${atempo(p.practice.tempo / pitch)},volume=${p.practice.master},alimiter=limit=0.98[out]`,
  );
  args.push('-filter_complex', filters.join(';'), '-map', '[out]');
  if (region && region.b > region.a)
    args.push(
      '-ss',
      String(region.a / p.practice.tempo),
      '-t',
      String((region.b - region.a) / p.practice.tempo),
    );
  if (path.extname(dest).toLowerCase() === '.mp3') args.push('-c:a', 'libmp3lame', '-b:a', '320k');
  else args.push('-c:a', 'pcm_s24le', '-rf64', 'auto');
  args.push(dest);
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let error = '';
    child.stderr.on('data', (b) => (error += b.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(dest) : reject(new Error(error || '混音导出失败')),
    );
  });
}
function exportStems(store, id, folder) {
  const p = store.get(id),
    out = path.join(folder, safeName(p.title, '音频') + '_' + Date.now());
  fs.mkdirSync(out, { recursive: true });
  let index = 0;
  for (const t of [
    ...(p.kind === 'creation' && !p.sessionSource ? [] : [{ name: 'original', file: p.original }]),
    ...p.tracks,
    ...(p.sourceGroups || []).flatMap((group) => group.tracks),
    ...(p.takes || []).filter(
      (t) => p.kind === 'creation' || (p.selectedTakeIds || []).includes(t.id),
    ),
  ])
    fs.copyFileSync(
      store.asset(id, t.file),
      path.join(
        out,
        safeName(t.label || t.name, '音轨') +
          '_' +
          String(index++).padStart(2, '0') +
          '_' +
          safeName(t.id, 'original').slice(0, 8) +
          path.extname(t.file),
      ),
    );
  return out;
}
function safeName(value, fallback) {
  const text =
    typeof value === 'string'
      ? value
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
          .replace(/[. ]+$/g, '')
          .slice(0, 100)
      : '';
  return text || fallback;
}
module.exports = { exportMix, exportStems, atempo };
