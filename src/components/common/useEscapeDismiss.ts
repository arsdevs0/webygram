import { useLayoutEffect, useRef } from 'react';
import { createBackNavigation } from '../../utils/backNavigation';
let navigation: ReturnType<typeof createBackNavigation> | undefined;
function getNavigation() {
  return navigation ??= createBackNavigation({
    history: window.history,
    listen: (type, callback) => {
      window.addEventListener(type, callback, type === 'keydown');
      return () => window.removeEventListener(type, callback, type === 'keydown');
    },
    defer: callback => { window.setTimeout(callback, 0); },
  });
}
/** Browser/device Back and Escape dismiss only the topmost open surface. */
export function useEscapeDismiss(open: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useLayoutEffect(() => {
    if (!open || !closeRef.current) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const remove = getNavigation().add(() => closeRef.current?.());
    return () => {
      remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
}
export function useAppBack(enabled: boolean, onBack: () => void) {
  const backRef = useRef(onBack); backRef.current = onBack;
  useLayoutEffect(() => { getNavigation().setFallback(enabled ? () => backRef.current() : undefined); });
  useLayoutEffect(() => () => getNavigation().setFallback(undefined), []);
}
