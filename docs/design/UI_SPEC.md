# Immerse Jam UI 设计规范 · 夜间排练室

> 版本：v1（2026-11）· 适用：Windows 桌面版 v0.1.11（Electron 45 + React 19）、Android 0.1.0-preview.3
> 交互原型：`docs/design/prototype.html`（单文件，可直接用本地静态服务器打开；`#mobile` 直达手机版，`#spec` 直达规范页）
> 本文档是实现依据；原型里的数据是演示数据，交互流程与状态以原型为准。

---

## 0. 给实现者的说明

1. **只替换表现层，不改业务逻辑。** 所有拆分、录音、互传、更新都已有 `jamCall()` 方法（见第 9 节），新 UI 只改组件结构与样式。
2. **先落 Token，再改组件。** 第 2 节的 CSS 变量替换 `src/styles/themes.css` 里现有的 `--tone-*` 散值；组件只引用语义 Token，不写颜色字面量。
3. **字体必须本地打包。** Electron / Android 的 CSP 是 `font-src 'self' data:`，不能用 Google Fonts。把 Bricolage Grotesque（可变字重）、Noto Sans SC（400/500/600/700 子集）、JetBrains Mono（400/500/600）放进 `src/assets/fonts/`，用 `@font-face` 引入；中文字体建议按 GB2312 常用字子集化，控制在 2–3 MB 内。
4. **图标**：原型使用 24×24、1.75 描边、圆角端点的线性图标（风格同 Lucide）。实现时可直接用 `lucide-react`，名称对照原型中的 `ic('名称')`。
5. 原型顶部的「原型条」（设备切换 / 主题 / 演示场景 / 设计规范）**不进入产品**。

---

## 1. 设计方向

**用户**：晚上回家还想练一会儿的乐手——吉他、贝斯、鼓、键盘、主唱；大多在用 Audio Jam / Moises 之类的工具，审美偏向 DAW、效果器、Live 录像，不喜欢花哨。

**意象**：关了大灯、只留几盏暖灯的排练室。

| 原则 | 落到界面上 |
|---|---|
| 手离开琴也只要一下 | 播放、±5 秒、循环、录音永远在固定位置；电脑有快捷键，手机放在拇指区（屏幕下 1/3）。 |
| 声部颜色就是信息 | 声部颜色固定且是界面里最鲜艳的东西；关掉的声部变灰并从波形里消失——所见即所听。 |
| 说人话 | 「选听 / 关闭声音 / 挂载 / 拆分」，不写 Solo、Mute、Stem。每个耗时操作说明要多久、会不会上传。 |
| 不打断练习 | 拆分、下载、互传在后台；完成用通知条 + 「打开」；删除都能撤销。 |

---

## 2. Design Tokens

暗色为默认（`:root`），浅色在 `[data-theme="light"]` 与 `prefers-color-scheme: light`（未显式选择暗色时）下覆盖。主题色用 `data-accent` 切换，rose 为默认（不写属性）。

### 2.1 表面与文字

| Token | 暗色 | 浅色 | 用途 |
|---|---|---|---|
| `--ground` | `#0d0c11` | `#eeedf2` | 窗口底色 |
| `--surface-1` | `#14131a` | `#fbfbfd` | 侧栏、面板、走带 |
| `--surface-2` | `#1b1a22` | `#ffffff` | 卡片、菜单、对话框 |
| `--surface-3` | `#24222d` | `#f0eff5` | 控件底、悬停 |
| `--surface-4` | `#2e2b38` | `#e5e3ec` | 滑轨、进度底 |
| `--line` | `#2a2833` | `#e1dfe8` | 分隔线、卡片描边 |
| `--line-strong` | `#3b3847` | `#cbc8d6` | 输入框、强调描边 |
| `--text` | `#eeecf3` | `#17151d` | 正文 |
| `--text-2` | `#aba7b9` | `#55516a` | 次要文字 |
| `--text-3` | `#75718a` | `#85819a` | 提示、占位 |
| `--scrim` | `rgba(6,5,9,.66)` | `rgba(30,27,40,.38)` | 遮罩 |
| `--playhead` | `#ffffff` | `#17151d` | 播放头 |

