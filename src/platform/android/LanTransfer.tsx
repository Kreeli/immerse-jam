import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { message, t as tr } from '../../i18n';
export default function LanTransfer({
  ids,
  onChanged,
  onError,
}: {
  ids: string[];
  onChanged: () => void;
  onError: (text: string) => void;
}) {
  const [url, setUrl] = useState(''),
    [paired, setPaired] = useState(''),
    [songs, setSongs] = useState<{ id: string; title: string }[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  useEffect(() => {
    const off = window.jam.onEvent((event: any) => {
      if (event.type === 'lan-progress')
        setStatus(
          tr('正在接收 {0}/{1} · {2} MB', [
            event.index,
            event.total,
            (event.received / 1048576).toFixed(1),
          ]),
        );
    });
    return () => {
      off();
      void window.jam.call('android-lan-cancel');
    };
  }, []);
  const guard = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setStatus('');
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const connect = async (value: string) => {
    const list = await window.jam.call<{ id: string; title: string }[]>('android-lan-list', {
      url: value,
    });
    setUrl(value);
    setPaired(value);
    setSongs(list);
    setSelected(list.map((s) => s.id));
    setStatus(tr('已连接，可选择接收或发送歌曲'));
  };
  return (
    <div className="android-lan-transfer notice">
      <h3>{tr('同一网络互传')}</h3>
      <p>
        {tr(
          '电脑生成配对二维码，手机扫描后直接选择接收；也能把上方选中的歌曲发回电脑。无需上传歌曲到云端。',
        )}
      </p>
      <div className="remote-actions">
        <button
          disabled={busy}
          onClick={() =>
            void guard(async () => {
              const value = await window.jam.call<string>('android-scan-pair');
              if (value) await connect(value);
            })
          }
        >
          <ScanLine size={17} />
          {tr('扫描配对二维码')}
        </button>
      </div>
      <input
        aria-label={tr('配对地址')}
        placeholder={tr('也可以粘贴电脑的配对地址')}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
      />
      <button disabled={busy || !url} onClick={() => void guard(() => connect(url))}>
        {tr('连接设备')}
      </button>
      {paired && (
        <>
          <div className="selection-list">
            {songs.map((song) => (
              <label key={song.id}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(song.id)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked ? [...old, song.id] : old.filter((id) => id !== song.id),
                    )
                  }
                />
                <span>{song.title}</span>
              </label>
            ))}
          </div>
          <div className="remote-actions">
            <button
              disabled={busy || !selected.length}
              onClick={() =>
                void guard(async () => {
                  try {
                    const result = await window.jam.call<any[]>('android-lan-download', {
                      url: paired,
                      ids: selected,
                    });
                    setStatus(tr('已接收 {0} 首歌曲', [result.length]));
                  } finally {
                    onChanged();
                  }
                })
              }
            >
              {tr('接收选中的歌曲')}
            </button>
            <button
              disabled={busy || !ids.length}
              onClick={() =>
                void guard(async () => {
                  await window.jam.call('android-lan-upload', { url: paired, ids });
                  setStatus(tr('已发送，请在电脑确认导入'));
                })
              }
            >
              {tr('发送上方选中的歌曲')}
            </button>
          </div>
        </>
      )}
      {busy && (
        <button onClick={() => void window.jam.call('android-lan-cancel')}>{tr('取消传输')}</button>
      )}
      {status && <p role="status">{message(status)}</p>}
    </div>
  );
}
