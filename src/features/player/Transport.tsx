import { Gauge, LoaderCircle, Pause, Play, Radio } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isAndroid } from '../../platform/environment';
import type { Player } from '../../audio/Player';
import { t as tr } from '../../i18n';
import { time, type Practice, type Project } from '../../shared/types';
interface Props {
  project: Project;
  player: Player;
  recording: boolean;
  loading: boolean;
  playing: boolean;
  position: number;
  countInRemaining: number;
  onTogglePlay: () => void;
  onPractice: (patch: Partial<Practice>) => void;
  browsing?: boolean;
  onReturn?: () => void;
  recorder: ReactNode;
}
export default function Transport({
  project,
  player,
  recording,
  loading,
  playing,
  position,
  countInRemaining,
  onTogglePlay,
  onPractice,
  browsing,
  onReturn,
  recorder,
}: Props) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const scrub = useRef<boolean>(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [visualPosition, setVisualPosition] = useState(position);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      setStarting(player.starting);
      if (player.playing || player.scrubbing || player.starting)
        setVisualPosition(player.displayPosition());
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [player]);
  useEffect(() => {
    if (!player.playing && !player.scrubbing) setVisualPosition(position);
  }, [position, player]);
  const finishSeek = () => {
    if (!scrub.current) return;
    scrub.current = false;
    player.endScrub();
    setScrubPosition(null);
  };
  const startSeek = (e: React.PointerEvent<HTMLInputElement>) => {
    scrub.current = true;
    player.beginScrub();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const changeSeek = (value: number) => {
    setScrubPosition(value);
    player.seek(value);
  };
  if (isAndroid)
    return (
      <footer className="mobile-transport nr-m-dock">
        <div className="mobile-seek-row">
          <span>{time(scrubPosition ?? visualPosition)}</span>
          <input
            className="seek nr-range"
            style={
              {
                '--p':
                  ((scrubPosition ?? visualPosition) / Math.max(project.duration, position, 0.01)) *
                    100 +
                  '%',
              } as React.CSSProperties
            }
            aria-label={tr('播放进度')}
            type="range"
            min="0"
            max={Math.max(project.duration, position, 0.01)}
            step=".01"
            value={scrubPosition ?? visualPosition}
            disabled={recording}
            onPointerDown={startSeek}
            onChange={(e) => changeSeek(+e.target.value)}
            onPointerUp={finishSeek}
            onPointerCancel={finishSeek}
            onLostPointerCapture={finishSeek}
            onKeyUp={() => setScrubPosition(null)}
            onBlur={() => {
              finishSeek();
              setScrubPosition(null);
            }}
          />
          <span>{time(Math.max(project.duration, position))}</span>
        </div>
        <div className="mobile-transport-controls nr-m-dock-row">
          <div className="mobile-primary-controls">
            <button
              className="play-main nr-play"
              aria-label={playing || starting ? tr('暂停') : tr('播放')}
              disabled={loading || recording || !project.duration}
              onClick={onTogglePlay}
            >
              {loading || starting ? (
                <LoaderCircle size={22} className="spin" />
              ) : playing ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" />
              )}
            </button>
            {recorder}
          </div>
          <div className="mobile-speed-control">
            <button
              className="mobile-speed-button nr-speed-chip"
              aria-label={tr('调整倍速')}
              aria-expanded={speedOpen}
              disabled={recording}
              onClick={() => setSpeedOpen(!speedOpen)}
            >
              {project.practice.tempo.toFixed(2)}×
            </button>
            {speedOpen && (
              <div className="mobile-speed-popover">
                <div className="mobile-speed-slider">
                  <output className="mobile-speed-value" aria-live="off">
                    {project.practice.tempo.toFixed(2)}×
                  </output>
                  <input
                    aria-label={tr('播放速度')}
                    type="range"
                    min=".25"
                    max="2"
                    step=".01"
                    value={project.practice.tempo}
                    onChange={(e) => onPractice({ tempo: +e.target.value })}
                  />
                </div>
                <button className="small" onClick={() => onPractice({ tempo: 1 })}>
                  {tr('重置')}
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>
    );
  return (
    <footer className="transport nr-transport">
      <div className="transport-top">
        {browsing ? (
          <button className="transport-project" onClick={onReturn} title={tr('返回播放')}>
            <strong>{project.title}</strong>
            <span>{tr('返回播放界面')} →</span>
          </button>
        ) : (
          <span className="transport-context">
            {project.kind === 'creation'
              ? tr('创作模式')
              : project.kind === 'practice'
                ? tr('跟练模式')
                : project.title}
          </span>
        )}
        <div className="transport-spacer" />
        <label className="tempo">
          <Gauge size={16} />
          <input
            aria-label={tr('播放速度')}
            type="range"
            min=".25"
            max="2"
            step=".01"
            value={project.practice.tempo}
            disabled={recording}
            onChange={(event) => onPractice({ tempo: +event.target.value })}
          />
          <button disabled={recording} onClick={() => onPractice({ tempo: 1 })}>
            {project.practice.tempo.toFixed(2)}×
          </button>
        </label>
      </div>
      <div className="transport-bottom">
        <button
          className="play-main nr-play"
          aria-label={playing ? tr('暂停') : tr('播放')}
          disabled={loading || recording || !project.duration}
          onClick={onTogglePlay}
        >
          {loading ? (
            <LoaderCircle className="spin" size={23} />
          ) : playing ? (
            <Pause size={23} fill="currentColor" />
          ) : (
            <Play size={23} fill="currentColor" />
          )}
        </button>
        {recorder}
        <span className="time-now">{time(scrubPosition ?? visualPosition)}</span>
        {countInRemaining > 0 && (
          <span className="count-in-badge">
            {tr('预备拍')}
            {countInRemaining}
          </span>
        )}
        <input
          className="seek nr-range"
          style={
            {
              '--p':
                ((scrubPosition ?? visualPosition) / Math.max(project.duration, position, 0.01)) *
                  100 +
                '%',
            } as React.CSSProperties
          }
          aria-label={tr('播放进度')}
          type="range"
          min="0"
          max={Math.max(project.duration, position, 0.01)}
          step=".01"
          value={scrubPosition ?? visualPosition}
          disabled={recording}
          onPointerDown={startSeek}
          onChange={(e) => changeSeek(+e.target.value)}
          onPointerUp={finishSeek}
          onPointerCancel={finishSeek}
          onLostPointerCapture={finishSeek}
          onKeyUp={() => setScrubPosition(null)}
          onBlur={() => {
            finishSeek();
            setScrubPosition(null);
          }}
        />
        <span className="time-total">{time(project.duration)}</span>
        <button
          className="icon-button"
          disabled={recording}
          title={tr('按住试听，松开返回')}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            (event.currentTarget as any)._start = position;
            void player.play();
          }}
          onPointerUp={(event) => {
            player.pause();
            player.seek((event.currentTarget as any)._start || 0);
          }}
        >
          <Radio size={20} />
        </button>
      </div>
    </footer>
  );
}
