import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { BrowserProfiles, PROFILE_COOKIE } from './src/server/browserProfiles';
import { ProfileWorkers } from './src/server/profileWorkers';

dotenv.config();
const profiles = new BrowserProfiles(path.resolve(process.env.DATA_DIR || '.'));
const workers = new ProfileWorkers(
  Math.max(1, Number(process.env.MAX_BROWSER_WORKERS) || 8),
  path.resolve(import.meta.url.endsWith('.mjs') ? 'build/server.mjs' : 'server.ts'),
);
const app = express();
const server = http.createServer(app);
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

function sameOrigin(req: http.IncomingMessage) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
app.post('/api/browser/session', express.json({ limit: '16kb' }), (req, res) => {
  if (!sameOrigin(req) || !req.is('application/json')) return res.status(403).json({ error: 'Invalid browser origin.' });
  const result = profiles.open(req.headers.cookie, req.body?.marker, req.body?.legacySession);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${PROFILE_COOKIE}=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=34560000${secure ? '; Secure' : ''}`);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ marker: result.marker, migrated: result.migrated });
});
app.get('/api/health', (_req, res) => res.json({ ok: true, browserIsolation: true }));
app.use('/api', async (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Invalid browser origin.' });
  const profile = profiles.read(profiles.token(req.headers.cookie));
  if (!profile) return res.status(401).json({ error: 'Open this site to initialize your own browser session.' });
  try {
    const worker = await workers.get(profile);
    if (req.destroyed || res.destroyed) return;
    worker.requests++;
    res.once('close', () => { worker.requests--; worker.lastUsed = Date.now(); });
    const headers = { ...req.headers, host: `127.0.0.1:${worker.port}`, 'x-profile-worker-key': worker.secret };
    delete headers.cookie;
    const upstream = http.request({ hostname: '127.0.0.1', port: worker.port, path: req.originalUrl, method: req.method, headers }, response => {
      res.writeHead(response.statusCode || 502, { ...response.headers, 'cache-control': 'private, no-store' });
      response.pipe(res);
      response.on('error', () => res.destroy());
    });
    upstream.on('error', () => { if (!res.headersSent) res.status(503).json({ error: 'Your session is reconnecting. Please retry.' }); else res.destroy(); });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  } catch (error) { if (!res.headersSent) res.status(503).json({ error: (error as Error).message }); }
});

server.on('upgrade', async (req, socket, head) => {
  if (req.url !== '/ws' || !sameOrigin(req)) { socket.destroy(); return; }
  const profile = profiles.read(profiles.token(req.headers.cookie));
  if (!profile) { socket.destroy(); return; }
  try {
    const worker = await workers.get(profile);
    if (socket.destroyed) return;
    sockets.handleUpgrade(req, socket, head, downstream => {
      worker.sockets++;
      const upstream = new WebSocket(`ws://127.0.0.1:${worker.port}/ws`, { headers: { 'x-profile-worker-key': worker.secret }, maxPayload: 1024 * 1024 });
      const pending: { data: Buffer; binary: boolean }[] = [];
      let pendingBytes = 0;
      upstream.on('open', () => { for (const item of pending) upstream.send(item.data, { binary: item.binary }); pending.length = 0; });
      downstream.on('message', (data, binary) => {
        worker.lastUsed = Date.now();
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
        else if (upstream.readyState === WebSocket.CONNECTING && pendingBytes < 1024 * 1024) { const bytes = Buffer.from(data as Buffer); pendingBytes += bytes.length; pending.push({ data: bytes, binary }); }
      });
      upstream.on('message', (data, binary) => { if (downstream.readyState === WebSocket.OPEN) downstream.send(data, { binary }); });
      upstream.on('error', () => downstream.close(1011, 'Session reconnecting'));
      upstream.on('close', () => downstream.close());
      downstream.on('error', () => upstream.terminate());
      downstream.on('close', () => { worker.sockets--; worker.lastUsed = Date.now(); upstream.terminate(); });
    });
  } catch { socket.destroy(); }
});

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve('dist');
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(dist, { maxAge: 0 }));
    app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
  }
  server.once('error', error => { console.error('Preview could not listen:', error.message); workers.close(); process.exitCode = 1; });
  server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
    console.log('Webygram browser-isolated preview ready.');
    const address = server.address();
    if (address && typeof address !== 'string') process.send?.({ type: 'GATEWAY_READY', port: address.port });
  });
}
const shutdown = () => { workers.close(); server.close(); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
main().catch(error => { console.error('Preview startup failed:', error.message); workers.close(); process.exit(1); });
