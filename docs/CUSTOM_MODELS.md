# 自定义模型

选择“设置与模型 → 导入自定义模型”，选取包含 `manifest.json` 和权重的文件夹。导入采用复制并试运行；验证通过前不会被用于歌曲。

示例：两轨波形 ONNX，单个完整 ONNX 文件，不引用外部数据。

```json
{
  "schemaVersion": 1,
  "name": "My two-stem model",
  "adapter": "onnx-waveform",
  "file": "model.onnx",
  "sampleRate": 44100,
  "stems": ["vocals", "other"],
  "sha256": "替换为模型文件的64位十六进制SHA256",
  "chunkSeconds": 6,
  "license": "模型作者提供的许可"
}
```

ONNX 输入必须是 float32 `[1, 2, T]`，输出是 `[1, S, 2, T]` 或 `[S, 2, T]`。只有一个输入与输出，S 与清单中的声部数量及顺序一致。采样率支持 22050、32000、44100、48000，片段长度支持 0.25–30 秒。实际长度受模型固定输入维度约束；不兼容时会拒绝导入。

SCNet 或 RoFormer 分别使用 `scnet`、`MDXC` 适配器，并提供 `config` 字段指向同目录 YAML，以及 `configSha256` 指定配置文件的 SHA-256。权重和配置都会在复制前、每次运行前复验；旧自定义模型缺少配置摘要时需要补齐清单后重新导入。模型架构、配置与权重必须匹配。仅文件扩展名相同不足以兼容，不支持任意 PyTorch 模型或任意自定义 Python 代码。

自定义 PyTorch 权重强制使用 `weights_only` 限制；YAML 只允许安全数据和模型需要的 tuple 标签，不执行任意对象构造。文件哈希验证完整性，不代表文件来源可信；这些限制也不是运行不可信模型的安全沙箱。内置模型使用固定上游摘要，缺少摘要时拒绝安装。

声部名建议使用 `vocals`、`drums`、`bass`、`guitar`、`piano`、`other`、`lead`、`rhythm`、`lead_vocals`、`backing_vocals`。不同名称可通过 `outputMap` 明确映射，不能靠轨道数量猜测。

每次处理都验证输出声部、立体声维度、有限数值与样本长度。输出不匹配时，保留之前的可用分轨。
