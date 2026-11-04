import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isAndroid } from '../platform/environment';
import { t as tr } from '../i18n';
const dialogClosers: { close: () => void }[] = [];
export function closeTopDialog() {
  const top = dialogClosers.at(-1);
  if (!top) return false;
  top.close();
  return true;
}
export default function ModalFrame({
  open,
  onClose,
  className = '',
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const [viewport, setViewport] = useState<CSSProperties>({});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const close = () => closeRef.current();
    const element = { close };
    dialogClosers.push(element);
    return () => {
      const index = dialogClosers.indexOf(element);
      if (index >= 0) dialogClosers.splice(index, 1);
    };
  }, [open]);
  useEffect(() => {
    if (!isAndroid || !open) return;
    const visible = window.visualViewport;
    const update = () => {
      const height = visible?.height ?? innerHeight,
        top = visible?.offsetTop ?? 0;
      setViewport({
        '--dialog-visible-height': height + 'px',
        '--dialog-keyboard-inset': Math.max(0, innerHeight - top - height) + 'px',
        '--dialog-center-from-bottom': innerHeight - top - height / 2 + 'px',
      } as CSSProperties);
    };
    update();
    visible?.addEventListener('resize', update);
    visible?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visible?.removeEventListener('resize', update);
      visible?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [open]);
  if (!isAndroid)
    return open
      ? createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          >
            <section className={'modal ' + className}>{children}</section>
          </div>,
          document.body,
        )
      : null;
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="mobile-dialog-overlay" />
        <Dialog.Content
          className={'modal mobile-dialog ' + className}
          style={viewport}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{label || tr('选项')}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
