# Immerse Jam 交接入口

**状态日期为 2026-11-08。** 下面的构建、发布和实机状态以功能提交 `6447fe7` 为基线。接手时先运行 `git status --short --branch` 和 `git log -5 --oneline`，再确认本地与远端状态。

## 从哪里开始

| 要做的事                                  | 入口                                        |
| ----------------------------------------- | ------------------------------------------- |
| 跑起来、隔离调试、打包                    | [开发指南](docs/DEVELOPMENT.md)             |
| 修改 IPC、Android 桥接、Python 任务或互传 | [接口与契约](docs/INTERFACES.md)            |
| 理解模块与音频链                          | [架构](docs/ARCHITECTURE.md)                |
| 维护项目清单、录音或跨端工程包            | [数据格式](docs/DATA_FORMAT.md)             |
| 构建和调试 Android                        | [Android 开发](platforms/android/README.md) |
| 更新官网、网页版试用和截图                | [官网维护](docs/WEBSITE_MAINTENANCE.md)     |
| 查找测试及前置条件                        | [验证指南](docs/VALIDATION.md)              |

## 目前交付到哪里

| 目标         | 当前状态                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub 源码  | `Kreeli/immerse-jam` 的 `main` 已收到 `53d86a0` 播放和保存修复及 `6447fe7` 赞赏码更新。这两次源码同步跳过自动工作流。                                                                                                                                          |
| 公开发行     | [v0.1.12](https://github.com/Kreeli/immerse-jam/releases/tag/v0.1.12)，Windows **0.1.12**、Android **0.1.0-preview.4**。下面的本地包使用同一版本号，但包含后续源码。                                                                                           |
| 本地 Windows | `Start-Immerse-Jam.cmd` 启动 `release/win-unpacked/Immerse Jam.exe`。当前目录已经包含新赞赏码，程序包已校验。                                                                                                                                                  |
| 本地 Android | `release/Immerse-Jam-Android-playback-stable-arm64.apk` 已覆盖安装在作者平板，已比对设备 APK 哈希。包名 `app.immersejam.mobile`，versionCode 4，保留原数据。                                                                                                   |
| 官网         | 新源码和本地试用均显示附件原图。可部署包在 `release/website-ready/Immerse-Jam-site-6447fe7.zip`。线上部署 [42457914848](https://github.com/Kreeli/immerse-jam/actions/runs/42457914848) 因账户账单锁定，在运行任何步骤前失败。线上旧赞赏图片最后确认仍能访问。 |

本地交付物校验值：

| 文件                                                    | SHA-256                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `release/win-unpacked/resources/app.asar`               | `ba3315f8d615c936271f40efbea448d21e1013b83037e01559cf2c2cf9ac2883`  |
| `release/Immerse-Jam-Android-playback-stable-arm64.apk` | `f24d8373ec3923633837ec8f1027d9c911b4212c8b292e40508b3a708f6d0d7e`  |
| `release/website-ready/Immerse-Jam-site-6447fe7.zip`    | `5734753a71173709700e91b6656ec1c8e5706f41d17976dae07fae40e9ec0ab74` |

## 需要保留的当前行为

- Windows 和 Android 播放中都可以点击或拖动进度条跳转。单击主波形不定位，拖动波形定位。普通控件聚焦时空格优先播放／暂停，鼠标或触摸操作不显示键盘焦点框。Tab、文字输入和菜单保留各自键盘行为。
- Android 用磁盘 PCM 窗口播放。稳定版采用短预读后切换，预读时继续播原位置。拖动试听与倒放试验已回退。冷读和变速／移调仍可能有可感知的延迟，勿把合成音频的一次采样当成所有歌曲的承诺。
- [Issue #11](https://github.com/Kreeli/immerse-jam/issues/11) 两项修复已在 `53d86a0`。Android 普通桥接请求等待原生响应，项目保存失败按项目隔离。失败项目需要手动重试或放弃修改。
- 新赞赏图唯一源文件是 `docs/site/assets/author-appreciation.png`，Windows、Android、官网与网页试用共用。当前源码及新版产物已移除旧图，Git 历史、历史安装包和线上旧部署可能仍保留旧码。

## 交接后的操作

1. 本地先从 [开发指南](docs/DEVELOPMENT.md) 选对应平台和最小相关测试。最近一次完整 Node 回归为 **136 项通过**，随后赞赏码改动通过类型、文案、桌面语法、三端构建及网页交互检查。未因换图重新跑大型模型推理或完整安装器流程。
2. 官网恢复部署前，确认作者的 GitHub 账户限制解除，再按 [官网维护](docs/WEBSITE_MAINTENANCE.md) 手动运行 Pages。部署后核对新图可访问、旧图不再从当前站点提供。单独发布应用由作者决定。
3. 开发数据默认位于 `.runtime/data`，已安装 Windows 版跟随其 `installation.json`，Android 数据由应用保管。保留原数据、签名、备份和模型缓存。无线 ADB 地址会变化，使用前确认设备空闲和系统授权。
4. 使用合成媒体或明确允许公开的演示素材。不要上传私人曲库、录音、截图、配对码、本机路径配置或签名。不要修改用户的系统代理、DNS 或网络配置来排查下载。

早期交接长记录可用 `git show 6447fe7:DEVELOPMENT_HANDOFF.md` 查阅。各轮 [验收记录](docs/VALIDATION.md) 和 [旧交接记录](docs/HANDOFF-RELAY-2026-11-04.md) 保留历史依据，里面的版本与阶段性决定以当时为准。
