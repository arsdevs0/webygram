import { createBackNavigation } from '../utils/backNavigation';
let navigation: ReturnType<typeof createBackNavigation> | undefined;
let exitHint: ((remaining?: number) => void) | undefined;
/** Arm before connecting/loading Telegram; keep one owner through lazy app mounts. */
export function initializeAppBack() {
  if (navigation) return navigation;
  navigation = createBackNavigation({
    history: window.history, now: () => Date.now(),
    listen: (type, callback) => {
      window.addEventListener(type, callback, type === 'keydown');
      return () => window.removeEventListener(type, callback, type === 'keydown');
    },
    defer: callback => { window.setTimeout(callback, 0); },
  });
  navigation.setExitProtection(remaining => exitHint?.(remaining), { rapidExitTaps: 4 });
  const browserNavigation = (window as any).navigation;
  browserNavigation?.addEventListener('navigate', (event: any) => {
    if (event.navigationType === 'traverse' && !event.destination.sameDocument && event.cancelable && navigation?.handleExternalBack()) event.preventDefault();
  });
  (window as any).__webygramBootBackCleanup?.();
  return navigation;
}
export function setAppExitHint(callback?: (remaining?: number) => void) { exitHint = callback; }
