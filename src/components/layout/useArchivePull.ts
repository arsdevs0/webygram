import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Pull feedback updates the small indicator, not the whole list on every touch. */
export function useArchivePull(viewport: RefObject<HTMLDivElement | null>, indicator: RefObject<HTMLButtonElement | null>, enabled: boolean, onReveal: () => void) {
  const reveal = useRef(onReveal); reveal.current = onReveal;
  useEffect(() => {
    const node = viewport.current, hint = indicator.current;
    if (!node || !hint || !enabled) return;
    let start: { x: number; y: number } | null = null;
    let distance = 0, frame = 0, armed = false;
    const paint = () => {
      frame = 0;
      hint.style.setProperty('--archive-pull', distance + 'px');
      hint.style.setProperty('--archive-progress', String(Math.min(1, distance / 58)));
      hint.dataset.pulling = String(distance > 0);
      hint.dataset.armed = String(distance >= 58);
      const label = hint.querySelector('span');
      if (label) label.textContent = distance >= 58 ? 'Release to show Archived Chats' : 'Pull down for Archived Chats';
    };
    const reset = () => { if (frame) cancelAnimationFrame(frame); frame = 0; distance = 0; armed = false; start = null; paint(); };
    const onStart = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1 || node.scrollTop > 1) return;
      const touch = event.touches[0]; start = { x: touch.clientX, y: touch.clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0], dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) { reset(); return; }
      if (dy <= 0) { distance = 0; if (!frame) frame = requestAnimationFrame(paint); return; }
      if (dy < 8 || Math.abs(dx) > dy) return;
      if (event.cancelable) event.preventDefault();
      distance = Math.min(104, dy * .55);
      if (distance >= 58 && !armed) navigator.vibrate?.(6);
      armed = distance >= 58;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onEnd = () => { const open = distance >= 58; reset(); if (open) reveal.current(); };
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', reset);
    return () => {
      node.removeEventListener('touchstart', onStart); node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd); node.removeEventListener('touchcancel', reset); reset();
    };
  }, [viewport, indicator, enabled]);
}