中性色都带一点紫色偏向（与 rose 主题色同温），不要用纯灰。

### 2.2 主题色（只用于「现在能点什么」：主按钮、选中、进度、播放进度）

| `data-accent` | `--accent` 暗 / 浅 | 说明 |
|---|---|---|
| （默认）rose | `#ff5c7a` / `#e23d62` | 玫瑰 |
| ocean | `#3fa7ff` / 对应深色 | 海蓝 |
| pine | `#34d399` / 对应深色 | 松绿 |
| violet | `#a78bfa` / 对应深色 | 紫罗兰 |

每个主题色派生：`--accent-strong`（悬停/浅色文字）、`--accent-ink`（主按钮上的文字）、`--accent-soft`（14% 选中底）、`--accent-line`（42% 选中描边）。完整值见 `prototype.html` 头部 `<style>`。

> 现有代码 `data-accent` 的值是 `rose / blue / green / purple`。保留旧值作为别名（blue→ocean …）以兼容已保存的设置。

### 2.3 声部颜色（固定，不随主题色变）

| Token | 暗 | 浅 | 声部 |
|---|---|---|---|
| `--stem-vocals` | `#ff5470` | `#e2334f` | 人声 |
| `--stem-drums` | `#b77bff` | `#8a4fe0` | 鼓 |
| `--stem-bass` | `#45adff` | `#1f84d8` | 贝斯 |
| `--stem-piano` | `#3fdc92` | `#13a465` | 钢琴 |
| `--stem-guitar` | `#ffa043` | `#e27518` | 吉他 |
| `--stem-other` | `#9a95ad` | `#77728c` | 其他 / 伴奏 |
| `--stem-lead` | `#ffc15a` | `#d9951a` | 主音吉他 |
| `--stem-rhythm` | `#ff7f3a` | `#e05a14` | 节奏吉他 |
| `--stem-backing` | `#ff92b4` | `#e0628c` | 和声 |
| `--stem-take` | `#efe7d2` | `#3a3448` | 我的录音 |

画布（Canvas）绘制时通过 `getComputedStyle` 读取这些变量，主题切换后重读一次（原型 `readColors()`）。

### 2.4 状态色

`--ok #45d39a` 完成 · `--warn #ffb547` 注意/标记点/需下载 · `--danger #ff5d5d` 删除 · `--rec #ff3b4f` 录音 · `--info #6cb8ff` 说明。浅色版见原型。

### 2.5 字体

| Token | 字体栈 | 用途 |
|---|---|---|
| `--font-display` | Bricolage Grotesque → Noto Sans SC → 系统中文 | 页面标题、歌名、大数字 |
| `--font-ui` | Noto Sans SC → HarmonyOS Sans SC → PingFang SC → Microsoft YaHei UI | 正文与控件 |
| `--font-mono` | JetBrains Mono → Cascadia Mono → Consolas | 时间码、BPM、百分比、ms（等宽，跳动时不抖） |

字号（px）：`--fs-micro 11` · `--fs-cap 12` · `--fs-ui 13` · `--fs-body 14` · `--fs-title-s 16` · `--fs-title 20` · `--fs-display 30`。
手机端正文 15、列表标题 16、页面标题 26（m-hello）。标题 `text-wrap: balance`，eyebrow 标签 `letter-spacing: .08em`。

### 2.6 圆角 · 间距 · 动效

| Token | 值 | 用途 |
|---|---|---|
| `--r-xs / --r-s` | 4 / 7 | 标签、菜单项、小按钮 |
| `--r-m` | 10 | 按钮、输入框、通知条 |
| `--r-l` | 14 | 卡片、声部条 |
| `--r-xl` | 20 | 对话框、手机底部面板顶角 |
| 间距 | 4 · 8 · 12 · 16 · 24 · 32 | 只用这 6 档；同组元素用 `gap` |
| `--t-fast` | 120ms | 悬停、按下 |
| `--t-med` | 200ms | 开关、选项卡 |
| `--t-slow` | 300ms | 对话框、抽屉、底部面板进入 |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | 所有进入动画 |

