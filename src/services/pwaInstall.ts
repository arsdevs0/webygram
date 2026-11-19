type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export type InstallState = 'installed' | 'ready' | 'preparing' | 'manual' | 'error' | 'insecure';
let installEvent: InstallEvent | undefined;
let installing = false, installed = false;
let initialization: Promise<void> | undefined;
let state: InstallState = window.isSecureContext ? 'manual' : 'insecure';
const changed = () => window.dispatchEvent(new Event('webygram-install-ready'));
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installEvent = event as InstallEvent; state = 'ready'; changed();
});
window.addEventListener('appinstalled', () => {
  installEvent = undefined; installed = true; state = 'installed'; changed();
});
export function isInstalled() {
  return installed || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || Boolean((navigator as any).standalone);
}
export function getInstallState(): InstallState { return isInstalled() ? 'installed' : installEvent ? 'ready' : state; }
export function subscribeInstall(listener: () => void) {
  window.addEventListener('webygram-install-ready', listener);
  return () => window.removeEventListener('webygram-install-ready', listener);
}
export function installInstructions() {
  if (!window.isSecureContext) return 'Open Webygram using its HTTPS address, then install it from your browser menu.';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'Open this page in Safari. Tap Share → Add to Home Screen → Add.';
  }
  if (/; wv\)|\bwv\b|FBAN|FBAV|Instagram|Telegram|Line\//i.test(ua)) {
    return 'Open this link in Chrome or Edge using the menu, then choose Install app. In-app browsers cannot install Webygram.';
  }
  return 'Use a normal Chrome or Edge tab, then open ⋮ → Install app / Add to Home screen. If the browser says it cannot download, reload this HTTPS page and retry. Private tabs cannot install apps.';
}
export async function installWebygram() {
  if (isInstalled()) return 'Webygram is already installed';
  if (installing) return 'The install window is already open';
  if (!installEvent) {
    if (state === 'error') { void initializePwa(); return 'App files could not load. Check your connection, reload the page, and retry installation.'; }
    if (state === 'preparing') return 'Preparing app files… Wait a moment, then tap Install again.';
    return installInstructions();
  }
  const event = installEvent; installing = true;
  try {
    // Invoke synchronously from the button gesture; do not wait for network here.
    await event.prompt();
    const result = await event.userChoice;
    return result.outcome === 'accepted' ? 'Installing Webygram…' : 'Install cancelled. You can try again from the browser menu.';
  } catch {
    return 'The browser could not install Webygram. Reload this page in a normal Chrome or Edge tab and retry from the browser menu.';
  } finally {
    if (installEvent === event) installEvent = undefined;
    installing = false; state = installed ? 'installed' : installEvent ? 'ready' : 'manual'; changed();
  }
}
export function initializePwa() {
  if (initialization) return initialization;
  if (!window.isSecureContext) { state = 'insecure'; changed(); return Promise.resolve(); }
  if (!navigator.serviceWorker) { state = 'manual'; changed(); return Promise.resolve(); }
  if (!installEvent) state = 'preparing'; changed();
  initialization = (async () => {
    try {
      const registration = await navigator.serviceWorker.register('/telegram-sw.js', { scope: '/', updateViaCache: 'none' });
      // Also refresh existing installations; the browser may otherwise defer its update check.
      if (registration.active) void registration.update().catch(() => {});
      const pending = registration.installing || registration.waiting;
      if (pending) {
        pending.addEventListener('statechange', () => {
          if (pending.state === 'activated') { if (!installEvent && !installed) state = 'manual'; changed(); }
          if (pending.state === 'redundant' && !registration.active) { state = 'error'; initialization = undefined; changed(); }
        });
      } else if (!installEvent && !installed) state = 'manual';
    } catch { state = 'error'; initialization = undefined; }
    changed();
  })();
  return initialization;
}
