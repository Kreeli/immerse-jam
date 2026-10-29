import type { Project, Take, Track } from '../shared/types';
export function takeStart(take: Take) {
  return (take.start || 0) + (take.offsetMs || 0) / 1000;
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
