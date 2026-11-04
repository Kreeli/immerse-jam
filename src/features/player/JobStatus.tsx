import { LoaderCircle, X } from 'lucide-react';
import { jamCall } from '../../platform/project-call';
import { t as tr, message as translateMessage } from '../../i18n';
import type { JamEvent } from '../../shared/types';

// Stage boundaries, rather than invented inference percentages. A long-running
// stage keeps its activity animation until the worker reports the next stage.
export default function JobStatus({
  job,
  onError,
}: {
  job: JamEvent;
  onError: (message: string) => void;
}) {
  const labels =
    job.operation === 'separate'
      ? [tr('准备模型'), tr('分离音轨'), tr('校验音轨'), tr('保存结果')]
      : job.operation === 'analyze'
        ? [tr('准备音频'), tr('提取特征'), tr('识别节拍'), tr('识别调性')]
        : [tr('准备'), tr('处理中…'), tr('校验'), tr('保存结果')];
  const progress = job.progress || 0;
  const stage =
    job.operation === 'separate'
      ? progress < 0.15
        ? 0
        : progress < 0.92
          ? 1
          : progress < 0.98
            ? 2
            : 3
      : job.operation === 'analyze'
        ? progress < 0.12
          ? 0
          : progress < 0.4
            ? 1
            : progress < 0.65
              ? 2
              : 3
        : progress < 0.1
          ? 0
          : progress < 0.9
            ? 1
            : progress < 0.98
              ? 2
              : 3;
  const title =
    job.operation === 'separate'
      ? tr('本地音轨分离')
      : job.operation === 'analyze'
        ? tr('分析音乐')
        : job.operation === 'align'
          ? tr('自动对齐乐谱')
          : tr('本地处理');
  return (
    <div className="task-status" role="status" aria-label={title}>
      <LoaderCircle size={15} className="spin" aria-hidden="true" />
      <div className="task-summary">
        <div className="task-heading">
          <strong>{title}</strong>
          <span>
            {stage + 1}/4 · {labels[stage]}
          </span>
        </div>
        <div className="task-stages" aria-hidden="true">
          {labels.map((label, index) => (
            <i
              key={label + index}
              data-state={index < stage ? 'done' : index === stage ? 'active' : 'waiting'}
            />
          ))}
        </div>
        <small>{translateMessage(job.message || '') || tr('处理中…')}</small>
      </div>
      {job.jobId && (
        <button
          className="nr-icon-btn nr-sm"
          aria-label={tr('取消任务')}
          onClick={() =>
            void jamCall('cancel', { jobId: job.jobId }).catch((error) => onError(error.message))
          }
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
