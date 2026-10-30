const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const ID = /^[a-f0-9-]{36}$/;
function validateMix(mix) {
  if (
    !mix ||
    ![mix.gain, mix.start].every(Number.isFinite) ||
    mix.gain < 0 ||
    mix.gain > 1 ||
    Math.abs(mix.start) > 14400 ||
    typeof mix.mute !== 'boolean' ||
    typeof mix.solo !== 'boolean' ||
    (mix.label !== undefined && (typeof mix.label !== 'string' || mix.label.length > 120))
  )
    throw new Error('分轨分组设置无效');
}
function validateGroups(p) {
  if (p.sourceMix) {
    validateMix(p.sourceMix);
    if (
      Object.keys(p.sourceMix).some(
        (key) => !['gain', 'mute', 'solo', 'start', 'label'].includes(key),
      )
    )
      throw new Error('分轨分组设置无效');
  }
  if (!p.sourceGroups) return;
  if (
    !Array.isArray(p.sourceGroups) ||
    p.sourceGroups.length > 100 ||
    (p.kind !== 'creation' && p.sourceGroups.length)
  )
    throw new Error('分轨分组数据无效');
  const ids = new Set(),
    tracks = new Set([
      ...(p.tracks || []).map((track) => track.id),
      ...(p.takes || []).map((take) => take.id),
    ]);
  for (const group of p.sourceGroups) {
    validateMix(group);
    if (
      !ID.test(group.id) ||
      ids.has(group.id) ||
      typeof group.name !== 'string' ||
      group.name.length > 120 ||
      !Array.isArray(group.tracks) ||
      !group.tracks.length ||
      group.tracks.length > 32
    )
      throw new Error('分轨分组数据无效');
    ids.add(group.id);
    for (const track of group.tracks) {
      if (
        tracks.has(track.id) ||
        typeof track.id !== 'string' ||
        typeof track.file !== 'string' ||
        !track.file.startsWith('groups/' + group.id + '/') ||
        track.file.includes('..') ||
        ![track.gain, track.pan, track.start || 0].every(Number.isFinite) ||
        track.gain < 0 ||
        track.gain > 1.5 ||
        Math.abs(track.pan) > 1 ||
        Math.abs(track.start || 0) > 14400
      )
        throw new Error('分轨分组音轨无效');
      tracks.add(track.id);
    }
  }
}
function addGroup(store, id, sourceStore, source, resultId, position = 0) {
  if (source.kind) throw new Error('请选择音乐库中的源工程');
  const p = store.get(id);
  if (p.kind !== 'creation' || !Number.isFinite(position) || Math.abs(position) > 14400)
    throw new Error('只能在创作工程中添加分轨项目');
  const result = resultId ? (source.results || []).find((item) => item.id === resultId) : null;
  if (resultId && !result) throw new Error('分离结果不存在');
  const inputs = result?.tracks || source.tracks;
  const sourceTracks = inputs.length
    ? inputs
    : [
        {
          id: 'original',
          name: source.title,
          file: source.playback || source.original,
          gain: 1,
          pan: 0,
          mute: false,
          solo: false,
        },
      ];
  const groupId = crypto.randomUUID(),
    relative = 'groups/' + groupId,
    folder = store.asset(id, relative);
  try {
    const tracks = sourceTracks.map((track, index) => {
      const file = relative + '/' + index + '-' + path.basename(track.file),
        target = store.asset(id, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(
        sourceStore.asset(source.id, track.file),
        target,
        fs.constants.COPYFILE_FICLONE,
      );
      return { ...track, id: groupId + ':' + track.id, file };
    });
    p.sourceGroups = [
      ...(p.sourceGroups || []),
      {
        id: groupId,
        name: source.title.slice(0, 120),
        sourceTitle: source.title,
        tracks,
        gain: 1,
        mute: false,
        solo: false,
        start: position,
      },
    ];
    return store.save(p);
  } catch (error) {
    if (path.dirname(path.resolve(folder)) === path.resolve(store.dir(id), 'groups'))
      fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}
function creationTracks(p) {
  const groups = [
    ...(p.sessionSource
      ? [
          {
            id: 'source',
            name: p.sessionSource.title,
            tracks: p.tracks.length
              ? p.tracks
              : [
                  p.originalMix || {
                    id: 'original',
                    name: '原曲',
                    file: p.playback || p.original,
                    gain: 1,
                    pan: 0,
                    mute: false,
                    solo: false,
                  },
                ],
            gain: 1,
            mute: false,
            solo: false,
            start: 0,
            ...p.sourceMix,
          },
        ]
      : []),
    ...(p.sourceGroups || []),
  ];
  const takes = p.takes || [],
    solo =
      groups.some((group) => group.solo && !group.mute) ||
      takes.some((take) => take.solo && !take.mute);
  return [
    ...groups.flatMap((group) => {
      const inner = group.tracks.some((track) => track.solo && !track.mute);
      return group.tracks.map((track) => ({
        ...track,
        groupId: group.id,
        gain: track.gain * group.gain,
        start: (track.start || 0) + group.start,
        mute: track.mute || group.mute || (inner && !track.solo) || (solo && !group.solo),
        solo: false,
      }));
    }),
    ...takes.map((take) => ({
      ...take,
      start: (take.start || 0) + (take.offsetMs || 0) / 1000,
      mute: take.mute || (solo && !take.solo),
      solo: false,
    })),
  ];
}
module.exports = { addGroup, validateGroups, creationTracks };
