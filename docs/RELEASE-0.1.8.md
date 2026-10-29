# Immerse Jam 0.1.8

- 修复循环回卷／拖动反复重建音频处理节点的问题。循环改为按音频时钟预排，seek 清空旧缓冲并短淡入淡出；快速连续拖动保持播放。
- 修复录音启动失败清空循环段落；关闭应用时释放播放器及 AudioContext。
- 修复异常速度导致导出卡死、缺省音轨名中断导出、局域网并发下载复用临时包，以及分块中文进度乱码。
- 补齐 SCNet XL 权重和配置摘要，内置模型缺少摘要拒绝安装；自定义模型强制受限权重加载，校验 YAML 并在运行前复验权重／配置。
- 修正 Beat This! 名称。侧栏依次为引擎状态、用户反馈、请作者喝一瓶冰可乐。
- 新增自制和弦谱删除确认。音乐播放页右上角可“以这首歌创建”跟练／创作并预选当前结果；普通音乐不显示录音按钮，历史录音库仍保留。
- “练琴模式”更名“跟练/创作”，列表与创建界面直接使用跟练、创作；内置分类更名“默认分类”。

Reuses one DSP across seeks and clock-scheduled loops, preserves loops on failed recording, validates playback/export settings and model artifacts, isolates concurrent LAN packages, and decodes UTF-8 progress incrementally. Adds chord-chart deletion and Create from this song, with clearer Practice / Create navigation.

33 项 Node、7 项 Python 测试、静态检查、双语词典、格式、构建及隔离界面回归通过。最终独立程序复测循环、连续定位、录音失败、创建取消、和弦谱删除及释放通过。

Windows 10/11 x64. 私人曲库、录音、模型权重和运行环境不包含在安装包中。原创源码采用 PolyForm Noncommercial 1.0.0，第三方许可保持不变。详细结论见 [源码审查记录](https://github.com/Kreeli/immerse-jam/blob/v0.1.8/docs/REVIEW-0.1.8.md)。
