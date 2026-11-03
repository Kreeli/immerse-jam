import Select from '../../shared/Select';
import { jamCall } from '../../platform/project-call';
import { isAndroid } from '../../platform/environment';
import { FolderOpen, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t as tr, message as translateMessage } from '../../i18n';
import type { Project } from '../../shared/types';
import ModalFrame from '../../shared/ModalFrame';
export default function ResultPicker({
  project,
  onProject,
  onError,
  loading,
  compact = false,
}: {
  project: Project;
  onProject: (project: Project) => void;
  onError: (message: string) => void;
  loading: boolean;
  compact?: boolean;
}) {
  const result = project.results?.find((item) => item.id === project.activeResultId);
  const [renaming, setRenaming] = useState(false),
    [savingName, setSavingName] = useState(false),
    [name, setName] = useState('');
  useEffect(() => {
    setRenaming(false);
    setName(result?.name || '');
  }, [result?.id, result?.name]);
  return (
    <div className={'result-picker nr-result-picker' + (compact ? ' compact-result' : '')}>
      <label>
        {tr('分离结果')}
        <Select
          menu
          title={result?.name}
          aria-label={tr('当前分离结果')}
          disabled={loading}
          value={project.activeResultId || ''}
          onChange={(event) =>
            void jamCall<Project>('result-select', {
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
              {item.name.replace(/ · 六轨(?:兼容)? · 完整六轨$/, ' · 完整六轨')} ·{' '}
              {item.tracks.length}
              {tr('轨')}
            </option>
          ))}
        </Select>
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
        {!isAndroid && (
          <button
            className="small"
            title={result ? tr('打开分离结果文件夹') : tr('打开项目文件夹')}
            onClick={() =>
              void jamCall('result-open', { id: project.id, resultId: result?.id }).catch((error) =>
                onError(error.message),
              )
            }
          >
            <FolderOpen size={12} />
            {result ? tr('结果文件夹') : tr('项目文件夹')}
          </button>
        )}
      </div>
      {renaming && result && (
        <ModalFrame
          open
          label={tr('重命名分离结果')}
          onClose={() => !savingName && setRenaming(false)}
          className="metadata-dialog result-name-dialog"
        >
          <form
            role={isAndroid ? undefined : 'dialog'}
            aria-label={tr('重命名分离结果')}
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingName(true);
              try {
                onProject(
                  await jamCall<Project>('result-rename', {
                    id: project.id,
                    resultId: result.id,
                    name,
                  }),
                );
                setRenaming(false);
              } catch (error) {
                onError((error as Error).message);
              } finally {
                setSavingName(false);
              }
            }}
          >
            <h2>{tr('重命名分离结果')}</h2>
            <label>
              {tr('分离结果名称')}
              <input
                aria-label={tr('分离结果名称')}
                value={name}
                maxLength={120}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <footer>
              <button
                className="nr-btn"
                type="button"
                disabled={savingName}
                onClick={() => setRenaming(false)}
              >
                {tr('取消')}
              </button>
              <button
                className="nr-btn nr-primary"
                disabled={savingName || !name.trim()}
                type="submit"
              >
                {tr('保存名称')}
              </button>
            </footer>
          </form>
        </ModalFrame>
      )}
      {result && (
        <small className="result-origin">
          {translateMessage(result.modelName)} · {new Date(result.createdAt).toLocaleDateString()}
        </small>
      )}
    </div>
  );
}
