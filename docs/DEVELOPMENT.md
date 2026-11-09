# 开发指南

当前源码基线与本机交付位置见 [开发交接](../DEVELOPMENT_HANDOFF.md)。在仓库根目录运行以下命令。

## 先跑起来

Windows 开发环境使用 Node.js 24 和 npm。项目通过 Electron 主进程提供文件、音频与运行环境接口。浏览器直接打开 Vite 开发地址只能看到网页环境，完整桌面调试用 `npm run dev`。

```powershell
npm ci
npm run check
npm run dev
```

`npm run dev` 启动本机 Vite 和 Electron。构建产物用 `npm run build`，结果在 `dist/`。构建会重新生成 `desktop/preload.cjs`、校验 TypeScript 并复制资源与许可。

真实分轨、节拍或对齐需要桌面私有 Python 和相应模型。用 `npm run prepare:runtime` 准备运行环境，或通过应用的设置页面安装。安装日志在所选数据目录的 `installation.log`，分析任务另有运行目录里的 `jobs/<id>/worker.log`。诊断先读日志与进度，续传使用原有下载缓存。

## 隔离曲库与构建目录

| 路径或变量                                                | 用途                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Start-Immerse-Jam.cmd`                                   | 本机原启动入口，使用 `release/win-unpacked` 和 `.runtime/data`。                  |
| `IMMERSE_DATA_DIR`                                        | Electron 项目库根目录。测试指向临时库。                                           |
| `IMMERSE_RUNTIME_DIR`                                     | 运行库、模型、缓存与任务日志根目录。                                              |
| `IMMERSE_PROFILE_DIR`                                     | 独立 Electron 用户配置目录。                                                      |
| `IMMERSE_LOCALE`                                          | 测试时初始化语言，例如 `zh-CN`。                                                  |
| `installation.json`                                       | 安装版程序旁的配置，选定数据根目录下分别使用 `library/`、`runtime/`、`profile/`。 |
| `.runtime/test-workspaces/`、`test-output/`               | 隔离样例与截图。内容可能包括本地调试信息。                                        |
| `release/`、`dist/`、`dist-android/`、`docs/site/tryout/` | 本地产物。通过构建重新生成。                                                      |

手动隔离调试可在一个新的 PowerShell 窗口设置进程级路径：

```powershell
$jamQa = Join-Path $PWD ('.runtime/test-workspaces/manual-' + [guid]::NewGuid())
$env:IMMERSE_DATA_DIR = Join-Path $jamQa 'data'
$env:IMMERSE_RUNTIME_DIR = Join-Path $jamQa 'runtime'
$env:IMMERSE_PROFILE_DIR = Join-Path $jamQa 'profile'
npm run dev
```

多数 UI 验收脚本已用 [fixtures.cjs](../scripts/fixtures.cjs) 自建隔离曲库。若只检查界面或播放，不必复制个人库或下载模型。

## 打包 Windows

```powershell
npm run build
node scripts/package.cjs dir
```

`dir` 先在 `release/build-staging/win-unpacked` 构建，校验关键文件后替换原入口目录。旧版正在运行时，新包留在暂存目录。退出后再替换，保留可恢复的旧程序和数据。只需要单独候选包时：

```powershell
node scripts/package.cjs dir --output=.runtime/desktop-candidate
```

制作 NSIS Setup 用 `npm run package`。打包器读取 `package.json`、`installer/setup.nsh` 和安装工具清单；Setup 的启动、依赖安装和运行环境准备是单独验收项。安装器下载所需资源与许可见 [下载资源说明](DOWNLOAD_RESOURCES.md)。制作本地包、推送源码、部署 Pages、发布 GitHub Release 是四个独立操作。

## Android 与 Web

- Android 入口是 `npm run android:build` 或 `node scripts/android.cjs assembleDebug`，输出 ABI 独立的调试 APK。环境、签名及 ADB 见 [Android 开发](../platforms/android/README.md)。
- 官网源码在 `docs/site`，网页试用由 `web-demo` 复用共享 React。构建后可在浏览器切换 Windows 和 Android 试用；测试媒体来自公开演示样例。
- 赞赏图统一维护 `docs/site/assets/author-appreciation.png`。修改后重建 Windows、Android 和网页版，检查产物使用相同图像字节。

```powershell
node node_modules/vite/bin/vite.js build --config web-demo/vite.config.mjs
node scripts/preview-website.cjs
```

## 修改时选哪些检查

| 改动                       | 最小检查                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| TypeScript、文案、桌面脚本 | `npm run check`。                                                                                          |
| 数据保存、桥接、音频调度   | `npm test`，或用 `node --test` 运行对应的 `tests/*.test.cjs`。Windows 的部分安全测试需要创建隔离符号链接。 |
| 桌面共享 UI                | 先 `npm run build`，再 `node scripts/ci-ui-check.cjs`。浏览器须可用。                                      |
| 网页试用和官网             | 先构建 `web-demo`，再 `node scripts/test-website-demo.cjs`。                                               |
| Android 原生代码           | `npm run android:test` 和 `npm run android:build`。设备相关功能再做指定真机或模拟器验收。                  |
| Python 分析                | 已有私有 Python 后执行 `npm run test:backend`。真实模型音质和速度另验。                                    |

更多历史验收入口及各自的依赖见 [验证指南](VALIDATION.md)。报告时区分本地通过、设备验证和远端工作流状态。
