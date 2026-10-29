import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
export default function DeleteProjectDialog({
  project,
  onClose,
  onDelete,
  onError,
}: {
  project: Project;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-label={tr('删除项目确认')}>
        <div className="modal-heading">
          <h2>
            {project.kind
              ? tr('删除工程「{0}」？', [project.title])
              : tr('删除歌曲「{0}」？', [project.title])}
          </h2>
        </div>
        <p>
          {project.kind
            ? tr('删除该工程及其录音和分轨副本，音乐库源歌曲不受影响。')
            : tr(
                '删除音乐库中的原曲、分轨、附件及该歌曲下的录音，已创建的跟练与创作工程不受影响。',
              )}
        </p>
        <p className="muted">{tr('文件会移至系统回收站。')}</p>
        <div className="modal-actions">
          <button disabled={busy} onClick={onClose}>
            {tr('取消')}
          </button>
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onDelete().catch((error) => {
                onError(error.message);
                setBusy(false);
              });
            }}
          >
            {busy ? tr('正在删除…') : tr('移至回收站')}
          </button>
        </div>
      </section>
    </div>
  );
}
