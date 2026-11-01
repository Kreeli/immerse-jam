# Immerse Jam 开发说明与交接

更新日期：2026-11-01（Asia/Macau）。本文用于在新会话或交给另一位开发者时恢复上下文，不需要重读此前的长对话。

## 1. 当前基线与发布状态

- 工作区：`D:\garbage pile\Immersed`，Windows / PowerShell。
- 仓库：<https://github.com/Kreeli/immerse-jam>，开发分支 `main`。
- 本文整理前工作区干净；功能基线为 `35ae41664838601c1e68b95d0101ec97c0c8e7fc`，已推送。
- Windows 版本：`0.1.9`；Android：`0.1.0-preview.1`，包名 `app.immersejam.mobile`。
- **v0.1.9 已于 2026-11-01 公开发布**：<https://github.com/Kreeli/immerse-jam/releases/tag/v0.1.9>。上次因会话中断停在草稿，附件已经上传；本次按用户此前明确授权完成公开。
- Release 附件：Windows 安装包、ARM64 手机 APK、x86_64 模拟器 APK、SHA-256 清单。Android 是**调试签名预览版**，没有正式发行签名配置。
- Release 对应上述功能提交。后续仅提交交接文档，不移动 `v0.1.9` 标签、不因此再发一个 Release。

不要根据旧 README 或历史待办中的“未发布”推断状态。历史记录说明当时发生了什么；本节记录交接时的实际状态。

## 2. 产品目标与已经确定的用户要求

Immerse Jam 是独立的本地分轨、练琴与多轨录音应用。参考 Audio Jam 的布局和练琴体验，原创实现，不依赖其会员、云计算或专有源码。先 Windows，再 Android，尽量共用体验，平台代码必须分类清楚。

### 分轨与结果管理

- 推理在设备本地完成。Windows 自动准备私有环境，不要求用户预装 Python / CUDA 工具链；首次安装和模型下载可以联网。
- 电脑端质量优先，可接受约 1–3 GB 的模型。移动端随包小模型，大模型按需安装，并防止低性能设备崩溃。
- 多次分离结果独立保留：**歌曲 → 模型分离结果 → 音轨**。结果可切换、改名，音频可导出。
- 最终希望覆盖 Audio Jam 的分离方式；Android 尚未完成的方式必须禁用或明确说明，不能用错误声部或轨数假装支持。
- 尽量迁移电脑本机已有 Audio Jam 内容，不修改原数据库；云端未下载的内容无法迁移。

### 播放与练琴界面

- 总混音波形为默认；点音轨名称切换该轨，再点一次返回混音。单色、滑动时间窗口，播放位置居中，可拖动定位，避免包络闪烁。
- 浏览音乐库、分类、收藏时保持播放。统一底部播放条，不因为离开播放页而卸载播放器。
- 音轨控制叫“选听 / 关闭声音”，可组合选听；同一轨两者互斥，以最后操作为准。保留音量、声像和实时电平。
- 删除均衡器；智能节拍器保留，有独立音量、预备拍和最近节拍吸附。
- 循环使用一个按钮依次设置开始、结束；循环和书签都可命名、跳转、删除。顶部保留快捷操作，右边固定宽度切换控制台 / 循环 / 书签。
- 不在波形中央摆大和弦图。和弦页跟随当前播放位置，以小节排列，支持空位、移动、互换、编辑、删除；每小节最多两个和弦，自制谱可新建、删除和校准小节。
- 保留 Guitar Pro / MusicXML / MIDI 显示、同步播放与对齐。**节拍质量优先于和弦识别**，不能退回粗糙 BPM 算法冒充精确节拍。
- 常用字体要够大；普通文字禁止拖选，仅输入区域允许选择。中英文、明暗主题与强调色切换。

### 跟练与创作

