import type { Project } from '../shared/types';
export function beatGrid(project: Project, duration = project.duration) {
  const analysis = project.analysis,
    bpm = project.practice.countInBpm || analysis?.bpm || 120;
  const custom = project.practice.countInBpm && Math.abs(bpm - (analysis?.bpm || 0)) > 0.1;
  let beats = !custom
    ? (analysis?.beats || []).filter((t) => Number.isFinite(t) && t >= 0 && t <= duration)
    : [];
  if (beats.length < 2) {
    const interval = 60 / Math.max(20, Math.min(350, bpm)),
      anchor = analysis?.downbeat || 0;
    beats = [];
    for (
      let t = anchor - Math.ceil(anchor / interval) * interval;
      t <= duration + interval;
      t += interval
    )
      if (t >= -1e-5) beats.push(Math.max(0, t));
  }
  beats = [...new Set(beats)].sort((a, b) => a - b);
  const last = beats.at(-1) || 0,
    step = localInterval(beats, last, 60 / bpm);
  for (let next = last + step; next < duration + step; next += step) beats.push(next);
  return beats;
}
export function nearestBeat(
  beats: number[],
  position: number,
  range?: { a: number; b: number } | null,
) {
  let best = position,
    distance = Infinity;
  for (const beat of beats) {
    if (range && (beat < range.a - 0.001 || beat >= range.b - 0.001)) continue;
    const delta = Math.abs(beat - position);
    if (delta < distance) {
      best = beat;
      distance = delta;
    }
    if (beat > position && delta > distance) break;
  }
  return best;
}
export function localInterval(beats: number[], position: number, fallback = 0.5) {
  const index = beats.findIndex((t) => t >= position - 0.001),
    intervals: number[] = [];
  for (let i = Math.max(1, index - 3); i < Math.min(beats.length, index + 4); i++) {
    const delta = beats[i] - beats[i - 1];
    if (delta > 60 / 350 && delta < 3) intervals.push(delta);
  }
  intervals.sort((a, b) => a - b);
  return intervals.length ? intervals[Math.floor(intervals.length / 2)] : fallback;
}
export function strongBeat(project: Project, beats: number[], index: number) {
  const time = beats[index],
    analysis = project.analysis;
  if (analysis?.downbeats?.length && !project.practice.countInBpm)
    return analysis.downbeats.some((t) => Math.abs(t - time) < 0.045);
  const anchor = analysis?.downbeat || 0;
  let origin = 0;
  beats.forEach((t, i) => {
    if (Math.abs(t - anchor) < Math.abs(beats[origin] - anchor)) origin = i;
  });
  return (
    (((index - origin) % (analysis?.beatsPerBar || 4)) + (analysis?.beatsPerBar || 4)) %
      (analysis?.beatsPerBar || 4) ===
    0
  );
}
