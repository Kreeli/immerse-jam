import { useState } from 'react';
import ModalFrame from './ModalFrame';
import { t as tr } from '../i18n';

export default function NameDialog({
  name,
  onSave,
  onClose,
}: {
  name: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <ModalFrame open onClose={onClose} className="metadata-dialog" label={tr('重命名音轨')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) {
            onSave(value.trim());
            onClose();
          }
        }}
      >
        <h2>{tr('重命名音轨')}</h2>
        <label>
          {tr('音轨名称')}
          <input
            aria-label={tr('音轨名称')}
            autoFocus
            maxLength={120}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <footer>
          <button className="nr-btn" type="button" onClick={onClose}>
            {tr('取消')}
          </button>
          <button className="nr-btn nr-primary" type="submit" disabled={!value.trim()}>
            {tr('保存')}
          </button>
        </footer>
      </form>
    </ModalFrame>
  );
}
