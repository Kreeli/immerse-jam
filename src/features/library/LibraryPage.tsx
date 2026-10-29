import {
  ArrowRight,
  ChevronRight,
  Mic2,
  Music2,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  Waves,
} from 'lucide-react';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import { time } from '../../shared/types';
import { FolderPicker } from './Folders';
const colors = ['#ed7894', '#d9a86c', '#91bda9', '#a092cd', '#7fa8d3', '#8e949d'];
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
>;
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
}: Props) {
  return (
    <>
      <header className="library-header">
        <div>
          <div className="eyebrow">YOUR PRACTICE SPACE</div>

          <h1>
            {page === 'starred'
              ? tr('我的收藏')
              : page.startsWith('playlist:')
                ? page.slice(9)
                : tr('音乐库')}

            <span>
              {songList.length}

              {tr('首歌曲')}
            </span>
          </h1>

          <p>{tr('拆开音乐，听清细节，把喜欢的段落练成自己的。')}</p>
        </div>

        <div className="header-actions">
          <button onClick={() => setCreatingSession('creation')}>
            <Mic2 size={16} />

            {tr('新建创作')}
          </button>

          <button className="primary" onClick={() => void importSongs()}>
            <Plus size={18} />

            {tr('导入音乐')}
          </button>
        </div>
      </header>

      <div className="library-tools">
        <label className="search">
          <Search size={17} />

          <input
            placeholder={tr('搜索歌曲、艺术家…')}

            value={query}

            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <span>{tr('支持拖入音频、视频、.aum 或 .ijam 项目')}</span>
      </div>

      {!songList.length ? (
        <div className="empty library-empty">
          <div className="empty-disc">
            <Music2 size={46} />
          </div>

          <h2>{query ? tr('没有匹配的歌曲') : tr('从你想练的一首歌开始')}</h2>

          <p>{tr('导入音乐，在本机分离音轨，循环、慢放、对照乐谱。')}</p>

          <button className="primary" onClick={() => void importSongs()}>
            <Upload size={17} />

            {tr('选择音乐文件')}
          </button>

          <button className="text-button" onClick={() => setModal('migration')}>
            {tr('已有 Audio Jam 曲库？迁移歌曲')}

            <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="songs">
          {songList.map((p, i) => (
            <article key={p.id} className="song" onDoubleClick={() => openProject(p)}>
              <button
                className="song-cover"

                style={{ '--cover': colors[i % colors.length] } as React.CSSProperties}

                onClick={() => openProject(p)}
              >
                <Music2 size={30} />

                <span className="cover-play">
                  <Play size={20} fill="currentColor" />
                </span>
              </button>

              <button className="song-info" onClick={() => openProject(p)}>
                <strong>{p.broken ? tr('歌曲数据需要恢复') : p.title}</strong>

                <span>
                  {p.artist || tr('本地音乐')}
                  <i />{' '}
                  {p.kind === 'creation'
                    ? tr('{0} 条录音', [p.takes?.length || 0])
                    : p.tracks.length
                      ? tr('{0} 条分轨', [p.tracks.length])
                      : tr('原曲')}
                </span>

                <div className="mini-wave">
                  {Array.from({ length: 32 }, (_, j) => (
                    <i
                      key={j}

                      style={{ height: 6 + Math.abs(Math.sin((i + 1) * (j + 1) * 2.1)) * 17 }}
                    />
                  ))}
                </div>
              </button>

              <div className="song-right">
                <button
                  className={'icon-button ' + (p.starred ? 'starred' : '')}

                  aria-label={tr('收藏歌曲')}

                  onClick={() =>
                    void act(async () => {
                      const updated = await window.jam.call<Project>('update', {
                        id: p.id,

                        patch: { starred: !p.starred },
                      });

                      setLibrary((list) => list.map((x) => (x.id === p.id ? updated : x)));
                    })
                  }
                >
                  <Star size={16} fill={p.starred ? 'currentColor' : 'none'} />
                </button>

                <span>{time(p.duration)}</span>
                <FolderPicker
                  project={p}
                  folders={folders}
                  onFolders={setFolders}
                  onError={notify}
                />
                <button
                  className="icon-button"
                  aria-label={tr('删除歌曲 {0}', [p.title])}
                  title={tr('删除歌曲')}
                  onClick={() => setDeletingProject(p)}
                >
                  <Trash2 size={15} />
                </button>

                <button
                  className="icon-button"

                  aria-label={tr('打开歌曲')}

                  onClick={() => openProject(p)}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="library-footer">
        <span>
          <Waves size={16} />

          {tr('本地分轨 \u00B7 同步乐谱 \u00B7 自由练习')}
        </span>

        <button onClick={() => setModal('settings')}>
          {tr('管理模型')}

          <ChevronRight size={14} />
        </button>
      </div>
    </>
  );
}
