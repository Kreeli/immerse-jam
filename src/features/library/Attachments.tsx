import AttachmentPicker from './AttachmentPicker';
import { File } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t as tr } from '../../i18n';
import { asset, type Project } from '../../shared/types';
export default function Attachments({
  project,
  onProject,
  onNotes,
  onNotesBlur,
  onError,
}: {
  project: Project;
  onProject: (p: Project) => void;
  onNotes: (p: Project) => void;
  onNotesBlur: () => void;
  onError: (s: string) => void;
}) {
  const [active, setActive] = useState(project.attachments[0]?.id || '');
  useEffect(() => {
    setActive((id) =>
      project.attachments.some((a) => a.id === id) ? id : project.attachments[0]?.id || '',
    );
  }, [project.id, project.attachments]);
  const attachment = project.attachments.find((a) => a.id === active);
  return (
    <div className="attachment-panel">
      <div className="score-toolbar">
        <AttachmentPicker
          project={project}
          items={project.attachments}
          value={active}
          onChoose={setActive}
          onProject={onProject}
          onError={onError}
        />
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
          onChange={(e) => onNotes({ ...project, notes: e.target.value })}
          onBlur={onNotesBlur}
        />
      </div>
    </div>
  );
}
