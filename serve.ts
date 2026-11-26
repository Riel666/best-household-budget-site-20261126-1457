// Hearth & Ledger — tiny static server for local testing only.
// Serves the generated app/ (run `node main.ts` first) at http://localhost:8080.
//   node serve.ts [--port 8080]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'out', 'app');
const port = Number(process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? 8080);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Hearth & Ledger at http://localhost:${port}/ (serving ${root})`));
