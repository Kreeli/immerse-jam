import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '../i18n';
import { orderedTracks } from './track-order';
import useTrackOrder from './useTrackOrder';

type Session = {
  id: string;
  pointer: number;
  touch: boolean;
  x: number;
  y: number;
  startX: number;
  startY: number;
  active: boolean;
  signature: string;
  timer: ReturnType<typeof setTimeout>;
  anchors: { id: string; y: number }[];
  scroll: HTMLElement | null;
  scrollTop: number;
  anchorOffset: number;
  leftOffset: number;
  topOffset: number;
  overlay: HTMLElement | null;
};
const controls =
  'input,select,textarea,a,summary,details,form,[contenteditable="true"],[role="slider"],canvas,video,.waveform,[data-no-reorder]';
const header = (node: HTMLElement) =>
  node.querySelector<HTMLElement>('.creation-object-heading,.track-top') || node;
const scrollParent = (node: HTMLElement | null) => {
  let parent = node?.parentElement;
  while (parent && parent !== document.body) {
    if (
      /(auto|scroll)/.test(getComputedStyle(parent).overflowY) &&
      parent.scrollHeight > parent.clientHeight
    )
      return parent;
    parent = parent.parentElement;
  }
  return null;
};

export default function SortableTracks<T extends { id: string }>({
  items,
  projectId,
  scope,
  label,
  children,
  disabled = false,
  className = '',
}: {
  items: T[];
  projectId: string;
  scope: string;
  label: (item: T) => string;
  children: (item: T) => ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useTrackOrder(projectId, scope);
  const root = useRef<HTMLDivElement>(null),
    nodes = useRef(new Map<string, HTMLDivElement>());
  const session = useRef<Session | null>(null),
    previewRef = useRef<string[] | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null),
    [active, setActive] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const suppressedClick = useRef(0),
    positions = useRef(new Map<string, number>()),
    settling = useRef(new Set<HTMLElement>());
  const latest = useRef({ items, saved, setSaved, disabled });
  latest.current = { items, saved, setSaved, disabled };
  const identity = projectId + '|' + scope + '|' + items.map((item) => item.id).join('\0');
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const ordered = orderedTracks(items, preview || saved);
  const remember = () => {
    positions.current = new Map(
      [...nodes.current].map(([id, node]) => [id, node.getBoundingClientRect().top]),
    );
  };
  const reset = () => {
    const drag = session.current;
    if (drag) {
      clearTimeout(drag.timer);
      drag.overlay?.remove();
    }
    session.current = null;
    previewRef.current = null;
    remember();
    setPreview(null);
    setActive(null);
  };
  const inside = (x: number, y: number) => {
    const box = root.current?.getBoundingClientRect(),
      clip = scrollParent(root.current)?.getBoundingClientRect();
    return (
      !!box &&
      x >= box.left &&
      x <= box.right &&
      y >= Math.max(0, box.top, clip?.top || 0) &&
      y <= Math.min(innerHeight, box.bottom, clip?.bottom || innerHeight)
    );
  };
  const move = () => {
    const drag = session.current;
    if (!drag?.active) return;
    if (drag.overlay)
      drag.overlay.style.transform = `translate3d(${drag.x - drag.leftOffset}px,${drag.y - drag.topOffset}px,0)`;
    if (!inside(drag.x, drag.y)) return;
    const center = drag.y + drag.anchorOffset + (drag.scroll?.scrollTop || 0) - drag.scrollTop;
    const others = drag.anchors.filter((anchor) => anchor.id !== drag.id);
    const index = others.filter((anchor) => center > anchor.y).length;
    const next = others.map((anchor) => anchor.id);
    next.splice(index, 0, drag.id);
    if (
      next.join('\0') !==
      (
        previewRef.current ||
        orderedTracks(latest.current.items, latest.current.saved).map((item) => item.id)
      ).join('\0')
    ) {
      remember();
      previewRef.current = next;
      setPreview(next);
    }
  };
  const activate = (drag: Session) => {
    if (
      session.current !== drag ||
      latest.current.disabled ||
      currentIdentity.current !== drag.signature
    )
      return;
    const node = nodes.current.get(drag.id);
    if (!node) return;
    drag.active = true;
    suppressedClick.current = Date.now() + 600;
    drag.scroll = scrollParent(root.current);
    drag.scrollTop = drag.scroll?.scrollTop || 0;
    drag.anchors = orderedTracks(latest.current.items, latest.current.saved).map((item) => {
      const row = nodes.current.get(item.id)!;
      const box = header(row).getBoundingClientRect();
      return { id: item.id, y: box.top + box.height / 2 };
    });
    const box = node.getBoundingClientRect(),
      anchor = header(node).getBoundingClientRect();
    drag.anchorOffset = anchor.top + anchor.height / 2 - drag.y;
    drag.leftOffset = drag.x - box.left;
    drag.topOffset = drag.y - box.top;
    // A DOM snapshot avoids mounting duplicate meters or waveform players.
    const overlay = document.createElement('div');
    overlay.className = 'card-drag-preview';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.width = box.width + 'px';
    overlay.style.transform = `translate3d(${box.left}px,${box.top}px,0)`;
    const card = node.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (card) {
      card
        .querySelectorAll('.take-timing,.creation-object-content')
        .forEach((element) => element.remove());
      card.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      overlay.appendChild(card);
    } else overlay.textContent = label(latest.current.items.find((item) => item.id === drag.id)!);
    document.body.appendChild(overlay);
    drag.overlay = overlay;
    if (!drag.touch) root.current?.setPointerCapture(drag.pointer);
    setActive(drag.id);
    setAnnouncement(tr('上下拖动，松手放置；拖出列表取消'));
  };
  const begin = (event: React.PointerEvent<HTMLDivElement>, item: T) => {
    if (disabled || items.length < 2 || session.current || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      !root.current?.contains(target) ||
      target.closest('.sortable-tracks') !== root.current ||
      target.closest(controls)
    )
      return;
    const button = target.closest('button,[role="button"]');
    if (button && !button.matches('.track-name,.object-expand')) return;
    const drag: Session = {
      id: item.id,
      pointer: event.pointerId,
      touch: event.pointerType === 'touch',
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      signature: identity,
      timer: setTimeout(() => {}, 0),
      anchors: [],
      scroll: null,
      scrollTop: 0,
      anchorOffset: 0,
      leftOffset: 0,
      topOffset: 0,
      overlay: null,
    };
    clearTimeout(drag.timer);
    drag.timer = setTimeout(() => activate(drag), drag.touch ? 340 : 300);
    session.current = drag;
    // Do not cancel a short click or native touch scrolling while waiting.
  };
  const update = (x: number, y: number) => {
    const drag = session.current;
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    if (!drag.active && Math.hypot(x - drag.startX, y - drag.startY) > 7) {
      reset();
      return;
    }
    if (drag.active) move();
  };
  const finish = (x: number, y: number, cancelled = false) => {
    const drag = session.current;
    if (!drag) return;
    const valid =
      !cancelled &&
      drag.active &&
      !latest.current.disabled &&
      currentIdentity.current === drag.signature &&
      inside(x, y);
    if (drag.active) suppressedClick.current = Date.now() + 500;
    if (valid && previewRef.current) {
      const target = nodes.current.get(drag.id)?.getBoundingClientRect();
      if (drag.overlay && target && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const overlay = drag.overlay;
        drag.overlay = null;
        settling.current.add(overlay);
        const animation = overlay.animate(
          [
            { transform: overlay.style.transform, opacity: 1 },
            { transform: `translate3d(${target.left}px,${target.top}px,0)`, opacity: 0 },
          ],
          { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
        );
        const remove = () => {
          overlay.remove();
          settling.current.delete(overlay);
        };
        animation.finished.then(remove, remove);
      }
      latest.current.setSaved(previewRef.current);
      setAnnouncement(tr('已调整音轨顺序'));
    }
    reset();
    if (!drag.touch && root.current?.hasPointerCapture(drag.pointer))
      root.current.releasePointerCapture(drag.pointer);
  };
  useLayoutEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [id, node] of nodes.current) {
      const before = positions.current.get(id);
      if (reduced || before === undefined || id === active) continue;
      node.getAnimations().forEach((animation) => animation.cancel());
      const dy = before - node.getBoundingClientRect().top;
      if (Math.abs(dy) > 1)
        node.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
          duration: 180,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
    }
    positions.current.clear();
  }, [ordered.map((item) => item.id).join('\0'), active]);
  useEffect(() => {
    if (session.current && (disabled || session.current.signature !== identity)) reset();
  }, [identity, disabled]);
  useEffect(() => {
    const element = root.current!;
    const touchMove = (event: TouchEvent) => {
      const drag = session.current;
      if (!drag?.touch) return;
      if (event.touches.length !== 1) {
        finish(drag.x, drag.y, true);
        return;
      }
      if (drag.active && event.cancelable) event.preventDefault();
      update(event.touches[0].clientX, event.touches[0].clientY);
    };
    const touchEnd = (event: TouchEvent) => {
      const drag = session.current;
      if (drag?.touch) {
        const p = event.changedTouches[0];
        finish(p?.clientX ?? drag.x, p?.clientY ?? drag.y, event.type === 'touchcancel');
      }
    };
    const pointerUp = (event: PointerEvent) => {
      const drag = session.current;
      if (drag && !drag.touch && drag.pointer === event.pointerId)
        finish(event.clientX, event.clientY, event.type === 'pointercancel');
    };
    const cancel = () => reset();
    element.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchEnd);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    return () => {
      if (session.current) {
        clearTimeout(session.current.timer);
        session.current.overlay?.remove();
      }
      settling.current.forEach((node) => node.remove());
      element.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      const drag = session.current,
        scroll = drag?.scroll;
      if (drag?.active && scroll && now - last > 16) {
        last = now;
        const rect = scroll.getBoundingClientRect(),
          box = root.current?.getBoundingClientRect();
        if (
          box &&
          drag.x >= box.left &&
          drag.x <= box.right &&
          drag.y >= rect.top - 12 &&
          drag.y <= rect.bottom + 12
        ) {
          const edge = Math.min(48, rect.height / 4);
          const dy =
            drag.y < rect.top + edge
              ? -Math.min(12, (rect.top + edge - drag.y) * 0.3)
              : drag.y > rect.bottom - edge
                ? Math.min(12, (drag.y - rect.bottom + edge) * 0.3)
                : 0;
          if (dy) {
            scroll.scrollTop += dy;
            move();
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return (
    <div
      ref={root}
      className={'sortable-tracks ' + className}
      data-order-scope={scope}
      data-reordering={!!active}
      onPointerDownCapture={() => {
        if (!session.current) suppressedClick.current = 0;
      }}
      onPointerMove={(event) => {
        if (session.current?.pointer === event.pointerId && !session.current.touch)
          update(event.clientX, event.clientY);
      }}
      onPointerLeave={() => {
        if (session.current && !session.current.active) reset();
      }}
      onLostPointerCapture={(event) => {
        if (session.current?.pointer === event.pointerId && !session.current.touch)
          finish(event.clientX, event.clientY, true);
      }}
      onClickCapture={(event) => {
        if (Date.now() < suppressedClick.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onContextMenu={(event) => {
        if (session.current) {
          event.preventDefault();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && session.current) {
          event.preventDefault();
          finish(session.current.x, session.current.y, true);
        }
      }}
    >
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {ordered.map((item) => (
        <div
          key={item.id}
          ref={(node) => {
            if (node) nodes.current.set(item.id, node);
            else nodes.current.delete(item.id);
          }}
          className="sortable-track"
          data-sort-id={item.id}
          data-dragging={active === item.id}
          onPointerDown={(event) => begin(event, item)}
        >
          {children(item)}
        </div>
      ))}
    </div>
  );
}
