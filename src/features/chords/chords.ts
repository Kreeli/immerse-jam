import type { Analysis, ChordRow } from '../../shared/types';

export interface ChordBar {
  id: string;
  number: number;
  start: number;
  end: number;
  segments: { index: number; start: number; end: number; label: string; confidence: number }[];
}

export function buildChordBars(analysis: Analysis, duration: number): ChordBar[] {
  if (!(duration > 0)) return [];
  const meter = analysis.beatsPerBar || 4,
    interval = 60 / (analysis.bpm > 0 ? analysis.bpm : 120);
  let beats = analysis.beats
    .filter((t) => Number.isFinite(t) && t >= 0 && t < duration)
    .sort((a, b) => a - b);
  beats = beats.filter((t, i) => i === 0 || t - beats[i - 1] > 0.02);
  if (beats.length < 2)
    beats = Array.from({ length: Math.ceil(duration / interval) }, (_, i) => i * interval);
  const downbeat = analysis.downbeat ?? beats[0] ?? 0;
  let phase = 0;
  beats.forEach((t, i) => {
    if (Math.abs(t - downbeat) < Math.abs(beats[phase] - downbeat)) phase = i;
  });
  phase %= meter;
  const downbeats = beats.filter((_, i) => i % meter === phase);
  // Keep a short pickup with the first measure rather than shifting every
  // four-measure row by an extra, partial cell.
  if (downbeats[0] < interval * meter) downbeats.shift();
  const starts = [0, ...downbeats].filter((t, i, list) => i === 0 || t - list[i - 1] > 0.05);
  if (starts.length > 1 && duration - starts.at(-1)! < 0.05) starts.pop();
  const boundaries = [...starts, duration];
  return starts.map((start, i) => {
    const end = boundaries[i + 1];
    const segments = analysis.chords.flatMap((chord, index) =>
      chord.end > start + 0.001 && chord.start < end - 0.001
        ? [{ ...chord, index, start: Math.max(start, chord.start), end: Math.min(end, chord.end) }]
        : [],
    );
    return { id: `bar-${i}`, number: i + 1, start, end, segments };
  });
}

export function arrangeRows(ids: string[], size = 4, stored?: ChordRow[]): ChordRow[] {
  const available = new Set(ids),
    seen = new Set<string>();
  const rows = (stored || []).map((row) => ({
    ...row,
    bars: row.bars.filter((id) => {
      if (!available.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));
  const remaining = ids.filter((id) => !seen.has(id));
  for (let i = 0; i < remaining.length; i += size)
    rows.push({ id: `auto-${i}-${remaining[i]}`, name: '', bars: remaining.slice(i, i + size) });
  return rows;
}

export function moveBar(
  rows: ChordRow[],
  barId: string,
  targetRow: string,
  beforeId?: string,
): ChordRow[] {
  if (
    !rows.some((row) => row.bars.includes(barId)) ||
    !rows.some((row) => row.id === targetRow) ||
    beforeId === barId
  )
    return rows;
  return rows.map((row) => {
    const bars = row.bars.filter((id) => id !== barId);
    if (row.id === targetRow) {
      const index = beforeId ? bars.indexOf(beforeId) : -1;
      bars.splice(index < 0 ? bars.length : index, 0, barId);
    }
    return { ...row, bars };
  });
}
