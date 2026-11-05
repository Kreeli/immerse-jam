(() => {
  const start = document.getElementById('tryout-start');
  const close = document.getElementById('tryout-close');
  const full = document.getElementById('tryout-fullscreen');
  const host = document.getElementById('tryout-frame');
  const launch = document.getElementById('tryout-launch');
  const mount = document.getElementById('tryout-mount');
  if (!start || !close || !full || !host || !launch || !mount) return;
  let platform = 'desktop';
  const standalone = document.querySelector('.tryout-toolbar a');
  document.querySelectorAll('[data-demo-platform]').forEach((button) =>
    button.addEventListener('click', () => {
      platform = button.dataset.demoPlatform;
      document
        .querySelectorAll('[data-demo-platform]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      const url = 'tryout/index.html' + (platform === 'android' ? '?platform=android' : '');
      standalone.href = url;
      document.querySelector('.tryout-pill').textContent =
        (platform === 'android' ? 'Android' : 'PC') + ' 原版界面 · 预置六轨 · 无需安装';
      const preview = launch.querySelector('img');
      preview.src =
        platform === 'android' ? 'assets/android_create.png' : 'assets/Win_practice.png';
      preview.alt =
        platform === 'android'
          ? '当前 Android 创作界面，分组与各声部均可调整音量和左右声像'
          : '当前 Windows 跟练工作台';
      preview.width = platform === 'android' ? 2464 : 1584;
      preview.height = platform === 'android' ? 2078 : 1058;
    }),
  );
  start.addEventListener('click', () => {
    window.dispatchEvent(new Event('immerse-demo-start'));
    const frame = document.createElement('iframe');
    frame.src = 'tryout/index.html' + (platform === 'android' ? '?platform=android' : '');
    host.classList.toggle('android-tryout', platform === 'android');
    frame.title = 'Immerse Jam ' + (platform === 'android' ? 'Android' : 'PC') + ' 在线试用工作台';
    frame.allow = 'autoplay; fullscreen';
    frame.allowFullscreen = true;
    frame.addEventListener('load', () => frame.contentWindow?.focus());
    mount.replaceChildren(frame);
    launch.hidden = true;
    close.hidden = false;
    full.hidden = !document.fullscreenEnabled;
  });
  close.addEventListener('click', () => {
    mount.replaceChildren();
    launch.hidden = false;
    close.hidden = true;
    full.hidden = true;
    start.focus();
  });
  full.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.requestFullscreen();
    } catch {
      full.textContent = '请使用「单独打开」体验';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    full.textContent = document.fullscreenElement ? '退出全屏' : '全屏体验 ↗';
  });
})();
