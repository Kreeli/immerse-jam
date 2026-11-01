# 应用介绍网站

网站源文件在 `docs/site/`，是一个独立的静态网站，不依赖应用构建、不需要安装额外依赖，也不包含曲库或音频文件。

## 本地预览

在仓库根目录运行：

```powershell
node scripts/preview-website.cjs
```

打开 http://127.0.0.1:4178/immerse-jam/ 。终端按 Ctrl+C 停止。端口被占用时可以先设置 `$env:IMMERSE_SITE_PORT = '4179'`。

也可以直接打开 `docs/site/index.html`，但本地服务更接近 GitHub Pages 实际效果。

## 第一次发布到 GitHub Pages

1. 将 `docs/site/`、`.github/workflows/pages.yml`、`scripts/preview-website.cjs`、本说明和 README 中的网站入口提交到 `main`。不要把正在开发的其他应用改动一并提交。
2. 打开 [仓库的 Pages 设置](https://github.com/Kreeli/immerse-jam/settings/pages)，在 **Build and deployment → Source** 中选择 **GitHub Actions**。这只需设置一次。
3. 打开 [Actions](https://github.com/Kreeli/immerse-jam/actions)，选择 **Deploy introduction website → Run workflow → main**。如果推送时 Pages 已启用，则工作流会自动触发，不用再手动运行。
4. 等待工作流成功后，访问 **https://kreeli.github.io/immerse-jam/**。部署成功后 README 顶部的网站入口才会可用。
5. 可在仓库首页右侧 **About → 编辑 → Website** 填入同一网址，便于访客发现。

配置遵循 [GitHub Pages 自定义工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。工作流只发布 `docs/site/`，不会把桌面应用或整个仓库当作网页发布。

## 日常修改

- 改文字和页面结构：`docs/site/index.html`。
- 改颜色和布局：`docs/site/styles.css`。
- 改五步导览的图片、文字和按钮坐标：`docs/site/app.js` 中的 `steps`。第一步的默认文字也同步保留在 HTML 中，供不运行 JavaScript 时阅读。
- 更新截图：替换 `docs/site/assets/` 中对应 PNG。如尺寸变化，同步调整 HTML 的图片宽高与导览热点百分比。点击截图可在弹窗放大，手机上可横向滚动查看细节。
- 当前截图来自 Windows。本机原图在 `pic/`；`Win_star.png` 展示分类文件夹，网站据此标注分类管理。`Win_send.png` 含本机地址与临时配对码，没有复制到网站，设备互传使用页面绘制的流程示意图。
- 下载按钮统一链接到 `releases/latest`，不锁死某个安装文件。发布新版时检查 Android 版本说明、系统要求与网站文案是否仍准确。
- 自动演示是截图导览，不是真实操作录像；没有使用商业歌曲音频。可在以后加入自己录制并有权分享的 WebM / MP4 视频，用原生 `<video controls playsinline preload="metadata" poster="...">` 嵌入。不要用大体积 GIF 替代长视频。

更新后推送到 `main`，工作流会自动重新部署。无需打包应用。网站全部使用相对资源地址，可部署在 GitHub Pages 的仓库子路径。更换仓库或账号时还应同步修改网页中的下载、反馈、源码、canonical 与社交分享网址，以及 README 的入口。

## 内容口径

- 应用正式名称使用仓库已有的 **Immerse Jam**。
- 表述为免费使用、无会员与分离次数限制；原创代码是 **PolyForm Noncommercial 1.0.0 非商业源码可用许可**，不宣传为 OSI 开源许可。
- Windows 为主要功能展示平台；Android 仍为预览版，以对应 Release 说明核对历史 APK。手机端的明确产品方向是播放、跟练、创作和导出，不提供也不计划提供本机推理；项目不提供服务器云计算。旧版 APK 的移动推理描述是历史能力，不代表后续方向。
- 分轨、和弦、节拍及乐谱自动对齐存在准确性边界；设备互传不等于多端自动同步。上述内容在网页常见问题中有说明。
- 「能力与边界」直接展示三项主要限制，不要求访客展开 FAQ 才能看到。跟拍延迟估计必须戴耳机，不用外放 + 内置麦克风校准；微调可修正对齐，不能去掉已录入的回声。估计包含人为跟拍误差，不是纯硬件延迟。
- 社区入口欢迎开发者与音乐爱好者反馈真实使用体验、复现问题、设备兼容情况及参与贡献；同时说明贡献许可与避免分享私人素材。
