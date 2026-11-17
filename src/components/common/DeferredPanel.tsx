import React, { lazy, Suspense, type ComponentType } from 'react';
import { useEscapeDismiss } from './useEscapeDismiss';

/** Keep optional features out of startup; closed panels don't subscribe or fetch. */
export function deferredPanel<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, managesDismissal = false) {
  const Panel = lazy(load);
  return function DeferredPanel(props: React.ComponentProps<T>) {
    const modal = 'isOpen' in props;
    const open = modal && Boolean((props as { isOpen: boolean }).isOpen);
    useEscapeDismiss(open && !managesDismissal, (props as { onClose?: () => void }).onClose);
    if (modal && !(props as { isOpen: boolean }).isOpen) return null;
    return (
      <Suspense fallback={
        <div role="status" className={modal
          ? 'fixed inset-0 z-50 grid place-items-center bg-black/40'
          : 'flex flex-1 items-center justify-center p-8 text-muted'}>
          <div className="rounded-2xl bg-surface dark:bg-surface px-6 py-4 text-sm shadow-sm flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Opening…
          </div>
        </div>
      }>
        <Panel {...props} />
      </Suspense>
    );
  };
}
