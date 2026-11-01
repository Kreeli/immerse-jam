import {
  SlidersHorizontal,
  Bookmark,
  Repeat2,
  X,
  MoreHorizontal,
  FolderOpen,
  Settings2,
} from 'lucide-react';
import { isAndroid } from '../../platform/environment';
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
  onMixer,
}: {
  pendingRange: number | null;
  loop: boolean;
  onRange: () => void;
  onPoint: () => void;
  onStop: () => void;
  onCancel: () => void;
  recording: boolean;
  onMixer?: () => void;
}) {
  if (isAndroid)
    return (
      <div className="mobile-practice-tools">
        <button className="icon-button" aria-label={tr('打开控制台')} onClick={onMixer}>
          <SlidersHorizontal size={22} />
        </button>
        <button
          className={'icon-button ' + (pendingRange !== null ? 'recording-range' : '')}
          aria-label={pendingRange === null ? tr('设置循环段落开始') : tr('设置循环段落结束')}
          title={pendingRange === null ? tr('设置循环段落开始') : tr('设置循环段落结束')}
          disabled={recording}
          onClick={onRange}
        >
          <Repeat2 size={22} />
          {pendingRange !== null && <i />}
        </button>
        <button
          className="icon-button"
          aria-label={tr('添加标记点')}
          disabled={recording}
          onClick={onPoint}
        >
          <Bookmark size={22} />
        </button>
        {(loop || pendingRange !== null) && (
          <button
            className="icon-button"
            aria-label={loop ? tr('停止循环') : tr('取消选段')}
            onClick={loop ? onStop : onCancel}
          >
            <X size={18} />
          </button>
        )}
        <details className="mobile-tools-menu">
          <summary role="button" aria-label={tr('更多工具')}>
            <MoreHorizontal size={20} />
          </summary>
          <div>
            <button
              disabled={recording}
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                window.dispatchEvent(
                  new CustomEvent('immerse-recorder-action', { detail: 'settings' }),
                );
              }}
            >
              <Settings2 size={17} />
              {tr('录音设置')}
            </button>
            <button
              disabled={recording}
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                window.dispatchEvent(
                  new CustomEvent('immerse-recorder-action', { detail: 'library' }),
                );
              }}
            >
              <FolderOpen size={17} />
              {tr('录音库')}
            </button>
          </div>
        </details>
      </div>
    );
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
    </div>
  );
}
