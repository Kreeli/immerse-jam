import Select from '../../shared/Select';
import { jamCall } from '../../platform/project-call';
import { Folder, Search } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import { time, type Project, type ProjectFolder } from '../../shared/types';
import CoverPicker from '../../shared/CoverPicker';
import RehearsalCover from '../../shared/RehearsalCover';
import ModalFrame from '../../shared/ModalFrame';
import ProjectCard from './ProjectCard';
import { isAndroid } from '../../platform/environment';
import LayoutPicker from './LayoutPicker';
import { usePreferences } from '../../app/preferences';
export interface FolderProps {
  folders: ProjectFolder[];
  onFolders: (folders: ProjectFolder[]) => void;
  onError: (message: string) => void;
}
export function FolderPicker({
  project,
  folders,
  onFolders,
  onError,
}: FolderProps & { project: Project }) {
  return (
    <Select
      menu
      className="folder-picker"
      aria-label={tr('移动到分类 {0}', [project.title])}
      value={folders.find((folder) => folder.projectIds.includes(project.id))?.id || ''}
      onChange={(event) =>
        void jamCall<ProjectFolder[]>('folders-edit', {
          action: 'move',
          id: event.target.value,
          projectId: project.id,
        })
          .then(onFolders)
          .catch((error) => onError(error.message))
      }
    >
      <option value="">{tr('默认分类')}</option>
      {folders.map((folder) => (
        <option value={folder.id} key={folder.id}>
          {folder.name}
        </option>
      ))}
    </Select>
  );
}
export function FolderDialog({
  folder,
  onClose,
  ...props
}: FolderProps & { folder?: ProjectFolder; onClose: () => void }) {
  const [name, setName] = useState(folder?.name || ''),
    [cover, setCover] = useState(folder?.cover || ''),
    [imageBusy, setImageBusy] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <ModalFrame
      open
      label={folder ? tr('编辑分类') : tr('新建分类')}
      onClose={() => !busy && onClose()}
      className="metadata-dialog"
    >
      <form
        className="folder-dialog"
        role={isAndroid ? undefined : 'dialog'}
        aria-label={folder ? tr('编辑分类') : tr('新建分类')}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void jamCall<ProjectFolder[]>('folders-edit', {
            action: folder ? 'rename' : 'create',
            id: folder?.id,
            name,
            cover,
          })
            .then((value) => {
              props.onFolders(value);
              onClose();
            })
            .catch((error) => props.onError(error.message))
            .finally(() => setBusy(false));
        }}
      >
        <h2>{folder ? tr('编辑分类') : tr('新建分类')}</h2>
        <CoverPicker value={cover} onChange={setCover} onBusyChange={setImageBusy} folder />
        <label>
          {tr('分类名称')}
          <input
            autoFocus
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p className="muted">{tr('同一分类可以放入分轨、跟练与创作。')}</p>
        <div className="header-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            {tr('取消')}
          </button>
          <button className="primary" disabled={busy || imageBusy || !name.trim()}>
            {tr('保存')}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
export default function FolderPage({
  id,
  library,
  onOpen,
  onDelete,
  onEdit,
  ...props
}: FolderProps & {
  id: string;
  library: Project[];
  onOpen: (project: Project) => void;
  onDelete: (project: Project) => void;
  onEdit: (project: Project) => void;
}) {
  const { libraryLayout } = usePreferences();
  const folder = props.folders.find((item) => item.id === id),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all');
  const projects = library.filter(
    (project) =>
      (folder
        ? folder.projectIds.includes(project.id)
        : !props.folders.some((item) => item.projectIds.includes(project.id))) &&
      (filter === 'all' || (project.kind || 'music') === filter) &&
      (project.title + ' ' + project.artist)
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <section className="folder-page nr-page">
        <div className="nr-page-inner">
          <header className="library-header nr-page-head">
            <div>
              <div className="eyebrow">IMMERSE JAM</div>
              <h1>
                {folder?.cover ? (
                  <RehearsalCover id={folder.id} cover={folder.cover} folder size={40} />
                ) : (
                  <Folder size={28} />
                )}
                {folder?.name || tr('默认分类')}
                <span>{tr('{0} 项内容', [projects.length])}</span>
              </h1>
              <p>{tr('分类收纳分轨、跟练与创作，文件保持独立。')}</p>
            </div>
          </header>
          <div className="library-tools nr-lib-tools folder-tools">
            <label className="nr-search">
              <Search size={16} />
              <input
                className="nr-input"
                aria-label={tr('搜索歌曲、跟练与创作')}
                placeholder={tr('搜索歌曲、跟练与创作')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="folder-view-tools">
              <LayoutPicker />
              <Select
                menu
                aria-label={tr('内容类型')}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">{tr('全部')}</option>
                <option value="music">{tr('分轨歌曲')}</option>
                <option value="practice">{tr('跟练')}</option>
                <option value="creation">{tr('创作')}</option>
              </Select>
            </div>
          </div>
          <div className="folder-project-list songs nr-lib-grid" data-layout={libraryLayout}>
            {projects.length ? (
              projects.map((project) => (
                <ProjectCard
                  {...props}
                  key={project.id}
                  project={project}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            ) : (
              <div className="empty">
                <Folder size={38} />
                <h3>{tr('这个分类还没有内容')}</h3>
                <p>{tr('在音乐库或跟练／创作列表的分类菜单中移动内容。')}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
