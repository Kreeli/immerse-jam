import {
  AudioLines,
  ArrowDownUp,
  Circle,
  Bookmark,
  CircleHelp,
  Download,
  FileMusic,
  Import,
  Library,
  Mic2,
  Play,
  Repeat2,
  Settings,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
import { t as tr } from '../../i18n';
import { isAndroid } from '../../platform/environment';

export default function UsageHelp() {
  const guide = [
    {
      icon: isAndroid ? ArrowDownUp : Import,
      label: isAndroid ? tr('导入与导出') : tr('导入项目或音频'),
    },
    { icon: Share2, label: tr('设备互传') },
    { icon: SlidersHorizontal, label: tr('混音面板') },
    { icon: Repeat2, label: tr('循环：点两次设置起止') },
    { icon: Bookmark, label: tr('添加标记点') },
    { icon: isAndroid ? Circle : Mic2, label: tr('录音') },
    { icon: Download, label: tr('导出音乐') },
    { icon: Settings, label: tr('设置') },
  ];
  return (
    <div className="usage-help">
      <svg viewBox="0 0 360 330" role="img" aria-label={tr('练习界面图解')}>
        <rect
          x="1"
          y="1"
          width="358"
          height="328"
          rx="18"
          fill="var(--panel)"
          stroke="var(--line)"
        />
        <text x="18" y="30" fill="currentColor" fontSize="13">
          {tr('项目名称')}
        </text>
        <Share2 x={206} y={14} width={18} height={18} />
        <ArrowDownUp x={241} y={14} width={18} height={18} />
        <CircleHelp x={276} y={14} width={18} height={18} />
        <Settings x={311} y={14} width={18} height={18} />
        {[AudioLines, Library, FileMusic, Bookmark].map((Icon, i) => (
          <Icon key={i} x={42 + i * 82} y={54} width={20} height={20} />
        ))}
        <path
          d="M12 174 H70 L82 149 L94 194 L108 115 L124 219 L140 161 L154 179 L170 130 L185 221 L202 155 L215 190 L230 141 L244 201 L260 164 L275 183 H348"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity=".6"
        />
        <path d="M180 92 V244" stroke="var(--pink)" strokeWidth="2" />
        <Repeat2 x={260} y={250} width={20} height={20} />
        <SlidersHorizontal x={214} y={250} width={20} height={20} />
        <Bookmark x={306} y={250} width={20} height={20} />
        <Play x={22} y={293} width={20} height={20} />
        <circle cx="75" cy="303" r="7" fill="#ed6d7a" />
        <path d="M106 304 H276" stroke="var(--muted)" strokeWidth="3" />
        <circle cx="158" cy="304" r="5" fill="var(--pink)" />
        <text x="298" y="309" fill="currentColor" fontSize="12">
          1.0×
        </text>
      </svg>
      <div className="help-icon-grid">
        {guide.map(({ icon: Icon, label }) => (
          <span key={label}>
            <Icon size={18} />
            {label}
          </span>
        ))}
      </div>
      <p>
        {isAndroid
          ? tr('导入伴奏 → 关闭要练的声部 → 设置循环 → 录音回听。')
          : tr(
              '导入歌曲 → 开始分析（推荐模型）→ 新建跟练 → 关闭自己要练的声部 → 设置循环 → 录一遍 → 回听。',
            )}
      </p>
      <small>
        {isAndroid
          ? tr('拖动波形定位，双指缩放时间窗口；点击倍速调整速度。项目自动保存。')
          : tr('拖动波形定位，Ctrl＋滚轮缩放时间窗口。项目自动保存。')}
      </small>
    </div>
  );
}
