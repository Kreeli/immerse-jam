import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isAndroid } from '../platform/environment';
import { t as tr } from '../i18n';
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
