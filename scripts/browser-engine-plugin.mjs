import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';

// Share the Telegram RPC implementation between the optional Node host and browser.
// Browser builds replace the host boundary, not individual feature handlers.
export function browserEnginePlugin(root) {
  return {
    name: 'webygram-direct-telegram',
    resolveId(id) { if (id === 'virtual:telegram-engine') return '\0telegram-engine'; },
    async load(id) {
      if (id !== '\0telegram-engine') return;
      let source = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
      const replace = (from, to) => { if (!source.includes(from)) throw new Error('Browser engine host boundary changed: ' + from); source = source.replace(from, to); };
      replace("import express from 'express';", "import express from '/src/browser/router';");
      replace("import http from 'http';", '');
      replace("import fs from 'fs';", "import fs from '/src/browser/storage';");
      replace("import os from 'os';", "import os from '/src/browser/platform';");
      replace("import crypto from 'crypto';", "import crypto from '/src/browser/crypto';");
      replace("import { execFile } from 'child_process';", "const execFile = (...args: any[]) => args[args.length - 1](new Error('Native audio conversion is unavailable in the browser.')); ");
      replace("import { WebSocketServer, WebSocket } from 'ws';", "import { LocalSocket as WebSocket, engineSocket } from '/src/browser/events';");
      replace("import dotenv from 'dotenv';", "const process = { env: { DATA_DIR: '/browser', TG_PROFILE_WORKER: '1', TG_PROFILE_KEY: 'browser', TELEGRAM_API_ID: import.meta.env.VITE_TELEGRAM_API_ID || '', TELEGRAM_API_HASH: import.meta.env.VITE_TELEGRAM_API_HASH || '', TELEGRAM_SESSION: '', PORT: '0' }, pid: 1, uptime: () => performance.now() / 1000 }; ");
      replace('dotenv.config();', '');
      replace("import { atomicDownload } from './src/utils/atomicDownload';", "import { atomicDownload } from '/src/browser/storage';");
      // All login and restored-session clients use Telegram's secure browser transport.
      source = source.replaceAll('connectionRetries:', 'useWSS: true, connectionRetries:');
      // Buffer-backed CustomFiles need no filesystem path, including uploads over 20 MB.
      replace("import { CustomFile } from 'telegram/client/uploads.js';", "import { BrowserFile as CustomFile } from '/src/browser/file';");
      const voiceStart = source.indexOf('async function convertBufferToTelegramVoice(');
      const voiceEnd = source.indexOf('\nfunction detectMediaInfo(', voiceStart);
      if (voiceStart < 0 || voiceEnd < 0) throw new Error('Missing voice converter boundary');
      source = source.slice(0, voiceStart) + "import { convertBrowserVoice as convertBufferToTelegramVoice } from '/src/browser/voice';\n" + source.slice(voiceEnd);
      replace('async function main() {', 'export async function startEngine() {');
      const websocketStart = source.indexOf('  const server = http.createServer(app);');
      const websocketEnd = source.indexOf('  // Transparently auto-reconnect', websocketStart);
      if (websocketStart < 0 || websocketEnd < 0) throw new Error('Missing host WebSocket boundary');
      source = source.slice(0, websocketStart) + '  wsClients.add(engineSocket as any);\n\n' + source.slice(websocketEnd);
      const hosting = source.indexOf('  // --- Vite / Static Frontend Serving ---');
      if (hosting < 0) throw new Error('Missing server host boundary');
      source = source.slice(0, hosting) + `
        void initClientFromSavedSession();
        setInterval(() => { if (loadSessionFile() && (!client || !client.connected)) void ensureConnectedClient().catch(() => {}); }, 25000);
        return app;
      }`;
      source = source.replaceAll("from './src/", "from '/src/");
      return (await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' })).code;
    },
  };
}
