import type { Project, SourceGroup, Take, Track } from '../shared/types';
export function creationGroups(project: Project): SourceGroup[] {
  if (project.kind !== 'creation') return [];
  const legacy = project.sessionSource
    ? [
        {
          id: 'source',
          name: project.sessionSource.title,
          sourceTitle: project.sessionSource.title,
          tracks: project.tracks.length
            ? project.tracks
            : [
                project.originalMix || {
                  id: 'original',
                  name: '原曲',
                  file: project.playback || project.original,
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
          ...project.sourceMix,
        },
      ]
    : [];
  return [...legacy, ...(project.sourceGroups || [])];
}
export function groupTracks(group: SourceGroup): Track[] {
  const listening = group.tracks.some((track) => track.solo && !track.mute);
  return group.tracks.map((track) => ({
    ...track,
    groupId: group.id,
    gain: track.gain * group.gain,
    start: (track.start || 0) + group.start,
    mute: track.mute || (listening && !track.solo),
    solo: false,
  }));
}
export function takeStart(take: Take) {
  return (take.start || 0) + (take.offsetMs || 0) / 1000;
}
export function groupWaveRegion(group: SourceGroup, durations: Map<string, number>) {
  const start = Math.min(0, ...group.tracks.map((track) => track.start || 0));
  const end = Math.max(
    0.01,
    ...group.tracks.map((track) => (track.start || 0) + (durations.get(track.id) || 0)),
  );
  return { origin: group.start + start, duration: Math.max(0.01, end - start) };
}
export function activeTakes(project: Project) {
  return (project.takes || []).filter(
    (take) => project.kind === 'creation' || (project.selectedTakeIds || []).includes(take.id),
  );
}
export function backingTracks(project: Project): Track[] {
  const base =
    project.kind === 'creation' && !project.sessionSource
      ? []
      : project.tracks.length
        ? project.tracks
        : [
            project.originalMix || {
              id: 'original',
              name: '原曲',
              file: project.playback || project.original,
              gain: 1,
              pan: 0,
              mute: false,
              solo: false,
            },
          ];
  return base;
}
export function sourceTracks(project: Project): Track[] {
  if (project.kind === 'creation') {
    const groups = creationGroups(project),
      takes = activeTakes(project),
      solo =
        groups.some((group) => group.solo && !group.mute) ||
        takes.some((take) => take.solo && !take.mute);
    return [
      ...groups.flatMap((group) =>
        groupTracks(group).map((track) => ({
          ...track,
          mute: track.mute || group.mute || (solo && !group.solo),
        })),
      ),
      ...takes.map((take) => ({
        ...take,
        start: takeStart(take),
        mute: take.mute || (solo && !take.solo),
        solo: false,
      })),
    ];
  }
  return [
    ...backingTracks(project),
    ...activeTakes(project).map((take) => ({ ...take, start: takeStart(take) })),
  ];
}
export function playbackTracks(project: Project, capturing = false): Track[] {
  const takes = activeTakes(project),
    takeIds = new Set(takes.map((take) => take.id));
  const reviewMixed =
    project.kind === 'practice' &&
    project.practiceMode === 'mixed' &&
    !capturing &&
    takes.length > 0;
  return sourceTracks(project).map((track) => ({
    ...track,
    mute:
      track.mute ||
      (project.kind === 'practice' && capturing && takeIds.has(track.id)) ||
      (reviewMixed && !takeIds.has(track.id)),
  }));
}
export function sessionDuration(project: Project, baseDuration: number) {
  return Math.max(
    baseDuration,
    ...activeTakes(project).map((take) => takeStart(take) + take.duration),
  );
}
