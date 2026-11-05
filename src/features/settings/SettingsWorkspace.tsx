import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  HardDrive,
  Info,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { WorkspaceController } from '../../app/useWorkspace';
import { getAudioDefaults } from '../../audio/device-preferences';
import { jamCall } from '../../platform/project-call';
import Select from '../../shared/Select';
import WindowControls from '../../shared/WindowControls';
import GeneralSettings from './GeneralSettings';
import AudioSettings from './AudioSettings';
import ModelsSettings from './ModelsSettings';
import StorageSettings from './StorageSettings';
import AboutSettings from './AboutSettings';
import { t as tr } from '../../i18n';
export default function SettingsWorkspace({
  controller: c,
  onClose,
}: {
  controller: WorkspaceController;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    [calibrating, setCalibrating] = useState(false),
    [engineBusy, setEngineBusy] = useState(false);
  const navigationLocked = calibrating || engineBusy;
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  const contentRef = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null),
    visited = useRef(new Set<string>());
  const categories = [
    {
      id: 'general',
      icon: Settings2,
      title: tr('常规与界面'),
      description: tr('语言、外观、缩放与使用帮助。'),
      keywords:
        '语言 language theme appearance 主题 强调色 波形颜色 缩放 scale zoom 帮助 tooltip tutorial 教程 悬停',
    },
    {
      id: 'audio',
      icon: SlidersHorizontal,
      title: tr('音频与录音'),
      description: tr('默认设备、输入声道与延迟校准。'),
      keywords:
        'audio device input output latency calibration ASIO WASAPI samplerate 音频系统 音频 录音 设备 声道 采样率 延迟 校准',
    },
    {
      id: 'models',
      icon: AudioLines,
      title: tr('模型与运行库'),
      description: tr('检查环境，下载、导入与校验模型。'),
      keywords:
        'model runtime download cpu nvidia 模型 运行库 环境 下载源 校验 修复 安装 ' +
        c.models.map((m) => m.name).join(' '),
    },
    {
      id: 'storage',
      icon: HardDrive,
      title: tr('存储与缓存'),
      description: tr('查看数据位置、占用与可清理内容。'),
      keywords: 'storage cache disk cleanup location 存储 缓存 磁盘 占用 空间 路径 清理 文件夹',
    },
    {
      id: 'about',
      icon: Info,
      title: tr('关于与诊断'),
      description: tr('版本、更新、日志与第三方声明。'),
      keywords: 'about version update log license diagnostic 关于 版本 更新 日志 诊断 许可',
    },
  ];
  const selected = categories.find((x) => x.id === c.settingsSection) || categories[0],
    term = query.trim().toLocaleLowerCase(),
    matches = categories.filter((x) =>
      (x.title + ' ' + x.description + ' ' + x.keywords).toLocaleLowerCase().includes(term),
    ),
    shown = term ? matches : [selected];
  shown.forEach((x) => visited.current.add(x.id));
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [selected.id, term]);
  const blocked =
    c.recording ||
    !!c.job ||
    c.installing ||
    Object.values(c.modelDownloads).some((m) => m.status === 'progress');
  const select = (id: string) => {
    c.openSettings(id);
    setQuery('');
  };
  const applyToProject = async () => {
    if (!c.project) return;
    const current = c.project,
      defaults = getAudioDefaults(),
      previous = current.recordingSettings?.outputDeviceId || defaults.outputDeviceId;
    try {
      await c.player.current.setOutputDevice(defaults.outputDeviceId);
      await c.flushEdits();
      const value = await jamCall('update', {
        id: current.id,
        patch: {
          recordingSettings: { mode: current.recordingSettings?.mode || 'instrument', ...defaults },
        },
      });
      c.adopt(value);
    } catch (error) {
      await c.player.current.setOutputDevice(previous).catch(() => {});
      throw error;
    }
  };
  const content = (id: string) => {
    if (id === 'general') return <GeneralSettings onGuide={() => c.setModal('help')} />;
    if (id === 'audio')
      return (
        <AudioSettings
          player={c.player.current}
          project={c.project}
          disabled={(c.recording && !calibrating) || c.loading}
          onEngineBusy={setEngineBusy}
          onActive={(value) => {
            setCalibrating(value);
            c.setRecording(value);
          }}
          applyToProject={applyToProject}
        />
      );
    if (id === 'models') return <ModelsSettings controller={c} />;
    if (id === 'storage')
      return (
        <StorageSettings
          disabled={blocked}
          active={shown.some((section) => section.id === 'storage')}
        />
      );
    return (
      <AboutSettings
        beforeInstall={async () => {
          if (c.recording || c.job || c.installing)
            throw new Error(tr('请先停止录音并等待当前任务完成'));
          await c.flushEdits();
          await c.flushNotes();
          c.player.current.pause();
        }}
      />
    );
  };
  return (
    <>
      <WindowControls onError={c.notify} />
      <div className="settings-workspace">
        <header className="settings-header">
          <button
            className="settings-back"
            ref={backRef}
            data-initial-focus
            disabled={navigationLocked}
            aria-label={tr('返回音乐工作区')}
            onClick={onClose}
          >
            <ArrowLeft size={18} />
            {tr('返回')}
          </button>
          <div>
            <h1>{tr('设置')}</h1>
          </div>
        </header>
        <div className="settings-layout">
          <aside className="settings-navigation">
            <div className="settings-search">
              <Search size={17} />
              <input
                ref={search}
                type="search"
                aria-label={tr('搜索设置')}
                placeholder={tr('搜索设置…')}
                disabled={navigationLocked}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  disabled={navigationLocked}
                  aria-label={tr('清除设置搜索')}
                  onClick={() => {
                    setQuery('');
                    search.current?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <nav aria-label={tr('设置分类')}>
              {categories.map(({ id, icon: Icon, title }) => (
                <button
                  key={id}
                  disabled={navigationLocked}
                  aria-current={!term && id === selected.id ? 'page' : undefined}
                  onClick={() => select(id)}
                >
                  <Icon size={18} />
                  <span>{title}</span>
                </button>
              ))}
            </nav>
            <label className="settings-mobile-category">
              {tr('设置分类')}
              <Select
                aria-label={tr('设置分类')}
                disabled={navigationLocked}
                value={selected.id}
                onChange={(e) => select(e.target.value)}
              >
                {categories.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </Select>
            </label>
            <small className="settings-autosave">
              {tr('偏好设置自动保存；安装与清理需要单独确认。')}
            </small>
          </aside>
          <main ref={contentRef} className="settings-content" aria-label={tr('设置内容')}>
            {term && (
              <p role="status" className="settings-search-count">
                {tr('找到{0}个分类', [matches.length])}
              </p>
            )}
            {term && !matches.length && (
              <div className="settings-empty">
                <Search size={28} />
                <h2>{tr('没有匹配的设置')}</h2>
                <p>{tr('试试设备、缩放、缓存或日志。')}</p>
                <button
                  onClick={() => {
                    setQuery('');
                    search.current?.focus();
                  }}
                >
                  {tr('清除搜索')}
                </button>
              </div>
            )}
            {categories
              .filter((x) => visited.current.has(x.id))
              .map((x) => (
                <section
                  className="settings-panel"
                  key={x.id}
                  hidden={!shown.some((s) => s.id === x.id)}
                  aria-labelledby={'settings-' + x.id}
                >
                  <div className="settings-panel-heading">
                    <h2 id={'settings-' + x.id}>{x.title}</h2>
                    <p>{x.description}</p>
                  </div>
                  {content(x.id)}
                </section>
              ))}
          </main>
        </div>
      </div>
    </>
  );
}
