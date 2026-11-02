const { ipcRenderer } = require('electron');
const zh = process.argv.includes('--setup-zh');
const text = (id, value) => {
  document.getElementById(id).textContent = value;
};
const labels = zh
  ? {
      data: '准备数据目录',
      runtime: '安装运行环境',
      audio: '安装音频工具',
      model: '下载模型',
      finish: '保存安装配置',
      complete: '安装完成',
    }
  : {
      data: 'Preparing data folder',
      runtime: 'Installing runtime',
      audio: 'Installing audio tools',
      model: 'Downloading model',
      finish: 'Saving installation settings',
      complete: 'Installation complete',
    };
const bytes = (value) => (value / 1048576).toFixed(1) + ' MiB';
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  text('heading', zh ? '正在准备安装' : 'Preparing installation');
  text('stage', labels.data);
  text('file', zh ? '正在准备…' : 'Preparing…');
  text(
    'estimate',
    zh
      ? '首次下载：CPU 约 1–2 GB，NVIDIA 约 3–5 GB，另加所选模型。通常需 5–30 分钟，慢网络可能更久；已有缓存会复用。'
      : 'First download: about 1–2 GB for CPU or 3–5 GB for NVIDIA, plus selected models. Usually 5–30 minutes; slow networks take longer. Existing caches are reused.',
  );
  text(
    'note',
    zh
      ? '下载完成后会自动校验文件。请保持网络连接。'
      : 'Downloaded files are verified automatically. Please stay connected.',
  );
  document
    .getElementById('overall')
    .setAttribute('aria-label', zh ? '安装步骤' : 'Installation steps');
  document
    .getElementById('download')
    .setAttribute('aria-label', zh ? '当前步骤进度' : 'Current step progress');
});
ipcRenderer.on('installation-progress', (_event, event) => {
  if (event.stage) {
    const { index, total, name, modelName } = event.stage;
    text('stage', modelName || labels[name] || name);
    text('steps', `${Math.min(index + 1, total)} / ${total}`);
    document.getElementById('overall').value = index / total;
    if (name === 'complete') text('heading', labels.complete);
  }
  text(
    'file',
    event.file ||
      (Number.isFinite(event.received)
        ? zh
          ? '正在下载'
          : 'Downloading'
        : zh
          ? '正在准备 / 校验…'
          : 'Preparing / verifying…'),
  );
  text('message', (event.message || '').replace(/\s+/g, ' ').slice(-360));
  const bar = document.getElementById('download');
  if (Number.isFinite(event.progress)) {
    bar.value = Math.max(0, Math.min(1, event.progress));
    text('percent', Math.round(bar.value * 100) + '%');
  } else {
    bar.removeAttribute('value');
    text('percent', '');
  }
  text(
    'bytes',
    Number.isFinite(event.received)
      ? bytes(event.received) + (event.total ? ' / ' + bytes(event.total) : '')
      : '',
  );
  text('speed', Number.isFinite(event.bytesPerSecond) ? bytes(event.bytesPerSecond) + '/s' : '');
  const seconds =
    event.total && event.bytesPerSecond > 0
      ? (event.total - event.received) / event.bytesPerSecond
      : 0;
  text(
    'remaining',
    seconds > 3
      ? (zh ? '此文件约剩 ' : 'This file: ~') +
          Math.ceil(seconds / 60) +
          (zh ? ' 分钟' : ' min left')
      : '',
  );
});
