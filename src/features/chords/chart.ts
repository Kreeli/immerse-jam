import type { Analysis, ChartBar, ChordChart } from '../../shared/types';
export interface Timing {
  bpm: number;
  meter: number;
  firstDownbeat: number;
  timingSource: 'detected' | 'fixed';
}
export function timeline(duration: number, settings: Timing, detected: number[] = []): ChartBar[] {
  const { bpm, meter } = settings;
  if (!(bpm >= 20 && bpm <= 350) || ![2, 3, 4, 6].includes(meter))
    throw new Error('BPM 应为 20–350，每小节支持 2、3、4、6 拍');
  if (
    !Number.isFinite(settings.firstDownbeat) ||
    settings.firstDownbeat < 0 ||
    settings.firstDownbeat >= Math.max(duration, 0.01)
  )
    throw new Error('首拍位置应在音频范围内');
  const first = settings.firstDownbeat,
    interval = 60 / bpm,
    starts = [first];
  const beats = detected
    .filter((t) => Number.isFinite(t) && t >= 0 && t < duration)
    .sort((a, b) => a - b);
  if (settings.timingSource === 'detected' && beats.length > 1) {
    let index = 0;
    beats.forEach((time, i) => {
      if (Math.abs(time - first) < Math.abs(beats[index] - first)) index = i;
    });
    for (let i = index + meter; i < beats.length; i += meter)
      if (beats[i] > starts.at(-1)! + 0.05) starts.push(beats[i]);
  }
  if (starts.length === 1)
    for (let next = first + meter * interval; next < duration - 0.03; next += meter * interval)
      starts.push(next);
  else {
    const lastStep = starts.length > 1 ? starts.at(-1)! - starts.at(-2)! : meter * interval;
    for (let next = starts.at(-1)! + lastStep; next < duration - 0.03; next += lastStep)
      starts.push(next);
  }
  if (first > 0.03) starts.unshift(0);
  else starts[0] = 0;
  return starts
    .filter((time) => time < duration)
    .map((start, index) => ({
      id: `bar-${index}`,
      start,
      end: starts[index + 1] ?? duration,
      pickup: first > 0.03 && index === 0,
      splitAt: meter === 3 ? 1 / 3 : 0.5,
      slots: [],
    }));
}
function dominant(analysis: Analysis | undefined, start: number, end: number) {
  const duration = new Map<string, number>();
  for (const chord of analysis?.chords || []) {
    const overlap = Math.min(end, chord.end) - Math.max(start, chord.start);
    if (overlap > 0 && chord.label !== 'N')
      duration.set(chord.label, (duration.get(chord.label) || 0) + overlap);
  }
  return [...duration].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
export function createChart(
  analysis: Analysis | undefined,
  duration: number,
  blank = false,
  id = 'auto',
): ChordChart {
  const settings: Timing = {
    bpm: analysis?.bpm || 120,
    meter: analysis?.beatsPerBar || 4,
    firstDownbeat: Math.min(Math.max(0, analysis?.downbeat || 0), Math.max(0, duration - 0.01)),
    timingSource: analysis?.beats.length ? 'detected' : 'fixed',
  };
  const bars = timeline(duration, settings, analysis?.beats).map((bar) => {
    if (blank) return { ...bar, slots: [{ id: bar.id + '-slot-0', label: null }] };
    const middle = bar.start + (bar.end - bar.start) * (bar.splitAt ?? 0.5),
      a = dominant(analysis, bar.start, middle),
      b = dominant(analysis, middle, bar.end);
    return {
      ...bar,
      slots:
        a === b
          ? [{ id: bar.id + '-slot-0', label: a }]
          : [
              { id: bar.id + '-slot-0', label: a },
              { id: bar.id + '-slot-1', label: b },
            ],
    };
  });
  const bank = [
    ...new Set(
      (analysis?.chords || []).map((chord) => chord.label).filter((label) => label !== 'N'),
    ),
  ].slice(0, 12);
  return {
    id,
    name: blank ? '自制和弦谱' : '识别和弦谱',
    source: blank ? 'manual' : 'recognized',
    ...settings,
    barsPerRow: 4,
    bars,
    bank: [...new Set([...bank, 'C', 'Dm', 'Em', 'F', 'G', 'Am'])],
    sections: {},
    createdAt: new Date().toISOString(),
  };
}
export function placeChord(
  chart: ChordChart,
  targetBarId: string,
  targetSlotId: string | null,
  label: string,
  source?: {
    barId: string;
    slotId: string;
  },
): ChordChart {
  const next = structuredClone(chart),
    target = next.bars.find((bar) => bar.id === targetBarId);
  if (!target) return chart;
  let slot = target.slots.find((slot) => slot.id === targetSlotId);
  if (!slot) {
    if (target.slots.length >= 2) return chart;
    slot = { id: crypto.randomUUID(), label: null };
    target.slots.push(slot);
  }
  if (source) {
    const from = next.bars
      .find((bar) => bar.id === source.barId)
      ?.slots.find((slot) => slot.id === source.slotId);
    if (!from || (from.id === slot.id && source.barId === targetBarId)) return chart;
    const previous = slot.label;
    slot.label = from.label;
    from.label = previous;
  } else slot.label = label.trim().slice(0, 40) || null;
  return next;
}
export function updateSlot(
  chart: ChordChart,
  barId: string,
  slotId: string,
  remove = false,
): ChordChart {
  return {
    ...chart,
    bars: chart.bars.map((bar) =>
      bar.id === barId
        ? {
            ...bar,
            slots: remove
              ? bar.slots.filter((slot) => slot.id !== slotId)
              : bar.slots.map((slot) => (slot.id === slotId ? { ...slot, label: null } : slot)),
          }
        : bar,
    ),
  };
}
export function retimeChart(
  chart: ChordChart,
  settings: Timing,
  duration: number,
  beats: number[] = [],
): ChordChart {
  const old = chart.bars.filter((bar) => !bar.pickup),
    oldPickup = chart.bars.find((bar) => bar.pickup),
    grid = timeline(duration, settings, beats);
  let index = 0;
  const bars: ChartBar[] = grid.map((bar) => {
    const previous = bar.pickup ? oldPickup : old[index++];
    return {
      ...bar,
      id: previous?.id || crypto.randomUUID(),
      splitAt:
        previous?.slots.length === 2
          ? Math.min(
              settings.meter - 1,
              Math.max(1, Math.round((previous.splitAt ?? 0.5) * chart.meter)),
            ) / settings.meter
          : bar.splitAt,
      slots: previous?.slots || [{ id: crypto.randomUUID(), label: null }],
    };
  });
  for (const overflow of old.slice(index)) {
    const start = bars.at(-1)?.end || 0;
    bars.push({
      ...overflow,
      start,
      end: start + (settings.meter * 60) / settings.bpm,
      pickup: false,
    });
  }
  return { ...chart, ...settings, bars };
}
export function calibrateBar(chart: ChordChart, barId: string, time: number): ChordChart {
  const index = chart.bars.findIndex((bar) => bar.id === barId);
  if (index < 0 || !Number.isFinite(time) || time < 0) throw new Error('请选择要校准的小节');
  if (index > 0 && time <= chart.bars[index - 1].start + 0.05)
    throw new Error('当前播放位置必须在上一小节起点之后');
  const delta = time - chart.bars[index].start;
  const bars = chart.bars.map((bar, i) =>
    i >= index
      ? { ...bar, start: bar.start + delta, end: bar.end + delta }
      : i === index - 1
        ? { ...bar, end: time }
        : bar,
  );
  if (index === 0 && time > 0.03)
    bars.unshift({
      id: crypto.randomUUID(),
      start: 0,
      end: time,
      pickup: true,
      slots: [{ id: crypto.randomUUID(), label: null }],
    });
  return { ...chart, bars, firstDownbeat: bars.find((bar) => !bar.pickup)?.start || 0 };
}
export function slotTime(bar: ChartBar, index: number) {
  return (
    bar.start +
    (bar.end - bar.start) * (index === 1 && bar.slots.length === 2 ? (bar.splitAt ?? 0.5) : 0)
  );
}
export function activeBar(chart: ChordChart, time: number) {
  let lo = 0,
    hi = chart.bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1,
      bar = chart.bars[mid];
    if (time < bar.start) hi = mid - 1;
    else if (time >= bar.end) lo = mid + 1;
    else return bar;
  }
  return null;
}
