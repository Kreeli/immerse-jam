# 安装资源与模型备份

Windows Setup 已包含 uv 0.13.6 和 Beat This! final0 节拍模型，均按固定 SHA-256 校验，保留原授权文件。安装时直接复制，无需另行下载这两项。其余 Python/PyTorch 运行环境及分轨模型仍需要网络或已有本地缓存；这不是完整离线安装包。

普通 Python 依赖安装会探测官方 PyPI 与清华镜像的响应，选择先响应的一项；镜像安装失败时回退官方。探测反映当时的可达性与响应速度，不保证每个大文件都更快。PyTorch CPU/CUDA 包继续用对应的官方索引，保留固定版本与约束。

## 自有公开下载源

固定资源版本：<https://github.com/Kreeli/immerse-jam/releases/tag/resources-v1>。资源附件独立于应用 Release，标为预发布且不作为最新应用版本。

- `beat-this-final0.ckpt`：与原上游完全相同的节拍权重，MIT。
- `uv-0.13.6-py3-none-win_amd64.whl`：原始 uv wheel，MIT OR Apache-2.0。
- 附件保留完整授权文本、来源清单和 `SHA256SUMS.txt`。既有资源版本不换字节；升级建立新的资源版本。

包内资源优先；缺失时使用本项目固定备份地址，失败再回退上游。每个下载源都必须通过同一个固定校验值。镜像下载不依赖可变的 `latest` 路径。大文件保留有界并行与断点续传。

GitHub Release 附件不进入 Git 源码历史。官方限制单附件小于 2 GiB，未对 Release 总大小及下载带宽设定额度：<https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas>。Hugging Face 可作为未来第二公开镜像，但不会仅因换站点就保证更快。

## 已有模型的本地保全

七种已有模型已在 `release/model-backup-2026-11-02/models/` 独立归档，包括权重及配置，合计约 2.2 GiB；同目录的清单保留来源 URL、大小与固定校验值。归档没有重新下载模型，没有改动 `.runtime/models` 或私人音乐工程。

恢复时，可将备份的 `models` 内容复制到应用数据目录的 `runtime/models`；原开发入口则是 `.runtime/models`。已有正确文件会直接复用并校验，不必重新下载。也可通过 `IMMERSE_COMPONENTS_DIR` 指向备份根目录，让安装准备读取并复制匹配的文件。

模型保全与公开分发分别记录：SW、主唱/和声、吉他模型没有找到明确的权重再分发声明；Demucs/SCNet 代码的许可证也不自动等于所有权重的授权。因此这些模型现阶段保留完整本地备份及原上游下载，不把它们标成已获 MIT 再分发授权的公开附件。

## 构建维护

- `node scripts/backup-models.cjs`：从本地缓存归档所有现有权重和配置，按清单核验，不下载。
- `node scripts/prepare-installer-assets.cjs`：从本地缓存生成安装资源，只读缓存，缺文件即报出位置。
- `node scripts/prepare-resource-mirror.cjs`：生成可公开资源、原授权、来源与校验清单。
- `node scripts/package.cjs nsis`：先生成资源，再在暂存目录打包；成功后才更新原测试程序。

Beat This! 上游明确代码和公开权重均采用 MIT：<https://github.com/CPJKU/beat_this#license>。uv 源码与许可证：<https://github.com/astral-sh/uv/tree/0.13.6>。本项目的非商业许可不改变这些第三方资源的许可证。
