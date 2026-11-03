# Immerse Jam 开发交接

更新于 2026-11-03。此文件只记录当前状态；历史长记录仍在 Git 中，可用 `git show eddf1b3:DEVELOPMENT_HANDOFF.md` 查看。不要把其中早期的“暂停”“未完成”等描述当成当前指令。

## 当前决定

- 作者已允许清理仓库、修复失败的检查、编写交接并上传 Git。
- 本轮没有要求新 Release、Setup 或重新安装应用；正式版本仍为 Windows 0.1.11 / Android 0.1.0-preview.3。
- 最近 UI 小改动曾明确要求不跑测试；本轮只因失败工作流而复跑相关脚本，没有重复模型分离、安装依赖或私人工程的录音测试。
- 不大改操作逻辑。保持单色总波形，点击声部切换单轨 / 总波形；单击波形不跳转，拖动定位，PC Ctrl＋滚轮 / Android 双指连续缩放。

## 使用入口与数据

- 作者原入口：`D:\garbage pile\Immersed\Start-Immerse-Jam.cmd`，启动 `release/win-unpacked/Immerse Jam.exe`。
- 私人曲库：`.runtime/data`；本地运行库、模型、验证脚本与日志也在 `.runtime/`。不要上传或清理这些数据。
- 最近 Windows / Android 验收产物和回退程序分别在 `release/simple-meta-review`、`release/result-menu-review` 等目录；它们是本地测试版，并非新的公开发行包。
- 平板已装同签名测试 APK。无线调试地址可能变化，操作前先确认连接和空闲状态；不要打断作者播放、录音或覆盖私人工程。
- Windows 打包若提示原程序正在运行，先准备完整新包，再请作者退出后覆盖原入口，保留旧版本。不要删除原目录后再尝试构建。

## 已实现的主要行为

- 同学 PR #6 的原始提交及作者署名在 Git 历史中保留。UI 由其代码移植，并保留作者原操作逻辑。
- 桌面为应用内窗口按钮，保存 / 拆分等控件在下一行；分离结果位于控制台。
- 两端分离结果使用同一个菜单：选中、命名、删除。删除有确认，当前结果删除后回原曲。未被其他内容引用的结果媒体移到数据目录 `trash/results`，保留删除前清单；没有新增还原 / 清空入口，因此暂不释放这些回收文件的磁盘占用。
- 和弦谱菜单管理新建、改名、删除；没有和弦库或常驻名称框，格内自由输入。自动识别项的勾与删除按钮同列。
- BPM 只显示数值，无 Tap 或 BPM 校准面板；桌面调性修正保留。Android 标题和列表显示 BPM、major / minor 调性。
- 乐谱使用独立浅底深字，保留导入与视觉跟随，已移除 MIDI 发声入口和合成。
- 音乐库、收藏、分类共用列表 / 方格偏好，封面尺寸统一。工程支持名称、简介、封面，分类支持图片；资料随工程包保留。
- 两端可自定义波形颜色；Android 独有鼠标指针选项，并共享键盘快捷键。
- 录音按钮在原位置切换停止状态，结束后尽量保留伴奏播放与当前位置，新增录音用增量追加。创作分组默认收起，按总波形 → 声部列表 → 单轨波形展开。
- 波形缓存仅存包络，最多 16 项 / 100 万峰值点；媒体和混音变化会失效。音频载入与波形预览就绪是不同阶段，勿将预览缓存称为全曲零等待。
- `test2` 曾保存不可用的伴奏输出；已增加设备校验与重新确认入口，换设备后旧链路延迟归零。原工程未被测试覆盖。

## 源码入口与不可误删的资源

- `src/app/App.tsx` / `useWorkspace.ts`：布局、状态与编辑协调。
- `src/audio/Player.ts`：音频与包络；Android 原生实现位于 `platforms/android`。
- `src/features/models/ResultPicker.tsx` / `chords/ChartPicker.tsx`：统一菜单。
- `src/styles/app.css`：正式统一样式入口，含 legacy / reset / design / integration 分层。网页演示也必须导入它，不要退回零散旧 CSS。
- `docs/design/prototype.html`、`UI_SPEC.md` 是同学原始设计贡献，`scripts/sync-rehearsal-design.cjs` 据此生成设计 CSS，必须保留。
- 字体、图标、第三方许可与安装资源清单均有实际用途，不按“看着不像代码”删除。
- `docs/site/assets/audio/fabulous-rehearsal` 的七个 MP3 是作者指定的公开演示素材，网站实际使用；不能作为私人音频误删。
- `scripts/` 中的设备、安装、录音检查有独立前置条件，没有被 npm scripts 引用不等于没用。不要一次性删除历史检查；入口和前置条件见 `docs/VALIDATION.md`、`docs/ANDROID.md`。

## 本轮清理与失败处理

- 删除：无引用的 `ChordDiagram.tsx` 和对应 CSS、根目录探针、`docs/zz-probe.md`、`zz-build` 临时构建 / 浏览器缓存、10 张已核对一致的重复截图。
- 本地保留：唯一含临时配对信息的互传截图和两份调试报告在 `.runtime/cleanup-2026-11-03`，禁止上传。
- `.gitignore` 和源码审计新增探针 / 私有素材保护；公开演示音频只允许精确白名单，源码审计加入 CI。
- 原 main 的 Source checks 41629834836 失败于寻找已移除的 MIDI 文案；Pages 41629834931 失败于把菜单项当按钮。两者都不是源码漏传。
- 同时修正后续脚本对旧和弦库、常驻名称框、BPM 编辑器的依赖；预备拍改为等待实际进度而非固定延时。
- 网站真实问题是仍导入旧 CSS；已改用 `app.css`，录音停止按钮恢复正常点击。
- 本地通过：类型 / 文案 / 桌面语法、源码材料审计、CI UI、播放控件、和弦交互、完整网站演示。网站演示验证不访问真实麦克风。远端结果以本次提交的 Actions 为准。

- 远端补充发现小窗口控制台覆盖和弦：已修复原型响应式定位冲突，1024 px 窗口的真实交互检查通过。保留这项窄窗回归检查；不要用强制点击隐藏遮挡。

## 后续工作方式

1. 先看当前 Git 状态和远端，避免覆盖其他 agent 或同学的新提交。
2. 需要构建桌面用 `npm run build`；本地打包 `node scripts/package.cjs dir`。Android 为 `node scripts/android.cjs assembleDebug`。
3. 只运行改动相关检查，不重下模型或对私人曲库做破坏性操作。网页流程用 `scripts/test-website-demo.cjs`；预先构建 `web-demo/vite.config.mjs`。
4. 当前上传没有发布 Release。后续是否 release、是否制作新 Setup 由作者决定。
5. 更详细的行为、验证边界与回退位置见 `docs/RESULT-MENU-2026-11-03.md`、`docs/REVIEW-CHORD-SCORE-2026-11-03.md`、`docs/REVIEW-DETAILS-RECORDING-2026-11-03.md`。
