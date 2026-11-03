import { useState } from 'react';
import { X } from 'lucide-react';
import { t as tr, message } from '../../i18n';
import { jamCall } from '../../platform/project-call';
import { isAndroid } from '../../platform/environment';
import type { Project } from '../../shared/types';
import CoverPicker from '../../shared/CoverPicker';
import ModalFrame from '../../shared/ModalFrame';

export default function ProjectDetails({
  project,
  onClose,
  onSaved,
  beforeSave,
}: {
  project: Project;
  onClose: () => void;
  onSaved: (project: Project) => void;
  beforeSave: () => Promise<void>;
}) {
  const [title, setTitle] = useState(project.title),
    [artist, setArtist] = useState(project.artist || ''),
    [description, setDescription] = useState(project.description || ''),
    [cover, setCover] = useState(project.cover || ''),
    [busy, setBusy] = useState(false),
    [imageBusy, setImageBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <ModalFrame
      open
      onClose={() => !busy && onClose()}
      className="metadata-dialog"
      label={tr('编辑项目')}
    >
      <form
        role={isAndroid ? undefined : 'dialog'}
        aria-label={tr('编辑项目')}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await beforeSave();
            const updated = await jamCall<Project>('update', {
              id: project.id,
              patch: {
                title: title.trim(),
                artist: artist.trim(),
                description: description.trim(),
                cover,
              },
            });
            onSaved(updated);
            onClose();
          } catch (e) {
            setError(message((e as Error).message));
          } finally {
            setBusy(false);
          }
        }}
      >
        <header>
          <h2>{tr('编辑项目')}</h2>
          <button
            type="button"
            className="nr-icon-btn"
            disabled={busy}
            aria-label={tr('关闭窗口')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <CoverPicker value={cover} onChange={setCover} onBusyChange={setImageBusy} />
        <label>
          {tr('项目名称')}
          <input
            autoFocus
            value={title}
            maxLength={120}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {tr('艺术家')}
          <input value={artist} maxLength={120} onChange={(e) => setArtist(e.target.value)} />
        </label>
        <label>
          {tr('简介')}
          <textarea
            value={description}
            maxLength={2000}
            rows={4}
            placeholder={tr('记录这首歌或这次创作的故事…')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" className="nr-btn" disabled={busy} onClick={onClose}>
            {tr('取消')}
          </button>
          <button className="nr-btn nr-primary" disabled={busy || imageBusy || !title.trim()}>
            {busy ? tr('保存中…') : tr('保存')}
          </button>
        </footer>
      </form>
    </ModalFrame>
  );
}
