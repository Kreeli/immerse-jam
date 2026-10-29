import { useEffect, useMemo, useRef, useState } from 'react';
import { fixedEnvelope } from '../../audio/envelope';
import { t as tr } from '../../i18n';
import { time } from '../../shared/types';
import { themeColor } from '../../styles/palette';
export default function Waveform({
  peaks,
  position,
  duration,
  windowSeconds,
  a,
  b,
  source,
  onSeek,
  onScrubStart,
  onScrubEnd,
  peakOrigin = 0,
  peakDuration = duration,
  amplitudeScale,
  label,
  disabled = false,
  preserveBins = false,
}: {
  peaks: number[];
  position: number;
  duration: number;
  windowSeconds: number;
  a: number | null;
  b: number | null;
  source: string;
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  peakOrigin?: number;
  peakDuration?: number;
  amplitudeScale?: number;
  label?: string;
  disabled?: boolean;
  preserveBins?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
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
      attributeFilter: ['data-theme', 'data-accent', 'lang'],
    });
    return () => observer.disconnect();
  }, []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = useMemo(() => {
    if (amplitudeScale !== undefined) {
      let max = 0;
      for (const value of peaks) if (Number.isFinite(value)) max = Math.max(max, Math.abs(value));
      return { normal: amplitudeScale, max };
    }
    const sorted = peaks
      .filter(Number.isFinite)
      .map(Math.abs)
      .sort((a, b) => a - b);
    return {
      normal: amplitudeScale ?? Math.max(0.01, sorted[Math.floor(sorted.length * 0.98)] || 0),
      max: sorted.at(-1) || 0,
    };
  }, [peaks, amplitudeScale]);
  const envelope = useMemo(
    () =>
      preserveBins
        ? { values: peaks, step: peakDuration / Math.max(1, peaks.length) }
        : fixedEnvelope(peaks, peakDuration, windowSeconds, size.width),
    [peaks, peakDuration, windowSeconds, size.width, preserveBins],
  );
  const start = position - windowSeconds / 2,
    end = position + windowSeconds / 2;
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !size.width || !size.height) return;
    const ratio = devicePixelRatio || 1,
      { width, height } = size;
    if (
      element.width !== Math.round(width * ratio) ||
      element.height !== Math.round(height * ratio)
    ) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }
    const ctx = element.getContext('2d')!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const center = height / 2 - 8,
      available = Math.max(50, height - 90),
      xAt = (seconds: number) => ((seconds - start) / windowSeconds) * width;
    ctx.fillStyle = themeColor('#ffffff02');
    if (start < 0) ctx.fillRect(0, 0, xAt(0), height - 27);
    if (end > duration) ctx.fillRect(xAt(duration), 0, width - xAt(duration), height - 27);
    ctx.strokeStyle = themeColor('#302b36');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(width, center);
    ctx.stroke();
    const tick = windowSeconds <= 10 ? 1 : windowSeconds <= 30 ? 2 : 5;
    ctx.font = '14px "Segoe UI",sans-serif';
    for (
      let seconds = Math.max(0, Math.ceil(start / tick) * tick);
      seconds <= Math.min(duration, end);
      seconds += tick
    ) {
      const x = xAt(seconds);
      ctx.fillStyle = themeColor('#7a6d84');
      ctx.fillText(time(seconds), Math.min(x + 4, width - 35), height - 9);
      ctx.fillStyle = themeColor('#51425d');
      ctx.fillRect(x, height - 27, 1, 5);
    }
    if (a !== null && b !== null && b > a) {
      ctx.fillStyle = themeColor('#e9688617');
      ctx.fillRect(xAt(a), 20, xAt(b) - xAt(a), height - 50);
    }
    const values = envelope.values,
      step = envelope.step,
      first = Math.max(
        0,
        Math.ceil(-peakOrigin / Math.max(step, 0.001) - 0.5),
        Math.floor((start - peakOrigin) / Math.max(step, 0.001)) - 1,
      ),
      last = Math.min(
        values.length - 1,
        Math.floor((duration - peakOrigin) / Math.max(step, 0.001) - 0.5),
        Math.ceil((end - peakOrigin) / Math.max(step, 0.001)) + 1,
      );
    if (values.length && last >= first) {
      ctx.beginPath();
      for (let i = first; i <= last; i++) {
        const x = xAt(peakOrigin + (i + 0.5) * step),
          h = (Math.min(1, values[i] / scale.normal) * available) / 2;
        if (i === first) ctx.moveTo(x, center - h);
        else ctx.lineTo(x, center - h);
      }
      for (let i = last; i >= first; i--) {
        const x = xAt(peakOrigin + (i + 0.5) * step),
          h = (Math.min(1, values[i] / scale.normal) * available) / 2;
        ctx.lineTo(x, center + h);
      }
      ctx.closePath();
      ctx.fillStyle = themeColor('#aa92b8');
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = themeColor('#f48da8');
    ctx.fillRect(width / 2 - 1, 15, 2, height - 46);
    for (const [value, label] of [
      [a, tr('开始')],
      [b, tr('结束')],
    ] as const)
      if (value !== null && value >= start && value <= end) {
        const x = xAt(value);
        ctx.fillStyle = themeColor('#ed96af');
        ctx.fillRect(x, 15, 1, height - 46);
        ctx.fillText(label, Math.min(width - 15, x + 5), 13);
      }
  }, [
    peaks,
    position,
    duration,
    windowSeconds,
    a,
    b,
    size,
    scale,
    start,
    end,
    envelope,
    themeRevision,
    peakOrigin,
  ]);
  const bounded = (value: number) => Math.max(0, Math.min(duration, value));
  const finish = () => {
    if (drag.current) {
      drag.current = null;
      onScrubEnd();
    }
  };
  return (
    <div className="wave-canvas-host">
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
        tabIndex={0}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, position, moved: false };
          onScrubStart();
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state) return;
          const distance = event.clientX - state.x;
          if (Math.abs(distance) > 3) state.moved = true;
          if (state.moved)
            onSeek(
              bounded(
                state.position - (distance / event.currentTarget.clientWidth) * windowSeconds,
              ),
            );
        }}
        onPointerUp={(event) => {
          const state = drag.current;
          if (state && !state.moved) {
            const rect = event.currentTarget.getBoundingClientRect();
            onSeek(
              bounded(
                state.position -
                  windowSeconds / 2 +
                  ((event.clientX - rect.left) / rect.width) * windowSeconds,
              ),
            );
          }
          finish();
        }}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
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
