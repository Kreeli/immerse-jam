import { useState } from 'react';
import { t as tr } from '../../i18n';
export default function DatabaseMigration({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [databases, setDatabases] = useState<any[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="database-migration">
      <h3>{tr('直接读取本机曲库')}</h3>
      <div className="remote-actions">
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const found = await window.jam.call<any[]>('migration-detect');
              setDatabases(found);
              if (!found.length)
                onError(tr('未在默认位置找到曲库，请选择 Audio Jam 的 AumDb 文件夹'));
            })
          }
        >
          {tr('检测本机 Audio Jam 曲库')}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const folder = await window.jam.call('pick-folder');
              if (folder)
                setDatabases([await window.jam.call('migration-database-scan', { folder })]);
            })
          }
        >
          {tr('选择 AumDb 文件夹')}
        </button>
      </div>
      {databases.map((db) => (
        <div key={db.folder}>
          <p className="muted">{db.folder}</p>
          <p>
            {tr('找到')}
            {db.items.length}
            {tr('首，')}
            {db.items.filter((p: any) => p.available).length}
            {tr('首原曲可迁移')}
          </p>
          <button
            className="small"
            onClick={() =>
              setSelected(db.items.filter((p: any) => p.available).map((p: any) => p.id))
            }
          >
            {tr('全选本机已有歌曲')}
          </button>
          <div className="selection-list">
            {db.items.map((p: any) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  disabled={!p.available || busy}
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>{p.name}</span>
                <small>
                  {p.available ? tr('{0} 分轨', [p.tracks]) : tr('原曲未下载')}
                  {p.missing.length ? tr(' \u00B7 缺少 ') + p.missing.length + tr(' 轨') : ''}
                </small>
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy || !selected.length}
            onClick={() =>
              void act(async () => {
                const result = await window.jam.call('migration-database-import', {
                  folder: db.folder,
                  ids: selected,
                });
                onError(tr('已迁移 {0} 首，原曲库保持完整', [result.length]));
                onDone();
              })
            }
          >
            {busy ? tr('正在复制…') : tr('迁移选中的 {0} 首', [selected.length])}
          </button>
        </div>
      ))}
    </div>
  );
}
