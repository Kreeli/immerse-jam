# 官网界面与源码同步

官网地址：https://kreeli.github.io/immerse-jam/ 。网站源码在本仓库 `docs/site`，GitHub Pages 工作流从 `main` 构建；不需要维护另一个官网仓库。

## 当前界面

网页试用直接引用本仓库 `src` 的应用组件和样式。`web-demo` 只适配浏览器环境、公开演示音频和模拟分析 / 录音，不能把它描述为浏览器运行分离模型、访问真实麦克风或连接设备。Windows 与 Android 分别通过默认地址和 `?platform=android` 进入。

赞赏码源图为 `docs/site/assets/author-appreciation.png`。官网 FAQ、页脚和两种网页试用都使用它，原生应用也从这里打包。更换时同时检查当前源码、产物和已部署页面上的旧图片。

截图也使用同一套公开演示项目，不拍摄私人曲库，不发布设备配对信息。更新界面后运行：

```powershell
node node_modules/vite/bin/vite.js build --config web-demo/vite.config.mjs
node scripts/capture-website-screenshots.cjs
node scripts/test-website-demo.cjs
```

截图脚本刷新四张 Windows 图、五张 Android 图，同时按 PNG 实际尺寸更新网页图片属性。图标取自当前应用资产。提交前检查导览热点、文字和图片一致；截图体现实际界面，数据及和弦 / 节拍示意的限制应保留说明。

下载链接由 `scripts/prepare-website-downloads.cjs` 根据已发布 Release 生成。它只更新官网，不打包或覆盖安装包，不移动版本标签。更新源码与发布安装包是两个步骤，不能把前者当成已发布新版应用。

## 仓库管理

- 以本地主工作目录通过验证的代码为准，先 fetch 再比较提交；对 `main` 和工作分支使用正常快进推送。若远端出现独有提交，先阅读差异，不直接强制覆盖。
- 保留 `889e8cd` 的 littleclock2 原作者提交；不合并 PR #8 的整条分支，不因为已经采用部分代码就把其他请求全部标成完成。
- 安装包、运行库、模型、临时测试数据和私人素材继续由 `.gitignore` 排除。源码一致指受版本管理的代码树，不是上传整个本地目录。
- 通知先看对应提交和最新工作流；旧失败被后续成功取代时，不反复重跑旧版本。查看通知不等于批量标为已读或关闭 Issue / PR。
- 推送后确认 Source checks 与 Deploy introduction website，核对 Pages 部署提交和线上截图；最后确认本地 / 远端代码树一致、工作目录干净。

2026-11-05 整理时，旧失败通知对应的后续源码检查和官网部署已成功，littleclock2 已出现在 GitHub Contributors 列表。PR #8 保持未合并，Issue #5 / #7 / #9 保留状态；本轮不代表这些报告已经全部完成。

2026-11-05 至 11-08 期间 GitHub 账户因账单问题锁定，[部署 42457914848](https://github.com/Kreeli/immerse-jam/actions/runs/42457914848) 等任务未运行步骤即失败；期间产物准备照常，完整静态包留存于 `release/website-ready/`。

2026-11-09 账户解锁后已补发完成：push `b2a8156` 触发的 [部署 42568530764](https://github.com/Kreeli/immerse-jam/actions/runs/42568530764) 成功，官网下载链接与 `releases.json` 指向 v0.1.12（Windows 0.1.12 / Android preview.5），新赞赏图 200、旧图 404，首页版本文案已同步 preview.5。同日 v0.1.12 Release 资产覆盖为同一批重建产物（详情见 Release 的 2026-11-09 覆盖更新段）。

参考：[解锁账单受限账户](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account)、[Pages 发布源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。改为分支发布仍会使用 Actions，不在本轮擅自改变托管设置。
