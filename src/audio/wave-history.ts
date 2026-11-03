import type { Project, Track } from '../shared/types';

// Labels and playback position do not change audio. Imported media revisions,
// files, timing and the actual rendered mix do; keep those in the identity.
export function waveHistoryKey(
  project: Project,
  tracks: Track[],
  source: string,
  origin: number,
  duration: number,
  master: number,
) {
  return JSON.stringify([
    project.id,
    project.importRevision || project.createdAt,
    source,
    origin,
    duration,
    master,
    tracks.map((t) => [t.id, t.file, t.start || 0, t.gain, t.pan, !!t.mute, !!t.solo]),
  ]);
}
export class WaveHistory {
  private values = new Map<string, number[]>();
  private points = 0;
  private readonly maxPoints: number;
  private readonly maxEntries: number;
  constructor(maxPoints = 1000000, maxEntries = 16) {
    this.maxPoints = maxPoints;
    this.maxEntries = maxEntries;
  }
  get(key: string) {
    const found = this.values.get(key);
    if (found) {
      this.values.delete(key);
      this.values.set(key, found);
    }
    return found || null;
  }
  set(key: string, values: number[]) {
    if (!values.length || values.length > this.maxPoints) return;
    const previous = this.values.get(key);
    if (previous) this.points -= previous.length;
    this.values.delete(key);
    this.values.set(key, values);
    this.points += values.length;
    while (this.points > this.maxPoints || this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value!;
      this.points -= this.values.get(oldest)!.length;
      this.values.delete(oldest);
    }
  }
  clear() {
    this.values.clear();
    this.points = 0;
  }
}
