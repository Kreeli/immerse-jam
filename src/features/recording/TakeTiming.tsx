import { useEffect, useState } from 'react';
import { t as tr } from '../../i18n';
import { time, type Take } from '../../shared/types';
export default function TakeTiming({
  take,
  onChange,
  onRemove,
  creation,
}: {
  take: Take;
  onChange: (patch: Partial<Take>) => void;
  onRemove: () => void;
  creation: boolean;
}) {
  const [offset, setOffset] = useState(String(take.offsetMs || 0)),
    [start, setStart] = useState(String(take.start || 0));
  useEffect(() => {
    setOffset(String(take.offsetMs || 0));
    setStart(String(take.start || 0));
  }, [take.offsetMs, take.start]);
  return (
    <div className="take-timing">
      <small>
        {take.mode === 'mixed' ? tr('含伴奏混音') : tr('演奏录音')} · {time(take.duration)}
      </small>
      <details>
        <summary>{tr('时间微调')}</summary>
        <label>
          {tr('开始位置（秒）')}
          <input
            aria-label={tr('{0}开始位置', [take.label || take.name])}
            type="number"
            step=".001"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            onBlur={() => {
              const value = Number(start);
              if (Number.isFinite(value) && Math.abs(value) <= 14400) onChange({ start: value });
            }}
          />
        </label>
        <label>
          {tr('向后偏移（毫秒）')}
          <input
            aria-label={tr('{0}时间偏移', [take.label || take.name])}
            type="number"
            step="1"
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
            onBlur={() => {
              const value = Number(offset);
              if (Number.isFinite(value) && Math.abs(value) <= 3600000)
                onChange({ offsetMs: value });
            }}
          />
        </label>
        <div>
          <button
            className="small"
            onClick={() => onChange({ offsetMs: (take.offsetMs || 0) - 10 })}
          >
            {tr('前移 10 ms')}
          </button>
          <button
            className="small"
            onClick={() => onChange({ offsetMs: (take.offsetMs || 0) + 10 })}
          >
            {tr('后移 10 ms')}
          </button>
        </div>
        <small>{tr('长度不足的部分自动留空；时间调整不裁切原文件。')}</small>
      </details>
      <button className="text-button" onClick={onRemove}>
        {creation ? tr('删除录音') : tr('移回录音库')}
      </button>
    </div>
  );
}
