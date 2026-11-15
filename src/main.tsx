import {createRoot} from 'react-dom/client';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { initializeBrowserSession } from './services/browserSession';
import './index.css';
import './flow-design.css';

const root = createRoot(document.getElementById('root')!);
root.render(<div role="status" className="h-dvh flex items-center justify-center bg-canvas text-ink">Opening your Webygram…</div>);
initializeBrowserSession().then(async () => {
  const { default: App } = await import('./App.tsx');
  root.render(<AppErrorBoundary><App /></AppErrorBoundary>);
}).catch((error: Error) => {
  root.render(<div role="alert" className="h-dvh flex flex-col gap-4 items-center justify-center bg-canvas text-ink p-6 text-center"><p>{error.message || 'Could not open your browser session. Your saved login has not been removed.'}</p><button className="px-5 py-3 rounded-full bg-primary text-on-primary" onClick={() => location.reload()}>Retry connection</button></div>);
});
