import { time, type Bookmark } from '../../shared/types';

interface Marker {
  seconds: number;
  edge: 'point' | 'start' | 'end';
  label: string;
  width: number;
  lane: number;
  rangeEnd?: number;
  rangeStart: number;
}

// Labels stay attached to song coordinates, including their collision lanes.
// Scrolling therefore only translates them; it never reflows their text.
export function waveMarkers(
  ctx: CanvasRenderingContext2D,
  marks: readonly Bookmark[],
  width: number,
  windowSeconds: number,
) {
  const maxWidth = Math.min(164, Math.max(72, width * 0.38));
  const shorten = (title: string) => {
    const characters = Array.from(title.replace(/\s+/g, ' ').trim());
    if (characters.length > 18) return characters.slice(0, 18).join('') + '…';
    return characters.join('');
  };
  const fit = (label: string) => {
    if (ctx.measureText(label).width <= maxWidth) return label;
    const characters = Array.from(label.replace(/…$/, ''));
    while (characters.length && ctx.measureText(characters.join('') + '…').width > maxWidth)
      characters.pop();
    return characters.join('') + '…';
  };
  const markers: Marker[] = [];
  for (const mark of marks) {
    if (!Number.isFinite(mark.start) || mark.start < 0) continue;
    const range = Number.isFinite(mark.end) && mark.end! > mark.start;
    for (const edge of range ? (['start', 'end'] as const) : (['point'] as const)) {
      const seconds = edge === 'end' ? mark.end! : mark.start;
      const label = fit([time(seconds), shorten(mark.title)].filter(Boolean).join(' · '));
      markers.push({
        seconds,
        edge,
        label,
        width: ctx.measureText(label).width,
        lane: 0,
        rangeStart: mark.start,
        rangeEnd: range ? mark.end : undefined,
      });
    }
  }
  const leftAt = (marker: Marker) =>
    (marker.seconds * width) / windowSeconds + (marker.edge === 'end' ? -marker.width - 5 : 5);
  markers.sort((a, b) => leftAt(a) - leftAt(b));
  const occupied = [-Infinity, -Infinity, -Infinity];
  for (const marker of markers) {
    const left = leftAt(marker);
    let lane = occupied.findIndex((right) => right + 8 <= left);
    if (lane < 0) lane = occupied.indexOf(Math.min(...occupied));
    marker.lane = lane;
    occupied[lane] = left + marker.width;
  }
  return markers;
}

export function drawWaveMarkers(
  ctx: CanvasRenderingContext2D,
  markers: ReturnType<typeof waveMarkers>,
  start: number,
  windowSeconds: number,
  width: number,
  height: number,
  colors: { normal: string; active: string; background: string },
  a: number | null,
  b: number | null,
) {
  const bottom = height - 30;
  if (bottom < 15) return;
  ctx.lineWidth = 1;
  for (const marker of markers) {
    const x = ((marker.seconds - start) / windowSeconds) * width;
    const left = x + (marker.edge === 'end' ? -marker.width - 5 : 5);
    if (Math.max(x, left + marker.width) < 0 || Math.min(x, left) > width) continue;
    const selected =
      marker.rangeEnd !== undefined &&
      a !== null &&
      b !== null &&
      Math.abs(marker.rangeStart - a) < 0.001 &&
      Math.abs(marker.rangeEnd - b) < 0.001;
    const color = selected ? colors.active : colors.normal;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x, bottom);
    if (marker.edge !== 'point') {
      const hook = marker.edge === 'start' ? 6 : -6;
      ctx.moveTo(x + hook, 5);
      ctx.lineTo(x, 5);
      ctx.moveTo(x, bottom);
      ctx.lineTo(x + hook, bottom);
    }
    ctx.stroke();
    const top = 3 + marker.lane * 15;
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(left - 2, top, marker.width + 4, 15);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(marker.label, left, top + 11);
  }
}
