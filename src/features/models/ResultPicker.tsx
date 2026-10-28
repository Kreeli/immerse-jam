import { FolderOpen, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t as tr, message as translateMessage } from '../../i18n';
import type { Project } from '../../shared/types';
export default function ResultPicker({
  project,
  onProject,
  onError,
  loading,
}: {
  project: Project;
  onProject: (project: Project) => void;
  onError: (message: string) => void;
  loading: boolean;
}) {
  const result = project.results?.find((item) => item.id === project.activeResultId);
  const [renaming, setRenaming] = useState(false),
    [name, setName] = useState('');
  useEffect(() => {
    setRenaming(false);
    setName(result?.name || '');
  }, [result?.id, result?.name]);
  return (
    <div className="result-picker">
      <label>
        {tr('分离结果')}
        <select
          aria-label={tr('当前分离结果')}
          disabled={loading}
          value={project.activeResultId || ''}
          onChange={(event) =>
            void window.jam
              .call<Project>('result-select', {
                id: project.id,
                resultId: event.target.value || null,
              })
              .then(onProject)
              .catch((error) => onError(error.message))
          }
        >
          <option value="">{tr('原曲')}</option>
          {project.results?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.tracks.length}
              {tr('轨')}
            </option>
          ))}
        </select>
      </label>
      <div className="result-actions">
        {result && (
          <button
            className="small"
            title={tr('重命名分离结果')}
            onClick={() => setRenaming(!renaming)}
          >
            <Pencil size={12} />
            {tr('重命名')}
          </button>
        )}
        <button
          className="small"
          title={result ? tr('打开分离结果文件夹') : tr('打开项目文件夹')}
          onClick={() =>
            void window.jam
              .call('result-open', { id: project.id, resultId: result?.id })
              .catch((error) => onError(error.message))
          }
        >
          <FolderOpen size={12} />
          {result ? tr('结果文件夹') : tr('项目文件夹')}
        </button>
      </div>
      {renaming && result && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void window.jam
              .call<Project>('result-rename', { id: project.id, resultId: result.id, name })
              .then(onProject)
              .catch((error) => onError(error.message));
          }}
        >
          <input
            aria-label={tr('分离结果名称')}
            value={name}
            maxLength={120}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button className="small primary" type="submit">
            {tr('保存名称')}
          </button>
        </form>
      )}
      {result && (
        <small className="result-origin">
          {translateMessage(result.modelName)} · {new Date(result.createdAt).toLocaleDateString()}
        </small>
      )}
    </div>
  );
}
