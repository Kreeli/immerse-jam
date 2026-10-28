import { File, Plus } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import { asset, type Project } from '../../shared/types';
export default function Attachments({
  project,
  onProject,
  onError,
}: {
  project: Project;
  onProject: (p: Project) => void;
  onError: (s: string) => void;
}) {
  const [active, setActive] = useState(project.attachments[0]?.id || '');
  const attachment = project.attachments.find((a) => a.id === active);
  return (
    <div className="attachment-panel">
      <div className="score-toolbar">
        <select value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="">{tr('选择附件')}</option>
          {project.attachments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          className="small"
          onClick={() =>
            void window.jam
              .call<Project>('attach', { id: project.id })
              .then(onProject)
              .catch((e) => onError(e.message))
          }
        >
          <Plus size={15} />
          {tr('添加附件')}
        </button>
      </div>
      {attachment && /\.(png|jpe?g|webp)$/i.test(attachment.name) ? (
        <img
          className="attachment-image"
          src={asset(project.id, attachment.file)}
          alt={attachment.name}
        />
      ) : attachment && /\.pdf$/i.test(attachment.name) ? (
        <iframe
          className="attachment-pdf"
          title={attachment.name}
          src={asset(project.id, attachment.file)}
        />
      ) : (
        <div className="attachment-hint">
          <File size={32} />
          <p>
            {attachment
              ? tr('Guitar Pro、MusicXML 与 MIDI 请在乐谱视图中打开。')
              : tr('可添加谱面图片、PDF、乐谱和练习资料。')}
          </p>
        </div>
      )}
      <div className="notes-area">
        <h3>{tr('练习便签')}</h3>
        <textarea
          placeholder={tr('记录指法、难点，或下次想练的内容…')}
          value={project.notes || ''}
          onChange={(e) => onProject({ ...project, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
