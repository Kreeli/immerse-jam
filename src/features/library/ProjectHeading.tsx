import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import AnalysisMeta from '../analysis/AnalysisMeta';
import ProjectName from './ProjectName';
export default function ProjectHeading({
  project,
  onProject,
}: {
  project: Project;
  onProject: (project: Project) => void;
}) {
  const [editing, setEditing] = useState(false),
    [playlist, setPlaylist] = useState('');
  return (
    <div
      className="now-title"
      onContextMenu={(event) => {
        event.preventDefault();
        setPlaylist(project.playlist || '');
        setEditing(true);
      }}
    >
      <ProjectName name={project.title} onName={(title) => onProject({ ...project, title })} />
      <AnalysisMeta project={project} onProject={onProject} />
      {editing && (
        <form
          className="playlist-editor"
          onSubmit={(event) => {
            event.preventDefault();
            onProject({ ...project, playlist: playlist.trim() });
            setEditing(false);
          }}
        >
          <label>
            {tr('添加到歌单（留空移出歌单）')}
            <input
              aria-label={tr('歌单')}
              value={playlist}
              maxLength={120}
              autoFocus
              onChange={(event) => setPlaylist(event.target.value)}
            />
          </label>
          <button className="small primary" type="submit">
            {tr('保存')}
          </button>
          <button className="small" type="button" onClick={() => setEditing(false)}>
            {tr('取消')}
          </button>
        </form>
      )}
    </div>
  );
}
