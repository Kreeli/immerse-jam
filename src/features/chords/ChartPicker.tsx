import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ChordChart } from '../../shared/types';
import { t as tr } from '../../i18n';
export default function ChartPicker({
  charts,
  automatic,
  value,
  onChoose,
  onDelete,
  onRename,
  onNew,
}: {
  charts: ChordChart[];
  automatic: boolean;
  value: string;
  onChoose: (id: string) => void;
  onDelete: (chart: ChordChart) => void;
  onRename: (chart: ChordChart) => void;
  onNew: () => void;
}) {
  const name = charts.find((c) => c.id === value)?.name || tr('最新识别结果');
  return (
    <Menu.Root>
      <Menu.Trigger
        className="nr-choice-trigger mobile-select-trigger chart-picker"
        aria-label={tr('当前和弦谱')}
      >
        <span>{name}</span>
        <ChevronDown size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="nr-choice-menu mobile-select-menu chart-picker-menu"
          sideOffset={6}
          collisionPadding={12}
          align="start"
        >
          {automatic && (
            <Menu.Item
              className="nr-choice-option mobile-select-option"
              onSelect={() => onChoose('auto')}
            >
              {tr('最新识别结果')}
              {value === 'auto' && <Check size={15} />}
            </Menu.Item>
          )}
          {charts.map((chart) => (
            <div className="chart-picker-choice" key={chart.id}>
              <Menu.Item
                className="nr-choice-option mobile-select-option"
                onSelect={() => onChoose(chart.id)}
              >
                <span>{chart.name}</span>
                {value === chart.id && <Check size={15} />}
              </Menu.Item>
              <Menu.Item
                className="chart-picker-action"
                aria-label={tr('重命名和弦谱 {0}', [chart.name])}
                onSelect={() => onRename(chart)}
              >
                <Pencil size={15} />
              </Menu.Item>
              <Menu.Item
                className="chart-picker-action chart-picker-delete"
                aria-label={tr('删除和弦谱 {0}', [chart.name])}
                onSelect={() => onDelete(chart)}
              >
                <Trash2 size={16} />
              </Menu.Item>
            </div>
          ))}
          <Menu.Separator className="mobile-menu-separator" />
          <Menu.Item
            className="nr-choice-option mobile-select-option chart-picker-new"
            onSelect={onNew}
          >
            <Plus size={17} />
            {tr('新建和弦谱')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
