process.env.VITE_DIRECT_TELEGRAM = 'true';
const { createServer } = await import('vite');
const server = await createServer();
await server.listen();
server.printUrls();
