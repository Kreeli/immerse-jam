import { Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { t as tr, message as translateMessage } from '../../i18n';
import type { Model, ModelDownload } from '../../shared/types';
export type { ModelDownload } from '../../shared/types';
export default function ModelManager({
  models,
  downloads,
  onDownload,
}: {
  models: Model[];
  downloads: Record<string, ModelDownload>;
  onDownload: (id: string) => void;
}) {
  const names: Record<string, string> = {
    vocals: tr('人声'),
    drums: tr('鼓'),
    bass: tr('贝斯'),
    piano: tr('钢琴'),
    guitar: tr('吉他'),
    other: tr('其他'),
    lead: tr('主奏吉他'),
    rhythm: tr('节奏吉他'),
    lead_vocals: tr('主唱'),
    backing_vocals: tr('和声'),
  };
  return (
    <div className="model-list">
      {models.map((model) => {
        const state = downloads[model.id],
          loading = state?.status === 'progress';
        return (
          <div key={model.id} className="model-item">
            <div className="model-description">
              <strong>
                {translateMessage(model.name)}
                {model.recommended && <span className="recommend">{tr('推荐')}</span>}
              </strong>
              <p>{translateMessage(model.description)}</p>
              <small>
                {model.adapter === 'BeatThis'
                  ? tr('节拍 \u00B7 小节首拍 \u00B7 BPM')
                  : model.stems.map((stem) => names[stem] || stem).join(' · ')}
              </small>
              {loading && (
                <>
                  <progress
                    aria-label={tr('{0}下载进度', [model.name])}
                    max="1"
                    value={state.progress ?? undefined}
                  />
                  <span className="model-download-message">
                    {translateMessage(state.message || '') || tr('正在准备下载…')}
                  </span>
                </>
              )}
              {state?.status === 'error' && (
                <span className="model-download-error">
                  {translateMessage(state.message)}
                  {tr('，可点击重试继续下载。')}
                </span>
              )}
            </div>
            <div className="model-actions">
              <span className={'badge ' + (model.installed ? 'green' : '')}>
                {model.installed ? tr('已下载') : tr('未下载')}
              </span>
              {!model.custom && (
                <button
                  className={'small ' + (model.installed ? '' : 'primary')}
                  aria-label={`${translateMessage(model.name)}${model.installed ? tr('校验模型') : tr('下载模型')}`}
                  disabled={loading}
                  onClick={() => onDownload(model.id)}
                >
                  {loading ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : model.installed ? (
                    <RefreshCw size={14} />
                  ) : (
                    <Download size={14} />
                  )}{' '}
                  {loading
                    ? tr('下载 / 校验中…')
                    : state?.status === 'error'
                      ? tr('重试')
                      : model.installed
                        ? tr('校验模型')
                        : tr('下载模型')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
