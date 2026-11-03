import Select from '../../shared/Select';
import { setPreferences, usePreferences } from '../../app/preferences';
import { t as tr } from '../../i18n';
export default function LayoutPicker() {
  const { libraryLayout } = usePreferences();
  return (
    <Select
      menu
      className="layout-picker"
      aria-label={tr('显示布局')}
      value={libraryLayout}
      onChange={(e) => setPreferences({ libraryLayout: e.target.value as 'grid' | 'list' })}
    >
      <option value="list">{tr('列表视图')}</option>
      <option value="grid">{tr('方格视图')}</option>
    </Select>
  );
}
