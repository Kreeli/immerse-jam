# Immerse Jam 0.1.4

Windows 本地练琴与多轨录音更新 / Local practice and multitrack recording.

- 恢复跟随实际节拍的智能节拍器，增加音量控制；预备拍吸附最近节拍，和播放共用时钟。
- 新增输入／输出／声道选择，支持纯乐器输入和声卡已混伴奏两种录制方式，无软件麦克风返听。
- 录音库保存多次尝试，练习最多挂载两条；创作可从空工程开始多轨叠录、导入和混音导出。
- 跟拍测延迟、设备组合记忆、逐轨开始位置和偏移；保留原始录音，并处理变速／移调后的时间映射。
- 录音实时波形、电平、自动保存和中断恢复。完整项目导出保留录音库。
- 简体中文／English，暗色／浅色／跟随系统及四种强调色。
- 按曲库、播放、录音、和弦、乐谱等职责整理代码，增加架构、项目格式和开发文档。
- 修复模型结果切换时可能复用错误音频缓存、批量录音导入报错及预备拍起录相关问题。

The release adds selectable recording devices/channels, instrument-only or hardware-mixed capture, an unlimited take library with two mounted practice takes, multitrack creation, latency estimation/correction, beat-aware count-in/metronome, bilingual appearance settings and a reorganized source tree.

## Download / 下载

`Immerse Jam Setup 0.1.4.exe` is for Windows 10/11 x64. Compare it against the accompanying SHA-256 file. The installer is unsigned. Your existing local library is separate from the installer.

Audio tools download automatically when first needed. AI separation/analysis requires the private environment and selected models to be prepared in Settings & models. Neither model weights nor personal media are bundled.

## Validation and limits / 验证与边界

24 Node tests, 6 Python tests, static checks and production build passed. Packaged-program checks cover recording/import, metronome timing, calibration, language/theme, waveform/multi-model switching, chord editing/following, score playback and local transfers. Detailed evidence is in `docs/VALIDATION.md`.

Follow-along calibration includes human timing bias; it is not a pure hardware latency measurement. Physical effects-unit USB/AUX routing and the best correction value require your own listening check. Cross-carrier WebRTC may fail without relay service. Native Android remains future work.

Original source is **PolyForm Noncommercial 1.0.0**, a noncommercial source-available license. Third-party components/models retain their original terms; see LICENSE and `docs/LICENSING.md`.
