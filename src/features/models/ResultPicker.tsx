import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { jamCall } from '../../platform/project-call';
import { isAndroid } from '../../platform/environment';
import { t as tr } from '../../i18n';
import type { Project, SeparationResult } from '../../shared/types';
import ModalFrame from '../../shared/ModalFrame';
const label = (name: string) => name.replace(/ · 六轨(?:兼容)? · 完整六轨$/, ' · 完整六轨');
export default function ResultPicker({
  project,
  onProject,
  onError,
  loading,
}: {
  project: Project;
  onProject: (project: Project) => void;
  onError: (message: string) => void;
  loading: boolean;
}) {
  const result = project.results?.find((item) => item.id === project.activeResultId);
  const [action, setAction] = useState<{
      result: SeparationResult;
      kind: 'rename' | 'delete';
    } | null>(null),
    [busy, setBusy] = useState(false),
    [name, setName] = useState('');
  useEffect(() => {
    setAction(null);
  }, [project.id]);
  const select = async (resultId: string | null) => {
    if (resultId === (project.activeResultId || null)) return;
    setBusy(true);
    try {
      onProject(await jamCall<Project>('result-select', { id: project.id, resultId }));
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (!busy) setAction(null);
  };
  const title = action?.kind === 'delete' ? tr('删除分离结果') : tr('重命名分离结果');
  return (
    <div className="result-picker nr-result-picker">
      <Menu.Root>
        <Menu.Trigger
          className="mobile-select-trigger nr-choice-trigger result-menu-trigger"
          aria-label={tr('当前分离结果')}
          title={result?.name || tr('原曲')}
          disabled={loading || busy}
        >
          <span>{result ? label(result.name) : tr('原曲')}</span>
          <ChevronDown size={15} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            className="nr-choice-menu result-menu"
            align="start"
            sideOffset={6}
            collisionPadding={12}
          >
            <Menu.Item
              className="nr-choice-option result-menu-option"
              data-result-id=""
              onSelect={() => void select(null)}
            >
              <span>{tr('原曲')}</span>
              {!result && <Check size={15} />}
            </Menu.Item>
            {(project.results || []).map((item) => (
              <div className="result-menu-row" key={item.id}>
                <Menu.Item
                  className="nr-choice-option result-menu-option"
                  data-result-id={item.id}
                  onSelect={() => void select(item.id)}
                  title={item.name}
                >
                  <span>{label(item.name)}</span>
                  {item.id === result?.id && <Check size={15} />}
                </Menu.Item>
                <Menu.Item
                  className="result-menu-action"
                  aria-label={tr('重命名分离结果 {0}', [item.name])}
                  title={tr('重命名')}
                  onSelect={() => {
                    setName(item.name);
                    setAction({ result: item, kind: 'rename' });
                  }}
                >
                  <Pencil size={15} />
                </Menu.Item>
                <Menu.Item
                  className="result-menu-action result-menu-delete"
                  aria-label={tr('删除分离结果 {0}', [item.name])}
                  title={tr('删除')}
                  onSelect={() => setAction({ result: item, kind: 'delete' })}
                >
                  <Trash2 size={15} />
                </Menu.Item>
              </div>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <ModalFrame
        open={!!action}
        label={title}
        className="metadata-dialog result-name-dialog"
        onClose={close}
      >
        <form
          role={isAndroid ? undefined : 'dialog'}
          aria-label={title}
          onSubmit={async (event) => {
            event.preventDefault();
            if (!action || busy) return;
            setBusy(true);
            try {
              onProject(
                await jamCall<Project>(
                  action.kind === 'delete' ? 'result-delete' : 'result-rename',
                  { id: project.id, resultId: action.result.id, name },
                ),
              );
              setAction(null);
            } catch (error) {
              onError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{title}</h2>
          {action?.kind === 'delete' ? (
            <p>
              {tr('确定删除分离结果“{0}”吗？原曲、录音和已创建的工程会保留。', [
                action.result.name,
              ])}
            </p>
          ) : (
            <label>
              {tr('分离结果名称')}
              <input
                aria-label={tr('分离结果名称')}
                value={name}
                maxLength={120}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <footer>
            <button className="nr-btn" type="button" disabled={busy} onClick={close}>
              {tr('取消')}
            </button>
            <button
              className={
                'nr-btn ' + (action?.kind === 'delete' ? 'result-delete-confirm' : 'nr-primary')
              }
              disabled={busy || (action?.kind === 'rename' && !name.trim())}
              type="submit"
            >
              {busy ? tr('正在保存…') : action?.kind === 'delete' ? tr('删除') : tr('保存名称')}
            </button>
          </footer>
        </form>
      </ModalFrame>
    </div>
  );
}
