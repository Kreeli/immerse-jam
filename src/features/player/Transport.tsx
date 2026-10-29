import { Gauge, LoaderCircle, Pause, Play, Radio } from 'lucide-react';
import type { ReactNode } from 'react';
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
  return (
    <footer className="transport">
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
          className="play-main"
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
          step=".01"
          value={position}
          disabled={recording}
          onChange={(event) => player.seek(+event.target.value)}
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