`prefers-reduced-motion: reduce` 时所有动画降到 1ms。重新渲染时**不要**重复播放进入动画（原型用 `body.calm` 处理）。

---

## 3. 组件

| 组件 | 规格 | 状态 |
|---|---|---|
| 按钮 `.btn` | 高 34（`.sm` 28，手机 44 / 34），圆角 `--r-m`，图标 15 + 文字 13/600 | default / hover（surface-3）/ active（scale .98）/ disabled（40%）/ `primary` / `ghost` / `danger` / `danger-ghost` / `quiet` |
| 图标按钮 `.icon-btn` | 32×32（`.sm` 26，手机 44） | 同上；必须有 `aria-label` 或 `title` |
| 分段 `.seg` | 底 surface-1 + 描边；选中项 surface-3 + text | `aria-pressed` / `aria-selected` |
| 开关 `.toggle` | 36×20（手机 44×26） | `role="switch"` + `aria-checked` |
| 勾选 `.check` / 单选 `.radio` | 18 | `aria-checked` |
| 选项卡片 `.choice` | 整块可点，左侧 radio，右侧可带警示 chip（需下载 xx MB） | 选中：accent-soft 底 + accent-line 描边 |
| 标签 `.chip` | 高 24，`ok / warn / accent` 变体 | — |
| 滑块 `.range` | 轨道 4，拇指 14；已填充部分用 `--c`（声部色），通过 `--p` 百分比绘制 | 声像 `.pan` 中心有刻线，拇指为方形 |
| 选听/静音 `.ms-btn` | 电脑 26×22，手机 52×34；S 选中 = 黄色底，M 选中 = 灰底 + 删除线色 | 被关掉的声部整条 `.off`（50% 不透明 + 去饱和） |
| 电平 `.meter` | 4px 宽竖条，声部色，60ms 线性过渡 | 只在播放时有值 |
| 进度 `.progress` | 高 6（手机 4） | `.ok` 完成态 |
| 通知 `.notice` | surface-1 + 描边，图标 info/warn | — |
| 通知条 `.toast` | 反色（text 底 / ground 字），最多 3 条，2.8 s；带动作时 5.2 s | 动作按钮 accent 色：「打开」「撤销」「查看」 |
| 菜单 `.menu` | surface-2，最小宽 210，项高 32；从触发器下方 6px 出现，超出视口自动翻转 | 同一触发器再次点击关闭；点外部关闭 |
| 对话框 `.modal` | 最大宽 560（`.wide` 760），头 / 可滚动体 / 底部按钮区 | Esc / 点遮罩 / × 关闭；底部最多一个主按钮 |
| 抽屉 `.drawer` | 右侧 420 宽 | 录音库、回收站 |
| 底部面板 `.sheet`（手机） | 默认 62% 高，上拉手柄切换到 88%；`auto` 高度用于短内容 | 点遮罩 / 手柄 / × 关闭 |

---

## 4. 电脑版（Windows）布局

### 4.1 外壳

```
┌ nav 232 ┬──────────────── main ───────────────────────────┐
│ 品牌     │ content（各页面，自己滚动）                          │
│ 曲库 11  │                                                    │
│ 跟练 3   │                                                    │
│ ●正在练习│                                                    │
│ 文件夹…  │                                                    │
│ 工具…    ├────────────────────────────────────────────────────┤
│ 引擎状态 │ transport 88（仅播放器页）                           │
└──────────┴────────────────────────────────────────────────────┘
```

- 侧栏 `< 960px` 收成 64px 图标栏（文字隐藏，`title` 提示）。
- 侧栏底部：本机引擎状态卡（NVIDIA / CPU，点击进设置-运行环境）、帮助、反馈、捐赠、版本号。
- 「正在练习」入口只在打开过歌曲后出现，带录音中红点。

### 4.2 曲库 `LibraryPage`

