// Tiny static file server for local demo. No dependencies.
// Run: node tools/serve.js  -> http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8080;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.csv': 'text/csv', '.xml': 'application/xml', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);
    if (path === '/') path = '/index.html';
    const full = normalize(join(ROOT, path));
    if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const s = await stat(full).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); return res.end('not found'); }
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': TYPES[extname(full)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end(String(e.message));
  }
}).listen(PORT, () => console.log(`VIR_Tier demo: http://localhost:${PORT}`));
