import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { jamCall } from '../platform/project-call';
import { t as tr } from '../i18n';
export default function WindowControls({ onError }: { onError: (message: string) => void }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    void jamCall<{ maximized: boolean }>('window', { action: 'state' })
      .then((s) => setMaximized(!!s?.maximized))
      .catch(() => {});
    return window.jam.onEvent((e) => {
      if (e.type === 'window-state') setMaximized(!!e.result?.maximized);
    });
  }, []);
  const act = (action: string) =>
    void jamCall('window', { action }).catch((e) => onError(e.message));
  return (
    <div className="desktop-window-controls" role="group" aria-label={tr('窗口控制')}>
      <button aria-label={tr('最小化')} title={tr('最小化')} onClick={() => act('minimize')}>
        <Minus size={15} />
      </button>
      <button
        aria-label={maximized ? tr('还原窗口') : tr('最大化')}
        title={maximized ? tr('还原窗口') : tr('最大化')}
        onClick={() => act('maximize')}
      >
        {maximized ? <Copy size={14} /> : <Square size={14} />}
      </button>
      <button
        className="window-close"
        aria-label={tr('关闭应用')}
        title={tr('关闭应用')}
        onClick={() => act('close')}
      >
        <X size={17} />
      </button>
    </div>
  );
}
