import { Guitar, Layers, Plus } from 'lucide-react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
export default function CreateFromSong({
  project,
  onCreate,
}: {
  project: Project;
  onCreate: (kind: 'practice' | 'creation') => void;
}) {
  return (
    <div className="create-from-song">
      <Menu.Root>
        <Menu.Trigger
          className="nr-btn nr-sm"
          aria-label={tr('以这首歌创建')}
          title={tr('以这首歌创建')}
        >
          <Plus size={15} />
          {tr('以这首歌创建')}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="nr-action-menu" align="end" sideOffset={6} collisionPadding={12}>
            <Menu.Item
              disabled={!project.results?.some((result) => result.tracks.length)}
              title={tr('选择已分轨的歌曲开始跟练')}
              onSelect={() => onCreate('practice')}
            >
              <Guitar size={16} />
              {tr('跟练')}
            </Menu.Item>
            <Menu.Item onSelect={() => onCreate('creation')}>
              <Layers size={16} />
              {tr('创作')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
