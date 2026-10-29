import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import { isAndroid } from '../../platform/environment';
export default function RecoveryDialog({
  project,
  onClose,
  onRecovered,
  onError,
}: {
  project: Project;
  onClose: () => void;
  onRecovered: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-label={tr('恢复歌曲数据')}>
        <h2>{tr('歌曲数据需要恢复')}</h2>
        <p>
          {tr('歌曲文件仍保留在原文件夹。可以尝试恢复最近一次有效备份，损坏清单也会另行保留。')}
        </p>
        <p className="muted">{project.broken}</p>
        <div className="modal-actions">
          <button onClick={onClose}>{tr('关闭')}</button>
          {!isAndroid && (
            <button
              onClick={() =>
                void window.jam.call('reveal', { id: project.id }).catch((e) => onError(e.message))
              }
            >
              {tr('打开文件夹')}
            </button>
          )}
          <button
            disabled={busy}
            className="primary"
            onClick={() => {
              setBusy(true);
              void window.jam
                .call('project-recover', { id: project.id })
                .then(onRecovered)
                .then(onClose)
                .catch((e) => onError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {tr('恢复自动备份')}
          </button>
        </div>
      </section>
    </div>
  );
}
