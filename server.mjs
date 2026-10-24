import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const MODEL = 'reactor/eden-live';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.wad': 'application/octet-stream', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

export async function startServer({ port = 3210, dev = false } = {}) {
  const vite = dev ? await (await import('vite')).createServer({ root, server: { middlewareMode: true, allowedHosts: ['127.0.0.1', 'localhost'] }, appType: 'spa' }) : null;
  let origin;
  const json = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    try {
      // This local server only serves files; BYOK goes straight to Reactor.
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
        return json(res, 403, { error: 'Open the demo using its printed localhost URL.' });
      }
      const url = new URL(req.url, origin);
      if (url.pathname === '/api/config' && req.method === 'GET') return json(res, 200, { byok: true, model: MODEL, inputFps: 24 });
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown endpoint.' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });

      let base, relative;
      if (dev && (url.pathname === '/doom/' || url.pathname === '/doom/index.html')) { base = root; relative = 'doom.html'; }
      else if (dev && url.pathname === '/doom/bridge.mjs') { base = path.join(root, 'src'); relative = 'doom-bridge.mjs'; }
      else if (dev && url.pathname === '/doom/deck-input.mjs') { base = path.join(root, 'src'); relative = 'deck-input.mjs'; }
      else if (dev && url.pathname.startsWith('/doom/')) { base = path.join(root, 'vendor/three-doom'); relative = decodeURIComponent(url.pathname.slice(6)); }
      else if (dev && url.pathname.startsWith('/three/')) { base = path.join(root, 'node_modules/three'); relative = decodeURIComponent(url.pathname.slice(7)); }
      else if (vite) return vite.middlewares(req, res, () => json(res, 404, { error: 'Not found.' }));
      else { base = path.join(root, 'dist'); relative = decodeURIComponent(url.pathname.slice(1)); if (!relative || relative.endsWith('/')) relative += 'index.html'; }
      const filename = path.resolve(base, relative);
      if (!filename.startsWith(base + path.sep) || relative.split(/[\\/]/).some((s) => s.startsWith('.'))) return json(res, 404, { error: 'Not found.' });
      const body = await fs.readFile(filename);
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      if (error.code === 'ENOENT' || error.code === 'EISDIR') return json(res, 404, { error: 'Not found. Run npm run build before npm start.' });
      // Never return upstream bodies or credentials in errors.
      json(res, 500, { error: 'The local server could not complete the request. Check connectivity and try again.' });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: async () => { await vite?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(path.join(root, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const port = Number(process.env.PORT || 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const app = await startServer({ port, dev: process.argv.includes('--dev') });
  console.log(`\nReactor / Doom → ${app.origin}\nBring your own key in the browser. This server never handles Reactor credentials.\n`);
  const close = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