- 音乐库独立于跟练 / 创作；跟练与创作放在一个列表，可筛选全部、跟练、创作。新建可选音乐库源歌曲，取消不创建。
- 跟练最多挂载 **两条新增录音轨**，两条均可听；录音库本身允许保存很多次录音，挂载与删除文件不是一回事。
- 跟练可切换“分轨伴奏 / 录音含伴奏”。前者回听时叠加分轨；后者已有挂载录音时默认不再叠加伴奏，避免伴奏重复。录制时两种方式都可调分轨伴奏。
- 不做内部软件麦克风返听。用户的效果器 USB 输入可能只有乐器，接电脑 AUX 后才会录到伴奏，不能假设每个人都有独立 Loopback。
- 对比演奏沿用音轨声像即可，不新造左右对比面板。输入源必须可选；支持延迟校正与跟拍测试。
- 创作允许多轨叠录，外部分轨工程作为一个外层分组，展开后控制其内部声部；各轨波形可展开 / 收起。录音按钮在播放按钮旁。

### 互传与移动端

- 优先传原曲和分轨，也保留完整包里的节拍、对齐、附件、和弦及录音。手机应直接使用电脑计算结果，不自动覆盖已校准节拍。
- 不要求用户自建或付费服务器；同一 Wi-Fi / 热点扫码直传。远程可用免费的连接服务，文件优先直传。
- 手机使用可呼出的侧栏，兼容 Android 平板；返回先关闭弹窗 / 侧栏，再回上一级；根页两次返回退出。
- Android 输入与单次录音上限 **44 分钟**；这不是任何长曲多轨都能无条件播放的承诺。

### 名称、反馈与许可

- 名称 Immerse Jam；分析按钮叫“开始分析”，不要叫“AI 分析”。Beat This! 名称不要被自动翻译损坏。
- 左下顺序：本地引擎就绪 → 用户反馈 → 请作者喝一瓶冰可乐。
- 反馈邮箱：`meowmeowneko999@gmail.com`，也可跳 GitHub Issues；应用不自动发送反馈。
- 使用用户提供的应用图标与原收款码，打赏只显示原二维码区域，不重绘二维码。
- 原创代码为 **PolyForm Noncommercial 1.0.0**，限制商业利用，属于非商业源码可用许可，不能称为 OSI 开源协议。第三方组件 / 模型仍依各自许可。

## 3. 代码地图

