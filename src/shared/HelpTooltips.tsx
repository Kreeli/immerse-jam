import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePreferences } from '../app/preferences';
export default function HelpTooltips() {
  const { helpTooltips } = usePreferences();
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null,
      title: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let revealed = false;
    const hide = () => {
      clearTimeout(timer);
      revealed = false;
      setTip(null);
      if (current) {
        if (title !== null && !current.hasAttribute('title')) current.setAttribute('title', title);
        const ids = (current.getAttribute('aria-describedby') || '')
          .split(' ')
          .filter((x) => x && x !== 'immerse-help-tooltip');
        if (ids.length) current.setAttribute('aria-describedby', ids.join(' '));
        else current.removeAttribute('aria-describedby');
      }
      current = null;
      title = null;
    };
    const show = (target: EventTarget | null, immediate = false) => {
      if (current && target instanceof Node && current.contains(target)) {
        if (!immediate) return;
        hide();
      }
      const element =
        target instanceof Element ? target.closest<HTMLElement>('[data-help],[title]') : null;
      if (element === current) return;
      hide();
      if (!element) return;
      const text = element.dataset.help || element.getAttribute('title');
      if (!text) return;
      current = element;
      title = element.getAttribute('title');
      element.removeAttribute('title');
      if (!helpTooltips) return;
      const reveal = () => {
        if (!element.isConnected || current !== element) return;
        const r = element.getBoundingClientRect(),
          width = Math.min(320, innerWidth - 24);
        revealed = true;
        setTip({
          text,
          x: Math.max(12, Math.min(r.left, innerWidth - width - 12)),
          y: r.bottom + 96 > innerHeight ? Math.max(12, r.top - 92) : r.bottom + 8,
        });
        const ids = (element.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        element.setAttribute(
          'aria-describedby',
          [...new Set([...ids, 'immerse-help-tooltip'])].join(' '),
        );
      };
      if (immediate) reveal();
      else timer = setTimeout(reveal, 2000);
    };
    const pointer = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') show(e.target);
    };
    const leave = (e: PointerEvent) => {
      if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget)))
        hide();
    };
    const focus = (e: FocusEvent) => show(e.target, true);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && revealed) {
        e.preventDefault();
        e.stopPropagation();
        hide();
      }
    };
    document.addEventListener('pointerover', pointer);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', hide, true);
    return () => {
      hide();
      document.removeEventListener('pointerover', pointer);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', hide, true);
    };
  }, [helpTooltips]);
  return tip
    ? createPortal(
        <div
          id="immerse-help-tooltip"
          className="help-tooltip"
          role="tooltip"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>,
        document.body,
      )
    : null;
}
