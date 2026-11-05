import { useEffect, useRef, useState } from 'react';
import { Import, AudioLines, Mic2, Download } from 'lucide-react';
import UsageHelp from './UsageHelp';
import GuideVisual from './GuideVisual';
import { t as tr } from '../../i18n';
export default function OnboardingGuide({
  onClose,
  onModels,
}: {
  onClose: () => void;
  onModels: () => void;
}) {
  const [step, setStep] = useState(0),
    heading = useRef<HTMLHeadingElement>(null);
  const steps = [
    {
      icon: Import,
      title: tr('从一首歌开始'),
      label: tr('导入歌曲'),
      body: tr(
        '在音乐库选择“导入音乐”，也可以拖入音频、视频或完整工程。导入内容保存在你选择的数据目录。',
      ),
      hint: tr('先播放原曲，确认输出设备和音量。'),
    },
    {
      icon: AudioLines,
      title: tr('准备模型，再开始分析'),
      label: tr('分析与分轨'),
      body: tr(
        '在“模型与运行库”检查环境，按需要下载模型。回到歌曲选择分析方式；分析完成后再选择要练习的声部。',
      ),
      hint: tr('首次下载需要时间，可在模型页查看进度和重试。'),
    },
    {
      icon: Mic2,
      title: tr('循环练习，录音回听'),
      label: tr('练习与录音'),
      body: tr(
        '新建跟练，关闭自己演奏的声部，设置循环起止。录音前确认输入设备与声道，并运行延迟校准。',
      ),
      hint: tr('录音会保存为独立记录，可选择不同录音进行回听。'),
    },
    {
      icon: Download,
      title: tr('导出需要的结果'),
      label: tr('导出与管理'),
      body: tr(
        '导出界面可以选择分轨、混音或完整工程。需要继续编辑或迁移时，使用完整工程保留相关资料。',
      ),
      hint: tr('存储与缓存页可以查看各类内容的占用和所在目录。'),
    },
  ];
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const current = steps[step],
    Icon = current.icon;
  return (
    <div className="onboarding-guide">
      <header className="onboarding-heading">
        <div>
          <span className="eyebrow">IMMERSE JAM</span>
          <h2>{tr('快速开始')}</h2>
        </div>
        <span className="onboarding-counter">
          {step + 1} / {steps.length}
        </span>
      </header>
      <div className="onboarding-body">
        <div className="onboarding-layout">
          <ol className="onboarding-steps" aria-label={tr('引导步骤')}>
            {steps.map((s, i) => (
              <li key={i}>
                <button aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                  <span>{i + 1}</span>
                  <s.icon size={17} />
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
          <section className="onboarding-content">
            <GuideVisual step={step} />
            <span className="onboarding-current-label">
              <Icon size={15} />
              {current.label}
            </span>
            <h3 ref={heading} tabIndex={-1}>
              {current.title}
            </h3>
            <p>{current.body}</p>
            <p className="notice">{current.hint}</p>
            {step === 1 && <button onClick={onModels}>{tr('打开模型设置')}</button>}
          </section>
        </div>
        <details className="onboarding-reference">
          <summary>{tr('查看界面图解与快捷操作')}</summary>
          <UsageHelp />
        </details>
      </div>
      <div className="onboarding-actions">
        <button onClick={onClose}>{tr('跳过引导')}</button>
        <div>
          {step > 0 && <button onClick={() => setStep(step - 1)}>{tr('上一步')}</button>}
          <button
            className="primary"
            onClick={() => (step === steps.length - 1 ? onClose() : setStep(step + 1))}
          >
            {step === steps.length - 1 ? tr('开始使用') : tr('下一步')}
          </button>
        </div>
      </div>
    </div>
  );
}
