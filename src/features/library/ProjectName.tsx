import { useEffect, useState } from 'react';
import { t as tr } from '../../i18n';
export default function ProjectName({
  name,
  onName,
}: {
  name: string;
  onName: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  if (!editing)
    return (
      <strong title={tr('双击编辑项目名称')} onDoubleClick={() => setEditing(true)}>
        {name}
      </strong>
    );
  const apply = () => {
    if (draft.trim()) onName(draft.trim().slice(0, 120));
    else setDraft(name);
    setEditing(false);
  };
  return (
    <input
      className="project-name-editor"
      aria-label={tr('项目名称')}
      autoFocus
      value={draft}
      maxLength={120}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(name);
          setEditing(false);
        }
      }}
    />
  );
}
