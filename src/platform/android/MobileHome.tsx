import MobileActions from './MobileActions';
import { time } from '../../shared/types';
import { Guitar, Layers, Plus, Share2, Trash2, Search } from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';

export default function MobileHome({ controller: c }: { controller: WorkspaceController }) {
  const [filter, setFilter] = useState('all');
  const projects = c.library
    .filter(
      (p) =>
        (filter === 'all' || (p.kind || 'practice') === filter) &&
        (p.title + ' ' + p.artist).toLowerCase().includes(c.query.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section className="mobile-home">
      <div className="mobile-home-top">
        <strong className="mobile-home-brand">Immerse Jam</strong>
        <MobileActions controller={c} />
      </div>
      <label className="mobile-search">
        <Search size={17} />
        <input
          aria-label={tr('搜索项目')}
          placeholder={tr('搜索项目')}
          value={c.query}
          onChange={(e) => c.setQuery(e.target.value)}
        />
      </label>
      <div className="session-tabs">
        {[
          ['all', '全部'],
          ['practice', '跟练'],
          ['creation', '创作'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'selected' : ''}
            onClick={() => setFilter(id)}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      <div className="mobile-projects">
        {projects.map((p) => (
          <article key={p.id}>
            <button className="mobile-project-open" onClick={() => c.openProject(p)}>
              {p.kind === 'creation' ? <Layers size={24} /> : <Guitar size={24} />}
              <span>
                <strong>{p.title}</strong>
                <small>
                  {p.artist || (p.kind === 'creation' ? tr('创作') : tr('跟练'))} ·{' '}
                  {time(p.duration)}
                </small>
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
            <button
              className="icon-button"
              aria-label={tr('删除 {0}', [p.title])}
              onClick={() => c.setDeletingProject(p)}
            >
              <Trash2 size={17} />
            </button>
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
