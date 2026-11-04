// A small UTF-16 INI snapshot lets the native installer display real download
// events without a second window or blocking its UI thread.
const fs = require('node:fs');
const clean = (value) =>
  String(value ?? '')
    .replace(/[\r\n\0]/g, ' ')
    .slice(0, 700);
const mib = (value) => (value / 1048576).toFixed(1) + ' MiB';
function create(file, english = false) {
  let stage,
    lastWrite = 0,
    pending,
    timer,
    state = 'running';
  const labels = english
    ? {
        data: 'Preparing data folder',
        runtime: 'Installing runtime',
        audio: 'Installing audio tools',
        model: 'Downloading model',
        finish: 'Saving settings',
        complete: 'Ready',
      }
    : {
        data: '准备数据目录',
        runtime: '安装运行环境',
        audio: '安装音频工具',
        model: '下载模型',
        finish: '保存安装配置',
        complete: '准备完成',
      };
  const write = () => {
    clearTimeout(timer);
    timer = undefined;
    lastWrite = Date.now();
    const e = pending || {},
      numeric = Number.isFinite(e.progress);
    const seconds = e.total && e.bytesPerSecond > 0 ? (e.total - e.received) / e.bytesPerSecond : 0;
    const fields = {
      state,
      stage: stage
        ? stage.modelName
          ? labels.model + ' · ' + stage.modelName
          : labels[stage.name] || stage.name
        : labels.data,
      steps: stage ? `${Math.min(stage.index + 1, stage.total)} / ${stage.total}` : '',
      overall: stage ? Math.round(Math.min(1, stage.index / stage.total) * 100) : 0,
      file: e.file || (english ? 'Preparing / verifying…' : '正在准备 / 校验…'),
      percent: numeric ? Math.round(Math.max(0, Math.min(1, e.progress)) * 100) : '',
      transfer: Number.isFinite(e.received)
        ? mib(e.received) +
          (e.total ? ' / ' + mib(e.total) : '') +
          (Number.isFinite(e.bytesPerSecond) ? '  ·  ' + mib(e.bytesPerSecond) + '/s' : '') +
          (seconds > 3
            ? (english ? '  ·  ~' : '  ·  约剩 ') +
              Math.ceil(seconds / 60) +
              (english ? ' min' : ' 分钟')
            : '')
        : '',
      message: (e.message || '').replace(/\x1b\[[0-9;]*m/g, ''),
    };
    const temp = file + '.tmp';
    fs.writeFileSync(
      temp,
      '\ufeff[Progress]\r\n' +
        Object.entries(fields)
          .map(([key, value]) => key + '=' + clean(value))
          .join('\r\n') +
        '\r\n',
      'utf16le',
    );
    fs.renameSync(temp, file);
  };
  return {
    send(event) {
      if (event.stage) stage = event.stage;
      pending = event;
      // "complete" is committed only after prepare() itself resolves.
      if (Date.now() - lastWrite >= 100) write();
      else if (!timer) timer = setTimeout(write, 100);
    },
    finish(error) {
      state = error ? 'failed' : 'complete';
      pending = error
        ? { message: require('./install-errors.cjs').errorMessage(error, english) }
        : {
            progress: 1,
            file: english ? 'Selected components are ready' : '所选组件已就绪',
            message: english ? 'All selected components are ready.' : '所选组件已全部准备完成。',
          };
      write();
    },
  };
}
module.exports = { create };
