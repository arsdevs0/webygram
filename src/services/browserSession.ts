const MARKER = 'tgplus_browser_profile_v1';
const MANAGED = 'tgplus_browser_managed_v1';
const OLD_AUTH = 'tgplus_saved_auth_v1';

/** Run before importing App: service singletons start requests during construction. */
export async function initializeBrowserSession() {
  if (import.meta.env.VITE_DIRECT_TELEGRAM === 'true') {
    const { initializeDirectTelegram } = await import('../browser/runtime');
    return initializeDirectTelegram();
  }
  // A previous direct build can still control this origin until the next navigation.
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'TELEGRAM_MEDIA_REQUEST') { event.ports[0]?.postMessage({ network: true }); event.ports[0]?.close(); }
  });
  for (const registration of await navigator.serviceWorker?.getRegistrations() || []) {
    if (registration.active?.scriptURL === new URL('/telegram-sw.js', location.origin).href) await registration.unregister();
  }
  // Two tabs opened together must finish the cookie/marker handshake in order.
  if (navigator.locks) return navigator.locks.request('tgplus-browser-session', openBrowserSession);
  return openBrowserSession();
}

async function openBrowserSession() {
  const marker = localStorage.getItem(MARKER);
  const wasManaged = localStorage.getItem(MANAGED) === '1';
  let legacySession: string | undefined;
  if (!wasManaged) {
    try { legacySession = JSON.parse(localStorage.getItem(OLD_AUTH) || 'null')?.sessionString; } catch { /* No valid legacy login. */ }
  }
  const response = await fetch('/api/browser/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ marker, legacySession }), credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Could not start your private browser session. Please retry.');
  const data = await response.json();
  localStorage.setItem(MARKER, data.marker);
  localStorage.setItem(MANAGED, '1');
  // Once migrated, cookies + the browser marker own persistence. Clearing either resets login.
  if (wasManaged || data.migrated) localStorage.removeItem(OLD_AUTH);
}
