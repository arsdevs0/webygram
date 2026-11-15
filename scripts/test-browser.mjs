import { build } from 'vite';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

process.env.VITE_DIRECT_TELEGRAM = 'true';
const root = path.resolve(import.meta.dirname, '..');
await build({ root, logLevel: 'error', publicDir: false, build: {
  outDir: '.local/browser-test-build', emptyOutDir: true, minify: false,
  lib: { entry: path.join(root, 'tests/browserEngine.entry.ts'), formats: ['es'], fileName: () => 'engine.mjs' },
} });
const result = spawnSync(process.execPath, ['--test', 'tests/browserEngine.integration.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, BROWSER_ENGINE_URL: pathToFileURL(path.join(root, '.local/browser-test-build/engine.mjs')).href },
});
process.exitCode = result.status ?? 1;
