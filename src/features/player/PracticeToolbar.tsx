import { Bookmark, Repeat2 } from 'lucide-react';
import { t as tr } from '../../i18n';
import { time } from '../../shared/types';
export default function PracticeToolbar({
  pendingRange,
  loop,
  onRange,
  onPoint,
  onStop,
  onCancel,
  recording,
  windowSeconds,
  onWindow,
}: {
  pendingRange: number | null;
  loop: boolean;
  onRange: () => void;
  onPoint: () => void;
  onStop: () => void;
  onCancel: () => void;
  recording: boolean;
  windowSeconds: number;
  onWindow: (seconds: number) => void;
}) {
  return (
    <div className="practice-toolbar">
      <button
        className={'range-capture ' + (pendingRange !== null ? 'recording-range' : '')}
        disabled={recording}
        onClick={onRange}
      >
        <Repeat2 size={14} />
        {pendingRange === null ? tr('设置循环段落开始') : tr('设置循环段落结束')}
      </button>
      {pendingRange !== null && (
        <>
          <small>
            {tr('开始于')}
            {time(pendingRange)}
          </small>
          <button className="text-button" onClick={onCancel}>
            {tr('取消选段')}
          </button>
        </>
      )}
      {loop && (
        <button className="text-button" onClick={onStop}>
          {tr('停止循环')}
        </button>
      )}
      <button className="text-button" onClick={onPoint}>
        <Bookmark size={14} />
        {tr('添加标记点')}
      </button>
      <label>
        {tr('时间窗口')}
        <select
          aria-label={tr('波形窗口时长')}
          value={windowSeconds}
          onChange={(event) => onWindow(+event.target.value)}
        >
          {[10, 20, 30, 60].map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}
              {tr('秒')}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
