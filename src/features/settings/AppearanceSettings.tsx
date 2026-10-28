import { setPreferences, usePreferences } from '../../app/preferences';
import { t as tr } from '../../i18n';
export default function AppearanceSettings() {
  const preferences = usePreferences();
  return (
    <section className="appearance-settings">
      <h3>{tr('外观与语言')}</h3>
      <div>
        <label>
          {tr('语言')}
          <select
            aria-label={tr('界面语言')}
            value={preferences.language}
            onChange={(event) => setPreferences({ language: event.target.value as 'zh-CN' | 'en' })}
          >
            <option value="zh-CN">{tr('简体中文')}</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {tr('明暗主题')}
          <select
            aria-label={tr('明暗主题')}
            value={preferences.theme}
            onChange={(event) =>
              setPreferences({ theme: event.target.value as 'dark' | 'light' | 'system' })
            }
          >
            <option value="dark">{tr('暗色')}</option>
            <option value="light">{tr('浅色')}</option>
            <option value="system">{tr('跟随系统')}</option>
          </select>
        </label>
        <label>
          {tr('强调色')}
          <select
            aria-label={tr('强调色')}
            value={preferences.accent}
            onChange={(event) =>
              setPreferences({ accent: event.target.value as 'rose' | 'blue' | 'green' | 'purple' })
            }
          >
            <option value="rose">{tr('玫瑰')}</option>
            <option value="blue">{tr('海蓝')}</option>
            <option value="green">{tr('松绿')}</option>
            <option value="purple">{tr('紫罗兰')}</option>
          </select>
        </label>
      </div>
      <div className="license-links">
        <button className="small" onClick={() => void window.jam.call('open-license-folder')}>
          {tr('查看许可与第三方声明')}
        </button>
        <small>{tr('项目源码可用于非商业用途；第三方组件遵循各自协议。')}</small>
      </div>
    </section>
  );
}
