# Immerse Jam 0.1.6

- 创作页改为可展开／收起的音轨列表，不再显示一整块总波形。播放中可随时录制新轨，保存后成为独立条目。
- 从音乐库或外部 `.ijam`／`.aum` 导入的分轨工程保留为一个外层音频分组，展开后调整内部声部。组内选听不影响其他录音；支持按钮和拖入文件两种导入方式。
- 跟练页上下对齐显示总混音与实时输入／已挂载录音的波形，共用播放位置和滑动时间窗口。
- 录音按钮移到播放按钮旁；设备设置保存后可直接起录，录音库与设置仍可单独打开。
- 循环与标记点快捷按钮移到顶部；右侧切换控制台／循环段落／标记点，列表独立滚动，不再挤压波形。
- 修复节拍器音量滑块的尺寸冲突，恢复鼠标拖动与保存。分组混音支持预设、音频导出和完整工程往返。
- 新界面支持中英文及现有主题；优化实时波形和分组波形缓存。

Creation now uses collapsible tracks and nested stem groups, with recording beside Play. Practice aligns live/take waveforms with the main mix. Top quick actions and a fixed Mixer/Loops/Markers panel preserve workspace space. Metronome volume dragging is fixed.

27 项 Node 测试及静态／翻译／格式检查通过。界面验收涵盖叠录、分组按钮与拖入导入、组内选听、对齐波形、固定标记列表、真实鼠标滑块拖动及英文浅色布局；声卡输入使用隔离的模拟信号。

Windows 10/11 x64: `Immerse.Jam.Setup.0.1.6.exe`. Compare with `SHA256SUMS-0.1.6.txt`. Grouped creation archives require 0.1.6 or newer; previous music projects remain readable. Private music, recordings and model weights are not bundled. Original source remains under PolyForm Noncommercial 1.0.0; third-party licenses remain unchanged.
