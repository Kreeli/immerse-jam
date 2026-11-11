import { useEffect, useRef, useState } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import ModalFrame from '../../shared/ModalFrame';
import { jamCall } from '../../platform/project-call';
import { getPreferences } from '../../app/preferences';
import { t as tr, message } from '../../i18n';
type Location = { id: string; path: string; bytes: number; complete: boolean };
type Info = { locations: Location[]; freeBytes: number | null; busy: boolean };
type Preview = { token: string; category: string; files: number; bytes: number; expires: number };
export function formatBytes(bytes: number) {
  const unit = bytes >= 1073741824 ? 'GiB' : bytes >= 1048576 ? 'MiB' : bytes >= 1024 ? 'KiB' : 'B';
  const divisor = { GiB: 1073741824, MiB: 1048576, KiB: 1024, B: 1 }[unit];
  return (
    new Intl.NumberFormat(getPreferences().language, { maximumFractionDigits: 1 }).format(
      bytes / divisor,
    ) +
    ' ' +
    unit
  );
}
export default function StorageSettings({
  disabled,
  active = true,
}: {
  disabled: boolean;
  active?: boolean;
}) {
  const [info, setInfo] = useState<Info | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [result, setResult] = useState('');
  const request = useRef(0);
  const refresh = async () => {
    const serial = ++request.current;
    setLoading(true);
    setError('');
    try {
      const next = await jamCall<Info>('settings-storage');
      if (serial === request.current) setInfo(next);
    } catch (e) {
      if (serial === request.current) setError(message((e as Error).message));
    } finally {
      if (serial === request.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (active) void refresh();
    return () => {
      request.current++;
    };
  }, [disabled, active]);
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
  const names: Record<string, string> = {
    library: tr('音乐与录音'),
    models: tr('模型文件'),
    runtime: tr('运行库与工具'),
    cache: tr('下载与运行缓存'),
    temp: tr('临时文件'),
    jobs: tr('任务记录'),
    profile: tr('应用设置'),
    logs: tr('应用日志'),
  };
  const locked = disabled || busy || loading || !!info?.busy;
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-heading">
          <h3>{tr('存储占用')}</h3>
          <button disabled={loading || busy} onClick={() => void refresh()}>
            <RefreshCw size={16} />
            {loading ? tr('扫描中…') : tr('重新扫描')}
          </button>
        </div>
        <p className="muted">{tr('音乐、模型、运行库与临时内容分别统计。')}</p>
        <p className="settings-readout">
          {tr('运行库所在磁盘可用')}：
          {info?.freeBytes === null || !info ? tr('未知') : formatBytes(info.freeBytes)}
        </p>
        <div className="settings-storage-list" aria-busy={loading}>
          {!info && <p role="status">{tr('正在统计存储占用…')}</p>}
          {info?.locations.map((row) => (
            <div className="settings-storage-row" key={row.id} data-storage-id={row.id}>
              <div>
                <strong>{names[row.id] || row.id}</strong>
                <span className="settings-path">{row.path}</span>
                {!row.complete && (
                  <small className="settings-error">
                    {tr('部分内容未能统计，显示的是已扫描大小。')}
                  </small>
                )}
              </div>
              <span className="settings-byte-count">{formatBytes(row.bytes)}</span>
              <button
                className="settings-folder-button"
                aria-label={tr('打开{0}目录', [names[row.id] || row.id])}
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await jamCall('settings-open-location', { id: row.id });
                  })
                }
              >
                <FolderOpen size={17} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <h3>{tr('分类清理')}</h3>
        <p className="muted">
          {tr('先查看可清理数量和大小，再确认。不会清除音乐、录音、模型、运行库或可续传下载。')}
        </p>
        {(disabled || info?.busy) && (
          <p className="notice">{tr('请等待录音、下载和处理任务结束后再清理')}</p>
        )}
        <div className="settings-cleanup-row">
          <span>
            <strong>{tr('过期临时文件')}</strong>
            <small>{tr('仅包含超过24小时、没有续传标记的临时内容。')}</small>
          </span>
          <button
            disabled={locked}
            onClick={() =>
              void work(async () =>
                setPreview(
                  await jamCall<Preview>('settings-cleanup-preview', { category: 'temp' }),
                ),
              )
            }
          >
            {tr('预览清理')}
          </button>
        </div>
        <div className="settings-cleanup-row">
          <span>
            <strong>{tr('旧任务记录')}</strong>
            <small>{tr('仅包含超过7天的已结束任务记录；清除后无法查看这些日志。')}</small>
          </span>
          <button
            disabled={locked}
            onClick={() =>
              void work(async () =>
                setPreview(
                  await jamCall<Preview>('settings-cleanup-preview', { category: 'jobs' }),
                ),
              )
            }
          >
            {tr('预览清理')}
          </button>
        </div>
      </section>
      {result && (
        <p className="settings-result" role="status">
          {result}
        </p>
      )}
      {error && (
        <div role="alert" className="settings-error">
          <p>{error}</p>
          <button disabled={busy || loading} onClick={() => void refresh()}>
            {tr('重试')}
          </button>
        </div>
      )}
      <ModalFrame
        open={!!preview}
        managedFocus
        label={tr('确认清理')}
        onClose={() => !busy && setPreview(null)}
        className="settings-confirm"
      >
        <h2>{tr('确认清理')}</h2>
        <p>{preview?.category === 'jobs' ? tr('旧任务记录') : tr('过期临时文件')}</p>
        <p>
          {preview?.files
            ? tr('预计清理{0}个文件，释放{1}。', [preview.files, formatBytes(preview.bytes)])
            : tr('没有可清理的过期内容。')}
        </p>
        <p className="muted">{tr('预览后发生变化的文件会跳过。')}</p>
        {error && (
          <div className="settings-error" role="alert">
            <p>{error}</p>
            <button
              disabled={busy || disabled}
              onClick={() =>
                void work(async () =>
                  setPreview(
                    await jamCall<Preview>('settings-cleanup-preview', {
                      category: preview!.category,
                    }),
                  ),
                )
              }
            >
              {tr('重新预览')}
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button disabled={busy} onClick={() => setPreview(null)}>
            {tr('取消')}
          </button>
          <button
            className="primary"
            disabled={locked || !preview?.files}
            onClick={() =>
              void work(async () => {
                const value = await jamCall<{
                  deletedFiles: number;
                  freedBytes: number;
                  skippedFiles: number;
                  failedFiles: number;
                }>('settings-cleanup', { token: preview!.token });
                setResult(
                  tr('已清理{0}个文件，释放{1}；跳过{2}，失败{3}。', [
                    value.deletedFiles,
                    formatBytes(value.freedBytes),
                    value.skippedFiles,
                    value.failedFiles,
                  ]),
                );
                setPreview(null);
                await refresh();
              })
            }
          >
            {busy ? tr('清理中…') : tr('确认清理')}
          </button>
        </div>
      </ModalFrame>
    </div>
  );
}
