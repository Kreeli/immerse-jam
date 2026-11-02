import { useEffect, useState } from 'react';
import { Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { jamCall } from '../../platform/project-call';
import { isAndroid } from '../../platform/environment';
import { t as tr, message as translateMessage } from '../../i18n';
interface Version {
  current: string;
  latest: string;
  available: boolean;
  size?: number;
}
export default function UpdateCheck({ beforeInstall }: { beforeInstall: () => Promise<void> }) {
  const [version, setVersion] = useState<Version | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [downloaded, setDownloaded] = useState(false),
    [progress, setProgress] = useState<number | undefined>();
  useEffect(
    () =>
      window.jam.onEvent((event) => {
        if (event.scope === 'update') {
          setProgress(event.progress);
          setMessage(event.message || '');
        }
      }),
    [],
  );
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="update-check">
      <div className="update-heading">
        <h3>{tr('应用更新')}</h3>
        <button
          className="small"
          disabled={busy}
          onClick={() =>
            void work(async () => {
              setDownloaded(false);
              setProgress(undefined);
              const result = await jamCall<Version>('update-check');
              setVersion(result);
              setMessage(
                result.available
                  ? tr('发现新版本 {0}', [result.latest])
                  : tr('已是最新公开版本 {0}', [result.current]),
              );
            })
          }
        >
          {busy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
          {tr('检查更新')}
        </button>
      </div>
      {version && <small>{tr('当前 {0} · 最新 {1}', [version.current, version.latest])}</small>}
      {message && (
        <p className="muted" role="status">
          {translateMessage(message)}
        </p>
      )}
      {busy && progress !== undefined && <progress max="1" value={progress} />}
      {version && (
        <button
          className="small"
          disabled={busy}
          onClick={() =>
            void work(async () => {
              if (isAndroid) {
                await jamCall('update-download');
                return;
              }
              if (downloaded) {
                await beforeInstall();
                await jamCall('update-install');
              } else {
                await jamCall('update-download');
                setDownloaded(true);
                setMessage(tr('安装包已校验，安装后继续使用原曲库。'));
              }
            })
          }
        >
          <Download size={14} />
          {isAndroid
            ? tr('下载 APK')
            : downloaded
              ? tr('退出并安装更新')
              : version.available
                ? tr('下载更新')
                : tr('重新下载当前版本')}
        </button>
      )}
    </section>
  );
}
