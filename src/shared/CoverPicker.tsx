import { useRef, useState } from 'react';
import { ImagePlus, RotateCcw } from 'lucide-react';
import { t as tr, message } from '../i18n';
import RehearsalCover from './RehearsalCover';

export default function CoverPicker({
  value,
  onChange,
  folder = false,
  onBusyChange,
}: {
  value: string;
  onChange: (cover: string) => void;
  folder?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="cover-picker">
      <RehearsalCover id="preview" size={80} cover={value} folder={folder} />
      <div className="cover-picker-actions">
        <input
          ref={input}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={tr('选择封面图片')}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setError('');
            setBusy(true);
            onBusyChange?.(true);
            let image: ImageBitmap | undefined;
            try {
              if (
                !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
                file.size > 20 * 1024 * 1024
              )
                throw new Error(tr('请选择 20 MB 以内的 JPG、PNG 或 WebP 图片'));
              image = await createImageBitmap(file);
              const canvas = document.createElement('canvas'),
                edge = Math.min(image.width, image.height);
              canvas.width = canvas.height = Math.min(384, edge);
              const ctx = canvas.getContext('2d')!;
              ctx.fillStyle = '#17151d';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(
                image,
                (image.width - edge) / 2,
                (image.height - edge) / 2,
                edge,
                edge,
                0,
                0,
                canvas.width,
                canvas.height,
              );
              let cover = canvas.toDataURL('image/jpeg', 0.82);
              if (cover.length > 180000) cover = canvas.toDataURL('image/jpeg', 0.6);
              if (cover.length > 180000) throw new Error(tr('图片处理失败，请换一张图片'));
              onChange(cover);
            } catch (e) {
              setError(message((e as Error).message) || tr('图片处理失败，请换一张图片'));
            } finally {
              image?.close();
              setBusy(false);
              onBusyChange?.(false);
            }
          }}
        />
        <button
          type="button"
          className="nr-btn"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} />
          {busy ? tr('正在处理图片…') : tr('修改封面')}
        </button>
        {value && (
          <button
            type="button"
            className="nr-btn nr-ghost"
            disabled={busy}
            onClick={() => onChange('')}
          >
            <RotateCcw size={15} />
            {tr('恢复默认图标')}
          </button>
        )}
        {error && <small role="alert">{error}</small>}
      </div>
    </div>
  );
}
