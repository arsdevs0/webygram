import React from 'react';

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Webygram render failed', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="h-dvh grid place-items-center bg-surface text-white p-6">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-semibold">Let’s get you back to your chats</h1>
        <p className="text-sm text-muted">A part of the app could not load. Reload to reconnect.</p>
        <button className="rounded-full bg-primary px-6 py-3 font-medium" onClick={() => window.location.reload()}>Reload Webygram</button>
      </div>
    </main>;
  }
}
