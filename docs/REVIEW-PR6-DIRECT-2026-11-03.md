# PR #6 直接代码复用验收版 · 2026-11-03

状态：本地供作者试用，不发布 Release，不更新官网或正式下载。不增加版本号，仍为 Windows 0.1.11 / Android preview.3；不要把本轮调试 APK 当作正式更新。

## 原始贡献和实现方式

[PR #6](https://github.com/Kreeli/immerse-jam/pull/6) 的内容是设计规范与完整 HTML / CSS / JS 原型，没有应用 React 组件。按作者要求批准并采用 merge 合并，保留 wweiyi2004 原始提交 `af582badd64aaddbb47c4d91f0f200aa6a6dc975`。GitHub Contributors 已确认显示 wweiyi2004 的一次贡献。

原型本身的格式导致合并后的自动检查失败；单独提交 `71a80cc` 只格式化两个已接受的设计文件。[Source checks 41592579885](https://github.com/Kreeli/immerse-jam/actions/runs/41592579885) 已通过。main 未包含本轮应用 UI 或录音改动，本地工作仍在 `codex/night-rehearsal-recording`。

`scripts/sync-rehearsal-design.cjs` 直接读取 `docs/design/prototype.html` 的四段样式，去除原型工具栏 / 全局 reset，为类名加 `nr-` 前缀并映射现有强调色名称，生成 `src/styles/rehearsal-design.css`，文件头记录来源 SHA-256。原型组件的颜色、尺寸、间距和控件样式直接使用；后续修改原型可重跑该脚本。原型演示音频、数据和事件不引入应用。

Sidebar、LibraryPage、TrackControl、封面等按原型 `navHTML()`、`libraryPage()`、`stripHTML()`、`cover()` 的组合结构移植成 React。侧栏、库卡片、顶栏、分段控件、音轨条、推子复用原样式，真实数据与功能仍由现有应用管理。CSS 用分层隔离旧界面与移植组件，产品适配保留在 `rehearsal.css`。Bricolage Grotesque / JetBrains Mono 原字体和 OFL 许可本地打包，不依赖字体 CDN；中文使用已安装字体回退。

## 操作和修正

- 总波形继续使用单色混音包络。点右侧音轨显示单轨，再点返回混音；不加入彩色堆叠波形或六条概览。
- 播放进度继续使用普通滑条，录音按钮为图标，不增加前进 / 后退按钮或“练琴录音”文字。
- 波形单击不定位；拖动定位、电脑方向键、Ctrl＋滚轮及 Android 双指缩放保留。时间窗为连续值，不恢复预设按钮；绘制窗口做平滑过渡，不改变音频时钟。
- 分离结果与混音预设采用可访问的自定义下拉菜单，明确设置普通、选中、悬停状态的前景 / 背景色，修复文字不可辨认的问题。
- 调性显示为 `C major` / `A minor`，含曲库、歌曲头部及移调显示。仅展开显示格式，保存的调性和和弦符号不变；未知模式保留原文。
- Android 保留右上四入口、独立四视图标签及普通滑条两排播放器，播放 / 录音居中、倍速靠右，不添加冗长操作说明。

连续录音仍沿用第一版：停录继续播放，只追加新录音，不重建已有伴奏 / Android 流会话；原速原调直接保存原 WAV，暂停后恢复录前循环和回听路由。详细实现与真实设备试听限制见 [第一版记录](REVIEW-PR6-2026-11-03.md)。

## 针对性验证

- 类型、1008 项翻译目录、桌面语法及修改文件格式检查通过，双端构建成功。
- `ci-ui-check.cjs`、`controls-check.cjs`、`interaction-check.cjs` 通过。维护测试改为按可访问名称操作库卡片 / 下拉控件，滑条仍走真实指针结束流程。
- 八种暗浅主题与强调色的结果菜单实际颜色检查通过，最低文本对比度 11.24:1；1440、1180、1024 宽窗口无横向溢出，单击不跳转、单轨往返、非档位滚轮缩放检查通过。
- Android 共享布局检查通过：手机 360 / 412 与平板 1280 宽、三波形填充、标记、四列和弦、下拉、帮助、双指缩放与模拟短阻塞。该项使用浏览器模拟原生接口，不冒充实体设备音频验证。
- 当前 UI 下 Windows 隔离曲库连录三次：整曲重载 0、原伴奏节点保留、监测节点静音间隙 0。未重复长时压力测试、模型推理或大体积下载。
- 原入口的打包 Windows 程序启动、单轨往返及 `C major` 显示检查通过，无页面异常。
- 实体平板确认未播放 / 未录音后同签名覆盖成功；只读检查确认已加载新资源、无横向溢出，未再操作原有工程做录音测试。

## 试用和回退

Windows 从 `D:\garbage pile\Immersed\Start-Immerse-Jam.cmd` 启动，程序为 `release/win-unpacked`，继续使用 `.runtime/data`。Android 当前包为 `release/pr6-direct-review/Immerse-Jam-Android-review-arm64.apk`，同签名覆盖安装，保留现有工程。

本机验收产物 SHA-256：Android APK 为 `186281bdfa2177d4aadf028428459eed25fe2f3fad547e22911e5e01e9f0d43e`；Windows `resources/app.asar` 为 `6040b3ab4bf306069c24d489b1f9e3ae8282343e7e09c06c7d592d4090313805`。

第一版源码保存在 `codex/first-ui-review-2026-11-03`（`57c8487`），完整程序为 `release/first-ui-review-57c8487/win-unpacked`，其 APK 保存在 `release/pr6-review`。公开版 `c42bf3f` 的分支、bundle、程序、设备旧 APK 继续保留，位置见第一版记录。

没有新 Setup，没有推送应用代码，没有更新 Release / 网站，没有清理私人曲库或模型。等待作者试用 UI、操作与实际录音手感后再决定后续工作。
