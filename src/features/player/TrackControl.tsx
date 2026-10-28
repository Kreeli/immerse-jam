import { useState } from 'react';
import type { Player } from '../../audio/Player';
import { t as tr, message as translateMessage } from '../../i18n';
import type { Track } from '../../shared/types';
import TrackMeter from './TrackMeter';
const trackNames = (): Record<string, string> => ({
  vocals: tr('人声'),
  drums: tr('鼓'),
  bass: tr('贝斯'),
  piano: tr('钢琴'),
  guitar: tr('吉他'),
  other: tr('其他'),
  lead: tr('主奏吉他'),
  rhythm: tr('节奏吉他'),
  lead_vocals: tr('主唱'),
  backing_vocals: tr('和声'),
  instrumental: tr('和声'),
});
export function trackLabel(track: Track | undefined) {
  return (
    track?.label ||
    trackNames()[track?.name || ''] ||
    translateMessage(track?.name || '') ||
    tr('音轨')
  );
}
export default function TrackControl({
  track: t,
  color,
  onChange,
  selected,
  onSelect,
  meterPlayer,
  onState,
}: {
  track: Track;
  color: string;
  onChange: (p: Partial<Track>) => void;
  selected: boolean;
  onSelect: () => void;
  meterPlayer: Player;
  onState: (action: 'listen' | 'close') => void;
}) {
  const [renaming, setRenaming] = useState(false),
    [name, setName] = useState('');
  return (
    <div
      className={
        'track-control ' + (t.mute ? 'muted-track ' : '') + (selected ? 'wave-selected' : '')
      }
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('input,button,form')) onSelect();
      }}
    >
      <div className="track-top">
        <button
          className="track-name"
          aria-label={tr('显示{0}波形', [trackLabel(t)])}
          onClick={onSelect}
          onDoubleClick={() => {
            setName(trackLabel(t));
            setRenaming(true);
          }}
          title={tr('单击显示波形，双击重命名')}
        >
          <i style={{ background: color }} />
          {trackLabel(t)}
        </button>
        <small>{Math.round(t.gain * 100)}%</small>
      </div>
      {renaming && (
        <form
          className="track-rename"
          onSubmit={(event) => {
            event.preventDefault();
            onChange({ label: name.trim().slice(0, 60) });
            setRenaming(false);
          }}
        >
          <input
            aria-label={tr('音轨名称')}
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button className="small" type="submit">
            {tr('保存')}
          </button>
          <button className="small" type="button" onClick={() => setRenaming(false)}>
            {tr('取消')}
          </button>
        </form>
      )}
      <TrackMeter player={meterPlayer} id={t.id} label={trackLabel(t)} />
      <div className="track-slider">
        <input
          aria-label={tr('{0}音量', [trackLabel(t)])}
          type="range"
          min="0"
          max="1.5"
          step=".01"
          value={t.gain}
          onChange={(e) => onChange({ gain: +e.target.value })}
        />
        <button
          className={'track-switch ' + (t.solo ? 'solo' : '')}
          aria-pressed={t.solo}
          title={tr('选听：可选择多轨，存在选听音轨时只播放这些音轨')}
          onClick={() => onState('listen')}
        >
          {tr('选听')}
        </button>
        <button
          className={'track-switch ' + (t.mute ? 'enabled' : '')}
          aria-pressed={t.mute}
          title={tr('关闭声音：可同时关闭多个音轨')}
          onClick={() => onState('close')}
        >
          {tr('关闭声音')}
        </button>
      </div>
      <div className="pan-control">
        <span>L</span>
        <input
          aria-label={tr('{0}左右声像', [trackLabel(t)])}
          type="range"
          min="-1"
          max="1"
          step=".01"
          value={t.pan}
          onChange={(e) => onChange({ pan: +e.target.value })}
        />
        <span>R</span>
      </div>
    </div>
  );
}
