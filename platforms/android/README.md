# Immerse Jam Android

Android **0.1.0-preview.1**，与 Windows 独立打包、独立存储。当前为已实际运行的首个预览版本；完整能力进度见 [功能表](../../docs/ANDROID.md)。

## 结构

- `app/src/main/java/app/immersejam/mobile/`：Activity、受来源限制的桥接、存储、录音。
- `inference/`：独立进程中的解码／分块推理／频谱计算；不依赖 Python 或 CUDA。
- `processing/`：MIDI、节拍／和弦特征、对齐、录音时间换算和 WAV 读取。
- `transfer/`：原生局域网地址验证与可取消的流式 HTTP 收发；相机入口由 Activity 管理。
- `app/src/test/`：纯计算测试；`app/src/androidTest/`：Android 存储与恢复测试。
- `model-catalog.json`：Android 专用格式、体积、SHA-256、声部清单与内存门槛。
- `../../src/platform/android/`：共享 React 界面的 Android 桥接与手机／平板布局。
- Windows 主进程仍在 `../../desktop/`，桌面 Python 在 `../../backend/`。Android 不导入两者。

## 构建

需要 Android Studio JBR、Android SDK 37、Build Tools 36，以及 Node.js 24。设置 `JAVA_HOME` 与 `ANDROID_HOME`，然后在仓库根目录：

```powershell
npm ci
npm run android:models
npm run android:build
npm run android:test
```

开发者首次转换随包 Beat This! 需要桌面 Python 音频／Torch／ONNX 依赖（可复用项目私有运行环境）。`android:models` 下载并校验指定 final0 后调用 `scripts/export-android-beats.py`，生成固定摘要的 ONNX 和 mel 矩阵。手机安装后的运行不需要 Python，也不下载 checkpoint。转换结果、模型和运行环境不提交 Git。

节拍对照：开发机先运行 `python scripts/android-beat-fixtures.py` 生成合成样例，再执行 `android:test`；Java 特征与后处理会和电脑结果比较。没有本机合成样例时，对照项跳过，普通计算测试仍执行。详细结果见 [迁移记录](../../docs/ANDROID-MIGRATION-2026-10-30.md)。

Windows 环境也可在忽略的 `.runtime/android/config.json` 中指定 `java`（JBR 目录）与 `sdk`。Gradle wrapper 固定版本；不要提交个人 SDK 路径、Gradle 缓存、签名密钥或模型权重。模型通过构建脚本固定摘要下载，APK 首次使用基础模型不需要联网。

Android Studio 打开本目录。先执行一次 `android:build` 准备共享网页和模型资源，再在 Studio 中开发、运行。网页源码修改后重新运行构建脚本。

`app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` 用于 ARM64 手机／平板；`app-x86_64-debug.apk` 用于模拟器。这是调试签名的预览包，正式签名和商店发布尚未配置。

## 自动验收

构建设备测试：`node scripts/android.cjs assembleDebugAndroidTest`。将主 APK 和测试 APK 装入隔离模拟器后运行 AndroidJUnitRunner。设备测试写入合成样例，不读取个人歌曲。

`android-check.cjs`、`android-recording-check.cjs`、`android-tablet-check.cjs` 位于根目录 `scripts/`，连接已启动模拟器中的调试 WebView；平板检查临时更改显示尺寸并在 finally 中恢复。需要现代 Android System WebView。完整结果及性能边界见 [ANDROID.md](../../docs/ANDROID.md)。

`android-device-fixtures.cjs` 从本机合成节拍样例生成电脑格式 `.ijam`，复制到应用 `cache/device-fixtures/source.ijam` 后可执行对应设备测试。`android-native-parity-check.cjs` 验证实际原生节拍、MIDI 对齐、变速录音和强制中断恢复；`android-archive-roundtrip-check.cjs` 启动隔离的电脑实例验证完整包往返与系统接收。

`android-lan-check.cjs --scanner` 使用真实 HTTP 验证电脑和模拟器双向收发、取消和重连，同时检查原生扫码窗口打开和返回取消；不声称已经测试相机识别。上述脚本仅操作合成样例，应在专用测试模拟器执行。构建／安装调试包需获得当前任务授权；这些命令不创建 GitHub Release。