- 页头：标题（曲库 / 收藏 / 文件夹名）、导入菜单（音频或视频、文件夹、.aum、.ijam、从手机接收）、主按钮「新建跟练 / 创作」。
- 「继续上次练习」横幅：封面 + 停在哪一段 + 循环/标记摘要 + 「跟练录音」「继续」；背景画淡色四声部包络。
- 工具条：搜索、筛选分段（全部/收藏/文件夹）、卡片/列表切换、拖放提示。
- 卡片网格 `auto-fill minmax(220px, 1fr)`：封面（按色相生成的声部线条图）、歌名、歌手、时长·BPM·调、声部色点、底部状态（`6 轨 · 完整六轨` / `未分析` + 「开始分析」/ `仅和弦与节拍`）、文件夹 chip、收藏、更多菜单。
- 处理中的卡片显示任务名 + 百分比 + 进度条（多阶段：下载模型 → 拆分 → 识别和弦）。
- 列表视图：封面 40 / 标题 / 状态 / 时长 / 添加日期 / 操作；`< 980` 隐藏第 3、5 列。
- 整页是拖放区，拖入时出现虚线高亮层。
- 空曲库：大图标 + 「曲库还是空的」+ 支持格式 + 导入 / 从 Audio Jam 迁移。

### 4.3 跟练 / 创作 `PracticeHub`

- 分段：全部 / 跟练 / 创作。行：类型图标、名称、来源歌曲、录音条数、更新时间、删除。
- 创作项目显示「分轨项目」分组（`creation-add-group`）。

### 4.4 播放器（核心）

```
┌ ph 56：封面 · 标题（双击改名）· 调性▾ · BPM▾ · 已保存 · 拆分结果▾ · 重新拆分 · 导出 · 控制台开关 ┐
├ ptool：波形 / 和弦 / 乐谱 / 附件 │ 设循环开始 · 设循环结束 · 添加标记点 │ 时间窗口 4 8 16 30 ┤
├ stage（主区）                                         │ console 320（≥1180 常驻） ┤
│  波形：按声部叠加的镜像包络；拍线、小节线、段落名、和弦名  │  混音 / 练习 / 段落·标记 │
│  声部行：名称（点击=单轨波形）· S · M · 单轨波形        │                          │
│  录音行（跟练项目时）：已挂载的录音 + 时间微调            │                          │
├ transport 88：−5 · 播放 · +5 · 练琴录音 · 录音库 · 时间码 / 总长 · 概览波形 · 小节 · 节拍器 · 速度 · 输出 ┤
```

- **波形**：播放头固定在中间，内容滚动。拖动 = 定位（单击不跳转，避免误触）；Ctrl+滚轮缩放；滚轮平移。关掉的声部从叠加图中消失；点击声部名进入单轨模式（其余声部隐藏，显示「回到混音」）。循环区域 accent 10% 底；标记点 warn 色旗标；录音中区域 rec 色底 + 实时包络。
- **预备拍**：波形中央 120px 大数字 + 「预备拍 2/4」。
- **录音中**：波形顶部红色胶囊「录音中 · 0:12」，录音按钮变「停止录音」。
- **和弦视图 `ChordSheet`**：按段落分组的小节网格（每行 2/4/8 小节可选），当前小节 accent-soft 高亮 + 底部进度细线，跟随播放滚动。点格子选中 → 右侧和弦面板（指法图 + 常用和弦 + 自定义输入），选完自动跳到下一格；双击格子从该小节播放；段落名可点击改名；顶部：和弦谱切换菜单（识别 / 自制，可复制、删除）、小节线设置、重新识别、撤销（Ctrl+Z）。
- **乐谱视图 `Score`**：Guitar Pro / MusicXML / MIDI；自动对齐、可信度、不确定小节标橙；整体偏移滑块、「对齐到当前位置」。
- **附件视图 `Attachments`**：笔记（自动保存）、文件列表、视频（`SyncedVideo`）。
- **控制台 `SidePanel`**
  - 混音：总音量、混音预设菜单（默认 / 卡拉 OK 去人声 / 只听节奏组 / 吉他 30% / 自定义保存）、声部条（电平、名称、几乎无声提示、百分比、S、M、音量、声像）；创作项目有「组音量」并可折叠；跟练项目在下方列出已挂载录音（最多 2 条），可展开时间微调 ±10ms。
  - 练习：速度（预设 0.5–1.25 + 滑块 0.25–2.0，不变调）、音调 ±12 半音 + 修正调性、节拍器开关与音量、预备拍（开关 / 1·2·4·8 拍 / 对齐到小节）、MIDI 踏板、录音设置入口。
  - 段落·标记：循环开关与清除、按段落循环 chips、标记点列表（跳转 / 从此循环 / 删除）。
