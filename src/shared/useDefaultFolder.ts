import { usePreferences } from '../app/preferences';
import { t as tr } from '../i18n';
import type { ProjectFolder } from './types';

/** The unfiled collection is a system view; only its local appearance is editable. */
export function useDefaultFolder(): ProjectFolder {
  const { defaultFolderName, defaultFolderCover } = usePreferences();
  return {
    id: 'unfiled',
    name: defaultFolderName || tr('默认分类'),
    cover: defaultFolderCover,
    projectIds: [],
  };
}
