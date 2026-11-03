# 0.1.12 发布接力文档（2026-11-04）

写给下一个会话：本文记录 0.1.12 发布后的准确现状、可复用命令与已知边界，读完即可接手，无需重查远端历史。权威长文仍是根目录 `DEVELOPMENT_HANDOFF.md`；行为细节见其中各节与 `docs/VALIDATION.md`。

## 当前状态（发布已完成，无遗留阻塞）

- 正式版本：Windows 0.1.12 / Android 0.1.0-preview.3。
- Release [v0.1.12](https://github.com/Kreeli/immerse-jam/releases/tag/v0.1.12)，tag 指向 main `c2fd80e`；main 最新为 `26bd005`，Source checks 在 main 与工作分支均绿。
- 官网 [kreeli.github.io/immerse-jam](https://kreeli.github.io/immerse-jam/) 的下载链接、版本文案与 `download/releases.json` 已验证指向 v0.1.12。
- 本地入口 `Start-Immerse-Jam.cmd` → `release/win-unpacked/Immerse Jam.exe`（已是 0.1.12）；平板已装 preview.3。
- 工作区干净，本地 `main` 已快进到 `26bd005`。

## 本轮提交链

| 提交      | 内容                                                 |
| --------- | ---------------------------------------------------- |
| `bfa7ca5` | 0.1.12 桌面 UI 调整与侧栏布局（发布前的主体工作）    |
| `3920807` | 交接文档格式修复（CI 的 prettier 检查失败）          |
| `a2c4780` | 修复 CI：新测试夹具先创建 `.runtime/test-workspaces` |
| `c2fd80e` | 官网静态文案指向 0.1.12（触发 Pages 部署）           |
| `26bd005` | 交接文档记录发布完成                                 |

## 发布资产与校验

| 资产                                                         | SHA-256 前缀                 |
| ------------------------------------------------------------ | ---------------------------- |
| `Immerse.Jam.Setup.0.1.12.exe`（216.9 MB）                   | `4a848c60ae79ebd3`           |
| `…preview.3-arm64.apk` / `…preview.3-x86_64.apk`（各 12 MB） | 两者相同：`e97c1ad22f6b843d` |

- Setup 哈希来自官方 `node scripts/verify-package.cjs`（同时校验 7808 个归档条目、无私有媒体、内置 beat-this 权重与 uv），输出 `release/SHA256SUMS-0.1.12.txt`。
- 两枚 APK 哈希相同不是复制失误：v0.1.11 官方 `SHA256SUMS.txt` 中这两个文件本就是同一哈希（preview.3 验收包以两个文件名发布）。本轮原样沿用。若将来出真正分架构包，需重新走实机验收。
- 本地上传暂存：`release/publish-v0.1.12/`（含三行 `SHA256SUMS.txt`），沿用 v0.1.11 的 `release/publish-v0.1.11/` 惯例。

## 官网更新机制（不要手工改下载链接）

- `docs/site/**/*.html` 中所有下载 `<a>` 带 `data-download-kind="windows|android-arm64|android-x64"`。Release 的 published / edited / deleted 事件触发 Pages workflow 重跑 `scripts/prepare-website-downloads.cjs`，按最新 Release 重写全部 href 并重生成 `docs/site/download/releases.json`。
- 需要手工同步的只有静态文案：`docs/site/index.html` 的卡片版本号 / 发布日期 / 发布说明一行、`docs/site/app.js` 的 fallback 版本串。改完必须过 prettier。
- 下一版发布后的验证方法：抓 `download/releases.json` 首条，或在首页 HTML 中检索 `releases/download/vX.Y.Z`。

## 已知边界与排查经验

- 沙箱：预存在文件（含 `.git/`、`release/`、`node_modules/`、`.runtime/`）的写入会被拒；新文件用 DSH 写入工具，git / 打包 / 校验脚本按需申请完全权限一次性执行。
- 网络：受限进程的 `curl.exe`、`Invoke-WebRequest` 对外 HTTPS 报 `SEC_E_NO_CREDENTIALS`；`web_fetch` 对 github.com 被 DNS 拒绝。查 GitHub 用 `gh api`（`fields` 传参 + `jq` 过滤，不要把 `?per_page=` 拼进端点），查官网用 `web_fetch`（kreeli.github.io 可达）。
- CI：任何新增 `.md` / `.cjs` 必过 `npx prettier --check`；新测试使用 `.runtime/test-workspaces` 时必须先 `fs.mkdirSync(..., { recursive: true })`（CI 是全新检出，目录不存在，`mkdtempSync` 需要父目录）。
- Actions 查询：新 push 后 runs 列表偶有索引延迟，可能短暂为空，等几分钟再查；失败日志用 `log_failed` 直接定位。

## 未做与待作者决定

- Android 未出新版：仍为 preview.3，`versionCode = 3`。下次 Android 发版需改 `platforms/android/app/build.gradle.kts` 的 `versionCode` / `versionName`，重新出包并实机验收。
- 未重下 3–5 GB 运行库，未做长时间实机音频回归（延续 0.1.11 的验证边界）。
- `trash/results` 回收文件仍占磁盘，无还原 / 清空入口（有意保留）。

## 可复用命令

```powershell
npm run build                    # 桌面构建（tsc + vite + notices + copy-assets）
node scripts/package.cjs nsis    # 打包 Setup → release/build-staging，并更新 win-unpacked
node scripts/package.cjs dir     # 只更新 win-unpacked
node scripts/verify-package.cjs  # 校验安装包内容并写 release/SHA256SUMS-<版本>.txt
npx prettier --check <改动文件>   # 提交前必过，含 .md 与 .cjs
```

下一版 Windows 发布顺序：改 `package.json` 版本 → 构建 + 校验 → 更新官网静态文案（不动 href）→ commit / push 到 CI 绿 → 打 tag、建 Release 并上传 Setup、APK、`SHA256SUMS.txt` → 等 Pages 自动刷新 → 线上验证。Android 发版另见上文 gradle 版本号说明。
