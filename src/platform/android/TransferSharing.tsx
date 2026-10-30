import { Share2 } from 'lucide-react';
import { t as tr } from '../../i18n';
import LanTransfer from './LanTransfer';
export default function TransferSharing({
  ids,
  onError,
  onChanged,
}: {
  ids: string[];
  onError: (message: string) => void;
  onChanged: () => void;
}) {
  return (
    <div className="notice">
      <LanTransfer ids={ids} onChanged={onChanged} onError={onError} />
      <p>
        {tr(
          '完整歌曲文件包含原曲、分轨、节拍、和弦谱，以及附件和录音（如有）。可从电脑导出 .ijam 导入手机，也可通过系统分享发给朋友。',
        )}
      </p>
      <button
        disabled={!ids.length}
        onClick={() =>
          void window.jam.call('android-share-projects', { ids }).catch((e) => onError(e.message))
        }
      >
        <Share2 size={16} />
        {tr('分享选中的完整歌曲')}
      </button>
      <small>
        {tr(
          '接收方安装 Immerse Jam 后，可用本应用打开收到的 .ijam。已有节拍默认保留，无需再次识别。',
        )}
      </small>
    </div>
  );
}
