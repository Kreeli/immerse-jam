import './bridge';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@desktop/app/App';
import '@desktop/styles/style.css';
import '@desktop/styles/themes.css';
import '@desktop/styles/playback-controls.css';
import '@desktop/styles/recording-workspace.css';
import '@desktop/styles/readability.css';
import './shell.css';

function Demo() {
  const [notice, setNotice] = useState(
    '已打开 Fabulous 排练片段。点击「开始分析」体验模拟六轨分离，再创建跟练。',
  );
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const show = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener('demo-notice', show);
    return () => window.removeEventListener('demo-notice', show);
  }, []);
  return (
    <>
      <header className="demo-banner">
        <div>
          <b>网页试用</b>
          <span>PC 原版界面 · 模拟分析 · 预置六轨 · 不使用麦克风</span>
        </div>
        <nav>
          <button onClick={() => setHelp(!help)}>体验说明</button>
          <button onClick={() => location.reload()}>重置</button>
          <a href="../index.html" target="_top">
            返回官网 ↗
          </a>
        </nav>
      </header>
      <div className="demo-notice" role="status">
        {notice}
      </div>
      {help && (
        <div className="demo-help">
          <strong>真实操作，示例数据。</strong>
          <p>
            播放、音量、选听、声像、变速移调、段落循环、标记、和弦编辑、跟练与创作使用 PC
            界面与播放器。分轨分析显示模拟进度，始终载入同一组预置六轨，不代表模型间的音质差异。和弦／节拍／谱例仅用于演示，非本曲准确转写。
          </p>
          <p>
            录音不使用麦克风，停止后载入预置吉他片段。导出、设备互传、本机文件导入和迁移仅展示入口；不访问文件或建立设备连接。所有修改仅保留在本页，重置即可恢复。
          </p>
          <button onClick={() => setHelp(false)}>开始体验</button>
        </div>
      )}
      <div className="demo-desktop">
        <App />
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Demo />);
