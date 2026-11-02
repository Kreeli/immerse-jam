(() => {
  const start = document.getElementById('tryout-start');
  const close = document.getElementById('tryout-close');
  const full = document.getElementById('tryout-fullscreen');
  const host = document.getElementById('tryout-frame');
  const launch = document.getElementById('tryout-launch');
  const mount = document.getElementById('tryout-mount');
  if (!start || !close || !full || !host || !launch || !mount) return;
  start.addEventListener('click', () => {
    window.dispatchEvent(new Event('immerse-demo-start'));
    const frame = document.createElement('iframe');
    frame.src = 'tryout/index.html';
    frame.title = 'Immerse Jam PC 在线试用工作台';
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
