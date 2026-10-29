# Immerse Jam 0.1.5

- 浏览音乐库、收藏、歌单或工程列表时继续播放；底部播放条显示当前工程，可返回完整播放界面，无悬浮小窗。
- “最近练习”改为“练琴模式”。跟练和创作用独立的行式工程列表管理，可筛选全部／跟练／创作；音乐库只显示源歌曲。
- 新建工程先填写名称、选择源歌曲和分离结果，确认后才创建；取消不再留下空工程。创作既可空白开始，也可选择音乐库源工程。
- 跟练工程支持“分轨伴奏／录音含伴奏”一键切换。已混伴奏录音回听默认不重复叠伴奏；录制时仍可控制伴奏分轨。跟练录制时静音旧尝试，创作保留叠录。
- 源媒体复制成工程自己的文件，设置、录音和文件均独立。删除歌曲或工程需确认，文件移至回收站，其他独立工程保留。
- 新流程同时提供中英文与现有主题支持。

Browsing now preserves playback in the integrated transport. Practice/creation projects have a separate filterable list, confirmed source-based creation, safe Recycle Bin deletion and practice-specific capture/review routing. Cancelling project creation writes nothing.

25 项 Node 测试、静态／翻译／格式检查及生产构建通过；最终程序中的工程列表、筛选、创建／取消、独立源文件、两种跟练路由、回收站删除、中英文、录音、循环和乐谱跟随均通过验收。声卡测试使用模拟输入，真实 USB／AUX 设备延迟仍需试听。

Windows 10/11 x64: `Immerse.Jam.Setup.0.1.5.exe`. Compare the download against `SHA256SUMS-0.1.5.txt`. Private music, recordings and model weights are not bundled. Original source remains under PolyForm Noncommercial 1.0.0; third-party licenses remain unchanged.
