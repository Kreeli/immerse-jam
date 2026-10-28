import type { Track } from '../shared/types';
export function toggleTrackState(tracks: Track[], id: string, action: 'listen' | 'close'): Track[] {
  return tracks.map((track) =>
    track.id !== id
      ? track
      : action === 'listen'
        ? { ...track, solo: !track.solo, mute: false }
        : { ...track, mute: !track.mute, solo: false },
  );
}
