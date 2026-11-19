import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const exportName = process.argv[2] || 'github-upload';
if (!/^github-upload(?:-[a-z0-9-]+)?$/.test(exportName)) throw Error('Use a github-upload name with lowercase letters, numbers and hyphens.');
const destination = path.join(root, exportName);
if (fs.existsSync(destination)) throw new Error(exportName + ' already exists. Keep or rename that folder before making a new export.');
const files = [
  'src', 'public', 'licenses', 'scripts', 'tests',
  'package.json', 'package-lock.json', 'index.html', 'tsconfig.json',
  'vite.config.ts', 'gateway.ts', 'server.ts', 'README.md',
  'THIRD_PARTY_NOTICES.md', '.env.example', '.gitignore', '.vercelignore',
];
const optional = ['vercel.json', 'vercel.ts', 'vercel.mjs', 'render.yaml', 'Dockerfile', '.dockerignore', 'DEPLOYMENT.md', 'PUSH.md'];
files.push(...optional.filter(file => fs.existsSync(path.join(root, file))));
const allowed = name => !/^(node_modules|\.git|\.local|\.vercel|\.tgplus.*|github-upload.*)$/.test(name)
  && (!name.startsWith('.env') || name === '.env.example')
  && !/\.(log|zip)$/.test(name);

fs.mkdirSync(destination);
for (const file of files) fs.cpSync(path.join(root, file), path.join(destination, file), {
  recursive: true,
  filter: source => {
    if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Export refuses symlinks: ' + path.relative(root, source));
    return allowed(path.basename(source));
  },
});
const all = fs.readdirSync(destination, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
console.log(`GitHub export: ${destination} (${all.length} files). No login, vault, environment secrets or dependencies copied.`);
