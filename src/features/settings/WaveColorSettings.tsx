import { useEffect, useState } from 'react';
import { setPreferences, usePreferences } from '../../app/preferences';
import { t as tr } from '../../i18n';
import { isAndroid } from '../../platform/environment';
const defaultColor = '#aa92b8';
const colors = ['#66CCFF', defaultColor, '#ed7894', '#62a9e8', '#67bd9b', '#d7ad68', '#5dc9c7'];
export default function WaveColorSettings({
  onError,
  onSaved,
}: {
  onError?: (error: string) => void;
  onSaved?: () => void;
}) {
  const { waveColor } = usePreferences(),
    [draft, setDraft] = useState(waveColor || defaultColor);
  useEffect(() => setDraft(waveColor || defaultColor), [waveColor]);
  const choose = (value: string) => {
    setDraft(value);
    if (value === '' || /^#[0-9a-f]{6}$/i.test(value)) {
      try {
        setPreferences({ waveColor: value });
        onSaved?.();
      } catch (error) {
        setDraft(waveColor || defaultColor);
        onError?.((error as Error).message);
      }
    }
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
              aria-pressed={(waveColor || defaultColor).toLowerCase() === color.toLowerCase()}
              style={{ background: color }}
              onClick={() => choose(color)}
            />
          ))}
        </div>
        {!isAndroid && (
          <input
            type="color"
            aria-label={tr('选择波形颜色')}
            value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : defaultColor}
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
          onBlur={() => setDraft(waveColor || defaultColor)}
        />
        <button className="nr-btn nr-sm" onClick={() => choose('')}>
          {tr('恢复默认')}
        </button>
      </div>
    </fieldset>
  );
}
