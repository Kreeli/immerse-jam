import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import AnalysisMeta from '../analysis/AnalysisMeta';
import ProjectName from './ProjectName';
import { FolderPicker, type FolderProps } from './Folders';
export default function ProjectHeading({
  project,
  onProject,
  ...folders
}: {
  project: Project;
  onProject: (project: Project) => void;
} & FolderProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      className="now-title"
      onContextMenu={(event) => {
        event.preventDefault();
        setEditing(!editing);
      }}
    >
      <ProjectName name={project.title} onName={(title) => onProject({ ...project, title })} />
      <AnalysisMeta project={project} onProject={onProject} />
      {editing && (
        <div className="playlist-editor">
          <label>
            {tr('分类文件夹')}
            <FolderPicker
              {...folders}
              project={project}
              onFolders={(value) => {
                folders.onFolders(value);
                setEditing(false);
              }}
            />
          </label>
          <button className="small" type="button" onClick={() => setEditing(false)}>
            {tr('取消')}
          </button>
        </div>
      )}
    </div>
  );
}
