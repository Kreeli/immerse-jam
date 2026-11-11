import { useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { WorkspaceController } from '../../app/useWorkspace';
import type { Model } from '../../shared/types';
import Select from '../../shared/Select';
import ModalFrame from '../../shared/ModalFrame';
import { jamCall } from '../../platform/project-call';
import ModelManager from '../models/ModelManager';
import DownloadSettings from './DownloadSettings';
import { t as tr, message } from '../../i18n';
export default function ModelsSettings({ controller: c }: { controller: WorkspaceController }) {
  const [checking, setChecking] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false),
    [filter, setFilter] = useState('all');
  const blocked = c.installing || c.recording || !!c.job;
  const preparationLog = c.runtimeMessage
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const check = async () => {
    setChecking(true);
    setError('');
    try {
      const value = await jamCall('runtime-status');
      c.setReady(value.ready);
      setStatus(value.ready ? tr('运行环境可用') : tr('运行环境尚未准备好'));
    } catch (e) {
      setError(message((e as Error).message));
    } finally {
      setChecking(false);
    }
  };
  const install = async () => {
    setConfirm(false);
    setError('');
    c.setInstalling(true);
    try {
      await jamCall('runtime-install', { mode: c.runtimeMode });
    } catch (e) {
      c.setInstalling(false);
      setError(message((e as Error).message));
    }
  };
  const download = (id: string) => {
    c.setModelDownloads((old) => ({
      ...old,
      [id]: { status: 'progress', progress: 0, message: tr('正在准备下载…') },
    }));
    void jamCall<Model[]>('model-download', { id })
      .then(c.setModels)
      .catch((e) => {
        c.setModelDownloads((old) => ({
          ...old,
          [id]: { ...old[id], status: 'error', message: e.message },
        }));
        c.notify(tr('模型下载未完成，可重试继续下载'));
      });
  };
  return (
    <div className="settings-stack">
      <section className="settings-card">
        {(c.job || c.recording) && <p className="notice">{tr('请先停止录音并等待当前任务完成')}</p>}
        <div className="settings-card-heading">
          <h3>{tr('运行环境')}</h3>
          <span className={'settings-status ' + (c.ready ? 'is-ready' : '')}>
            {checking || c.checkingRuntime
              ? tr('检查中')
              : c.installing
                ? tr('准备中…')
                : c.ready
                  ? tr('就绪')
                  : tr('待准备')}
          </span>
        </div>
        <p className="muted">{tr('检查只读取当前状态。安装或修复需要单独确认。')}</p>
        <div className="settings-runtime-check">
          <button disabled={blocked || checking || c.checkingRuntime} onClick={() => void check()}>
            {checking ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{' '}
            {tr('检查运行环境')}
          </button>
          <small role="status">{status}</small>
        </div>
        <div className="settings-maintenance">
          <label className="settings-row">
            <span>
              <strong>{tr('运行库安装模式')}</strong>
              <small>{tr('更改此选项不会启动安装。')}</small>
            </span>
            <Select
              aria-label={tr('运行库安装模式')}
              value={c.runtimeMode}
              disabled={blocked || checking}
              onChange={(e) => c.setRuntimeMode(e.target.value)}
            >
              <option value="cuda">{tr('NVIDIA 显卡加速')}</option>
              <option value="cpu">{tr('CPU 通用兼容')}</option>
            </Select>
          </label>
          <DownloadSettings disabled={blocked} />
          <p className="muted">
            {tr('首次下载CPU约1–2GB，NVIDIA约3–5GB，模型另计；已有下载会复用。')}
          </p>
          <button
            disabled={blocked || checking || c.checkingRuntime}
            onClick={() => setConfirm(true)}
          >
            {tr('准备 / 修复运行库')}
          </button>
        </div>
        {preparationLog && (
          <details className="settings-runtime-details">
            <summary>{tr('查看准备记录')}</summary>
            <pre className="settings-install-log">{message(preparationLog.slice(-1400))}</pre>
          </details>
        )}
      </section>
      <section className="settings-card">
        <div className="settings-card-heading">
          <h3>{tr('模型管理')}</h3>
          <Select
            aria-label={tr('筛选模型')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{tr('全部')}</option>
            <option value="installed">{tr('已下载')}</option>
            <option value="missing">{tr('未下载')}</option>
          </Select>
        </div>
        <fieldset disabled={blocked} className="settings-fieldset">
          <button
            onClick={() =>
              void c.act(async () => {
                await jamCall('model-import');
                c.setModels(await jamCall('models'));
              })
            }
          >
            {tr('导入本地模型')}
          </button>
          <ModelManager
            onError={c.notify}
            models={c.models.filter(
              (m) => filter === 'all' || (filter === 'installed' ? m.installed : !m.installed),
            )}
            downloads={c.modelDownloads}
            onDownload={download}
          />
        </fieldset>
        {!c.models.filter(
          (m) => filter === 'all' || (filter === 'installed' ? m.installed : !m.installed),
        ).length && <p className="muted">{tr('没有符合条件的模型。')}</p>}
      </section>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      <ModalFrame
        open={confirm}
        managedFocus
        label={tr('准备运行库')}
        onClose={() => setConfirm(false)}
        className="settings-confirm"
      >
        <h2>{tr('准备运行库')}</h2>
        <p>{c.runtimeMode === 'cuda' ? tr('NVIDIA 显卡加速') : tr('CPU 通用兼容')}</p>
        <p>{tr('将下载、校验并准备所选运行库。已有模型和音乐会保留，下载保存在当前数据目录。')}</p>
        <div className="modal-actions">
          <button onClick={() => setConfirm(false)}>{tr('取消')}</button>
          <button className="primary" disabled={blocked} onClick={() => void install()}>
            {tr('确认准备')}
          </button>
        </div>
      </ModalFrame>
    </div>
  );
}
