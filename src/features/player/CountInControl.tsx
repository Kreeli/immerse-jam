import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t as tr } from '../../i18n';
import type { Practice } from '../../shared/types';
export default function CountInControl({
  practice,
  bpm,
  onChange,
}: {
  practice: Practice;
  bpm: number;
  onChange: (patch: Partial<Practice>) => void;
}) {
  const initial = practice.countInBpm || bpm || 120,
    [draft, setDraft] = useState(String(initial));
  useEffect(() => setDraft(String(initial)), [initial]);
  const apply = () => {
    const value = Number(draft);
    if (Number.isFinite(value) && value >= 20 && value <= 350) onChange({ countInBpm: value });
    else setDraft(String(initial));
  };
  return (
    <div className="count-in-control">
      <label>
        <Clock size={16} />
        {tr('智能节拍器')}
        <input
          aria-label={tr('启用智能节拍器')}
          type="checkbox"
          checked={!!practice.metronome}
          onChange={(event) => onChange({ metronome: event.target.checked })}
        />
      </label>
      <label className="metronome-volume">
        {tr('节拍器音量')}
        <input
          aria-label={tr('节拍器音量')}
          type="range"
          min="0"
          max="1"
          step=".01"
          value={practice.metronomeVolume ?? 0.5}
          onChange={(event) => onChange({ metronomeVolume: +event.target.value })}
        />
        <small>{Math.round((practice.metronomeVolume ?? 0.5) * 100)}%</small>
      </label>
      <label>
        <Clock size={16} />
        {tr('预备拍')}
        <input
          aria-label={tr('启用预备拍')}
          type="checkbox"
          checked={!!practice.countIn}
          onChange={(event) => onChange({ countIn: event.target.checked })}
        />
      </label>
      {practice.countIn && (
        <div className="count-in-options">
          <label>
            {tr('原速 BPM')}
            <input
              aria-label={tr('预备拍 BPM')}
              type="number"
              min="20"
              max="350"
              step=".1"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={apply}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <label>
            {tr('拍数')}
            <select
              aria-label={tr('预备拍拍数')}
              value={practice.countInBeats || 4}
              onChange={(event) => onChange({ countInBeats: +event.target.value })}
            >
              {[2, 3, 4, 6, 8].map((value) => (
                <option key={value} value={value}>
                  {value}
                  {tr('拍')}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr('从最近的正拍开始')}
            <input
              aria-label={tr('预备后对齐最近节拍')}
              type="checkbox"
              checked={practice.snapCountIn !== false}
              onChange={(event) => onChange({ snapCountIn: event.target.checked })}
            />
          </label>
          <small>{tr('预备拍与音乐使用同一播放时钟和音频路径。')}</small>
        </div>
      )}
    </div>
  );
}
