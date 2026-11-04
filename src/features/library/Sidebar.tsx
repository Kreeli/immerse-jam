import { useState, useRef, useEffect } from 'react';
import { setPreferences, usePreferences } from '../../app/preferences';
import {
  PanelLeftClose,
  PanelLeftOpen,
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
import FolderActions from './FolderActions';
import { useDefaultFolder } from '../../shared/useDefaultFolder';
type Props = Pick<
  WorkspaceController,
  | 'page'
  | 'library'
  | 'project'
  | 'showPlayer'
  | 'setShowPlayer'
  | 'setPage'
  | 'setSelected'
  | 'setModal'
  | 'folders'
  | 'setFolders'
  | 'notify'
>;

// PR #6 navHTML(): the original nav-brand / nav-scroll / nav-foot composition.
export default function Sidebar({
  page,
  library,
  project,
  showPlayer,
  setShowPlayer,
  setPage,
  setSelected,
  setModal,
  folders,
  setFolders,
  notify,
  onCreateFolder,
}: Props & { onCreateFolder: () => void }) {
  const { sidebarCollapsed, sidebarWidth } = usePreferences();
  const defaultFolder = useDefaultFolder();
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ x: number; width: number; next: number } | null>(null);
  const finishResize = () => {
    if (!drag.current) return;
    setPreferences({ sidebarWidth: drag.current.next });
    drag.current = null;
    setResizing(false);
  };
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--sidebar-drag-width');
    },
    [],
  );
  const navigate = (id: string) => {
    setShowPlayer(false);
    setPage(id);
  };
  return (
    <aside data-resizing={resizing} className="sidebar nr-nav" aria-label={tr('你的音乐空间')}>
      <div className="nr-nav-brand">
        <span className="nr-brandmark">
          <img src={appIcon} alt="" />
        </span>
        <b>
          Immerse <span>Jam</span>
        </b>
        <button
          className="nr-icon-btn sidebar-collapse"
          aria-label={sidebarCollapsed ? tr('展开侧栏') : tr('收起侧栏')}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setPreferences({ sidebarCollapsed: !sidebarCollapsed })}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
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
            {[defaultFolder, ...folders].map((folder) => (
              <div
                className="sidebar-folder-row"
                data-current={page === 'folder:' + folder.id && !showPlayer}
                key={folder.id}
                onClick={(event) => {
                  if (event.target === event.currentTarget) navigate('folder:' + folder.id);
                }}
              >
                <button
                  className="nr-nav-item nr-sub"
                  aria-current={page === 'folder:' + folder.id && !showPlayer ? 'page' : undefined}
                  aria-label={folder.name}
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
                <FolderActions
                  folder={folder}
                  folders={folders}
                  onFolders={setFolders}
                  onError={notify}
                  onDeleted={() => {
                    if (page === 'folder:' + folder.id) navigate('folder:unfiled');
                  }}
                />
                <span className="nr-badge-count sidebar-folder-count">
                  {folder.id === 'unfiled'
                    ? library.filter((p) => !folders.some((f) => f.projectIds.includes(p.id)))
                        .length
                    : folder.projectIds.length}
                </span>
              </div>
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
        <div className="nr-nav-mini">
          <button
            className="nr-nav-item"
            aria-label={tr('第一次使用？')}
            title={tr('第一次使用？')}
            onClick={() => setModal('help')}
          >
            <CircleHelp size={18} />
            <span>{tr('第一次使用？')}</span>
          </button>
          <button
            className="nr-nav-item"
            title={tr('用户反馈')}
            onClick={() => setModal('feedback')}
          >
            <MessageSquare size={18} />
            <span>{tr('用户反馈')}</span>
          </button>
        </div>
        <button
          className="nr-nav-item"
          title={tr('请作者喝一瓶冰可乐')}
          onClick={() => setModal('donate')}
        >
          <Heart size={18} />
          <span>{tr('请作者喝一瓶冰可乐')}</span>
        </button>
        <div className="nr-ver">v{platformVersion || version}</div>
      </div>
      {!sidebarCollapsed && (
        <div
          className="sidebar-resize"
          role="separator"
          aria-label={tr('调整侧栏宽度')}
          aria-orientation="vertical"
          aria-valuemin={200}
          aria-valuemax={360}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              setPreferences({
                sidebarWidth: Math.max(
                  200,
                  Math.min(360, sidebarWidth + (e.key === 'ArrowLeft' ? -12 : 12)),
                ),
              });
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, width: sidebarWidth, next: sidebarWidth };
            setResizing(true);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            drag.current.next = Math.round(
              Math.max(
                200,
                Math.min(
                  360,
                  window.innerWidth - 560,
                  drag.current.width + e.clientX - drag.current.x,
                ),
              ),
            );
            document.documentElement.style.setProperty(
              '--sidebar-drag-width',
              drag.current.next + 'px',
            );
          }}
          onPointerUp={(e) => {
            finishResize();
            document.documentElement.style.removeProperty('--sidebar-drag-width');
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            finishResize();
            document.documentElement.style.removeProperty('--sidebar-drag-width');
          }}
          onLostPointerCapture={() => {
            finishResize();
            document.documentElement.style.removeProperty('--sidebar-drag-width');
          }}
        />
      )}
    </aside>
  );
}
