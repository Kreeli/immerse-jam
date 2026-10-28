import { useEffect, useRef } from 'react';
import type { Player } from '../../audio/Player';
import { t as tr } from '../../i18n';
export default function TrackMeter({
  player,
  id,
  label,
}: {
  player: Player;
  id: string;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    fill = useRef<HTMLSpanElement>(null),
    text = useRef<HTMLElement>(null);
  useEffect(() => {
    let frame = 0,
      last = 0,
      display = -60;
    const tick = (now: number) => {
      if (now - last >= 40) {
        const elapsed = (now - last) / 1000;
        last = now;
        const level = player.trackLevel(id),
          db = level.rms > 1e-7 ? Math.max(-60, 20 * Math.log10(level.rms)) : -60;
        display = !player.playing ? -60 : Math.max(db, display - Math.min(0.2, elapsed) * 60);
        const value = Math.max(0, Math.min(1, (display + 60) / 60));
        if (fill.current) {
          fill.current.style.transform = `scaleX(${value})`;
          fill.current.style.background =
            level.peak >= 0.98 ? '#ec7e8d' : display > -6 ? '#d7b27b' : '#91b8a9';
        }
        if (host.current) {
          host.current.setAttribute('aria-valuenow', display.toFixed(1));
          host.current.dataset.level = String(level.rms);
        }
        if (text.current)
          text.current.textContent = display <= -59.9 ? '—' : `${Math.round(display)} dB`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [player, id]);
  return (
    <div className="track-meter-wrap">
      <div
        ref={host}
        className="track-meter"
        role="meter"
        aria-label={tr('{0}当前声音大小', [label])}
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={-60}
        title={tr('当前音轨的实际声音大小')}
      >
        <span ref={fill} />
      </div>
      <small ref={text}>—</small>
    </div>
  );
}
