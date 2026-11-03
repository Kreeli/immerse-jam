import RehearsalCover from '../../shared/RehearsalCover';
import MobileActions from './MobileActions';
import { time } from '../../shared/types';
import { Guitar, Layers, Plus, Share2, Trash2, Search } from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';
import ProjectMenu from '../../features/library/ProjectMenu';
import MobileFolders from './MobileFolders';
import { keyLabel } from '../../features/analysis/transposition';

export default function MobileHome({ controller: c }: { controller: WorkspaceController }) {
  const [filter, setFilter] = useState('all'),
    [folder, setFolder] = useState('all');
  const projects = c.library
    .filter(
      (p) =>
        (filter === 'all' || (p.kind || 'practice') === filter) &&
        (folder === 'all' ||
          (folder
            ? c.folders.find((f) => f.id === folder)?.projectIds.includes(p.id)
            : !c.folders.some((f) => f.projectIds.includes(p.id)))) &&
        (p.title + ' ' + p.artist).toLowerCase().includes(c.query.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section className="mobile-home nr-m-home">
      <div className="mobile-home-top nr-m-top">
        <strong className="mobile-home-brand">Immerse Jam</strong>
        <MobileActions controller={c} />
      </div>
      <label className="mobile-search nr-search">
        <Search size={17} />
        <input
          aria-label={tr('搜索项目')}
          placeholder={tr('搜索项目')}
          value={c.query}
          onChange={(e) => c.setQuery(e.target.value)}
        />
      </label>
      <div className="mobile-library-tools">
        <div className="session-tabs nr-seg">
          {[
            ['all', '全部'],
            ['practice', '跟练'],
            ['creation', '创作'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? 'selected' : ''}
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        <MobileFolders
          folders={c.folders}
          onFolders={c.setFolders}
          onError={c.notify}
          value={folder}
          onChange={setFolder}
        />
      </div>
      <div className="mobile-projects">
        {projects.map((p) => (
          <article key={p.id} className="nr-m-card">
            <button className="mobile-project-open" onClick={() => c.openProject(p)}>
              <RehearsalCover id={p.id} size={52} cover={p.cover} />
              <span>
                <strong>{p.title}</strong>
                {p.description && (
                  <small className="project-description" title={p.description}>
                    {p.description}
                  </small>
                )}
                <small>
                  {p.artist || (p.kind === 'creation' ? tr('创作') : tr('跟练'))} ·{' '}
                  {time(p.duration)}
                </small>
                {p.analysis && (
                  <small>
                    {p.analysis.bpm ? `${Math.round(p.analysis.bpm * 100) / 100} BPM` : '— BPM'} ·{' '}
                    {keyLabel(p.analysis.key)}
                  </small>
                )}
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={tr('分享 {0}', [p.title])}
              onClick={() => {
                c.setSelected([p.id]);
                c.setModal('transfer');
              }}
            >
              <Share2 size={18} />
            </button>
            <ProjectMenu
              project={p}
              folders={c.folders}
              onFolders={c.setFolders}
              onError={c.notify}
              onEdit={c.setEditingProject}
              onOpen={c.openProject}
              onDelete={c.setDeletingProject}
            />
          </article>
        ))}
      </div>
      <button
        className="mobile-new-project"
        aria-label={tr('新建创作')}
        onClick={() => c.setCreatingSession('creation')}
      >
        <Plus size={24} />
      </button>
    </section>
  );
}
