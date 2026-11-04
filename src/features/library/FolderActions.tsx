import * as Menu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { FolderDialog, type FolderProps } from './Folders';
import ModalFrame from '../../shared/ModalFrame';
import { jamCall } from '../../platform/project-call';
import { t as tr } from '../../i18n';
import type { ProjectFolder } from '../../shared/types';

export default function FolderActions({
  folder,
  onDeleted,
  ...props
}: FolderProps & {
  folder: ProjectFolder;
  onDeleted: () => void;
}) {
  const [action, setAction] = useState<'edit' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="nr-icon-btn nr-sm sidebar-folder-menu"
          aria-label={tr('管理分类 {0}', [folder.name])}
          title={tr('管理分类 {0}', [folder.name])}
        >
          <MoreHorizontal size={16} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            className="nr-action-menu"
            align="start"
            side="right"
            sideOffset={8}
            collisionPadding={12}
          >
            <Menu.Item onSelect={() => setAction('edit')}>
              <Pencil size={16} />
              {tr('编辑分类')}
            </Menu.Item>
            {folder.id !== 'unfiled' && (
              <Menu.Item className="menu-danger" onSelect={() => setAction('delete')}>
                <Trash2 size={16} />
                {tr('删除分类')}
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {action === 'edit' && (
        <FolderDialog {...props} folder={folder} onClose={() => setAction(null)} />
      )}
      <ModalFrame
        open={action === 'delete'}
        onClose={() => !busy && setAction(null)}
        className="metadata-dialog"
        label={tr('删除分类')}
      >
        <form
          role="dialog"
          aria-label={tr('删除分类')}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              props.onFolders(await jamCall('folders-edit', { action: 'delete', id: folder.id }));
              setAction(null);
              onDeleted();
            } catch (error) {
              props.onError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            {tr('删除分类')} · {folder.name}
          </h2>
          <p>{tr('只删除分类，里面的内容会回到默认分类，音频和录音保留。')}</p>
          <footer>
            <button
              className="nr-btn"
              type="button"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              {tr('取消')}
            </button>
            <button className="nr-btn result-delete-confirm" type="submit" disabled={busy}>
              {tr('删除分类')}
            </button>
          </footer>
        </form>
      </ModalFrame>
    </>
  );
}
