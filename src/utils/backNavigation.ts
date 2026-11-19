export interface BackPort {
  history: { state: any; pushState(state: any, title: string): void; back(): void };
  listen(type: 'popstate' | 'keydown' | 'pointerdown', callback: (event: any) => void): () => void;
  defer(callback: () => void): void;
  now?(): number;
}
const marker = '__webygramBack';
/** One same-document history entry protects the current in-app surface. */
export function createBackNavigation(port: BackPort) {
  const layers: Array<{ token: symbol; close: () => void }> = [];
  let fallback: (() => void) | undefined;
  let guarded = Boolean(port.history.state?.[marker]);
  let releasing = false, disposed = false;
  let rootPrompt: ((remaining?: number) => void) | undefined;
  let exitTaps = 0, firstExitAt = 0, lastExitAt = 0, rapidExitTaps = 0;
  const resetExit = () => { exitTaps = 0; firstExitAt = 0; lastExitAt = 0; };
  const sync = () => {
    if (disposed || releasing) return;
    const needed = layers.length > 0 || Boolean(fallback) || Boolean(rootPrompt);
    if (needed && !guarded) {
      port.history.pushState({ ...port.history.state, [marker]: true }, '');
      guarded = true;
    } else if (!needed && guarded) {
      releasing = true;
      port.history.back();
    }
  };
  const dismiss = () => (layers.at(-1)?.close || fallback)?.();
  const unpop = port.listen('popstate', event => {
    if (event.state?.[marker]) { guarded = true; sync(); return; }
    const wasGuarded = guarded;
    guarded = false;
    if (releasing) { releasing = false; sync(); return; }
    if (wasGuarded) {
      // Rearm before React commits, so another Back never sees an unguarded root.
      if (layers.length || fallback) { resetExit(); if (rootPrompt) sync(); dismiss(); }
      else if (rootPrompt) {
        const now = port.now?.() ?? Date.now();
        if (!exitTaps || now - lastExitAt > 300 || now - firstExitAt > 900) { resetExit(); firstExitAt = now; }
        lastExitAt = now; exitTaps++;
        if (rapidExitTaps && exitTaps >= rapidExitTaps) {
          disposed = true; unkey(); unpop(); unpointer(); port.history.back(); return;
        }
        sync();
        rootPrompt(rapidExitTaps ? rapidExitTaps - exitTaps : undefined);
      }
      port.defer(sync);
    }
  });
  const unpointer = port.listen('pointerdown', resetExit);
  const unkey = port.listen('keydown', event => {
    const browserBack = event.key === 'BrowserBack' || (event.altKey && event.key === 'ArrowLeft');
    if (event.key !== 'Escape' && !browserBack) resetExit();
    if (event.key !== 'Escape' || event.defaultPrevented || (!layers.length && !fallback)) return;
    event.preventDefault(); event.stopImmediatePropagation(); dismiss();
  });
  return {
    // Modern browser Back can skip synthetic history entries or traverse several at once.
    // Its cancellable navigation event protects that path without blocking normal links.
    handleExternalBack() {
      if (disposed || releasing || (!layers.length && !fallback && !rootPrompt)) return false;
      if (layers.length || fallback) { resetExit(); dismiss(); return true; }
      const now = port.now?.() ?? Date.now();
      if (!exitTaps || now - lastExitAt > 300 || now - firstExitAt > 900) { resetExit(); firstExitAt = now; }
      lastExitAt = now; exitTaps++;
      if (rapidExitTaps && exitTaps >= rapidExitTaps) { disposed = true; unkey(); unpop(); unpointer(); return false; }
      rootPrompt?.(rapidExitTaps ? rapidExitTaps - exitTaps : undefined);
      return true;
    },
    add(close: () => void) {
      resetExit(); const token = Symbol('back-layer'); layers.push({ token, close }); sync();
      return () => { const index = layers.findIndex(layer => layer.token === token); if (index >= 0) layers.splice(index, 1); sync(); };
    },
    setExitProtection(prompt?: (remaining?: number) => void, options?: { rapidExitTaps?: number }) {
      rootPrompt = prompt; rapidExitTaps = options?.rapidExitTaps || 0; resetExit(); sync();
    },
    setFallback(close?: () => void) { if (Boolean(close) !== Boolean(fallback)) resetExit(); fallback = close; sync(); },
    dispose() { disposed = true; unpop(); unkey(); unpointer(); layers.length = 0; fallback = undefined; },
  };
}
