import { CircleHelp, ArrowDownUp, Settings, Share2 } from 'lucide-react';
import type { WorkspaceController } from '../../app/useWorkspace';
import { t as tr } from '../../i18n';
export default function MobileActions({ controller: c }: { controller: WorkspaceController }) {
  return (
    <div className="mobile-actions">
      <button
        className="icon-button"
        aria-label={tr('设备互传')}
        onClick={() => {
          c.setSelected(c.project ? [c.project.id] : []);
          c.setModal('transfer');
        }}
      >
        <Share2 size={19} />
      </button>
      <button
        className="icon-button"
        aria-label={tr('导入与导出')}
        disabled={c.recording}
        onClick={() => c.setModal('files')}
      >
        <ArrowDownUp size={19} />
      </button>
      <button
        className="icon-button"
        aria-label={tr('第一次使用？')}
        onClick={() => c.setModal('help')}
      >
        <CircleHelp size={19} />
      </button>
      <button
        className="icon-button"
        aria-label={tr('设置')}
        onClick={() => c.setModal('settings')}
      >
        <Settings size={19} />
      </button>
    </div>
  );
}
