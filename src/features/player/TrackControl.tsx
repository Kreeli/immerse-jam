import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import NameDialog from '../../shared/NameDialog';
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
  grouped = false,
  onRemove,
  editingDisabled = false,
}: {
  track: Track;
  color: string;
  onChange: (p: Partial<Track>) => void;
  selected: boolean;
  onSelect: () => void;
  meterPlayer: Player;
  onState: (action: 'listen' | 'close') => void;
  grouped?: boolean;
  onRemove?: () => void;
  editingDisabled?: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  // PR #6 stripHTML(): meter + compact header + volume/pan line.
  return (
    <div
      style={{ '--c': color, '--track-color': color } as React.CSSProperties}
      className={
        'track-control nr-strip ' +
        (t.mute ? 'muted-track nr-off ' : '') +
        (selected ? 'wave-selected' : '')
      }
      data-focus={selected}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('input,button,form')) onSelect();
      }}
    >
      <TrackMeter player={meterPlayer} id={t.id} label={trackLabel(t)} vertical />
      <div className="nr-strip-body">
        <div className="track-top nr-strip-top">
          <button
            className="track-name nr-name"
            aria-label={tr('显示{0}波形', [trackLabel(t)])}
            aria-pressed={selected}
            onClick={onSelect}
            title={tr('显示{0}波形', [trackLabel(t)])}
          >
            <i className="nr-stem-dot" />
            {trackLabel(t)}
          </button>
          <span className="track-name-actions">
            <button
              className="nr-icon-btn nr-sm"
              disabled={editingDisabled}
              aria-label={tr('重命名音轨 {0}', [trackLabel(t)])}
              title={tr('重命名音轨')}
              onClick={() => setRenaming(true)}
            >
              <Pencil size={14} />
            </button>
            {onRemove && (
              <button
                className="nr-icon-btn nr-sm"
                disabled={editingDisabled}
                aria-label={tr('移回录音库')}
                title={tr('移回录音库')}
                onClick={onRemove}
              >
                <Trash2 size={14} />
              </button>
            )}
          </span>
          {t.quiet && <small className="nr-tag-quiet">{tr('几乎无声')}</small>}
          <span className="nr-pct">{Math.round(t.gain * 100)}%</span>
          <button
            className={'track-switch nr-ms-btn nr-s ' + (t.solo ? 'solo' : '')}
            aria-label={tr('选听')}
            aria-pressed={t.solo}
            title={
              grouped
                ? tr('组内选听：只选择此分组中的声部，不影响其他音轨')
                : tr('选听：可选择多轨，存在选听音轨时只播放这些音轨')
            }
            onClick={() => onState('listen')}
          >
            S
          </button>
          <button
            className={'track-switch nr-ms-btn nr-m ' + (t.mute ? 'enabled' : '')}
            aria-label={tr('关闭声音')}
            aria-pressed={t.mute}
            title={tr('关闭声音：可同时关闭多个音轨')}
            onClick={() => onState('close')}
          >
            M
          </button>
        </div>
        <div className="nr-strip-ctl">
          <input
            className="nr-range"
            style={{ '--p': (t.gain / 1.5) * 100 + '%' } as React.CSSProperties}
            aria-label={tr('{0}音量', [trackLabel(t)])}
            type="range"
            min="0"
            max="1.5"
            step=".01"
            value={t.gain}
            onChange={(e) => onChange({ gain: +e.target.value })}
          />
          <span className="nr-pan-wrap">
            L
            <input
              className="nr-range nr-pan"
              aria-label={tr('{0}左右声像', [trackLabel(t)])}
              type="range"
              min="-1"
              max="1"
              step=".01"
              value={t.pan}
              onChange={(e) => onChange({ pan: +e.target.value })}
            />
            R
          </span>
        </div>
        {renaming && (
          <NameDialog
            name={trackLabel(t)}
            onSave={(label) => onChange({ label })}
            onClose={() => setRenaming(false)}
          />
        )}
      </div>
    </div>
  );
}
