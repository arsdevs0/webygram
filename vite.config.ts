import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { browserEnginePlugin } from './scripts/browser-engine-plugin.mjs';

export default defineConfig(() => {
  return {
    plugins: [browserEnginePlugin(import.meta.dirname), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        'node:fs': path.resolve(import.meta.dirname, 'src/browser/storage.ts'),
        'node:path': 'path-browserify',
        fs: path.resolve(import.meta.dirname, 'src/browser/storage.ts'),
        path: 'path-browserify',
        os: path.resolve(import.meta.dirname, 'src/browser/platform.ts'),
        crypto: path.resolve(import.meta.dirname, 'node_modules/telegram/crypto/crypto.js'),
        util: path.resolve(import.meta.dirname, 'src/browser/inspect.ts'),
        net: path.resolve(import.meta.dirname, 'src/browser/empty.ts'),
        socks: path.resolve(import.meta.dirname, 'src/browser/empty.ts'),
        'node-localstorage': path.resolve(import.meta.dirname, 'src/browser/localStorage.ts'),
      },
    },
    server: {
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.tgplus*', '**/.tgplus*/**', '**/.local/**', '**/build/**', '**/server.ts', '**/gateway.ts'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
