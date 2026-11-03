import { useEffect, useRef } from 'react';
import { usePreferences, type Preferences } from '../../app/preferences';
import { jamCall } from '../project-call';

export function PointerGlyph({ style }: { style: Preferences['pointerStyle'] }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      {style === 'ring' ? (
        <>
          <circle cx="14" cy="14" r="8" fill="none" stroke="#15131a" strokeWidth="4" />
          <circle cx="14" cy="14" r="8" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <circle cx="14" cy="14" r="2" fill="white" />
        </>
      ) : style === 'crosshair' ? (
        <>
          <path d="M14 2v8m0 8v8M2 14h8m8 0h8" stroke="#15131a" strokeWidth="4" />
          <path d="M14 2v8m0 8v8M2 14h8m8 0h8" stroke="white" strokeWidth="2" />
          <circle cx="14" cy="14" r="2" fill="var(--accent)" />
        </>
      ) : (
        <path
          d="M3 2v21l6-6 4 9 4-2-4-8h9Z"
          fill="white"
          stroke="#15131a"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function AndroidPointer() {
  const { pointerStyle } = usePreferences(),
    host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.dataset.pointerStyle = pointerStyle;
    void jamCall('android-pointer-style', { style: pointerStyle }).catch(() => {});
    if (pointerStyle === 'system') return;
    let timer: ReturnType<typeof setTimeout>;
    const hide = () => {
      if (host.current) host.current.dataset.visible = 'false';
      clearTimeout(timer);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') {
        hide();
        return;
      }
      if (!host.current) return;
      const offset = pointerStyle === 'arrow' ? 2 : 14;
      host.current.style.transform = `translate3d(${event.clientX - offset}px,${event.clientY - offset}px,0)`;
      host.current.dataset.visible = 'true';
      host.current.dataset.pressed = String(event.buttons !== 0);
      clearTimeout(timer);
      timer = setTimeout(hide, 2200);
    };
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    window.addEventListener('pointerup', move, { passive: true });
    window.addEventListener('pointerout', leave);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      hide();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      window.removeEventListener('pointerup', move);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [pointerStyle]);
  if (pointerStyle === 'system') return null;
  return (
    <div ref={host} className="android-pointer" data-visible="false" aria-hidden="true">
      <PointerGlyph style={pointerStyle} />
    </div>
  );
}
