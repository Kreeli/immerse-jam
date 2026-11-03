import * as Dialog from '@radix-ui/react-dialog';
import type { ComponentProps, ReactNode } from 'react';
import { Bookmark, Repeat2, SlidersHorizontal, X } from 'lucide-react';
import { isAndroid } from '../../platform/environment';
import { t as tr } from '../../i18n';
import PracticeMarks from './PracticeMarks';
export type PanelTab = 'mixer' | 'ranges' | 'points';
export default function SidePanel({
  tab,
  onTab,
  marks,
  mixer,
  recording,
  onClose,
  open,
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  marks: ComponentProps<typeof PracticeMarks>;
  mixer: ReactNode;
  recording: boolean;
  onClose?: () => void;
  open?: boolean;
}) {
  const content = (
    <aside className="mixer-shell nr-console">
      {isAndroid ? (
        <div className="mobile-panel-tabs">
          {(
            [
              { id: 'mixer', icon: SlidersHorizontal, label: tr('控制台') },
              { id: 'ranges', icon: Repeat2, label: tr('循环段落') },
              { id: 'points', icon: Bookmark, label: tr('标记点') },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={tab === id ? 'selected' : ''}
              aria-selected={tab === id}
              onClick={() => onTab(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          <button className="icon-button" aria-label={tr('关闭控制台')} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      ) : (
        <div className="console-tabs nr-console-tabs" role="group" aria-label={tr('右侧面板')}>
          <div className="nr-seg nr-accent">
            {(
              [
                ['mixer', tr('控制台')],
                ['ranges', tr('循环段落')],
                ['points', tr('标记点')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                className={tab === id ? 'selected' : ''}
                aria-selected={tab === id}
                onClick={() => onTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'mixer' ? (
        mixer
      ) : (
        <fieldset className="marks-panel" disabled={recording}>
          <PracticeMarks {...marks} tab={tab} embedded />
        </fieldset>
      )}
    </aside>
  );
  if (!isAndroid) return content;
  return (
    <Dialog.Root open={!!open} onOpenChange={(value) => !value && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="mobile-dialog-overlay" />
        <Dialog.Content
          className="mobile-panel-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{tr('控制台')}</Dialog.Title>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
