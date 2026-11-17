
export interface BackPort {
  history: { state: any; pushState(state: any, title: string): void; back(): void };
  listen(type: 'popstate' | 'keydown', callback: (event: any) => void): () => void;
  defer(callback: () => void): void;
}
const marker = '__webygramBack';
/** One same-document history entry protects the current in-app surface. */
export function createBackNavigation(port: BackPort) {
  const layers: Array<{ token: symbol; close: () => void }> = [];
  let fallback: (() => void) | undefined;
  let guarded = Boolean(port.history.state?.[marker]);
  let releasing = false;
  let disposed = false;
  const sync = () => {
    if (disposed || releasing) return;
    const needed = layers.length > 0 || Boolean(fallback);
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
    if (wasGuarded) { dismiss(); port.defer(sync); }
  });
  const unkey = port.listen('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || (!layers.length && !fallback)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dismiss();
  });
  return {
    add(close: () => void) {
      const token = Symbol('back-layer'); layers.push({ token, close }); sync();
      return () => { const index = layers.findIndex(layer => layer.token === token); if (index >= 0) layers.splice(index, 1); sync(); };
    },
    setFallback(close?: () => void) { fallback = close; sync(); },
    dispose() { disposed = true; unpop(); unkey(); layers.length = 0; fallback = undefined; },
  };
}