- `< 1180` 控制台变为右侧浮层（阴影 + slide 动画），默认收起。

### 4.5 设备互传 `RemoteTransfer`

二维码（2 分钟有效倒计时，可刷新）+ 网络选择 + 连接码复制；对方应答码输入；接收中的文件与历史。

### 4.6 迁移 Audio Jam `DatabaseMigration`

检测结果、逐首勾选（全选）、开始迁移 → 进度（分轨、标记点一起迁移）。

### 4.7 设置

左侧子导航：运行环境（引擎、重新检测、运行库安装）· 模型（下载 / 校验 / 取消 / 删除，显示大小与状态）· 下载与存储（下载源：自动 / 国内镜像 / 官方；存储位置）· 外观与语言 · 更新（idle → checking → found → dl → ready）· 帮助与反馈 · 关于与许可。`< 980` 子导航变成顶部换行按钮组。

### 4.8 对话框清单

| 对话框 | 关键内容 |
|---|---|
| 拆分 `separate` | 7 种方式卡片（识别和弦、四轨、六轨推荐、吉他手、鼓手、贝斯手、歌手）、需下载提示、NVIDIA/CPU、同时识别和弦、预计耗时 |
| 导出 `export` | 当前混音 / 各分轨 / 录音与伴奏 / 工程包；格式 WAV FLAC MP3；应用速度音调；只导出循环段；保存位置 |
| 新建跟练/创作 `newSession` | 跟练 / 创作、名称、来源歌曲、伴奏方式（分轨 / 录音含伴奏）、挂载上限说明 |
| 录音设置 `recSettings` | 录音来源、输入设备、声道、输入电平、监听输出、延迟校正 |
| 延迟校准 `calib` | 准备 → 8 声测量 → 结果（平均 / 抖动 / 之前）|
| 恢复录音 `recovery` | 意外退出后列出未保存录音，恢复 / 丢弃 |
| 收到文件 `incoming` | 来源设备、文件、接收进度 |
| 新手引导 `onboard` | 三步：拖入 → 拆分 → 开始练 |
| 文件夹 `folder` | 新建 / 重命名 |
| 确认删除 `confirm` | 标题 + 后果说明 + 危险按钮；删除后通知条可撤销 |

---

## 5. 手机版（Android）布局

画板 390×844 dp；状态栏 24、手势条 20；内容左右安全边距 16；**所有点击区域 ≥ 44×44**。

| 屏幕 | 结构 |
|---|---|
| 曲库首页 `MobileHome` | 顶栏（品牌 + 设置）→「今天练点什么？」→ 继续练习卡（封面 / 进度 / 64 播放）→ 三步引导卡（可关闭）→ 搜索 → 分段（全部 / 收藏 / 已拆分 / 来自电脑）→ 歌曲列表（行高 72，右侧 ⋯ 打开歌曲面板）→ 右下 FAB「+」导入 → 底部导航 |
| 播放器 · 波形 | 顶栏（返回 / 标题 + 调·BPM / ⋮）→ 波形·和弦谱分段 → 波形区（左右拖动定位）→ 横向滑动胶囊（循环、标记、控制台、录音库、节拍器）→ 声部行 38 高（点名称即静音）→ **底部固定控制区**：概览波形、时间 / 小节 / 总长、速度 · −5 · 播放 64 · +5 · 录音 52 |
| 播放器 · 和弦谱 | 和弦谱切换 chip + 跟随播放开关 → 每行固定 4 小节；点格子弹出和弦面板（指法图 + 4 列常用和弦 + 自定义输入 + 拆成 2 个和弦 / 从这里播放 / 清空） |
| 控制台面板 | 底部面板三页：控制台（总音量、声部条 S/M 52×34、已挂载录音、节拍器、预备拍）/ 循环段落 / 标记点；上拉展开 88% |
| 跟练项目 | 项目卡片（录音条数、更新时间、删除）→ 新建跟练（底部面板选歌）。手机端只新建跟练，多轨创作在电脑做 |
| 互传 | 扫码 / 连接码分段 → 取景框或输入框 → 已连接卡（设备、会话剩余时间、断开）→ 发送到电脑 / 最近收到 |
| 设置 | 外观（主题、主题色）、录音（预备拍、延迟校准）、存储、关于（版本、检查更新、捐赠） |

