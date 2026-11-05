import Select from '../../shared/Select';
import { jamCall } from '../../platform/project-call';
import { setPreferences, usePreferences, type Preferences } from '../../app/preferences';
import { t as tr } from '../../i18n';
import { isAndroid } from '../../platform/environment';
import { PointerGlyph } from '../../platform/android/AndroidPointer';
import WaveColorSettings from './WaveColorSettings';
export default function AppearanceSettings({
  showLicense = true,
  onError,
  onSaved,
}: {
  showLicense?: boolean;
  onError?: (error: string) => void;
  onSaved?: () => void;
}) {
  const preferences = usePreferences();
  const commit = (patch: Partial<Preferences>) => {
    try {
      setPreferences(patch);
      onSaved?.();
    } catch (error) {
      onError?.((error as Error).message);
    }
  };
  return (
    <section className="appearance-settings">
      <h3>{tr('外观与语言')}</h3>
      <div>
        <label>
          {tr('语言')}
          <Select
            aria-label={tr('界面语言')}
            value={preferences.language}
            onChange={(event) => commit({ language: event.target.value as 'zh-CN' | 'en' })}
          >
            <option value="zh-CN">{tr('简体中文')}</option>
            <option value="en">English</option>
          </Select>
        </label>
        <label>
          {tr('明暗主题')}
          <Select
            aria-label={tr('明暗主题')}
            value={preferences.theme}
            onChange={(event) =>
              commit({ theme: event.target.value as 'dark' | 'light' | 'system' })
            }
          >
            <option value="dark">{tr('暗色')}</option>
            <option value="light">{tr('浅色')}</option>
            <option value="system">{tr('跟随系统')}</option>
          </Select>
        </label>
        <label>
          {tr('强调色')}
          <Select
            aria-label={tr('强调色')}
            value={preferences.accent}
            onChange={(event) =>
              commit({ accent: event.target.value as 'rose' | 'blue' | 'green' | 'purple' })
            }
          >
            <option value="rose">{tr('玫瑰')}</option>
            <option value="blue">{tr('海蓝')}</option>
            <option value="green">{tr('松绿')}</option>
            <option value="purple">{tr('紫罗兰')}</option>
          </Select>
        </label>
      </div>
      <WaveColorSettings onError={onError} onSaved={onSaved} />
      {isAndroid && (
        <fieldset className="pointer-settings">
          <legend>{tr('鼠标指针')}</legend>
          <div className="pointer-options">
            {(['arrow', 'ring', 'crosshair', 'system'] as const).map((style, index) => (
              <button
                key={style}
                type="button"
                className="nr-btn"
                aria-pressed={preferences.pointerStyle === style}
                onClick={() => commit({ pointerStyle: style })}
              >
                <PointerGlyph style={style} />
                {[tr('箭头'), tr('圆环'), tr('十字'), tr('系统')][index]}
              </button>
            ))}
          </div>
          <small>{tr('移动鼠标时显示，触摸或闲置后隐藏。')}</small>
        </fieldset>
      )}
      {showLicense && (
        <div className="license-links">
          <button className="small" onClick={() => void jamCall('open-license-folder')}>
            {tr('查看许可与第三方声明')}
          </button>
          <small>{tr('项目源码可用于非商业用途；第三方组件遵循各自协议。')}</small>
        </div>
      )}
    </section>
  );
}
