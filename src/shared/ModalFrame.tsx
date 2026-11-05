import * as Dialog from '@radix-ui/react-dialog';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { isAndroid } from '../platform/environment';
import { t as tr } from '../i18n';
let desktopModalCount = 0;
export default function ModalFrame({
  open,
  onClose,
  className = '',
  label,
  managedFocus = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
  label?: string;
  managedFocus?: boolean;
  children: ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (isAndroid || !open || !managedFocus) return;
    desktopModalCount++;
    document.documentElement.dataset.desktopModal = 'open';
    return () => {
      if (--desktopModalCount === 0) delete document.documentElement.dataset.desktopModal;
    };
  }, [open, managedFocus]);
  useLayoutEffect(() => {
    if (open)
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  const [viewport, setViewport] = useState<CSSProperties>({});
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
  if (!isAndroid && !managedFocus)
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
        <Dialog.Overlay
          className={isAndroid ? 'mobile-dialog-overlay' : 'desktop-dialog-overlay'}
        />
        <Dialog.Content
          className={'modal ' + (isAndroid ? 'mobile-dialog ' : 'managed-dialog ') + className}
          style={viewport}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            if (isAndroid) e.preventDefault();
            else if (e.target instanceof HTMLElement) {
              const initial = e.target.querySelector<HTMLElement>('[data-initial-focus]');
              if (initial) {
                e.preventDefault();
                initial.focus();
              }
            }
          }}
          onCloseAutoFocus={(e) => {
            if (!isAndroid) {
              e.preventDefault();
              if (returnFocus.current?.isConnected) returnFocus.current.focus();
            }
          }}
        >
          <Dialog.Title className="sr-only">{label || tr('选项')}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