**能力边界（必须在界面里说清）**：手机本机只做「人声与伴奏」两轨拆分和「识别和弦与节拍」；完整六轨等方式提示到电脑上拆，再用互传发过来。

手机底部面板清单：歌曲菜单（分析 / 跟练 / 收藏 / 发送到电脑 / 删除）、导入（手机文件 / 从电脑接收 / 现场录）、分析、新建跟练、速度与音调、和弦选择、录音库、发送。

---

## 6. 断点

| 宽度 | 变化 |
|---|---|
| ≥ 1180 | 控制台常驻右侧 320 |
| 980–1180 | 控制台变浮层；和弦侧栏、乐谱侧栏隐藏 |
| < 960 | 侧栏收成 64 图标栏 |
| < 980 | 设置 / 互传改单列，列表隐藏次要列，走带两行 |
| 产品最小窗口 | 960 × 600（Electron `minWidth/minHeight`） |
| 原型 < 760 | 强制显示手机版（仅原型行为） |

---

## 7. 快捷键（电脑）

| 键 | 作用 |
|---|---|
| Space | 播放 / 暂停（开了预备拍先数拍；数拍中再按取消） |
| ← / → | ±5 秒；Shift + ←/→ 按 1 小节 |
| L | 设循环开始 → 设循环结束 → 之后切换循环开关 |
| M | 当前位置加标记点 |
| R | 开始 / 停止录音（没有跟练项目时先弹出新建） |
| [ / ] | 速度 −/+ 0.05× |
| T | Tap 测速 |
| Ctrl + 滚轮 | 波形窗口 4 / 8 / 16 / 30 秒 |
| Ctrl + Z | 撤销和弦修改 |
| Esc | 依次关闭：菜单 → 对话框 → 底部面板 → 抽屉 → 和弦选中 → 单轨模式 |

输入框聚焦时快捷键全部失效；中文输入法组合输入期间不响应 Enter。

---

## 8. 状态与文案

每个界面都要实现以下状态（原型「演示场景」可逐个查看）：

| 状态 | 表现 |
|---|---|
| 空曲库 | 大图标 + 支持格式 + 导入 / 迁移按钮 |
| 第一次使用 | 新手引导对话框（电脑）/ 三步卡片（手机） |
| 处理中 | 卡片内阶段名 + 百分比；多阶段写「（2/3）」；可继续操作别的 |
| 首次下载模型 | 拆分对话框黄色提示「需要先下载 xx（约 670 MB）」，开始后自动下载 |
| 完成 | 通知条「『鲜花』拆分完成 · 打开」 |
| 无音频示例 | 黄色 chip「示例 · 无音频」 |
| 录音不到 1 秒 | 丢弃并提示 |
| 录音挂满 2 条 | 新录音进录音库，提示「已挂满 2 条」 |
| 意外退出 | 恢复录音对话框 |
| 收到文件 | 接收对话框 → 进度 → 放进曲库 + 「打开」 |
| 有新版本 | 设置-更新带红点；下载 → 校验 → 退出后安装 |
| 删除 | 二次确认 + 通知条「撤销」；录音进回收站 30 天 |

文案规则：动词开头（「开始拆分」不是「拆分开始」）；数值带单位（`670 MB`、`31 ms`、`0.75×`）；说明后果（「原文件不会被删除」）；术语：选听、关闭声音、挂载、录音库、回收站、预备拍、循环段落、标记点、和弦谱、分轨。

---

## 9. 界面 ↔ 代码对照