| 位置                                                                | 职责与修改入口                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/app/App.tsx`、`useWorkspace.ts`                                | 页面组合、浏览路由与活跃播放器的协调                                                       |
| `src/features/`                                                     | library、player、recording、chords、score、analysis、models、transfer、migration、settings |
| `src/audio/Player.ts`                                               | AudioContext、共同播放时钟、混音、SoundTouch、循环、节拍器、波形缓存                       |
| `src/audio/playback-processor.js`                                   | DSP FIFO 重置、短淡入淡出；避免每次 seek 重建 DSP                                          |
| `src/audio/performance.ts`                                          | 跟练录制 / 回听和创作分组的播放策略                                                        |
| `src/audio/capture.ts`、`offline-stream.ts`                         | 带时间戳的 PCM 采集、分块离线变速移调                                                      |
| `src/shared/types.ts`、`shared/project-validation.cjs`              | 跨端数据契约与校验                                                                         |
| `shared/ipc-methods.json`                                           | IPC 白名单；改桥接能力时同步考虑两端                                                       |
| `desktop/`                                                          | Windows Electron 主进程、存储、安装、模型、导出、互传等                                    |
| `desktop/store.cjs`、`sessions.cjs`、`groups.cjs`                   | 项目保存、独立跟练 / 创作复制、外部分轨分组                                                |
| `desktop/archive.cjs`、`transfer.cjs`、`peer-files.cjs`             | `.ijam`、局域网 HTTP、WebRTC 文件片段接口                                                  |
| `desktop/runtime.cjs`、`audio-tools.cjs`、`models.cjs`              | 私有 Python、FFmpeg / ffprobe、模型下载校验                                                |
| `backend/worker.py`                                                 | Windows Python JSON 请求 / 进度 / 结果入口，诊断输出 stderr                                |
| `backend/separation.py`、`analysis.py`、`rhythm.py`、`alignment.py` | 分轨、和弦、节拍、乐谱对齐，分模块维护                                                     |
| `backend/model_safety.py`                                           | 受限权重加载、配置安全检查                                                                 |
| `src/platform/android/`                                             | Android 网页桥接、移动布局、分享和流式音频处理                                             |
| `platforms/android/app/src/main/java/app/immersejam/mobile/`        | Android Activity、原生桥、存储、录音持久化与导出                                           |
| 上述目录下 `processing/`                                            | WAV、MIDI、和弦特征、录音时间换算、有界乐谱对齐                                            |
| 上述目录下 `inference/`                                             | 独立 `:inference` 进程、ONNX、分块分轨与 Beat This!                                        |
| 上述目录下 `transfer/`                                              | 私有局域网地址校验、可取消的流式 HTTP 收发                                                 |
| `platforms/android/model-catalog.json`                              | 移动模型、SHA-256、输出声部、内存门槛；不复用桌面 checkpoint                               |
| `shared/locales/en.json`、`src/i18n/`                               | 中英文；用户自定义内容不翻译                                                               |
| `installer/setup.nsh`                                               | Windows 安装向导、数据路径、运行环境和可选模型                                             |

Android 不引入 Windows 主进程或 Python 运行环境。网页分别构建为 `dist/` 和 `dist-android/`。新平台差异继续放到平台目录，不在共享播放器里散落设备特例。

## 4. 数据与必须保持的行为

- 完整 `.ijam` 含项目 JSON、媒体和校验清单，跨端保留同一时间轴。详见 [数据格式](docs/DATA_FORMAT.md)。
- 曲库歌曲与从它创建的跟练 / 创作拥有独立媒体副本；删除源歌曲不能连带损坏已创建的跟练。
- 项目内 `results/` 存各模型结果，`recordings/` 存原始 / 归一化录音及中断恢复标记，`attachments/` 存乐谱。以代码数据契约为准，不手工改私人项目文件试验。
- 原始录音必须保留。归一化或保存失败不能删除原始录音与 pending 恢复记录；跟练的“两条”仅限制挂载数量。
- 已有同源归档在 Android 会去重，**并不自动合并新编辑或覆盖旧分析**。测试应使用独立源编号，不能误把去重结果当新导入的样例。
- Windows 安装的数据根目录承载 library / runtime / profile 等；开发使用 `.runtime/`。Android 使用应用专用存储，卸载前需要导出。
- 测试可用 `IMMERSE_DATA_DIR`、`IMMERSE_RUNTIME_DIR`、`IMMERSE_PROFILE_DIR` 指向隔离位置，绝不能直接拿用户曲库试删除、迁移、导入或恢复。

## 5. Android 实现状态

| 能力                                                | 交接状态                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| 手机 / 平板 UI、返回、分类、跟练 / 创作、播放与波形 | 共享实现，模拟器验收通过                                               |
| UVR 人声 / 伴奏两轨                                 | 随包约 64 MiB，模拟器实际推理通过                                      |
| SCNet 四轨                                          | 可选约 50 MiB，模拟器实际推理通过；运行内存门槛高于两轨                |
| Beat This! final0                                   | 随包约 78 MiB，与电脑同权重转换；模拟器原生推理通过                    |
| 节拍保护                                            | 默认保留导入 / 手动校准结果，明确选择才重算                            |
| 和弦                                                | 轻量 chroma / Viterbi，可编辑；复杂曲目精度不保证                      |
| 录音 / 归一化 / 中断恢复                            | 模拟输入及实际原生文件链路通过，实体 USB 效果器未验收                  |
| MIDI 自动对齐                                       | 原生解析及有界 DTW 已实现，合成样例通过                                |
| `.ijam`、系统打开分享包、跨端往返                   | 已通过；调试桥转送不等于真实 WebRTC 网络测试                           |
| 电脑 ↔ 模拟器局域网                                 | 真实 HTTP 双向传输、取消 / 重连通过                                    |
| 相机扫码                                            | 已接入，窗口打开 / 返回取消通过；实际识别没有验收通过                  |
| 远程 WebRTC                                         | 共享界面和文件桥已有；真实跨设备 / 跨运营商网络未验收，无配置中的 TURN |
| 六轨、主奏 / 节奏吉他、主唱 / 和声模型              | 移动本机适配未完成；可导入电脑已分离的全部音轨                         |
| 后台 / 锁屏、电话 / 蓝牙路由                        | 原生长期播放服务及完整生命周期适配尚未完成                             |
| 本机 `.aum` 迁移、自定义模型导入                    | 未迁移；可先在电脑处理再分享结果                                       |
| 正式签名、应用商店                                  | 未配置，当前为 debug-signed preview                                    |

### 资源保护

单任务、独立推理进程、固定分块、最多两条计算线程，检查内存、存储、温度和取消；失败保留旧分轨。UVR 约需 900 MiB 可用内存，SCNet 与 Beat This! 约需 1200 MiB。不能把文件体积当运行内存需求。

播放解码约限制在 320 MiB 且不超过可用内存四分之一，因此 44 分钟以内的多轨长曲也可能被拒绝；后续应考虑原生流式播放。MIDI 对齐最多 200 万个回溯单元，只保留三行成本，音符特征用范围累加。

局域网原生客户端只接受携带临时令牌的私有 IPv4 HTTP 地址，不接受任意域名 / 公网地址、不跟随重定向。网页资源仍受来源限制，模型仍使用固定 HTTPS 来源和哈希。

## 6. 验证证据与未结项：不要写成“全部通过”

以下为历史执行结果，本次整理文档没有重跑测试。

- 53 项 Node、16 项 Java 计算 / 校验测试通过；桌面共享 UI 和 Android 共享 UI 回归通过。
- Android 36 秒合成曲跨越 30 秒模型窗口：72 个节拍、18 个小节首拍、120 BPM，与电脑时间差为 0。仅说明这个样例一致，不能外推所有曲目准确。
- MIDI 合成样例：73 个同步点，可信度约 0.887；独立变速样例误差中位数约 0.05 秒。
- 0.5× / +12 半音的 880 Hz、2 秒录音归一为 440 Hz、1 秒；1.5× / −5 半音录音在强制停止后恢复为 440 Hz、1.5 秒。
- 手机 412 dp、平板 1707 dp、录音、浏览不中断与返回行为通过。均为 Android 15 x86_64 模拟器，不是 ARM64 真机 / 实体声卡验收。

**必须保留的两个未结项：**

1. Android 3 项设备测试首次通过，最终重复执行时有 1 项失败：同源测试样例已被前一轮改为 120 BPM，导入去重后断言仍期待 120.123。`StorageTest.java` 已改为每轮独立源编号，**最终修订没有重跑**，用户当时要求停止检查直接发布。
2. 本机 `.runtime/audio-session-final.log` 留有桌面音频会话失败：`scripts/audio-session-check.cjs:116` 报 `stale audio leaked into a silent resume: 0.022641103714704514`。**尚未确定是产品残留音、测量窗口还是测试时序问题，不能宣称已排除。** 源码虽然实现了 DSP reset / fade，用户也验收过桌面，但这条后来的失败仍应优先调查。该日志在忽略目录，不随 Git 传播，关键信息已在本文保留。

详细记录：[Android 设备验收](docs/ANDROID-DEVICE-VALIDATION-2026-10-30.md)、[历史迁移](docs/ANDROID-MIGRATION-2026-10-30.md)、[GitHub 反馈核对](docs/FEEDBACK-2026-10-30.md)、[验证说明](docs/VALIDATION.md)。源码已实现某项修复不等于 GitHub Issue 已被关闭；没有获授权时不要代用户发评论或关闭问题。

## 7. 开发环境与常用命令

当前机器有 Node.js 24、Android Studio JBR、SDK、Gradle 和现有 AVD。私有配置 `.runtime/android/config.json` 保存 Java / SDK / Gradle 路径，不提交。JBR 在 `D:/Android Studio/jbr`；SDK 在用户的 `AppData/Local/Android/Sdk`。Android 配置为 minSdk 28、targetSdk 35、compileSdk 37、AGP 9.4.1、Gradle 9.6.1。

桌面常用命令（按改动选择，不必每次全部重复）：

```powershell
npm ci
npm run dev
npm run check
npm test
npm run build
npm run test:backend
npm run package
```

`prepare:runtime` 准备 Windows 私有环境；Python 在 `.runtime/venv/Scripts/python.exe`。不要重装全局环境来掩盖私有环境问题。FFmpeg / ffprobe 由项目准备。

Android：

```powershell
npm run android:models
node scripts/android.cjs assembleDebug
node scripts/android.cjs assembleDebugAndroidTest
node scripts/android.cjs testDebugUnitTest
```

模型转换首次需要开发机 Torch / ONNX 等依赖；手机运行不需要 Python。脚本会准备网页、校验并复制模型、许可证，再调用 Gradle。纯单元测试入口目前也会走资源准备，不能假设无模型即可直接运行。

模拟器曾使用 `Medium_Phone_API_35` / `emulator-5554`；跨会话不能假设还在运行。不要 wipe data，不安装到实体设备，除非任务授权。APK 在 `platforms/android/app/build/outputs/apk/debug/`。`scripts/android-artifacts.cjs` 只复制 APK 并生成摘要，不是正式签名流程。

### 针对性脚本

| 脚本                                                              | 用途                                               |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `scripts/ci-ui-check.cjs`                                         | 隔离桌面共享 UI                                    |
| `scripts/audio-session-check.cjs`                                 | 音频恢复 / 暂停 / 校准链路，当前有上述未结失败     |
| `scripts/android-shared-ui-check.cjs`                             | 不依赖 SDK 的手机 / 平板共享界面，原生接口为模拟   |
| `scripts/android-check.cjs`                                       | 实际模拟器网页与返回、播放                         |
| `scripts/android-recording-check.cjs`                             | 模拟输入录音 / 保存 / 暂停挂起                     |
| `scripts/android-tablet-check.cjs`                                | 临时改分辨率检查平板，finally 恢复                 |
| `scripts/android-beat-fixtures.py`、`android-device-fixtures.cjs` | 生成隔离合成节拍 / MIDI / `.ijam` 样例             |
| `scripts/android-native-parity-check.cjs`                         | 原生节拍 / 对齐、变速录音、强停恢复                |
| `scripts/android-archive-roundtrip-check.cjs`                     | Android ↔ 隔离 Electron ↔ Android 完整包与系统打开 |
| `scripts/android-lan-check.cjs --scanner`                         | 真实局域网收发 / 取消；扫码参数只证明打开和取消    |

测试脚本会写合成样例，使用专门的测试环境。Playwright 浏览器曾放 `.runtime/browsers`；需要时设置 `PLAYWRIGHT_BROWSERS_PATH`。Windows 隔离执行环境可能看不到宿主模拟器或 GitHub 登录，不能把权限视图差异误判为未安装工具。

## 8. 典型问题与已经做过的修复

- 最早的 WinError 2 在分离时来自音频工具调用缺失；`CUDAExecutionProvider not available` 是加速警告，不能把它直接当作 FileNotFoundError 根因。
- seek / 循环不应反复 pause / play 重建 SoundTouch。已有复用、FIFO reset、排程与淡入淡出，但继续排查第 6 节残留音证据，不能简单删掉保护。
- 录音权限失败不能清空用户循环；暂停要挂起音频上下文，录音 / 校准通过会话保活，退出释放。
- 导出入口验证速度，拒绝 0 / 负数，避免 atempo 死循环；缺省文件名不能中断整批导出。
- 内置模型和配置固定摘要；下载后无哈希不能冒充“已验证”。自定义 PyTorch 采用受限加载。
- Android `JSONObject.optDouble(key)` 缺省是 NaN，需要明确默认值；已修正多个可选字段。
- 电脑流式 STORED ZIP 带数据描述符，Android 改用 `ZipFile` 中央目录读取；保留路径、体积、条目及 SHA 校验，失败回滚。
- Windows 对空 `sourceGroups` 数组兼容；Android 导出非创作时移除空分组，兼容旧版桌面。
- 完整分享使用包含分析的归档，不要退回只打媒体的包而丢掉节拍 / 对齐。

## 9. 后续顺序建议

1. 用户重新要求功能开发 / 验证时，先处理桌面残留音失败和设备测试隔离修订，分别确认，别混成一个“全过”结论。
2. Android 实体 ARM64：节拍时序、耳机 / USB 输入、延迟、扫码识别、文件分享、内存和热稳定性。
3. 原生后台 / 锁屏播放服务、音频焦点、电话打断与路由恢复；不能仅靠网页计时器假定锁屏可靠。
4. 手机之间与手机 / 电脑之间真实 WebRTC 传输，确认 NAT 失败提示、断开与文件清理；同源更新导入需要明确交互设计。
5. 移动六轨及专用模型适配、严格声部契约、自定义模型安全导入；长期增加流式播放能力。
6. 正式 Android 签名与更新策略；更换签名会影响覆盖安装，先明确备份 / 迁移，不提交密钥。

发布附件还有一处命名整理事项：GitHub 将 Windows 资产名规范成 `Immerse.Jam.Setup.0.1.9.exe`，本地文件名使用空格。后续整理校验清单时需使清单文件名与实际下载名一致，不能只比较摘要而忽略文件名。

## 10. 协作与发布约定

- 用户希望直接做已授权的工作，不反复确认；有缺失信息再简短询问，能独立推进的先推进。
- 用户不希望每次修订都发布 Release。**提交源码与公开发布分开**；2026-10-30 的“直接提交再 Release”授权用于已完成的 v0.1.9，不等于今后所有改动都自动发版。
- 当时的“停止检查”已执行；本次只整理文档和完成已授权发布，没有追加功能测试。未来按新任务决定必要验证，不把一次暂停测试当成永久禁测。
- 不删私人曲库，不 wipe 模拟器，不覆盖运行中的原桌面程序；构建可使用独立输出目录。
- 不提交 `.runtime/`、`release/`、个人音频、权重、缓存、凭据或签名密钥。Android / 桌面第三方许可分别维护。
- 不替用户发送邮件、GitHub 评论或关闭 Issue，除非明确授权。不要未经请求创建新聊天或分派子代理。

## 新会话入口

把下面这段发到新会话即可：

```text
请先阅读 D:\garbage pile\Immersed\DEVELOPMENT_HANDOFF.md，
再按我这次的具体要求继续 Immerse Jam。
功能基线是 35ae416，v0.1.9 已发布，Android 仍是调试签名预览版。
注意交接文档中两个未结测试项，不要假定全部检查通过，
不要每次修订都上传 Release，也不要修改我的私人曲库。
```

进一步阅读：[架构](docs/ARCHITECTURE.md)、[Android 功能表](docs/ANDROID.md)、[Android 构建](platforms/android/README.md)、[总待办](TODO.md)、[许可范围](docs/LICENSING.md)。
