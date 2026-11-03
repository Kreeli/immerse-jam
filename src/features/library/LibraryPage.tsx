import { jamCall } from '../../platform/project-call';
import {
  ArrowRight,
  ChevronRight,
  Mic2,
  Music2,
  Play,
  Plus,
  Search,
  Star,
  Upload,
  Waves,
  Folder,
} from 'lucide-react';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';
import { time, type Project } from '../../shared/types';
import RehearsalCover from '../../shared/RehearsalCover';
import { trackColor } from '../../styles/palette';
import { keyLabel } from '../analysis/transposition';
import ProjectMenu from './ProjectMenu';
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
          <span className="nr-hint">
            <Upload size={14} />
            {tr('支持拖入音频、视频、.aum 或 .ijam 项目')}
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
          <div className="songs nr-lib-grid">
            {songList.map((p) => {
              const folder = folders.find((f) => f.projectIds.includes(p.id));
              return (
                <article className="song nr-song" key={p.id} onDoubleClick={() => openProject(p)}>
                  <button
                    className="nr-open-hit"
                    aria-label={tr('打开 {0}', [p.title])}
                    onClick={() => openProject(p)}
                  />
                  <RehearsalCover id={p.id} cover={p.cover} />
                  <div className="nr-song-copy">
                    <h3 className="nr-ellipsis">{p.broken ? tr('歌曲数据需要恢复') : p.title}</h3>
                    <div className="nr-meta nr-ellipsis">{p.artist || tr('本地音乐')}</div>
                    {p.description && (
                      <div className="project-description nr-ellipsis" title={p.description}>
                        {p.description}
                      </div>
                    )}
                    <div className="nr-meta nr-mono">
                      {time(p.duration)}
                      {p.analysis
                        ? ` · ${Math.round(p.analysis.bpm * 10) / 10} BPM · ${keyLabel(p.analysis.key)}`
                        : ''}
                    </div>
                    <div className="nr-stems">
                      {p.tracks.map((t) => (
                        <i
                          key={t.id}
                          style={{ '--c': trackColor(t.name) } as React.CSSProperties}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="nr-foot">
                    <span className={'nr-chip ' + (p.tracks.length ? 'nr-ok' : 'nr-warn')}>
                      {p.tracks.length ? tr('{0} 条分轨', [p.tracks.length]) : tr('原曲')}
                    </span>
                    {folder && (
                      <span className="nr-chip">
                        <Folder size={12} />
                        {folder.name}
                      </span>
                    )}
                    <div className="nr-card-actions">
                      <button
                        className="nr-icon-btn nr-sm nr-fav"
                        aria-label={tr('收藏歌曲')}
                        aria-pressed={p.starred}
                        title={tr('收藏歌曲')}
                        onClick={() =>
                          void act(async () => {
                            const updated = await jamCall<Project>('update', {
                              id: p.id,
                              patch: { starred: !p.starred },
                            });
                            setLibrary((list) => list.map((x) => (x.id === p.id ? updated : x)));
                          })
                        }
                      >
                        <Star size={16} fill={p.starred ? 'currentColor' : 'none'} />
                      </button>
                      <ProjectMenu
                        project={p}
                        folders={folders}
                        onFolders={setFolders}
                        onError={notify}
                        onEdit={setEditingProject}
                        onDelete={setDeletingProject}
                        onOpen={openProject}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="library-footer nr-library-footer">
          <span>
            <Waves size={16} />
            {tr('本地分轨 · 同步乐谱 · 自由练习')}
          </span>
          <button className="nr-btn nr-ghost nr-sm" onClick={() => setModal('settings')}>
            {tr('管理模型')}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
