import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import ModalFrame from '../../shared/ModalFrame';
import { jamCall } from '../../platform/project-call';
import { t as tr } from '../../i18n';
import type { Attachment, Project } from '../../shared/types';

export default function AttachmentPicker({
  project,
  items,
  value,
  onChoose,
  onProject,
  onError,
  score = false,
}: {
  project: Project;
  items: Attachment[];
  value: string;
  onChoose: (id: string) => void;
  onProject: (p: Project) => void;
  onError: (message: string) => void;
  score?: boolean;
}) {
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const label = score ? tr('选择乐谱 / MIDI') : tr('选择附件');
  const add = async () => {
    try {
      onProject(await jamCall<Project>('attach', { id: project.id }));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="nr-choice-trigger mobile-select-trigger chart-picker"
          aria-label={label}
        >
          <span>{items.find((a) => a.id === value)?.name || label}</span>
          <ChevronDown size={16} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            className="nr-choice-menu mobile-select-menu chart-picker-menu attachment-picker-menu"
            sideOffset={6}
            collisionPadding={12}
            align="start"
          >
            {items.map((a) => (
              <div className="chart-picker-choice" key={a.id}>
                <Menu.Item
                  className="nr-choice-option mobile-select-option"
                  onSelect={() => onChoose(a.id)}
                >
                  <span>{a.name}</span>
                  {value === a.id && <Check size={15} />}
                </Menu.Item>
                <Menu.Item
                  className="chart-picker-action chart-picker-delete"
                  aria-label={tr('删除附件 {0}', [a.name])}
                  onSelect={() => setRemoving(a)}
                >
                  <Trash2 size={16} />
                </Menu.Item>
              </div>
            ))}
            {items.length > 0 && <Menu.Separator className="mobile-menu-separator" />}
            <Menu.Item
              className="nr-choice-option mobile-select-option chart-picker-new"
              onSelect={() => void add()}
            >
              <Plus size={17} />
              {score ? tr('导入乐谱') : tr('添加附件')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <ModalFrame
        open={!!removing}
        onClose={() => !busy && setRemoving(null)}
        className="metadata-dialog"
        label={tr('删除附件')}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!removing || busy) return;
            setBusy(true);
            try {
              const updated = await jamCall<Project>('attachment-delete', {
                id: project.id,
                attachmentId: removing.id,
              });
              onProject(updated);
              setRemoving(null);
            } catch (error) {
              onError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{tr('删除附件')}</h2>
          <p>
            {tr('永久删除附件“{0}”？只删除项目内的副本，不影响导入前的原文件。', [
              removing?.name || '',
            ])}
          </p>
          <footer>
            <button
              className="nr-btn"
              type="button"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              {tr('取消')}
            </button>
            <button className="nr-btn result-delete-confirm" type="submit" disabled={busy}>
              {tr('删除')}
            </button>
          </footer>
        </form>
      </ModalFrame>
    </>
  );
}
