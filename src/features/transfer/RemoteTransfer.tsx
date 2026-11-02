import { jamCall } from '../../platform/project-call';
import { encode, decode } from './connection-code';
import { useEffect, useRef, useState } from 'react';
import { message, t as tr } from '../../i18n';
export default function RemoteTransfer({
  ids,
  onError,
  beforeSend,
}: {
  ids: string[];
  beforeSend?: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const peerAcks = useRef(false);
  const acknowledgement = useRef<{
    offset: number;
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peer = useRef<RTCPeerConnection | null>(null),
    channel = useRef<RTCDataChannel | null>(null),
    queue = useRef(Promise.resolve()),
    receiving = useRef<{
      id: string;
      offset: number;
    } | null>(null);
  const [local, setLocal] = useState(''),
    [remote, setRemote] = useState(''),
    [status, setStatus] = useState(tr('尚未连接')),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [offers, setOffers] = useState<any[]>([]);
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setBusy(false);
      onError((e as Error).message);
    }
  };
  const disconnect = () => {
    if (connectTimer.current) clearTimeout(connectTimer.current);
    acknowledgement.current?.reject(new Error(tr('连接已断开，请重新发送')));
    acknowledgement.current = null;
    receiving.current = null;
    setOffers([]);
    setConnected(false);
    setBusy(false);
    void jamCall('peer-close').catch(() => {});
  };
  const bind = (c: RTCDataChannel) => {
    channel.current = c;
    peerAcks.current = false;
    c.binaryType = 'arraybuffer';
    c.onopen = () => {
      c.send(JSON.stringify({ type: 'hello', acknowledgements: true }));
      if (connectTimer.current) clearTimeout(connectTimer.current);
      setConnected(true);
      setStatus(tr('已加密直连，可以互相发送选中的歌曲'));
    };
    c.onclose = () => {
      setConnected(false);
      setStatus(tr('连接已关闭'));
      disconnect();
    };
    c.onerror = disconnect;
    c.onmessage = (e) => {
      // Acknowledgements must bypass the disk queue: send() can be waiting
      // inside that queue while handling the peer's accept-files message.
      if (typeof e.data === 'string') {
        try {
          const ack = JSON.parse(e.data);
          if (ack.type === 'hello') {
            peerAcks.current = ack.acknowledgements === true;
            return;
          }
          if (ack.type === 'written') {
            const pending = acknowledgement.current;
            if (pending && pending.offset === ack.offset) pending.resolve();
            return;
          }
        } catch {
          c.close();
          return;
        }
      }
      queue.current = queue.current
        .then(async () => {
          if (typeof e.data === 'string') {
            const message = JSON.parse(e.data);
            if (message.type === 'offer-files') setOffers(message.files);
            if (message.type === 'file-start') {
              if (receiving.current) throw new Error(tr('已有文件正在接收'));
              const id = await jamCall<string>('peer-begin', message.file);
              receiving.current = { id, offset: 0 };
            }
            if (message.type === 'file-end') {
              if (!receiving.current) throw new Error(tr('未找到正在接收的文件'));
              await jamCall('peer-finish', { id: receiving.current.id });
              receiving.current = null;
              c.send(JSON.stringify({ type: 'written', offset: -1 }));
              setStatus(tr('文件接收并校验完成，请确认导入'));
            }
            if (message.type === 'accept-files') await send(message.ids);
          } else {
            const item = receiving.current;
            if (!item) throw new Error(tr('意外的文件片段'));
            const bytes = new Uint8Array(e.data);
            item.offset = await jamCall('peer-append', {
              id: item.id,
              offset: item.offset,
              chunk: bytes,
            });
            c.send(JSON.stringify({ type: 'written', offset: item.offset }));
            setStatus(tr('已接收 {0} MB', [(item.offset / 1048576).toFixed(1)]));
          }
        })
        .catch((error) => {
          c.close();
          disconnect();
          onError(error.message);
        });
    };
  };
  const create = () => {
    disconnect();
    peer.current?.close();
    setConnected(false);
    const p = new RTCPeerConnection({ iceServers: [] });
    peer.current = p;
    p.ondatachannel = (e) => bind(e.channel);
    p.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(p.connectionState)) {
        disconnect();
      }
      if (p.connectionState === 'failed')
        setStatus(tr('网络不支持当前直连，请尝试同一网络或热点互传'));
    };
    return p;
  };
  const gather = async (p: RTCPeerConnection) => {
    await new Promise<void>((resolve) => {
      if (p.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(resolve, 15000);
      p.addEventListener('icegatheringstatechange', () => {
        if (p.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    setLocal(encode(p.localDescription!));
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = setTimeout(() => {
      if (p.connectionState !== 'connected') {
        p.close();
        disconnect();
        setStatus(tr('直连超时，请使用同一 Wi-Fi、热点或分享 .ijam 文件。'));
      }
    }, 90000);
    setBusy(false);
    setStatus(
      p.localDescription?.type === 'offer'
        ? tr('把连接码发给对方，再粘贴对方的回应码')
        : tr('把回应码发回发起方'),
    );
  };
  const apply = () =>
    guard(async () => {
      setBusy(true);
      const description = decode(remote);
      if (description.type === 'offer') {
        const p = create();
        await p.setRemoteDescription(description);
        await p.setLocalDescription(await p.createAnswer());
        await gather(p);
      } else {
        if (!peer.current || peer.current.signalingState !== 'have-local-offer')
          throw new Error(tr('请先发起连接'));
        await peer.current.setRemoteDescription(description);
        setBusy(false);
        setStatus(tr('正在尝试直接连接…'));
      }
    });
  const waitWritten = (offset: number, sendChunk: () => void) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        acknowledgement.current = null;
        reject(new Error(tr('传输超时，请重新连接后发送')));
      }, 30000);
      acknowledgement.current = {
        offset,
        resolve: () => {
          clearTimeout(timer);
          acknowledgement.current = null;
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          acknowledgement.current = null;
          reject(error);
        },
      };
      try {
        sendChunk();
      } catch (error) {
        acknowledgement.current.reject(error as Error);
      }
    });
  const send = async (keys: string[]) => {
    const c = channel.current!;
    setBusy(true);
    try {
      for (const id of keys) {
        const file = (await jamCall<any[]>('peer-outgoing')).find((f) => f.id === id);
        if (!file) throw new Error(tr('发送文件已失效'));
        c.send(JSON.stringify({ type: 'file-start', file }));
        for (let offset = 0; offset < file.size;) {
          if (c.readyState !== 'open') throw new Error(tr('连接已断开，请重新发送'));
          while (c.bufferedAmount > 1024 * 1024) {
            if (c.readyState !== 'open') throw new Error(tr('连接已断开'));
            await new Promise((r) => setTimeout(r, 20));
          }
          const chunk = await jamCall<string | Uint8Array>('peer-read', {
            id,
            offset,
            binary: true,
          });
          const bytes =
            typeof chunk === 'string'
              ? Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0))
              : chunk;
          if (!bytes.length) throw new Error(tr('发送文件已失效'));
          if (peerAcks.current)
            await waitWritten(offset + bytes.length, () => c.send(new Uint8Array(bytes)));
          else c.send(new Uint8Array(bytes));
          offset += bytes.length;
          setStatus(
            tr('发送 {0} \u00B7 {1}%', [file.name, Math.round((offset / file.size) * 100)]),
          );
        }
        if (peerAcks.current)
          await waitWritten(-1, () => c.send(JSON.stringify({ type: 'file-end' })));
        else c.send(JSON.stringify({ type: 'file-end' }));
      }
      setStatus(tr('文件已发送，等待对方确认导入'));
    } finally {
      setBusy(false);
    }
  };
  useEffect(
    () => () => {
      peer.current?.close();
      disconnect();
    },
    [],
  );
  return (
    <div className="remote-transfer">
      <h3>{tr('局域网直连 · 连接码配对')}</h3>
      <p className="notice">{tr('请连接同一局域网（同一 Wi-Fi 或热点）。')}</p>
      <p className="muted">
        {tr(
          '双方打开 Immerse Jam。发起方分享连接码，接收方粘贴后将回应码发回。歌曲通过加密连接直传；部分网络无法打通。',
        )}
      </p>
      <div className="remote-actions">
        <button
          disabled={busy || connected}
          onClick={() =>
            void guard(async () => {
              setBusy(true);
              setStatus(tr('收集连接信息…'));
              const p = create();
              bind(p.createDataChannel('immerse-files', { ordered: true }));
              await p.setLocalDescription(await p.createOffer());
              await gather(p);
            })
          }
        >
          {tr('发起局域网连接')}
        </button>
        <button
          onClick={() => {
            disconnect();
            peer.current?.close();
            setConnected(false);
            setLocal('');
            setRemote('');
            void jamCall('peer-close');
          }}
        >
          {tr('断开')}
        </button>
      </div>
      <textarea
        aria-label={tr('对方连接码')}
        placeholder={tr('粘贴对方的连接码 / 回应码')}
        value={remote}
        onChange={(e) => setRemote(e.target.value)}
      />
      <button disabled={busy || !remote || connected} onClick={() => void apply()}>
        {tr('使用对方连接码')}
      </button>
      {local && (
        <>
          <textarea aria-label={tr('本机连接码')} readOnly value={local} />
          <button onClick={() => void navigator.clipboard.writeText(local)}>
            {tr('复制本机连接码')}
          </button>
        </>
      )}
      <p role="status">{message(status)}</p>
      {connected && (
        <button
          className="primary"
          disabled={busy || !ids.length}
          onClick={() =>
            void guard(async () => {
              setBusy(true);
              await beforeSend?.();
              const files = await jamCall('peer-prepare', { ids });
              channel.current!.send(JSON.stringify({ type: 'offer-files', files }));
              setBusy(false);
              setStatus(tr('已发出歌曲清单，等待对方选择接收'));
            })
          }
        >
          {tr('发送选中的')}
          {ids.length}
          {tr('首歌曲')}
        </button>
      )}
      {offers.length > 0 && (
        <div className="notice">
          <strong>{tr('对方分享的歌曲')}</strong>
          {offers.map((f) => (
            <label key={f.id} style={{ display: 'block' }}>
              <input
                type="checkbox"
                defaultChecked
                onChange={(e) => (f.accept = e.target.checked)}
              />
              {f.name} · {Math.round(f.size / 1048576)} MB
            </label>
          ))}
          <button
            onClick={() => {
              channel.current!.send(
                JSON.stringify({
                  type: 'accept-files',
                  ids: offers.filter((f) => f.accept !== false).map((f) => f.id),
                }),
              );
              setOffers([]);
              setStatus(tr('准备接收…'));
            }}
          >
            {tr('接收选中的歌曲')}
          </button>
        </div>
      )}
    </div>
  );
}
