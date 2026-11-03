import { useEffect, useState } from 'react';
import { setPreferences, usePreferences } from '../../app/preferences';
import { t as tr } from '../../i18n';
import { isAndroid } from '../../platform/environment';
const colors = ['#aa92b8', '#ed7894', '#62a9e8', '#67bd9b', '#d7ad68', '#5dc9c7'];
export default function WaveColorSettings() {
  const { waveColor } = usePreferences(),
    [draft, setDraft] = useState(waveColor || colors[0]);
  useEffect(() => setDraft(waveColor || colors[0]), [waveColor]);
  const choose = (value: string) => {
    setDraft(value);
    if (/^#[0-9a-f]{6}$/i.test(value)) setPreferences({ waveColor: value });
  };
  return (
    <fieldset className="wave-color-settings">
      <legend>{tr('波形颜色')}</legend>
      <div className="wave-color-controls">
        <div className="wave-color-swatches">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={tr('波形颜色 {0}', [color])}
              aria-pressed={waveColor === color}
              style={{ background: color }}
              onClick={() => choose(color)}
            />
          ))}
        </div>
        {!isAndroid && (
          <input
            type="color"
            aria-label={tr('选择波形颜色')}
            value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : colors[0]}
            onChange={(e) => choose(e.target.value)}
          />
        )}
        <input
          className="wave-color-hex"
          aria-label={tr('自定义波形颜色')}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => choose(e.target.value)}
          onBlur={() => setDraft(waveColor || colors[0])}
        />
        <button className="nr-btn nr-sm" onClick={() => setPreferences({ waveColor: '' })}>
          {tr('恢复默认')}
        </button>
      </div>
    </fieldset>
  );
}
