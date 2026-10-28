import { Bookmark, Gauge, LoaderCircle, Pause, Play, Radio } from 'lucide-react';
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
  pendingRange: number | null;
  loop: boolean;
  countInRemaining: number;
  onCaptureRange: () => void;
  onAddPoint: () => void;
  onTogglePlay: () => void;
  onPractice: (patch: Partial<Practice>) => void;
  onStopLoop: () => void;
  onCancelRange: () => void;
}
export default function Transport({
  project,
  player,
  recording,
  loading,
  playing,
  position,
  pendingRange,
  loop,
  countInRemaining,
  onCaptureRange,
  onAddPoint,
  onTogglePlay,
  onPractice,
  onStopLoop,
  onCancelRange,
}: Props) {
  return (
    <footer className="transport">
      <div className="transport-top">
        <button
          className={'range-capture ' + (pendingRange !== null ? 'recording-range' : '')}
          onClick={onCaptureRange}
        >
          {pendingRange === null ? tr('设置循环段落开始') : tr('设置循环段落结束')}
        </button>
        {pendingRange !== null && (
          <>
            <small className="pending-range-time">
              {tr('开始于')}
              {time(pendingRange)}
            </small>
            <button className="text-button" onClick={onCancelRange}>
              {tr('取消选段')}
            </button>
          </>
        )}
        {loop && (
          <button className="text-button loop-stop" onClick={() => onStopLoop()}>
            {tr('停止循环')}
          </button>
        )}
        <button className="text-button" onClick={onAddPoint}>
          <Bookmark size={14} />
          {tr('添加标记点')}
        </button>
        <div className="transport-spacer" />
        <label className="tempo">
          <Gauge size={16} />
          <input
            aria-label={tr('播放速度')}
            type="range"
            min="0.25"
            max="2"
            step="0.01"
            value={project.practice.tempo}
            onChange={(e) => onPractice({ tempo: +e.target.value })}
          />
          <button onClick={() => onPractice({ tempo: 1 })}>
            {project.practice.tempo.toFixed(2)}×
          </button>
        </label>
      </div>
      <div className="transport-bottom">
        <button
          className="play-main"
          aria-label={playing ? tr('暂停') : tr('播放')}
          disabled={loading || (!project.duration && !recording)}
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
        <span className="time-now">{time(position)}</span>
        {countInRemaining > 0 && (
          <span className="count-in-badge">
            {tr('预备拍')}
            {countInRemaining}
          </span>
        )}
        <input
          className="seek"
          aria-label={tr('播放进度')}
          type="range"
          min="0"
          max={Math.max(project.duration, position, 0.01)}
          step="0.01"
          value={position}
          onChange={(e) => player.seek(+e.target.value)}
        />
        <span className="time-total">{time(project.duration)}</span>
        <button
          className="icon-button"
          title={tr('按住试听，松开返回')}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            (e.currentTarget as any)._start = position;
            void player.play();
          }}
          onPointerUp={(e) => {
            player.pause();
            player.seek((e.currentTarget as any)._start || 0);
          }}
        >
          <Radio size={20} />
        </button>
      </div>
    </footer>
  );
}
