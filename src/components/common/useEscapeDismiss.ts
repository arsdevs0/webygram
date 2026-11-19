import { useLayoutEffect, useRef } from 'react';
import { initializeAppBack, setAppExitHint } from '../../services/appBackNavigation';
const getNavigation = initializeAppBack;
/** Browser/device Back and Escape dismiss only the topmost open surface. */
export function useEscapeDismiss(open: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useLayoutEffect(() => {
    if (!open || !closeRef.current) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const restoreKeyboardFocus = previousFocus?.matches(':focus-visible');
    const remove = getNavigation().add(() => closeRef.current?.());
    return () => {
      remove();
      if (restoreKeyboardFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
}
export function useAppBack(enabled: boolean, onBack: () => void, onExitHint?: (remaining?: number) => void) {
  const backRef = useRef(onBack); backRef.current = onBack;
  const hintRef = useRef(onExitHint); hintRef.current = onExitHint;
  useLayoutEffect(() => {
    getNavigation(); setAppExitHint(remaining => hintRef.current?.(remaining));
    return () => setAppExitHint(undefined);
  }, []);
  useLayoutEffect(() => { getNavigation().setFallback(enabled ? () => backRef.current() : undefined); });
  useLayoutEffect(() => () => getNavigation().setFallback(undefined), []);
}
