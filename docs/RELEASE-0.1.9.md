# Immerse Jam 0.1.9 · Android Preview 1

Windows 0.1.9 与首个 Android 0.1.0-preview.1 预览包。

## 下载

- Windows：`Immerse Jam Setup 0.1.9.exe`，安装向导自动准备本地运行环境和所选模型。
- Android 手机／平板：`Immerse-Jam-Android-0.1.0-preview.1-arm64-v8a.apk`，Android 9+。这是调试签名预览包，尚未配置正式发行签名。
- Android 模拟器：`Immerse-Jam-Android-0.1.0-preview.1-x86_64.apk`。
- `SHA256SUMS-0.1.9.txt` 提供三个安装文件的 SHA-256。

## 本次更新

- Windows 修复暂停后声音通路和恢复播放残留，完善校准取消、界面字号及文字选择行为；完整歌曲互传保留节拍、对齐、附件和录音。
- Android 提供手机／平板布局、侧栏、层级返回和根页两次返回退出；音乐库、跟练／创作、波形、和弦编辑及本地存储沿用共享界面。
- 随包提供人声／伴奏分离模型和与电脑同权重的 Beat This!，四轨模型按需下载；有时长、内存、存储和温度保护。
- 默认保留电脑或朋友分享的节拍与手动校准结果，可明确选择重新识别。36 秒合成样例实际原生推理与电脑得到相同的 72 个节拍、18 个小节首拍。
- 支持变速／移调录音归一化、中断恢复、MIDI 自动对齐、WAV 混音与完整 `.ijam` 分享。
- 原生局域网收发、取消和重连；支持扫码入口及粘贴电脑配对地址。修复电脑流式 ZIP 在手机上的兼容问题。

## Android 预览限制

已在 Android 15 x86_64 模拟器运行，不代表实体 ARM64 手机、USB 效果器或长时间温度／性能已验收。相机窗口打开和取消已验证，实际二维码识别仍待真机；真实 WebRTC 网络链路仍待验收。

后台／锁屏长期播放与电话、蓝牙路由尚未完成原生适配。移动端六轨、主奏／节奏吉他、主唱／和声的本机模型适配，以及 `.aum` 本机迁移、自定义模型导入仍待完成；可以从电脑分享已经算好的完整结果。

输入和单次录音最多 44 分钟，长曲多轨播放另受内存预算限制。复杂曲目的节拍、和弦和乐谱对齐仍可能需要手动修正。应用数据保存在应用专用目录，卸载或换签名前请先导出。

按用户要求停止追加检查并直接发布。已有验证和最终未重跑项见 [本地验收记录](https://github.com/Kreeli/immerse-jam/blob/main/docs/ANDROID-DEVICE-VALIDATION-2026-10-30.md)。

Windows installer and debug-signed Android preview APKs are included. Android feature coverage and validation remain limited as described above; this is not a full Windows replacement. Export your projects before uninstalling or changing signing keys.
