// Static server for a game folder. Usage: node serve.mjs [root=.preview] [port=4321] [--config tools/serve.json]
// PUBLIC=1 serves only the paths the config allows ("public" globs, "downloads" map); without PUBLIC it serves everything
// under root on 127.0.0.1 (HOST overrides). GET/HEAD only. A bad request path gets 400, never a crash.
import http from 'node:http';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// new URL('//', base) and decodeURIComponent('%') both throw; an uncaught throw takes the whole server down
export function reqPath(raw) {
  try { return decodeURIComponent(new URL('http://x' + (String(raw).startsWith('/') ? raw : '/' + raw)).pathname); } catch { return null; }
}
// "*" = one path segment, "**" = any depth; matched against the path without its leading slash
export function globRe(g) {
  const s = g.replace(/^\//, '').split(/(\*\*|\*)/).map(p => p === '**' ? '.+' : p === '*' ? '[^/]+' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('');
  return new RegExp('^' + s + '$');
}
export function allowed(rel, res) {
  const r = rel.replace(/^\//, '');
  return !r.split('/').some(seg => seg === '..' || seg.startsWith('.')) && res.some(re => re.test(r));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--config');
  const ROOT = path.resolve(pos[0] || '.preview'), PORT = +(pos[1] || process.env.PORT || 4321);
  const HOST = process.env.HOST || '127.0.0.1', PUBLIC = process.env.PUBLIC === '1';
  const ci = process.argv.indexOf('--config'), cfgPath = path.resolve(ci > 0 ? process.argv[ci + 1] : 'tools/serve.json');
  let cfg = { public: [], downloads: {} };
  try { cfg = { ...cfg, ...JSON.parse(readFileSync(cfgPath, 'utf8')) }; }
  catch (e) { if (PUBLIC) { console.error(`PUBLIC=1 needs a config (${cfgPath}): ${e.message}`); process.exit(1); } }
  const RES = cfg.public.map(globRe);
  const DL = Object.fromEntries(Object.entries(cfg.downloads || {}).map(([k, v]) => [k, path.resolve(path.dirname(cfgPath), v)]));
  const send = (res, code, body, type = 'text/plain; charset=utf-8', head = {}) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...head });
    res.end(body);
  };
  http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method');
    let rel = reqPath(req.url);
    if (rel == null) return send(res, 400, 'bad request');
    if (rel === '/') rel = '/index.html';
    try {
      if (DL[rel]) return send(res, 200, await fs.readFile(DL[rel]), TYPES[path.extname(rel)] || 'application/octet-stream', { 'content-disposition': `attachment; filename="${path.basename(rel)}"` });
      if (PUBLIC && !allowed(rel, RES)) return send(res, 404, 'not found');
      const file = path.resolve(ROOT, '.' + rel);
      if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'forbidden');
      send(res, 200, await fs.readFile(file), TYPES[path.extname(file)] || 'application/octet-stream');
    } catch { send(res, 404, 'not found'); }
  }).listen(PORT, HOST, () => console.log(`serving ${ROOT} at http://${HOST}:${PORT}${PUBLIC ? ` (public: ${cfgPath})` : ''}`));
}
