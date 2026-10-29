import { X } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
export default function SessionCreateDialog({
  library,
  kind,
  onClose,
  onCreated,
  onError,
  initialSource,
}: {
  library: Project[];
  kind: 'practice' | 'creation';
  onClose: () => void;
  onCreated: (project: Project) => void;
  onError: (message: string) => void;
  initialSource?: Project;
}) {
  const songs = library.filter(
    (project) =>
      !project.kind &&
      (kind === 'creation' || project.results?.some((result) => result.tracks.length)),
  );
  const [title, setTitle] = useState(''),
    [sourceId, setSourceId] = useState(
      initialSource?.id || (kind === 'practice' ? songs[0]?.id || '' : ''),
    ),
    [resultId, setResultId] = useState(''),
    [mode, setMode] = useState<'instrument' | 'mixed'>('instrument'),
    [busy, setBusy] = useState(false);
  const source = songs.find((song) => song.id === sourceId),
    results = source?.results || [],
    selectedResult = resultId || source?.activeResultId || results[0]?.id || '';
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const project = await window.jam.call<Project>('session-create', {
        kind,
        title:
          title.trim() ||
          (source
            ? `${source.title} · ${kind === 'practice' ? tr('跟练') : tr('创作')}`
            : kind === 'creation'
              ? tr('我的创作')
              : tr('我的跟练')),
        sourceId: sourceId || undefined,
        resultId: selectedResult || undefined,
        mode,
      });
      onCreated(project);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop session-create"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-label={kind === 'practice' ? tr('新建跟练') : tr('新建创作')}
      >
        <div className="modal-heading">
          <h2>{kind === 'practice' ? tr('新建跟练') : tr('新建创作')}</h2>
          <button
            className="icon-button"
            aria-label={tr('关闭新建窗口')}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="session-create-fields">
          <label>
            {tr('名称')}
            <input
              autoFocus
              aria-label={tr('名称')}
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={kind === 'practice' ? tr('我的跟练') : tr('我的创作')}
            />
          </label>
          <label>
            {tr('音乐库歌曲')}
            <select
              aria-label={tr('音乐库歌曲')}
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setResultId('');
              }}
            >
              {kind === 'creation' && <option value="">{tr('空白创作')}</option>}
              {songs.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title}
                </option>
              ))}
            </select>
          </label>
          {source && (
            <label>
              {tr('使用分离结果')}
              <select
                aria-label={tr('使用分离结果')}
                value={selectedResult}
                onChange={(event) => setResultId(event.target.value)}
              >
                {!results.length && <option value="">{tr('原曲')}</option>}
                {results.map((result) => (
                  <option key={result.id} value={result.id}>
                    {result.name} · {tr('{0} 条分轨', [result.tracks.length])}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'practice' && (
            <>
              <div className="recording-mode-options">
                <button
                  className={mode === 'instrument' ? 'selected' : ''}
                  onClick={() => setMode('instrument')}
                >
                  {tr('分轨伴奏')}
                </button>
                <button
                  className={mode === 'mixed' ? 'selected' : ''}
                  onClick={() => setMode('mixed')}
                >
                  {tr('录音含伴奏')}
                </button>
              </div>
              <p className="muted">
                {mode === 'instrument'
                  ? tr('录制乐器输入，回听时叠加可调节的伴奏分轨。')
                  : tr('录制已混入伴奏的输入，回听时默认仅播放录音。')}
              </p>
              {!songs.length && (
                <p role="status">{tr('音乐库中还没有已分轨的歌曲，请先导入并完成分轨。')}</p>
              )}
            </>
          )}
          <p className="muted">{tr('确认后建立独立跟练或创作，音乐库中的源歌曲保持不变。')}</p>
        </div>
        <div className="modal-actions">
          <button disabled={busy} onClick={onClose}>
            {tr('取消')}
          </button>
          <button
            className="primary"
            disabled={busy || (kind === 'practice' && !sourceId)}
            onClick={() => void submit()}
          >
            {busy ? tr('正在创建…') : tr('创建')}
          </button>
        </div>
      </section>
    </div>
  );
}
