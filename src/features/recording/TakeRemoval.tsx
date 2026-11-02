import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Undo2, X } from 'lucide-react';
import ModalFrame from '../../shared/ModalFrame';
import { jamCall } from '../../platform/project-call';
import { t as tr } from '../../i18n';
import type { Project, Take } from '../../shared/types';
type Request = { projectId: string; take?: Take };
export function requestTakeRemoval(project: Project, take: Take) {
  window.dispatchEvent(
    new CustomEvent('immerse-take-removal', { detail: { projectId: project.id, take } }),
  );
}
export function requestTakeTrash(project: Project) {
  window.dispatchEvent(
    new CustomEvent('immerse-take-removal', { detail: { projectId: project.id } }),
  );
}
export default function TakeRemoval({
  onProject,
  onError,
}: {
  onProject: (p: Project) => void;
  onError: (message: string) => void;
}) {
  const [request, setRequest] = useState<Request | null>(null);
  const [deleted, setDeleted] = useState<Take[]>([]);
  const [undo, setUndo] = useState<Request | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const listener = (event: Event) => setRequest((event as CustomEvent<Request>).detail);
    window.addEventListener('immerse-take-removal', listener);
    return () => window.removeEventListener('immerse-take-removal', listener);
  }, []);
  useEffect(() => {
    setDeleted([]);
    if (request && !request.take)
      void jamCall<Take[]>('take-deleted', { id: request.projectId })
        .then(setDeleted)
        .catch((e) => onError(e.message));
  }, [request]);
  const restore = async (target: Request) => {
    if (!target.take) return;
    setBusy(true);
    try {
      onProject(
        await jamCall<Project>('take-restore', { id: target.projectId, takeId: target.take.id }),
      );
      setDeleted((items) => items.filter((take) => take.id !== target.take!.id));
      setUndo(null);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const undoHost = undo
    ? document.querySelector<HTMLElement>(`[data-take-undo-host="${undo.projectId}"]`)
    : null;
  return (
    <>
      <ModalFrame
        open={!!request}
        onClose={() => !busy && setRequest(null)}
        label={request?.take ? tr('删除录音') : tr('录音回收站')}
      >
        <div className="modal-heading">
          <h2>
            {request?.take
              ? tr('删除录音「{0}」？', [request.take.label || request.take.name])
              : tr('录音回收站')}
          </h2>
          <button
            className="icon-button"
            disabled={busy}
            onClick={() => setRequest(null)}
            aria-label={tr('关闭窗口')}
          >
            <X size={18} />
          </button>
        </div>
        <p className="muted">
          {tr('原始文件会保留，可随时从此项目的录音回收站恢复。导出的项目不包含已删除录音。')}
        </p>
        {request?.take ? (
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setRequest(null)}>
              {tr('取消')}
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  onProject(
                    await jamCall<Project>('take-delete', {
                      id: request.projectId,
                      takeId: request.take!.id,
                    }),
                  );
                  setUndo(request);
                  setRequest(null);
                } catch (error) {
                  onError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} />
              {tr('移至录音回收站')}
            </button>
          </div>
        ) : (
          <div className="take-library-list">
            {deleted.map((take) => (
              <div className="take-library-row" key={take.id}>
                <span>{take.label || take.name}</span>
                <button
                  className="small"
                  disabled={busy}
                  onClick={() => request && void restore({ ...request, take })}
                >
                  {tr('恢复录音')}
                </button>
              </div>
            ))}
            {!deleted.length && <p className="empty">{tr('录音回收站为空')}</p>}
          </div>
        )}
      </ModalFrame>
      {undo &&
        createPortal(
          <div className={undoHost ? 'take-undo-inline' : 'take-undo toast'} role="status">
            <span>{tr('录音已移至回收站')}</span>
            <button className="small" disabled={busy} onClick={() => void restore(undo)}>
              <Undo2 size={15} />
              {tr('撤销')}
            </button>
            <button
              className="icon-button"
              aria-label={tr('关闭提示')}
              onClick={() => setUndo(null)}
            >
              <X size={15} />
            </button>
          </div>,
          undoHost || document.body,
        )}
    </>
  );
}
