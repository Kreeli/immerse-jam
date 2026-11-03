import { LayoutGrid, List } from 'lucide-react';
import { setPreferences, usePreferences } from '../../app/preferences';
import { t as tr } from '../../i18n';
export default function LayoutPicker() {
  const { libraryLayout } = usePreferences();
  return (
    <div className="layout-switch" role="group" aria-label={tr('显示布局')}>
      <button
        className="nr-icon-btn nr-sm"
        title={tr('列表视图')}
        aria-label={tr('列表视图')}
        aria-pressed={libraryLayout === 'list'}
        onClick={() => setPreferences({ libraryLayout: 'list' })}
      >
        <List size={17} />
      </button>
      <button
        className="nr-icon-btn nr-sm"
        title={tr('方格视图')}
        aria-label={tr('方格视图')}
        aria-pressed={libraryLayout === 'grid'}
        onClick={() => setPreferences({ libraryLayout: 'grid' })}
      >
        <LayoutGrid size={17} />
      </button>
    </div>
  );
}
