import { ChevronRight, Guitar, Layers, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import { FolderPicker, type FolderProps } from '../library/Folders';
export default function PracticeHub({
  library,
  onOpen,
  onCreate,
  onDelete,
  folders,
  onFolders,
  onError,
}: {
  library: Project[];
  onOpen: (project: Project) => void;
  onCreate: (kind: 'practice' | 'creation') => void;
  onDelete: (project: Project) => void;
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
          <h1>{tr('练琴模式')}</h1>
          <p>{tr('选择跟练工程，或用多轨叠录开始创作。')}</p>
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
      <div className="session-tabs" role="group" aria-label={tr('工程类型')}>
        {(
          [
            { id: 'all', label: tr('全部工程') },
            { id: 'practice', label: tr('跟练模式') },
            { id: 'creation', label: tr('创作模式') },
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
          <h2>{tr('新建你的练琴工程')}</h2>
          <p>{tr('跟练可选音乐库里的分轨歌曲；创作可从空白或源歌曲开始。')}</p>
          <div className="header-actions">
            {filter !== 'creation' && (
              <button className="primary" onClick={() => onCreate('practice')}>
                {tr('新建跟练')}
              </button>
            )}
            {filter !== 'practice' && (
              <button onClick={() => onCreate('creation')}>{tr('新建创作')}</button>
            )}
          </div>
        </div>
      ) : (
        <div className="session-list">
          <table className="session-table">
            <thead>
              <tr>
                <th>{tr('工程名称')}</th>
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
                      {project.kind === 'practice' ? <Guitar size={19} /> : <Layers size={19} />}
                      <span>
                        <strong>{project.title}</strong>
                        <small>
                          {project.sessionSource
                            ? tr('源歌曲：{0}', [project.sessionSource.title])
                            : tr('空白工程')}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="session-badge">
                      {project.kind === 'practice' ? tr('跟练工程') : tr('创作工程')}
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
                      <FolderPicker
                        project={project}
                        folders={folders}
                        onFolders={onFolders}
                        onError={onError}
                      />
                      <button
                        className="icon-button"
                        aria-label={tr('打开工程 {0}', [project.title])}
                        onClick={() => onOpen(project)}
                      >
                        <ChevronRight size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={tr('删除工程 {0}', [project.title])}
                        title={tr('删除工程')}
                        onClick={() => onDelete(project)}
                      >
                        <Trash2 size={16} />
                      </button>
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
