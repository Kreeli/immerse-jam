import {
  CircleHelp,
  Folder,
  FolderPlus,
  MessageSquare,
  FolderInput,
  Guitar,
  Heart,
  Library,
  Settings,
  Share2,
  Star,
  AudioLines,
} from 'lucide-react';
import appIcon from '../../../assets/app-icon.png';
import { version } from '../../../package.json';
import { isAndroid, platformVersion } from '../../platform/environment';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';
import RehearsalCover from '../../shared/RehearsalCover';
type Props = Pick<
  WorkspaceController,
  | 'page'
  | 'library'
  | 'project'
  | 'ready'
  | 'checkingRuntime'
  | 'showPlayer'
  | 'setShowPlayer'
  | 'setPage'
  | 'setSelected'
  | 'setModal'
  | 'folders'
>;

// PR #6 navHTML(): the original nav-brand / nav-scroll / nav-foot composition.
export default function Sidebar({
  page,
  library,
  project,
  ready,
  checkingRuntime,
  showPlayer,
  setShowPlayer,
  setPage,
  setSelected,
  setModal,
  folders,
  onCreateFolder,
}: Props & { onCreateFolder: () => void }) {
  const navigate = (id: string) => {
    setShowPlayer(false);
    setPage(id);
  };
  return (
    <aside className="sidebar nr-nav" aria-label={tr('你的音乐空间')}>
      <div className="nr-nav-brand">
        <span className="nr-brandmark">
          <img src={appIcon} alt="" />
        </span>
        <b>
          Immerse <span>Jam</span>
        </b>
      </div>
      <div className="nr-nav-scroll">
        <nav className="nr-nav-group">
          {!isAndroid && (
            <button
              className="nr-nav-item"
              aria-label={tr('音乐库')}
              aria-current={page === 'library' && !showPlayer ? 'page' : undefined}
              title={tr('音乐库')}
              onClick={() => navigate('library')}
            >
              <Library size={18} />
              <span>{tr('音乐库')}</span>
              <span className="nr-badge-count">{library.filter((p) => !p.kind).length}</span>
            </button>
          )}
          <button
            className="nr-nav-item"
            aria-label={tr('跟练/创作')}
            aria-current={page === 'practice' && !showPlayer ? 'page' : undefined}
            title={tr('跟练/创作')}
            onClick={() => navigate('practice')}
          >
            <Guitar size={18} />
            <span>{tr('跟练/创作')}</span>
            <span className="nr-badge-count">{library.filter((p) => p.kind).length}</span>
          </button>
          {project && (
            <button
              className="nr-nav-item"
              aria-current={showPlayer ? 'page' : undefined}
              title={project.title}
              onClick={() => setShowPlayer(true)}
            >
              <AudioLines size={18} />
              <span className="nr-ellipsis">{project.title}</span>
            </button>
          )}
        </nav>
        {!isAndroid && (
          <div className="nr-nav-group nr-folder-list">
            <div className="nr-row">
              <span className="nr-eyebrow nr-grow">{tr('分类文件夹')}</span>
              <button
                className="nr-icon-btn nr-sm"
                aria-label={tr('新建分类')}
                title={tr('新建分类')}
                onClick={onCreateFolder}
              >
                <FolderPlus size={15} />
              </button>
            </div>
            <button
              className="nr-nav-item nr-sub"
              aria-current={page === 'starred' && !showPlayer ? 'page' : undefined}
              title={tr('我的收藏')}
              onClick={() => navigate('starred')}
            >
              <Star size={16} />
              <span>{tr('我的收藏')}</span>
              <span className="nr-badge-count">{library.filter((p) => p.starred).length}</span>
            </button>
            {[{ id: 'unfiled', name: tr('默认分类'), projectIds: [] }, ...folders].map((folder) => (
              <button
                key={folder.id}
                className="nr-nav-item nr-sub"
                aria-current={page === 'folder:' + folder.id && !showPlayer ? 'page' : undefined}
                title={folder.name}
                onClick={() => navigate('folder:' + folder.id)}
              >
                {'cover' in folder && folder.cover ? (
                  <RehearsalCover id={folder.id} size={18} cover={folder.cover} folder />
                ) : (
                  <Folder size={18} />
                )}
                <span className="nr-ellipsis">{folder.name}</span>
              </button>
            ))}
          </div>
        )}
        <nav className="nr-nav-group">
          <div className="nr-row">
            <span className="nr-eyebrow">{tr('设备与工具')}</span>
          </div>
          <button
            className="nr-nav-item"
            title={tr('设备互传')}
            onClick={() => {
              setSelected(project ? [project.id] : []);
              setModal('transfer');
            }}
          >
            <Share2 size={18} />
            <span>{tr('设备互传')}</span>
          </button>
          {!isAndroid && (
            <button
              className="nr-nav-item"
              title={tr('迁移 Audio Jam')}
              onClick={() => setModal('migration')}
            >
              <FolderInput size={18} />
              <span>{tr('迁移 Audio Jam')}</span>
            </button>
          )}
          <button
            className="nr-nav-item"
            title={tr('设置与模型')}
            onClick={() => setModal('settings')}
          >
            <Settings size={18} />
            <span>{tr('设置与模型')}</span>
          </button>
        </nav>
      </div>
      <div className="nr-nav-foot">
        <button className="nr-engine" onClick={() => setModal('settings')} title={tr('设置与模型')}>
          <span className="nr-pulse" style={{ background: ready ? 'var(--ok)' : 'var(--warn)' }} />
          <div>
            <b>
              {checkingRuntime
                ? tr('正在检查环境…')
                : ready
                  ? tr('本地引擎就绪')
                  : tr('本地引擎待准备')}
            </b>
            <small>{tr('音乐留在你的设备上')}</small>
          </div>
        </button>
        <div className="nr-nav-mini">
          <button
            className="nr-btn nr-ghost"
            title={tr('第一次使用？')}
            onClick={() => setModal('help')}
          >
            <CircleHelp size={16} />
            <span>{tr('第一次使用？')}</span>
          </button>
          <button
            className="nr-btn nr-ghost"
            title={tr('用户反馈')}
            onClick={() => setModal('feedback')}
          >
            <MessageSquare size={16} />
            <span>{tr('用户反馈')}</span>
          </button>
        </div>
        <button
          className="nr-donate"
          title={tr('请作者喝一瓶冰可乐')}
          onClick={() => setModal('donate')}
        >
          <Heart size={16} />
          <span className="donate-label">{tr('请作者喝一瓶冰可乐')}</span>
        </button>
        <div className="nr-ver">v{platformVersion || version}</div>
      </div>
    </aside>
  );
}
