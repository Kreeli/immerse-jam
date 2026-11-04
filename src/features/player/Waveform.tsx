import type { Player } from '../../audio/Player';
import { useEffect, useMemo, useRef, useState } from 'react';
import { wavePainter } from './WavePainter';
import { drawWaveMarkers, waveMarkers } from './WaveMarkers';
import { fixedEnvelope } from '../../audio/envelope';
import { t as tr } from '../../i18n';
import { time, type Bookmark } from '../../shared/types';
import { themeColor } from '../../styles/palette';
const noMarks: Bookmark[] = [];
export default function Waveform({
  peaks,
  player,
  position,
  duration,
  windowSeconds,
  a = null,
  b = null,
  marks = noMarks,
  source,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onWindow,
  active = true,
  peakOrigin = 0,
  peakDuration = duration,
  amplitudeScale,
  label,
  disabled = false,
  preserveBins = false,
}: {
  peaks: number[];
  player?: Player;
  position: number;
  duration: number;
  windowSeconds: number;
  a?: number | null;
  b?: number | null;
  marks?: Bookmark[];
  source: string;
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onWindow?: (seconds: number) => void;
  active?: boolean;
  peakOrigin?: number;
  peakDuration?: number;
  amplitudeScale?: number;
  label?: string;
  disabled?: boolean;
  preserveBins?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    waveCanvas = useRef<HTMLCanvasElement>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<{ distance: number; window: number } | null>(null),
    drag = useRef<{
      x: number;
      position: number;
      moved: boolean;
    } | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((value) => value + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent', 'data-wave-color', 'lang'],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = waveCanvas.current;
    if (!element) return;
    const lost = (event: Event) => event.preventDefault();
    const restored = () => setThemeRevision((value) => value + 1);
    element.addEventListener('webglcontextlost', lost);
    element.addEventListener('webglcontextrestored', restored);
    return () => {
      element.removeEventListener('webglcontextlost', lost);
      element.removeEventListener('webglcontextrestored', restored);
    };
  }, []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = useMemo(() => {
    if (amplitudeScale !== undefined) {
      let max = 0;
      for (const value of peaks) if (Number.isFinite(value)) max = Math.max(max, Math.abs(value));
      return { normal: amplitudeScale, max };
    }
    let max = 0;
    for (const value of peaks) if (Number.isFinite(value)) max = Math.max(max, Math.abs(value));
    return {
      // Keep the true peak envelope, with headroom so loud passages do not
      // look pinned to the top/bottom edge. This changes display only.
      normal: Math.max(0.01, max * 1.45),
      max,
    };
  }, [peaks, amplitudeScale]);
  // Keep bin boundaries attached to the song, independent of the viewport's
  // position. Limit detail to one peak per CSS pixel to avoid edge shimmer.
  const stride = preserveBins
    ? 1
    : Math.max(
        1,
        Math.ceil(
          (peaks.length * windowSeconds) / Math.max(peakDuration, 0.001) / Math.max(1, size.width),
        ),
      );
  const envelope = useMemo(
    () =>
      preserveBins
        ? { values: peaks, step: peakDuration / Math.max(1, peaks.length) }
        : fixedEnvelope(
            peaks,
            peakDuration,
            (stride * peakDuration) / Math.max(1, peaks.length),
            1,
          ),
    [peaks, peakDuration, stride, preserveBins],
  );
  const start = position - windowSeconds / 2,
    end = position + windowSeconds / 2;
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth,
        height = element.clientHeight;
      // Retain the GPU envelope while this view is hidden.
      if (width && height)
        setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const latest = useRef({ position, duration, a, b, marks, active, windowSeconds });
  latest.current = { position, duration, a, b, marks, active, windowSeconds };
  useEffect(() => {
    const element = canvas.current;
    if (!element || !waveCanvas.current || !size.width || !size.height) return;
    const ratio = Math.min(window.ImmerseNative ? 2 : Infinity, devicePixelRatio || 1);
    const { width, height } = size;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    const ctx = element.getContext('2d')!;
    waveCanvas.current.width = element.width;
    waveCanvas.current.height = element.height;
    const colors = Object.fromEntries(
      [
        '#aa92b8',
        '#ffffff02',
        '#302b36',
        '#e9688617',
        '#7a6d84',
        '#51425d',
        '#f48da8',
        '#ed96af',
        '#111114',
      ].map((c) => [c, themeColor(c)]),
    );
    colors['#aa92b8'] =
      getComputedStyle(document.documentElement).getPropertyValue('--waveform-fill').trim() ||
      colors['#aa92b8'];
    const painter = wavePainter(
      waveCanvas.current,
      envelope.values,
      Math.max(envelope.step, 0.000001),
      peakOrigin,
      scale.normal,
      colors['#aa92b8'],
      width,
      height,
    );
    const center = (height - 30) / 2;
    let displayedWindow = latest.current.windowSeconds,
      zoomFrame = performance.now();
    let last = '',
      frame = 0;
    let previousMarks: Bookmark[] | undefined,
      markerWindow = 0,
      markers: ReturnType<typeof waveMarkers> = [],
      markerRevision = 0;
    const paint = () => {
      const state = latest.current;
      const now = performance.now(),
        elapsed = Math.min(100, now - zoomFrame);
      zoomFrame = now;
      // Smooth physical wheel steps in the painter; keep React/audio scheduling
      // at the input event rate. There are no preset zoom levels.
      displayedWindow += (state.windowSeconds - displayedWindow) * (1 - Math.exp(-elapsed / 65));
      if (Math.abs(state.windowSeconds - displayedWindow) < 0.001)
        displayedWindow = state.windowSeconds;
      const windowSeconds = displayedWindow;
      if (state.marks !== previousMarks || markerWindow !== windowSeconds) {
        ctx.font = '12px "Segoe UI",sans-serif';
        markers = waveMarkers(ctx, state.marks, width, windowSeconds);
        previousMarks = state.marks;
        markerWindow = windowSeconds;
        markerRevision++;
      }
      const at = player ? player.displayPosition() : state.position;
      const stamp = `${at}|${state.a}|${state.b}|${state.duration}|${windowSeconds}|${markerRevision}`;
      if (state.active && stamp !== last) {
        last = stamp;
        const start = at - windowSeconds / 2,
          end = at + windowSeconds / 2;
        const xAt = (seconds: number) => ((seconds - start) / windowSeconds) * width;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = colors['#ffffff02'];
        if (start < 0) ctx.fillRect(0, 0, xAt(0), height - 27);
        if (end > state.duration)
          ctx.fillRect(xAt(state.duration), 0, width - xAt(state.duration), height - 27);
        ctx.strokeStyle = colors['#302b36'];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, center);
        ctx.lineTo(width, center);
        ctx.stroke();
        if (state.a !== null && state.b !== null && state.b > state.a) {
          ctx.fillStyle = colors['#e9688617'];
          ctx.fillRect(xAt(state.a), 0, xAt(state.b) - xAt(state.a), height - 27);
        }
        painter.draw(start, windowSeconds);
        ctx.font = '12px "Segoe UI",sans-serif';
        const textWidth = ctx.measureText(time(state.duration)).width;
        const tick =
          [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find(
            (value) => (value * width) / windowSeconds >= textWidth + 12,
          ) || 120;
        // Draw partly visible labels beyond both edges. Canvas performs the
        // clipping, so characters enter and leave one by one with the waveform.
        const labelSeconds = ((textWidth + 8) * windowSeconds) / width;
        for (
          let seconds = Math.max(0, Math.floor((start - labelSeconds) / tick) * tick);
          seconds <= Math.min(state.duration, end);
          seconds += tick
        ) {
          const x = xAt(seconds);
          ctx.fillStyle = colors['#7a6d84'];
          ctx.fillText(time(seconds), x + 4, height - 9);
          ctx.fillStyle = colors['#51425d'];
          ctx.fillRect(x, height - 27, 1, 5);
        }
        ctx.fillStyle = colors['#f48da8'];
        ctx.fillRect(width / 2 - 1, 8, 2, height - 38);
        drawWaveMarkers(
          ctx,
          markers,
          start,
          windowSeconds,
          width,
          height,
          { normal: colors['#ed96af'], active: colors['#f48da8'], background: colors['#111114'] },
          state.a,
          state.b,
        );
        for (const [value, label] of [
          [state.a, tr('开始')],
          [state.b, tr('结束')],
        ] as const)
          if (
            value !== null &&
            value >= start &&
            value <= end &&
            !markers.some((marker) => Math.abs(marker.seconds - value) < 0.001)
          ) {
            const x = xAt(value);
            ctx.fillStyle = colors['#ed96af'];
            ctx.fillRect(x, 8, 1, height - 38);
            ctx.fillText(label, x + 5, 12);
          }
      }
      frame = requestAnimationFrame(paint);
    };
    paint();
    return () => {
      cancelAnimationFrame(frame);
      painter.dispose();
    };
  }, [size, scale, envelope, peakOrigin, themeRevision, player]);
  const bounded = (value: number) => Math.max(0, Math.min(duration, value));
  const zoom = (seconds: number) => onWindow?.(Math.max(2, Math.min(600, seconds)));
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let target = windowSeconds;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || disabled || !onWindow) return;
      event.preventDefault();
      event.stopPropagation();
      const pixels =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      target = Math.max(2, Math.min(600, target * Math.exp(pixels * 0.0015)));
      zoom(target);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [windowSeconds, disabled, onWindow]);
  const finish = (pointerId: number) => {
    pointers.current.delete(pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null;
        const remaining = [...pointers.current.values()][0];
        drag.current = remaining
          ? { x: remaining.x, position: player?.displayPosition() ?? position, moved: false }
          : null;
      }
      return;
    }
    const state = drag.current;
    drag.current = null;
    if (state?.moved) onScrubEnd();
  };
  return (
    <div className="wave-canvas-host">
      <canvas ref={waveCanvas} className="wave-paint" aria-hidden="true" />
      <canvas
        ref={canvas}
        className="waveform"
        role="slider"
        aria-label={label || tr('拖动波形时间窗口')}
        aria-disabled={disabled}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={position}
        aria-valuetext={time(position)}
        data-window-start={start}
        data-window-end={end}
        data-source={source}
        data-peak-max={scale.max}
        data-peak-count={peaks.length}
        data-marker-count={marks.length}
        tabIndex={0}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = {
              distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
              window: windowSeconds,
            };
            if (drag.current?.moved) onScrubEnd();
            drag.current = null;
          } else if (!pinch.current) {
            drag.current = {
              x: event.clientX,
              position: player?.displayPosition() ?? position,
              moved: false,
            };
          }
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pinch.current) {
            if (pointers.current.size === 2) {
              const [a, b] = [...pointers.current.values()];
              zoom(
                (pinch.current.window * pinch.current.distance) /
                  Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
              );
            }
            return;
          }
          const state = drag.current;
          if (!state) return;
          const distance = event.clientX - state.x;
          if (!state.moved && Math.abs(distance) > 5) {
            state.moved = true;
            onScrubStart();
          }
          if (state.moved)
            onSeek(
              bounded(
                state.position - (distance / event.currentTarget.clientWidth) * windowSeconds,
              ),
            );
        }}
        onPointerUp={(event) => finish(event.pointerId)}
        onPointerCancel={(event) => finish(event.pointerId)}
        onLostPointerCapture={(event) => finish(event.pointerId)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            onSeek(
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? duration
                  : bounded(position + (event.key === 'ArrowRight' ? 5 : -5)),
            );
          }
        }}
      />
    </div>
  );
}
