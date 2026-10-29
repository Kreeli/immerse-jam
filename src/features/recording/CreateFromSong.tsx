import { Plus } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
export default function CreateFromSong({
  project,
  onCreate,
}: {
  project: Project;
  onCreate: (kind: 'practice' | 'creation') => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="create-from-song">
      <button className="small" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Plus size={15} />
        {tr('以这首歌创建')}
      </button>
      {open && (
        <div className="create-song-menu">
          <button
            disabled={!project.results?.some((result) => result.tracks.length)}
            title={tr('选择已分轨的歌曲开始跟练')}
            onClick={() => {
              setOpen(false);
              onCreate('practice');
            }}
          >
            {tr('跟练')}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onCreate('creation');
            }}
          >
            {tr('创作')}
          </button>
        </div>
      )}
    </div>
  );
}
