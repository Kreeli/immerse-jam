import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, Folder, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import { jamCall } from '../project-call';
import type { ProjectFolder } from '../../shared/types';
import RehearsalCover from '../../shared/RehearsalCover';
import ModalFrame from '../../shared/ModalFrame';
import { FolderDialog, type FolderProps } from '../../features/library/Folders';
import { useDefaultFolder } from '../../shared/useDefaultFolder';

export default function MobileFolders({
  value,
  onChange,
  ...props
}: FolderProps & { value: string; onChange: (id: string) => void }) {
  const defaultFolder = useDefaultFolder();
  const [manage, setManage] = useState(false),
    [editing, setEditing] = useState<ProjectFolder | null | undefined>(),
    [deleting, setDeleting] = useState<ProjectFolder | null>(null);
  const title =
    value === 'all'
      ? tr('分类')
      : props.folders.find((f) => f.id === value)?.name || defaultFolder.name;
  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="nr-btn mobile-folder-filter" aria-label={tr('筛选分类')}>
          <Folder size={17} />
          <span>{title}</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="nr-action-menu" align="end" sideOffset={6} collisionPadding={12}>
            {[
              { id: 'all', name: tr('全部'), projectIds: [] },
              { ...defaultFolder, id: '' },
              ...props.folders,
            ].map((f) => (
              <Menu.Item key={f.id} onSelect={() => onChange(f.id)}>
                <RehearsalCover
                  id={f.id}
                  size={22}
                  folder
                  cover={'cover' in f ? f.cover : undefined}
                />
                <span>{f.name}</span>
                {value === f.id && <Check size={15} className="menu-trailing" />}
              </Menu.Item>
            ))}
            <Menu.Separator />
            <Menu.Item onSelect={() => setManage(true)}>
              <Settings2 size={16} />
              {tr('管理分类')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <ModalFrame
        open={manage}
        onClose={() => setManage(false)}
        className="metadata-dialog"
        label={tr('管理分类')}
      >
        <header>
          <h2>{tr('管理分类')}</h2>
          <button
            className="nr-icon-btn"
            aria-label={tr('关闭窗口')}
            onClick={() => setManage(false)}
          >
            <X size={18} />
          </button>
        </header>
        <div className="folder-manager-list">
          {props.folders.map((f) => (
            <div key={f.id}>
              <RehearsalCover id={f.id} size={36} folder cover={f.cover} />
              <span>{f.name}</span>
              <button
                className="nr-icon-btn"
                aria-label={tr('编辑分类 {0}', [f.name])}
                onClick={() => {
                  setManage(false);
                  setEditing(f);
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                className="nr-icon-btn"
                aria-label={tr('删除分类 {0}', [f.name])}
                onClick={() => {
                  setManage(false);
                  setDeleting(f);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="nr-btn nr-primary"
          onClick={() => {
            setManage(false);
            setEditing(null);
          }}
        >
          <Plus size={16} />
          {tr('新建分类')}
        </button>
      </ModalFrame>
      {editing !== undefined && (
        <FolderDialog
          {...props}
          folder={editing || undefined}
          onClose={() => {
            setEditing(undefined);
            setManage(true);
          }}
        />
      )}
      <ModalFrame
        open={!!deleting}
        onClose={() => setDeleting(null)}
        className="metadata-dialog"
        label={tr('删除分类')}
      >
        <h2>{tr('删除分类')}</h2>
        <p>{tr('只删除分类，里面的内容会回到默认分类，音频和录音保留。')}</p>
        <footer>
          <button
            className="nr-btn"
            onClick={() => {
              setDeleting(null);
              setManage(true);
            }}
          >
            {tr('取消')}
          </button>
          <button
            className="nr-btn nr-primary"
            onClick={() =>
              void jamCall<ProjectFolder[]>('folders-edit', { action: 'delete', id: deleting?.id })
                .then((list) => {
                  props.onFolders(list);
                  if (value === deleting?.id) onChange('all');
                  setDeleting(null);
                  setManage(true);
                })
                .catch((e) => props.onError(e.message))
            }
          >
            {tr('删除分类')}
          </button>
        </footer>
      </ModalFrame>
    </>
  );
}
