import { ChevronRight, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project, ProjectFolder } from '../../shared/types';
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
    <select
      className="folder-picker"
      aria-label={tr('移动到分类 {0}', [project.title])}
      value={folders.find((folder) => folder.projectIds.includes(project.id))?.id || ''}
      onChange={(event) =>
        void window.jam
          .call<ProjectFolder[]>('folders-edit', {
            action: 'move',
            id: event.target.value,
            projectId: project.id,
          })
          .then(onFolders)
          .catch((error) => onError(error.message))
      }
    >
      <option value="">{tr('未分类')}</option>
      {folders.map((folder) => (
        <option value={folder.id} key={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  );
}
export function FolderDialog({
  folder,
  onClose,
  ...props
}: FolderProps & { folder?: ProjectFolder; onClose: () => void }) {
  const [name, setName] = useState(folder?.name || ''),
    [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop">
      <form
        className="modal folder-dialog"
        role="dialog"
        aria-label={folder ? tr('重命名分类') : tr('新建分类')}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void window.jam
            .call<ProjectFolder[]>('folders-edit', {
              action: folder ? 'rename' : 'create',
              id: folder?.id,
              name,
            })
            .then((value) => {
              props.onFolders(value);
              onClose();
            })
            .catch((error) => props.onError(error.message))
            .finally(() => setBusy(false));
        }}
      >
        <h2>{folder ? tr('重命名分类') : tr('新建分类')}</h2>
        <label>
          {tr('分类名称')}
          <input
            autoFocus
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p className="muted">{tr('同一分类可以放入分轨、跟练与创作工程。')}</p>
        <div className="header-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            {tr('取消')}
          </button>
          <button className="primary" disabled={busy || !name.trim()}>
            {tr('保存')}
          </button>
        </div>
      </form>
    </div>
  );
}
export default function FolderPage({
  id,
  library,
  onOpen,
  onDelete,
  onCreate,
  ...props
}: FolderProps & {
  id: string;
  library: Project[];
  onOpen: (project: Project) => void;
  onDelete: (project: Project) => void;
  onCreate: () => void;
}) {
  const folder = props.folders.find((item) => item.id === id),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
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
      <header className="library-header">
        <div>
          <div className="eyebrow">IMMERSE JAM</div>
          <h1>
            <Folder size={28} />
            {folder?.name || tr('未分类')}
            <span>{tr('{0} 个工程', [projects.length])}</span>
          </h1>
          <p>{tr('分类收纳分轨、跟练与创作，工程文件保持独立。')}</p>
        </div>
        <div className="header-actions">
          {folder && (
            <>
              <button onClick={() => setEditing(true)}>
                <Pencil size={16} />
                {tr('重命名')}
              </button>
              <button onClick={() => setDeleting(true)}>
                <Trash2 size={16} />
                {tr('删除分类')}
              </button>
            </>
          )}
          <button onClick={onCreate}>
            <FolderPlus size={16} />
            {tr('新建分类')}
          </button>
        </div>
      </header>
      <div className="library-tools">
        <input
          aria-label={tr('搜索工程')}
          placeholder={tr('搜索工程')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label={tr('工程类型')}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">{tr('全部工程')}</option>
          <option value="music">{tr('分轨工程')}</option>
          <option value="practice">{tr('跟练工程')}</option>
          <option value="creation">{tr('创作工程')}</option>
        </select>
      </div>
      <div className="folder-project-list">
        {projects.length ? (
          projects.map((project) => (
            <article className="folder-project" key={project.id}>
              <button className="folder-project-open" onClick={() => onOpen(project)}>
                <strong>{project.title}</strong>
                <small>
                  {project.kind === 'practice'
                    ? tr('跟练工程')
                    : project.kind === 'creation'
                      ? tr('创作工程')
                      : tr('分轨工程')}
                  {project.artist ? ' · ' + project.artist : ''}
                </small>
              </button>
              <FolderPicker {...props} project={project} />
              <button
                className="icon-button"
                aria-label={tr('删除工程 {0}', [project.title])}
                onClick={() => onDelete(project)}
              >
                <Trash2 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={tr('打开工程 {0}', [project.title])}
                onClick={() => onOpen(project)}
              >
                <ChevronRight size={19} />
              </button>
            </article>
          ))
        ) : (
          <div className="empty">
            <Folder size={38} />
            <h3>{tr('这个分类还没有工程')}</h3>
            <p>{tr('在音乐库或练琴列表的分类菜单中移动工程。')}</p>
          </div>
        )}
      </div>
      {editing && <FolderDialog {...props} folder={folder} onClose={() => setEditing(false)} />}
      {deleting && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-label={tr('删除分类')}>
            <h2>{tr('删除分类')}</h2>
            <p>{tr('只删除分类，里面的所有工程会回到未分类，音频和录音保留。')}</p>
            <div className="header-actions">
              <button onClick={() => setDeleting(false)}>{tr('取消')}</button>
              <button
                className="primary"
                onClick={() =>
                  void window.jam
                    .call<ProjectFolder[]>('folders-edit', { action: 'delete', id })
                    .then((value) => {
                      props.onFolders(value);
                      setDeleting(false);
                    })
                    .catch((error) => props.onError(error.message))
                }
              >
                {tr('删除分类')}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
