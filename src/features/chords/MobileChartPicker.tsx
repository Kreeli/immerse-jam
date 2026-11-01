import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { ChordChart } from '../../shared/types';
import { t as tr } from '../../i18n';
export default function MobileChartPicker({
  charts,
  automatic,
  value,
  onChoose,
  onDelete,
  onNew,
}: {
  charts: ChordChart[];
  automatic: boolean;
  value: string;
  onChoose: (id: string) => void;
  onDelete: (chart: ChordChart) => void;
  onNew: () => void;
}) {
  const name = charts.find((c) => c.id === value)?.name || tr('最新识别结果');
  return (
    <Menu.Root>
      <Menu.Trigger
        className="mobile-select-trigger mobile-chart-picker"
        aria-label={tr('当前和弦谱')}
      >
        <span>{name}</span>
        <ChevronDown size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="mobile-select-menu mobile-chart-list"
          sideOffset={6}
          collisionPadding={12}
          align="start"
        >
          {automatic && (
            <Menu.Item className="mobile-select-option" onSelect={() => onChoose('auto')}>
              {tr('最新识别结果')}
              {value === 'auto' && <Check size={15} />}
            </Menu.Item>
          )}
          {charts.map((chart) => (
            <div className="mobile-chart-choice" key={chart.id}>
              <Menu.Item className="mobile-select-option" onSelect={() => onChoose(chart.id)}>
                {chart.name}
                {value === chart.id && <Check size={15} />}
              </Menu.Item>
              <Menu.Item
                className="mobile-chart-delete"
                aria-label={tr('删除和弦谱 {0}', [chart.name])}
                onSelect={() => onDelete(chart)}
              >
                <Trash2 size={16} />
              </Menu.Item>
            </div>
          ))}
          <Menu.Separator className="mobile-menu-separator" />
          <Menu.Item className="mobile-select-option mobile-chart-new" onSelect={onNew}>
            <Plus size={17} />
            {tr('新建和弦谱')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
