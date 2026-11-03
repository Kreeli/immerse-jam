import { Guitar, Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import type { FolderProps } from '../library/Folders';
import ProjectMenu from '../library/ProjectMenu';
import RehearsalCover from '../../shared/RehearsalCover';
export default function PracticeHub({
  library,
  onOpen,
  onCreate,
  onDelete,
  folders,
  onFolders,
  onError,
  onEdit,
}: {
  library: Project[];
  onOpen: (project: Project) => void;
  onCreate: (kind: 'practice' | 'creation') => void;
  onDelete: (project: Project) => void;
  onEdit: (project: Project) => void;
} & FolderProps) {
  const [filter, setFilter] = useState<'all' | 'practice' | 'creation'>('all');
  const sessions = library.filter(
    (project) => project.kind && (filter === 'all' || project.kind === filter),
  );
  return (
    <>
      <header className="library-header">
        <div>
          <div className="eyebrow">IMMERSE JAM</div>
          <h1>{tr('跟练/创作')}</h1>
          <p>{tr('选择跟练，或用多轨叠录开始创作。')}</p>
        </div>
        <div className="header-actions">
          <button onClick={() => onCreate('practice')}>
            <Guitar size={17} />
            {tr('新建跟练')}
          </button>
          <button className="primary" onClick={() => onCreate('creation')}>
            <Plus size={17} />
            {tr('新建创作')}
          </button>
        </div>
      </header>
      <div className="session-tabs" role="group" aria-label={tr('内容类型')}>
        {(
          [
            { id: 'all', label: tr('全部') },
            { id: 'practice', label: tr('跟练') },
            { id: 'creation', label: tr('创作') },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            aria-pressed={filter === tab.id}
            className={filter === tab.id ? 'selected' : ''}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {!sessions.length ? (
        <div className="empty library-empty">
          <div className="empty-disc">
            <Layers size={42} />
          </div>
          <h2>{tr('开始跟练或创作')}</h2>
          <p>{tr('跟练可选音乐库里的分轨歌曲；创作可从空白或源歌曲开始。')}</p>
        </div>
      ) : (
        <div className="session-list">
          <table className="session-table">
            <thead>
              <tr>
                <th>{tr('名称')}</th>
                <th>{tr('类型')}</th>
                <th>{tr('跟练方式')}</th>
                <th>{tr('录音')}</th>
                <th>{tr('最近修改')}</th>
                <th>{tr('操作')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((project) => (
                <tr className="session-row" key={project.id} onDoubleClick={() => onOpen(project)}>
                  <td>
                    <button className="session-title" onClick={() => onOpen(project)}>
                      <RehearsalCover id={project.id} cover={project.cover} size={38} />
                      <span>
                        <strong>{project.title}</strong>
                        {project.description && (
                          <small className="project-description" title={project.description}>
                            {project.description}
                          </small>
                        )}
                        <small>
                          {project.sessionSource
                            ? tr('源歌曲：{0}', [project.sessionSource.title])
                            : tr('空白创作')}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="session-badge">
                      {project.kind === 'practice' ? tr('跟练') : tr('创作')}
                    </span>
                  </td>
                  <td>
                    {project.kind === 'practice'
                      ? project.practiceMode === 'mixed'
                        ? tr('录音含伴奏')
                        : tr('分轨伴奏')
                      : '—'}
                  </td>
                  <td>{project.takes?.length || 0}</td>
                  <td>
                    <time dateTime={project.updatedAt}>
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </time>
                  </td>
                  <td>
                    <div className="session-row-actions">
                      <ProjectMenu
                        project={project}
                        folders={folders}
                        onFolders={onFolders}
                        onError={onError}
                        onOpen={onOpen}
                        onDelete={onDelete}
                        onEdit={onEdit}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
