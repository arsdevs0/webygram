import { build } from 'esbuild';

await build({
  entryPoints: ['gateway.ts', 'server.ts'],
  outdir: 'build',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
});
