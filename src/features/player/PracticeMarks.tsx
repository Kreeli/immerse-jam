import { Bookmark, Pencil, Repeat2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { t as tr } from '../../i18n';
import { time, type Bookmark as Mark } from '../../shared/types';
function MarkRow({
  mark,
  range,
  active,
  onJump,
  onRename,
  onDelete,
}: {
  mark: Mark;
  range: boolean;
  active: boolean;
  onJump: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(mark.title);
  return (
    <div className={'practice-mark-row ' + (active ? 'active-mark' : '')} data-mark-id={mark.id}>
      <button
        className="mark-jump"
        aria-label={tr('跳到{0} {1}', [range ? tr('循环段落') : tr('标记点'), mark.title])}
        onClick={onJump}
        onDoubleClick={() => {
          setName(mark.title);
          setEditing(true);
        }}
      >
        {range ? <Repeat2 size={13} /> : <Bookmark size={13} />}
        <strong>{mark.title}</strong>
        <small>
          {time(mark.start)}
          {range ? ' → ' + time(mark.end!) : ''}
        </small>
        {active && <span>{tr('循环中')}</span>}
      </button>
      <button
        className="icon-button"
        aria-label={tr('重命名{0} {1}', [range ? tr('循环段落') : tr('标记点'), mark.title])}
        onClick={() => {
          setName(mark.title);
          setEditing(true);
        }}
      >
        <Pencil size={13} />
      </button>
      <button
        className="icon-button"
        aria-label={tr('删除{0} {1}', [range ? tr('循环段落') : tr('标记点'), mark.title])}
        onClick={onDelete}
      >
        <Trash2 size={13} />
      </button>
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onRename(name.trim().slice(0, 80));
            setEditing(false);
          }}
        >
          <input
            aria-label={range ? tr('循环段落名称') : tr('标记点名称')}
            autoFocus
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
            }}
          />
          <button className="small primary" type="submit">
            {tr('保存名称')}
          </button>
          <button className="small" type="button" onClick={() => setEditing(false)}>
            {tr('取消')}
          </button>
        </form>
      )}
    </div>
  );
}
export default function PracticeMarks({
  marks,
  tab,
  onTab,
  activeId,
  onJump,
  onRename,
  onDelete,
}: {
  marks: Mark[];
  tab: 'ranges' | 'points';
  onTab: (tab: 'ranges' | 'points') => void;
  activeId: string | null;
  onJump: (mark: Mark) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const isRange = (mark: Mark) => Number.isFinite(mark.end) && mark.end! > mark.start;
  const ranges = marks.filter(isRange),
    points = marks.filter((mark) => !isRange(mark)),
    visible = tab === 'ranges' ? ranges : points;
  return (
    <div className="practice-marks">
      <div className="practice-marks-tabs">
        <button className={tab === 'ranges' ? 'selected' : ''} onClick={() => onTab('ranges')}>
          <Repeat2 size={13} />
          {tr('循环段落')}
          <small>{ranges.length}</small>
        </button>
        <button className={tab === 'points' ? 'selected' : ''} onClick={() => onTab('points')}>
          <Bookmark size={13} />
          {tr('标记点')}
          <small>{points.length}</small>
        </button>
      </div>
      <div className="practice-marks-list">
        {visible.map((mark) => (
          <MarkRow
            key={mark.id}
            mark={mark}
            range={tab === 'ranges'}
            active={activeId === mark.id}
            onJump={() => onJump(mark)}
            onRename={(name) => onRename(mark.id, name)}
            onDelete={() => onDelete(mark.id)}
          />
        ))}
        {!visible.length && (
          <p>
            {tab === 'ranges'
              ? tr('点击一次设置循环段落开始，再点击一次设置结束，段落会自动保存。')
              : tr('播放到需要的位置，点击“添加标记点”即可保存。')}
          </p>
        )}
      </div>
    </div>
  );
}