| 原型区域 | 现有组件 | 主要 `jamCall` 方法 |
|---|---|---|
| 侧栏、文件夹 | `features/library/Sidebar.tsx`、`Folders.tsx` | `folders-list`、`folders-edit` |
| 曲库卡片 / 列表 / 导入 | `features/library/LibraryPage.tsx`、`ProjectHeading.tsx`、`ProjectName.tsx` | `library`、`import`、`reveal` |
| 删除确认 / 恢复 | `DeleteProjectDialog.tsx`、`RecoveryDialog.tsx` | `project-delete`、`project-recover`、`take-recover` |
| 拆分对话框、处理进度 | `features/models/ResultPicker.tsx`、`features/analysis/AnalysisMeta.tsx` | `run`、`cancel`、`result-select`、`result-rename`、`result-open` |
| 播放器波形 / 声部行 | `features/player/Waveform.tsx`、`TrackControl.tsx`、`TrackMeter.tsx` | — |
| 控制台 | `SidePanel.tsx`、`Mixer.tsx`、`PresetControls.tsx`、`PracticeToolbar.tsx`、`CountInControl.tsx`、`PracticeMarks.tsx` | — |
| 走带 | `Transport.tsx` | — |
| 和弦视图 | `features/chords/ChordSheet.tsx`、`ChordDiagram.tsx`、`MobileChartPicker.tsx` | — |
| 乐谱 / 附件 / 视频 | `features/score/Score.tsx`、`library/Attachments.tsx`、`player/SyncedVideo.tsx` | `attach`、`read-attachment` |
| 跟练 / 创作、录音 | `features/recording/*`（`PracticeHub`、`PracticeRecorder`、`PracticeWaves`、`TakeTiming`、`TakeRemoval`、`CreationTracks`、`SessionCreateDialog`、`CreateFromSong`） | `session-create`、`take-start/append/finish`、`take-select`、`take-delete`、`take-restore`、`take-deleted`、`take-import`、`take-open` |
| 延迟校准 | `recording/LatencyCalibration.tsx` | — |
| 导出 | （导出对话框） | `export`、`export-audio` |
| 互传（电脑） | `features/transfer/RemoteTransfer.tsx` | `pair-start`、`pair-stop`、`peer-*` |
| 迁移 | `features/migration/DatabaseMigration.tsx` | `migration-detect/scan/import`、`migration-database-scan/import` |
| 设置 | `features/settings/*`、`features/models/ModelManager.tsx` | `runtime-status`、`runtime-install`、`models`、`model-download`、`model-import`、`download-settings`、`pick-folder`、`update-check/download/install`、`ui-language`、`feedback-open`、`open-license-folder` |
| 手机首页 / 操作 / 互传 | `platform/android/MobileHome.tsx`、`MobileActions.tsx`、`LanTransfer.tsx`、`TransferSharing.tsx` | `android-scan-pair`、`android-lan-*`、`android-share-projects`、`android-capture-*` |
| 对话框外壳 / 下拉 | `shared/ModalFrame.tsx`、`shared/Select.tsx` | — |

### 迁移步骤建议

1. `themes.css`：新增第 2 节 Token；把现有 `--tone-*` 逐个映射到语义 Token（如 `--tone-111114 → --surface-1`），确认无引用后删除旧值。`data-accent` 旧值保留别名。
2. `@font-face` 本地字体 + `--font-*`。
3. 共享组件：按钮、分段、开关、滑块、chip、菜单、`ModalFrame`、通知条。
4. 外壳与侧栏 → 曲库 → 播放器（波形绘制改读 Token）→ 控制台 → 对话框 → 设置 / 互传 / 迁移。
5. Android：底部导航、底部面板（替换现有弹窗）、底部固定控制区、44dp 点击区域检查。
6. 回归：暗色 / 浅色 × 4 主题色截图；960×600、1180、1440 三档窗口；Android 360 / 390 / 412 宽。

---

## 10. 无障碍

- 所有图标按钮有 `aria-label`；开关 `role="switch"`；分段 `aria-pressed` / `role="tab"`；对话框 `role="dialog" aria-modal`。
- 文字对比度 ≥ 4.5:1（`--text-3` 只用于 ≥12px 的辅助信息）。
- 声部状态不只靠颜色：关闭的声部同时变灰 + 图标变化；选听按钮有字母 S/M。
- 键盘可达：Tab 顺序与视觉一致，焦点环 2px accent。
