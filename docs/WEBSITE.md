# 应用介绍网站

## PC 界面在线试用

官网新增「在线试用」入口与按点击加载的工作台。`web-demo/` 复用 `src/` 中的 PC 端 React 组件、样式与播放器，通过独立的浏览器适配层替代桌面接口，不修改 PC 端代码。可单独打开 `tryout/index.html`，或在官网内嵌／全屏体验。关闭内嵌试用会卸载工作台并停止播放。

首次本地构建：

```powershell
node node_modules/vite/bin/vite.js build --config web-demo/vite.config.mjs
node scripts/preview-website.cjs
```

直接访问 http://127.0.0.1:4178/immerse-jam/tryout/index.html 。已有项目依赖即可构建；干净环境需先 `npm ci --ignore-scripts`。构建产物 `docs/site/tryout/` 不提交，由 Pages 工作流构建后发布。网页部署会使用提交到 GitHub 的 PC 源码，不包含工作区其他未提交修改。

播放、声部混音、变速移调、段落／标记、和弦编辑、跟练与创作使用真实前端交互。模拟分析只显示进度并载入现有 Fabulous 六轨，不运行模型，也不比较不同模型效果。节拍、和弦、谱例与对齐点为流程示意，不应当作歌曲的准确识别结果。录音使用模拟输入与预置吉他片段，不请求麦克风。导出／互传／本机文件操作展示入口，不生成真实工程或建立设备连接。修改只保留在当前页面会话中，重置即可恢复。

`web-demo/bridge.ts` 管理演示数据与事件，`capture.ts` 和 `devices.ts` 保证不访问录音硬件。Vite 插件只在网页构建中转换音频资源地址，保留 PC 代码不变。`scripts/test-website-demo.cjs` 验证端到端体验，Windows 使用已安装 Edge，其他系统使用 Playwright Chromium：

```powershell
node scripts/test-website-demo.cjs
```

如需验证与已提交源码一致的构建，可以将该版本的 `src/`、`shared/`、`assets/` 和 `package.json` 导出到独立目录，并将 `IMMERSE_DEMO_APP_ROOT` 指向该目录。工作流每次构建都会跟随已提交 PC 界面；改动相关组件后应重新运行上述检查。

## 直接下载与版本更新

首页、下载中心和下载跳转页的按钮，在发布前由 `scripts/prepare-website-downloads.cjs` 写入真实安装包地址；访客不必请求 GitHub API，也不需要 JavaScript 才能下载。Windows、Android ARM64 与 x86_64 分别选取最近的可用安装文件，允许不同平台来自不同 Release。

发布工作流读取公开 Release 列表，生成同站点的 `download/releases.json`。下载页的自动跳转与版本显示读取此文件；目录读取失败时，手动按钮仍直接指向构建时确认的安装包。GitHub 安装包域名本身仍需可访问，浏览器的下载确认或安全检查由浏览器决定。

发布、编辑或删除 Release 会触发刷新；请先上传完所需安装包再正式发布。如果只是给已经发布的 Release 补传资产，手动运行 **Deploy introduction website** 刷新下载地址。构建未能取得完整有效的下载目录时会停止发布，保留上一次已部署的网站。

官网源文件在 `docs/site/`；介绍页是静态 HTML，PC 在线试用通过 `web-demo/` 单独构建。只使用网站中已有的公开排练片段，不读取个人曲库。

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
- 公开截图在 `docs/site/assets/`；`Win_star.png` 展示分类文件夹。根目录重复原图已清理；含本机地址与临时配对码的 `Win_send.png` 仅保留在被忽略的本地归档中，没有复制到网站，设备互传使用页面绘制的流程示意图。
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
