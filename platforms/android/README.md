# Immerse Jam Android 开发

当前 **0.1.0-preview.4**，包名 `app.immersejam.mobile`，versionCode 4。最低 Android 9（API 28），编译 SDK 37，目标 API 35。Android 提供项目导入、播放、跟练、创作、前台录音、导出和设备互传。分轨与自动分析在 Windows 完成。

## 构建与安装

在 Windows 准备 Node.js 24、Android Studio 自带的 JBR、Android SDK 37 和 platform-tools。可设置 `JAVA_HOME` 与 `ANDROID_HOME`，也可在忽略的 `.runtime/android/config.json` 中配置 `java` 与 `sdk` 为本机目录。Gradle wrapper 当前固定 9.6.1，Android Gradle Plugin 为 9.4.1。

在仓库根目录运行：

```powershell
npm ci
npm run android:build
npm run android:test
```

[构建脚本](../../scripts/android.cjs) 先生成 `dist-android/`，复制 WebView 资源，再调用 Gradle。当前构建无需 `android:models`，也无需准备 Python、ONNX 或分离权重。旧模型脚本与推理文档属于早期预览历史。

产物位于 `platforms/android/app/build/outputs/apk/debug/`。

- `app-arm64-v8a-debug.apk` 用于主流 Android 手机和平板。
- `app-x86_64-debug.apk` 用于对应模拟器。

经授权后用 `adb devices -l` 确认目标。无线调试配对地址和连接端口会变化，按设备界面当前信息操作。确认应用没有播放、录音或互传后，可用同签名 `adb -s <serial> install -r -t <apk>` 覆盖安装，按系统提示确认。签名不一致时先保全项目数据，避免卸载、清数据或更换调试密钥。调试签名、SDK 路径和连接信息不进 Git。

## 源码与验证

- [原生宿主](app/src/main/java/app/immersejam/mobile) 包含 Activity、桥接、存储、流式音频、AudioRecord、系统分享和局域网。
- [共享 Android 前端](../../src/platform/android) 负责 WebView 桥接、播放窗口、录音适配和移动布局。
- [接口文档](../../docs/INTERFACES.md) 记录消息、媒体路由及取消约束。
- `node scripts/android.cjs assembleDebugAndroidTest` 构建设备测试 APK。真实录音或互传用独立样例，脚本及前置条件见 [验证指南](../../docs/VALIDATION.md)。
- [功能与历史说明](../../docs/ANDROID.md) 区分当前路径和早期模型实验。[交接入口](../../DEVELOPMENT_HANDOFF.md) 记录已装平板的包与最近验收结果。
