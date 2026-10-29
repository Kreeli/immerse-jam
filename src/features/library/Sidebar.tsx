import {
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
} from 'lucide-react';
import appIcon from '../../../assets/app-icon.png';
import { version } from '../../../package.json';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';
type Props = Pick<
  WorkspaceController,
  | 'page'
  | 'library'
  | 'project'
  | 'ready'
  | 'showPlayer'
  | 'setShowPlayer'
  | 'setPage'
  | 'setSelected'
  | 'setModal'
  | 'folders'
>;
export default function Sidebar({
  page,
  library,
  project,
  ready,
  showPlayer,
  setShowPlayer,
  setPage,
  setSelected,
  setModal,
  folders,
  onCreateFolder,
}: Props & { onCreateFolder: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src={appIcon} alt="Immerse Jam" />
        </div>

        <div>
          Immerse <span>Jam</span>
          <small>{tr('沉浸在每一段音乐里')}</small>
        </div>
      </div>

      <div className="nav-label">{tr('你的音乐空间')}</div>

      <nav>
        {[
          { id: 'library', label: tr('音乐库'), icon: Library },

          { id: 'practice', label: tr('练琴模式'), icon: Guitar },

          { id: 'starred', label: tr('我的收藏'), icon: Star },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-label={label}

            className={page === id && !showPlayer ? 'active' : ''}

            onClick={() => {
              setShowPlayer(false);

              setPage(id);
            }}
          >
            <Icon size={18} />

            {label}

            {id === 'library' && (
              <span className="count">{library.filter((item) => !item.kind).length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="nav-label folder-nav-heading">
        {tr('分类文件夹')}
        <button
          className="icon-button"
          aria-label={tr('新建分类')}
          title={tr('新建分类')}
          onClick={onCreateFolder}
        >
          <FolderPlus size={16} />
        </button>
      </div>

      <nav className="playlist-nav">
        {[{ id: 'unfiled', name: tr('未分类'), projectIds: [] }, ...folders].map((folder) => (
          <button
            key={folder.id}
            className={page === 'folder:' + folder.id && !showPlayer ? 'active' : ''}

            onClick={() => {
              setShowPlayer(false);

              setPage('folder:' + folder.id);
            }}
          >
            <Folder size={16} />

            <span>{folder.name}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <div className="nav-label">{tr('设备与工具')}</div>

      <nav>
        <button
          onClick={() => {
            setSelected(project ? [project.id] : []);

            setModal('transfer');
          }}
        >
          <Share2 size={18} />

          {tr('设备互传')}
        </button>

        <button onClick={() => setModal('migration')}>
          <FolderInput size={18} />

          {tr('迁移 Audio Jam')}
        </button>

        <button onClick={() => setModal('settings')}>
          <Settings size={18} />

          {tr('设置与模型')}
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button className="feedback-button" onClick={() => setModal('feedback')}>
          <MessageSquare size={16} />
          {tr('用户反馈')}
        </button>
        <div className="local-note">
          <span className={'dot ' + (ready ? 'green-dot' : '')} />

          <div>
            {ready ? tr('本地引擎就绪') : tr('本地引擎待准备')}

            <small>{tr('音乐留在你的设备上')}</small>
          </div>
        </div>

        <button className="donate" onClick={() => setModal('donate')}>
          <Heart size={17} />

          {tr('支持作者')}

          <span>↗</span>
        </button>

        <small className="version">IMMERSE JAM · {version}</small>
      </div>
    </aside>
  );
}
