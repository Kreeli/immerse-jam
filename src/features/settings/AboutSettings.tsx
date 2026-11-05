import { useEffect, useState } from 'react';
import { version } from '../../../package.json';
import UpdateCheck from './UpdateCheck';
import { jamCall } from '../../platform/project-call';
import { t as tr, message } from '../../i18n';
export default function AboutSettings({ beforeInstall }: { beforeInstall: () => Promise<void> }) {
  const [diagnostics, setDiagnostics] = useState<{
      version: string;
      platform: string;
      electron: string;
      ready: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(message((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    void jamCall('settings-diagnostics')
      .then((d) => {
        if (alive) setDiagnostics(d);
      })
      .catch((e) => {
        if (alive) setError(message(e.message));
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <h3>Immerse Jam</h3>
        <p className="settings-version">{tr('版本 {0}', [diagnostics?.version || version])}</p>
        {diagnostics && (
          <p className="muted">
            {diagnostics.platform} · Electron {diagnostics.electron}
          </p>
        )}
        <UpdateCheck beforeInstall={beforeInstall} />
      </section>
      <section className="settings-card">
        <h3>{tr('日志与诊断')}</h3>
        <p className="muted">
          {tr('诊断摘要包含版本、运行环境状态和数据路径，仅复制到本机剪贴板。')}
        </p>
        <div className="settings-action-row">
          <button
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await jamCall('settings-open-location', { id: 'logs' });
              })
            }
          >
            {tr('打开应用日志')}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await jamCall('settings-open-location', { id: 'installLog' });
              })
            }
          >
            {tr('打开安装日志')}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await jamCall('settings-open-location', { id: 'jobs' });
              })
            }
          >
            {tr('打开任务记录')}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await jamCall('settings-copy-diagnostics');
                setStatus(tr('诊断摘要已复制'));
              })
            }
          >
            {tr('复制诊断摘要')}
          </button>
        </div>
        <small role="status">{status}</small>
      </section>
      <section className="settings-card">
        <h3>{tr('许可与第三方声明')}</h3>
        <p className="muted">{tr('项目源码可用于非商业用途；第三方组件遵循各自协议。')}</p>
        <button
          disabled={busy}
          onClick={() =>
            void work(async () => {
              await jamCall('open-license-folder');
            })
          }
        >
          {tr('查看许可与第三方声明')}
        </button>
      </section>
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
    </div>
  );
}
