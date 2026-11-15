import { useEffect, useRef } from 'react';

const openDialogs: symbol[] = [];

/** Only the topmost open panel consumes Escape. */
export function useEscapeDismiss(open: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !closeRef.current) return;
    const token = Symbol('dialog');
    const previousFocus = document.activeElement as HTMLElement | null;
    openDialogs.push(token);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && openDialogs.at(-1) === token) {
        event.preventDefault();
        closeRef.current?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      openDialogs.splice(openDialogs.indexOf(token), 1);
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
}
