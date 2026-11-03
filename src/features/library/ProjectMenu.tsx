import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  ChevronRight,
  Folder,
  MoreHorizontal,
  Pencil,
  Play,
  Share2,
  Trash2,
} from 'lucide-react';
import { t as tr } from '../../i18n';
import { jamCall } from '../../platform/project-call';
import type { Project, ProjectFolder } from '../../shared/types';
import type { FolderProps } from './Folders';
import RehearsalCover from '../../shared/RehearsalCover';

export default function ProjectMenu({
  project,
  folders,
  onFolders,
  onError,
  onEdit,
  onOpen,
  onDelete,
  onShare,
}: FolderProps & {
  project: Project;
  onEdit: (p: Project) => void;
  onOpen: (p: Project) => void;
  onDelete: (p: Project) => void;
  onShare?: (p: Project) => void;
}) {
  const folderId = folders.find((f) => f.projectIds.includes(project.id))?.id || '';
  const move = (id: string) =>
    void jamCall<ProjectFolder[]>('folders-edit', { action: 'move', id, projectId: project.id })
      .then(onFolders)
      .catch((e) => onError(e.message));
  return (
    <Menu.Root>
      <Menu.Trigger
        className="nr-icon-btn nr-sm project-menu-trigger"
        aria-label={tr('更多操作 {0}', [project.title])}
      >
        <MoreHorizontal size={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="nr-action-menu" align="end" sideOffset={6} collisionPadding={12}>
          <Menu.Item onSelect={() => onOpen(project)}>
            <Play size={16} />
            {tr('打开歌曲')}
          </Menu.Item>
          <Menu.Item onSelect={() => onEdit(project)}>
            <Pencil size={16} />
            {tr('编辑项目')}
          </Menu.Item>
          <Menu.Sub>
            <Menu.SubTrigger>
              <Folder size={16} />
              {tr('移动到分类')}
              <ChevronRight size={15} className="menu-trailing" />
            </Menu.SubTrigger>
            <Menu.Portal>
              <Menu.SubContent className="nr-action-menu" sideOffset={5} collisionPadding={12}>
                {[{ id: '', name: tr('默认分类'), projectIds: [] }, ...folders].map((f) => (
                  <Menu.Item key={f.id} onSelect={() => move(f.id)}>
                    <RehearsalCover
                      id={f.id}
                      cover={'cover' in f ? f.cover : undefined}
                      folder
                      size={22}
                    />
                    <span>{f.name}</span>
                    {folderId === f.id && <Check size={15} className="menu-trailing" />}
                  </Menu.Item>
                ))}
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>
          {onShare && (
            <Menu.Item onSelect={() => onShare(project)}>
              <Share2 size={16} />
              {tr('设备互传')}
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item className="menu-danger" onSelect={() => onDelete(project)}>
            <Trash2 size={16} />
            {tr('删除歌曲')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
