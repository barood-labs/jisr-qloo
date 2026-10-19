// Zero-dependency HTTP server: static UI + /api/plan (NDJSON stream of agent steps, then the plan).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize as np } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from './agent.js';
import { isMock } from './qloo.js';

const PUB = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const hits = new Map(); // tiny per-IP rate limit to protect the Qloo quota

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/health') return json(res, 200, { ok: true, mock: isMock(), llm: !!process.env.LLM_BASE_URL });
      if (url.pathname === '/api/plan' && req.method === 'POST') {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
        const now = Date.now(); const h = (hits.get(ip) || []).filter((t) => now - t < 60000);
        if (h.length >= 10) return json(res, 429, { error: 'Too many requests, try again in a minute.' });
        hits.set(ip, [...h, now]);
        const body = await readBody(req);
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
        const send = (o) => res.write(JSON.stringify(o) + '\n');
        try {
          const out = await runAgent(JSON.parse(body || '{}'), { onStep: (s) => send({ step: s }) });
          send({ final: { plan: out.plan, error: out.error, brain: out.brain || 'planner', mock: isMock() } });
        } catch (e) { send({ error: e.message }); }
        return res.end();
      }
      let p = np(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
      const file = join(PUB, p);
      if (!file.startsWith(PUB)) return json(res, 403, { error: 'forbidden' });
      const data = await readFile(file).catch(() => null);
      if (!data) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) { json(res, 500, { error: e.message }); }
  });
}

function json(res, code, o) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); }
function readBody(req) {
  return new Promise((ok, bad) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 20000) { bad(new Error('body too large')); req.destroy(); } }); req.on('end', () => ok(b)); req.on('error', bad); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8787;
  createServer().listen(port, () => console.log(`Jisr on http://localhost:${port} (mock=${isMock()})`));
}
