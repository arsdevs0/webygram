process.env.VITE_DIRECT_TELEGRAM = 'true';
const { build } = await import('vite');
await build();
