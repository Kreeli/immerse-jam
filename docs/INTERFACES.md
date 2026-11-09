# 接口与契约

这里记录跨模块边界、关键参数和安全约束。请求全量名单以 [共享 IPC 白名单](../shared/ipc-methods.json) 为准，字段与返回值以处理器和调用点为准。项目结构与归档兼容性见 [数据格式](DATA_FORMAT.md)。

## React 到宿主

共享界面使用 [window.jam](../src/shared/types.ts)，包括 `call(method, data?)`、`onEvent(callback)`、`filePath(file)` 和可选的初始语言。`call` 返回 Promise，`onEvent` 返回取消订阅函数。事件可携带 `jobId`、`projectId`、`operation` 和 `scope`，应按来源识别并发进度。

常用业务调用通过 [jamCall](../src/platform/project-call.ts)。有序项目操作先等对应项目的待保存编辑，再进入宿主，避免导出或删除使用旧清单。批量操作缺少单一 `id` 时由调用链处理待保存编辑。新增有序写入时检查这里的名单和 [useWorkspace](../src/app/useWorkspace.ts) 中的保存协调。

| 用途           | 方法与常用参数                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 曲库           | `library()` 返回项目列表，`update({ id, patch })` 写入部分项目字段。项目类型在 [types.ts](../src/shared/types.ts)，补丁在 [project-patch.cjs](../shared/project-patch.cjs)。            |
| 分离结果       | `result-select({ id, resultId })`、`result-rename({ id, resultId, name })`、`result-delete({ id, resultId })`。                                                                         |
| 附件与创作分组 | `attach`、`read-attachment({ id, attachmentId })`、`attachment-delete({ id, attachmentId })`、`creation-add-group`、`creation-import-group`、`creation-remove-group({ id, groupId })`。 |
| 录音           | `take-start` 开会话，`take-append` 追加 PCM，`take-finish({ sessionId })` 完成，`take-select({ id, takeIds })` 选择挂载。删除、回收与恢复使用独立方法。                                 |
| 导出和互传     | `export` 打包项目，`export-audio` 导出分轨或混音。共享连接码传输使用 `peer-*` 方法交换分块并验证后接收。                                                                                |
| 桌面分析       | `run({ id, operation, ... })` 提交分析、分离或对齐，`cancel({ jobId })` 取消。                                                                                                          |
| 桌面运行环境   | `runtime-status`、`runtime-install({ mode })`、`models`、`model-download({ id })`、`model-source-open({ id, file })`。                                                                  |

保存失败状态按项目、编辑类型记录。成功保存另一项目不得清除原项目错误。自动保存跳过失败项目，手动重试或放弃修改才处理其失败状态。

## Windows Electron

[prepare-preload.cjs](../scripts/prepare-preload.cjs) 从共享白名单生成沙箱 preload。`window.jam.call` 映射为 `ipcRenderer.invoke('jam:' + method, data)`，`jam:event` 推送业务事件。用 `npm run build` 重新生成桥接，避免手改生成文件。

- [application.cjs](../desktop/application.cjs) 注册多数处理器，校验调用来自工作区窗口。
- [ipc/recordings.cjs](../desktop/ipc/recordings.cjs) 注册会话、录音与部分创作分组接口。
- `immerse://asset/<project-id>/<relative-file>` 由 `store.asset` 解析至项目范围内，越界和不可用文件返回错误。前端使用 `asset(id, file)` 构造地址。
- [ipc.test.cjs](../tests/ipc.test.cjs) 核对注册方法与白名单。新增方法还要检查 Android 与网页试用的能力边界。

## Android WebView 与 PCM

[MainActivity.java](../platforms/android/app/src/main/java/app/immersejam/mobile/MainActivity.java) 只接收应用资源来源的顶层框架消息。[bridge.ts](../src/platform/android/bridge.ts) 发送 `{id, method, data}`，[NativeBridge.java](../platforms/android/app/src/main/java/app/immersejam/mobile/NativeBridge.java) 用同一 `id` 返回 `{id, result}` 或 `{id, error}`，事件单独用 `{event}`。

- 除 `android-playback-state` 保留 15 秒等待外，普通请求等待原生任务的真实结果。不要用固定前端总时长将长任务标成失败，否则原生任务仍可能提交。局域网取消用 `android-lan-cancel`，原生端用代次检查拦住旧任务。
- 单条 JSON 消息上限为 2,000,000 字符。桥接会编码 PCM 追加和互传块，附件响应按需解码。媒体大块走资源响应，避免进入单条 JSON。
- `/app/` 提供打包界面，`/projects/` 提供项目媒体，`/stream/` 提供播放 PCM 与波形，`/capture/` 提供原生录音数据。
- `android-stream-open` 建立轨道读取会话，`android-stream-append` 更新轨道，`android-stream-wave` 创建波形任务，`android-stream-close` 释放会话。读取返回的波形 URL 才能让原生侧释放对应任务，即使界面已改选其他轨道。
- PCM 使用 48 kHz 交错双声道 Float32。前端 [StreamingAudio.ts](../src/platform/android/StreamingAudio.ts) 管理有界请求与缓存，[StreamTrack.ts](../src/platform/android/StreamTrack.ts) 把数据交给 [stream-processor.js](../src/audio/stream-processor.js)。播放状态、采集、文件处理和局域网使用各自的原生调度队列。
- `android-capture-*` 封装原生 AudioRecord，`android-render-*` 负责分块导出或录音归一化。Android 不提供本机分轨或分析，`run` 明确拒绝这类请求。

## Python 分析与任务事件

[desktop/jobs.cjs](../desktop/jobs.cjs) 创建独立任务目录、写入 UTF-8 `request.json`，再用私有解释器运行 [backend/worker.py](../backend/worker.py)。请求含 `operation`，不同任务附带 `source`、`directory`、模型配置或 `midi`。Worker 支持 `probe`、`prepare`、`analyze`、`align`、`separate` 与 `validate-model`。

- stdout 是逐行 JSON，含 `progress`、`result` 或 `failure`。第三方输出与诊断写 stderr。
- 桌面主进程验证结果并提交项目后，才发 `complete`。取消或失败保留之前可播放的结果。
- 模型来源、体积与摘要从 [桌面模型实现](../desktop/models.cjs) 和 [下载资源说明](DOWNLOAD_RESOURCES.md) 核对。维护下载不要放宽来源、摘要或受限模型加载校验。

## 局域网和网页版

[Windows 局域网服务](../desktop/transfer.cjs) 只用于可信局域网。一次性邀请通过 `POST /api/pair` 兑换短时会话，后续使用 Bearer 或受限 Cookie。主要路由为 `GET /api/list`、`GET /api/download/<id>`、`POST /api/upload?name=<file>`。上传先写临时目录并等待接收方确认；下载按请求生成独立临时归档并在结束时清理。不要在日志、文档或截图中记录实际配对令牌。

网页试用的 [bridge.ts](../web-demo/bridge.ts) 实现演示子集，使用公开素材与模拟操作。它没有 Electron 文件权限、Android 原生接口或真实录音和分轨能力。修改共享方法时，可通过 [网页演示测试](../scripts/test-website-demo.cjs) 检查与演示适配器是否兼容。
