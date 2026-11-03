import { Folder, Star } from 'lucide-react';
import RehearsalCover from '../../shared/RehearsalCover';
import { time, type Project } from '../../shared/types';
import { trackColor } from '../../styles/palette';
import { keyLabel } from '../analysis/transposition';
import { t as tr } from '../../i18n';
import { usePreferences } from '../../app/preferences';
import ProjectMenu from './ProjectMenu';
import type { FolderProps } from './Folders';
export default function ProjectCard({
  project: p,
  onOpen,
  onDelete,
  onEdit,
  onFavorite,
  folders,
  onFolders,
  onError,
}: FolderProps & {
  project: Project;
  onOpen: (p: Project) => void;
  onDelete: (p: Project) => void;
  onEdit: (p: Project) => void;
  onFavorite?: () => void;
}) {
  const { libraryLayout } = usePreferences();
  const folder = folders.find((f) => f.projectIds.includes(p.id));
  return (
    <article className="song nr-song" onDoubleClick={() => onOpen(p)}>
      <button
        className="nr-open-hit"
        aria-label={tr('打开 {0}', [p.title])}
        onClick={() => onOpen(p)}
      />
      <RehearsalCover id={p.id} cover={p.cover} size={libraryLayout === 'list' ? 44 : 64} />
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
            <i key={t.id} style={{ '--c': trackColor(t.name) } as React.CSSProperties} />
          ))}
        </div>
      </div>
      <div className="nr-foot">
        <span className={'nr-chip ' + (p.tracks.length ? 'nr-ok' : 'nr-warn')}>
          {p.kind === 'creation'
            ? tr('创作')
            : p.kind === 'practice'
              ? tr('跟练')
              : p.tracks.length
                ? tr('{0} 条分轨', [p.tracks.length])
                : tr('原曲')}
        </span>
        {folder && (
          <span className="nr-chip">
            <Folder size={12} />
            {folder.name}
          </span>
        )}
        <div className="nr-card-actions">
          {onFavorite && (
            <button
              className="nr-icon-btn nr-sm nr-fav"
              aria-label={tr('收藏歌曲')}
              aria-pressed={p.starred}
              title={tr('收藏歌曲')}
              onClick={onFavorite}
            >
              <Star size={16} fill={p.starred ? 'currentColor' : 'none'} />
            </button>
          )}
          <ProjectMenu
            project={p}
            folders={folders}
            onFolders={onFolders}
            onError={onError}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        </div>
      </div>
    </article>
  );
}
