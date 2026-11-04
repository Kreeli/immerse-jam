import { jamCall } from '../../platform/project-call';
import { ArrowRight, Mic2, Music2, Play, Plus, Search, Upload, Waves } from 'lucide-react';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';
import { time, type Project } from '../../shared/types';
import RehearsalCover from '../../shared/RehearsalCover';
import ProjectCard from './ProjectCard';
import LayoutPicker from './LayoutPicker';
import { usePreferences } from '../../app/preferences';
type Props = Pick<
  WorkspaceController,
  | 'page'
  | 'library'
  | 'query'
  | 'setQuery'
  | 'act'
  | 'openProject'
  | 'setCreatingSession'
  | 'setDeletingProject'
  | 'importSongs'
  | 'setModal'
  | 'setLibrary'
  | 'songList'
  | 'folders'
  | 'setFolders'
  | 'notify'
  | 'setEditingProject'
>;

// React adaptation of PR #6 libraryPage(): page-inner, real resume, lib-grid and card foot.
export default function LibraryPage({
  page,
  library,
  query,
  setQuery,
  act,
  openProject,
  setCreatingSession,
  setDeletingProject,
  importSongs,
  setModal,
  setLibrary,
  songList,
  folders,
  setFolders,
  notify,
  setEditingProject,
}: Props) {
  const { libraryLayout } = usePreferences();
  const recent = library
    .filter((p) => !p.kind && p.practice.lastPlayedAt)
    .sort((a, b) =>
      (b.practice.lastPlayedAt || '').localeCompare(a.practice.lastPlayedAt || ''),
    )[0];
  return (
    <section className="library-page nr-page">
      <div className="nr-page-inner">
        <header className="library-header nr-page-head">
          <div>
            <h1>
              {page === 'starred' ? tr('我的收藏') : tr('音乐库')}
              <span className="nr-library-count">
                {songList.length} {tr('首歌曲')}
              </span>
            </h1>
          </div>
        </header>
        {recent && page === 'library' && !query && (
          <div className="nr-resume">
            <RehearsalCover id={recent.id} size={52} cover={recent.cover} />
            <div className="nr-grow">
              <div className="nr-eyebrow">{tr('返回播放')}</div>
              <h3 className="nr-ellipsis">{recent.title}</h3>
              <div className="nr-row nr-dim nr-resume-meta">
                <span>{time(recent.duration)}</span>
                <span>·</span>
                <span>
                  {recent.bookmarks.length} {tr('标记点')}
                </span>
              </div>
            </div>
            <button className="nr-btn nr-primary" onClick={() => openProject(recent)}>
              <Play size={16} />
              {tr('播放')}
            </button>
          </div>
        )}
        <div className="library-tools nr-lib-tools">
          <label className="nr-search">
            <Search size={16} />
            <input
              className="nr-input"
              placeholder={tr('搜索歌曲、艺术家…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="nr-actions">
            <button className="nr-btn" onClick={() => setCreatingSession('creation')}>
              <Mic2 size={16} />
              {tr('新建创作')}
            </button>
            <button className="nr-btn nr-primary" onClick={() => void importSongs()}>
              <Plus size={18} />
              {tr('导入音乐')}
            </button>
          </div>
          <LayoutPicker />
          <span className="nr-hint" title={tr('支持拖入音频、视频、.aum 或 .ijam 项目')}>
            <Upload size={14} />
            <span className="drag-import-copy">{tr('支持拖入音频、视频、.aum 或 .ijam 项目')}</span>
          </span>
        </div>
        {!songList.length ? (
          <div className="empty nr-empty">
            <Music2 size={42} />
            <h3>{query ? tr('没有匹配的歌曲') : tr('从你想练的一首歌开始')}</h3>
            <p>{tr('导入音乐，在本机分离音轨，循环、慢放、对照乐谱。')}</p>
            <button className="nr-btn nr-primary" onClick={() => void importSongs()}>
              <Upload size={16} />
              {tr('选择音乐文件')}
            </button>
            <button className="nr-btn nr-ghost" onClick={() => setModal('migration')}>
              {tr('已有 Audio Jam 曲库？迁移歌曲')}
              <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div className="songs nr-lib-grid" data-layout={libraryLayout}>
            {songList.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                folders={folders}
                onFolders={setFolders}
                onError={notify}
                onOpen={openProject}
                onEdit={setEditingProject}
                onDelete={setDeletingProject}
                onFavorite={() =>
                  void act(async () => {
                    const updated = await jamCall<Project>('update', {
                      id: p.id,
                      patch: { starred: !p.starred },
                    });
                    setLibrary((list) => list.map((x) => (x.id === p.id ? updated : x)));
                  })
                }
              />
            ))}
          </div>
        )}
        <div className="library-footer nr-library-footer">
          <span>
            <Waves size={16} />
            {tr('本地分轨 · 同步乐谱 · 自由练习')}
          </span>
        </div>
      </div>
    </section>
  );
}
