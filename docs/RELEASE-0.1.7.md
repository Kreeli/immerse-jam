# Immerse Jam 0.1.7

- 放大歌曲标题、艺人、导入提示、底部说明及播放页常用文字；长歌名可显示两行。
- 修正 Windows 任务栏身份和图标设置，使窗口、启动和安装快捷方式使用同一应用身份与提供的图标。
- 侧栏改为分类文件夹，可创建、改名，统一收纳分轨、跟练与创作工程。歌曲和工程行可选择分类；删除分类只移回未分类，保留文件。
- 安装向导新增独立数据目录、加速方式和可选模型。优先非系统固定盘，使用系统盘需明确确认。私有 Python、推理依赖、FFmpeg 和所选模型在完成前自动准备；失败可重试，数据和大型缓存跟随所选目录。
- 默认选择 BS RoFormer SW 六轨与 Beat This!，另可选 Demucs、SCNet Small、人声和吉他模型；专用模型同时准备所需基础模型。设置中显示实际存储位置。
- 新增邮件与 GitHub 反馈入口：`meowmeowneko999@gmail.com` 或仓库 Issues。点击只打开对应入口，不自动发送内容。
- 打赏窗口仅显示原图片的二维码区域和白边，保留原二维码内容。

Larger text, mixed project folders, a consistent Windows taskbar identity, email/GitHub feedback and a cropped original donation QR. Setup now selects storage, acceleration and models, then prepares the private environment before finishing. Large application data and download caches use the chosen data root; Windows installer extraction still uses OS-managed temporary storage.

29 项 Node 测试、6 项新安装 CPU 环境中的 Python 测试与静态、翻译、格式及构建检查通过；分类、连续播放、反馈链接、二维码、录音界面和中英文主题通过隔离验收。全新目录实际完成 CPU 环境及 Demucs／Beat This! 下载校验，并通过原生安装准备执行链及非系统固定盘选择检查。原生向导的人工逐页点击尚未完成。

Windows 10/11 x64: `Immerse.Jam.Setup.0.1.7.exe`, with `SHA256SUMS-0.1.7.txt`. Private music, recordings, runtimes and model weights are not bundled. Original source uses PolyForm Noncommercial 1.0.0; third-party licenses remain unchanged.
