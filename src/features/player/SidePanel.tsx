import type { ComponentProps, ReactNode } from 'react';
import { t as tr } from '../../i18n';
import PracticeMarks from './PracticeMarks';
export type PanelTab = 'mixer' | 'ranges' | 'points';
export default function SidePanel({
  tab,
  onTab,
  marks,
  mixer,
  recording,
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  marks: ComponentProps<typeof PracticeMarks>;
  mixer: ReactNode;
  recording: boolean;
}) {
  return (
    <aside className="mixer-shell">
      <div className="side-panel-selector">
        <select
          aria-label={tr('右侧面板')}
          value={tab}
          onChange={(event) => onTab(event.target.value as PanelTab)}
        >
          <option value="mixer">{tr('控制台')}</option>
          <option value="ranges">{tr('循环段落')}</option>
          <option value="points">{tr('标记点')}</option>
        </select>
      </div>
      {tab === 'mixer' ? (
        mixer
      ) : (
        <fieldset className="marks-panel" disabled={recording}>
          <PracticeMarks {...marks} tab={tab} embedded />
        </fieldset>
      )}
    </aside>
  );
}
