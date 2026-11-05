import { useState } from 'react';
import Select from '../../shared/Select';
import AppearanceSettings from './AppearanceSettings';
import { setPreferences, usePreferences } from '../../app/preferences';
import { jamCall } from '../../platform/project-call';
import { t as tr, message } from '../../i18n';
export default function GeneralSettings({ onGuide }: { onGuide: () => void }) {
  const preferences = usePreferences(),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(''),
    [busy, setBusy] = useState(false);
  const change = async (scale?: number, reset = false) => {
    setBusy(true);
    setError('');
    try {
      if (scale !== undefined) await jamCall('ui-scale', { scale });
      setPreferences(
        reset
          ? { theme: 'dark', accent: 'rose', waveColor: '', uiScale: 1, helpTooltips: true }
          : { uiScale: scale! },
      );
      setSaved(tr('设置已保存'));
    } catch (e) {
      if (scale !== undefined)
        await jamCall('ui-scale', { scale: preferences.uiScale }).catch(() => {});
      setError(message((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-stack">
      <AppearanceSettings
        showLicense={false}
        onError={(e) => setError(message(e))}
        onSaved={() => {
          setError('');
          setSaved(tr('设置已保存'));
        }}
      />
      <section className="settings-card">
        <h3>{tr('显示与帮助')}</h3>
        <label className="settings-row">
          <span>
            <strong>{tr('界面缩放')}</strong>
            <small>{tr('调整整个窗口的文字与控件大小。')}</small>
          </span>
          <Select
            aria-label={tr('界面缩放')}
            disabled={busy}
            value={preferences.uiScale}
            onChange={(e) => void change(Number(e.target.value))}
          >
            {![0.8, 0.9, 1, 1.1, 1.25, 1.5].includes(preferences.uiScale) && (
              <option value={preferences.uiScale}>{Math.round(preferences.uiScale * 100)}%</option>
            )}
            {[0.8, 0.9, 1, 1.1, 1.25, 1.5].map((n) => (
              <option key={n} value={n}>
                {Math.round(n * 100)}%
              </option>
            ))}
          </Select>
        </label>
        <label className="settings-row">
          <span>
            <strong>{tr('悬停说明')}</strong>
            <small>{tr('鼠标停留约2秒显示说明；键盘聚焦时直接显示。')}</small>
          </span>
          <input
            type="checkbox"
            aria-label={tr('悬停说明')}
            checked={preferences.helpTooltips}
            onChange={(e) => {
              try {
                setPreferences({ helpTooltips: e.target.checked });
                setSaved(tr('设置已保存'));
                setError('');
              } catch (err) {
                setError(message((err as Error).message));
              }
            }}
          />
        </label>
        <div className="settings-row">
          <span>
            <strong>{tr('使用引导')}</strong>
            <small>{tr('从导入、分析到录音与导出，逐步了解工作流程。')}</small>
          </span>
          <button onClick={onGuide}>{tr('重新观看教程')}</button>
        </div>
      </section>
      <div className="settings-section-footer">
        <button disabled={busy} onClick={() => void change(1, true)}>
          {tr('恢复外观与帮助默认值')}
        </button>
        <small role="status">{saved || tr('修改会自动保存。')}</small>
      </div>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
