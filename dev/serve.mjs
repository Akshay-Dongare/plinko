// Local dev server: the full app with an in-memory database and fake email. No secrets needed.
//
//   npm ci
//   node dev/serve.mjs        then open http://localhost:3000
//
// Sign-in codes print in this terminal (also at /__dev/codes as JSON). Any email works.
// akshay@akshaydongare.com is the admin unless ADMIN_EMAILS is set. Data is lost when the server stops.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const KV = 'http://kv.dev.invalid', MAIL = 'http://mail.dev.invalid/emails';
Object.assign(process.env, {
  KV_REST_API_URL: KV, KV_REST_API_TOKEN: 'dev', RESEND_API_KEY: 'dev', RESEND_API_URL: MAIL,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'akshay@akshaydongare.com'
});

// In-memory Redis with only the commands that lib/kv.js sends.
const db = new Map(), exp = new Map();
const alive = k => { if (exp.has(k) && exp.get(k) < Date.now()) { db.delete(k); exp.delete(k); } return db.has(k); };
const set = k => new Set(alive(k) ? JSON.parse(db.get(k)) : []);
function run(c) {
  const [cmd, ...a] = c.map(String);
  switch (cmd.toUpperCase()) {
    case 'GET': return alive(a[0]) ? db.get(a[0]) : null;
    case 'SET': {
      const [k, v, ...o] = a, O = o.map(x => x.toUpperCase());
      if (O.includes('NX') && alive(k)) return null;
      db.set(k, v);
      const i = O.indexOf('EX');
      if (i >= 0) exp.set(k, Date.now() + Number(o[i + 1]) * 1000); else if (!O.includes('KEEPTTL')) exp.delete(k);
      return 'OK';
    }
    case 'DEL': { let n = 0; for (const k of a) if (alive(k)) { db.delete(k); exp.delete(k); n++; } return n; }
    case 'INCR': { const v = Number(alive(a[0]) ? db.get(a[0]) : 0) + 1; db.set(a[0], String(v)); return v; }
    case 'EXPIRE': { if (!alive(a[0])) return 0; exp.set(a[0], Date.now() + Number(a[1]) * 1000); return 1; }
    case 'SADD': { const s = set(a[0]); let n = 0; for (const m of a.slice(1)) if (!s.has(m)) { s.add(m); n++; } db.set(a[0], JSON.stringify([...s])); return n; }
    case 'SREM': { const s = set(a[0]); let n = 0; for (const m of a.slice(1)) if (s.delete(m)) n++; db.set(a[0], JSON.stringify([...s])); return n; }
    case 'SMEMBERS': return [...set(a[0])];
    case 'SCARD': return set(a[0]).size;
    default: throw new Error('dev database: unsupported command ' + cmd);
  }
}

// lib/kv.js and lib/mail.js call fetch. Answer their two hosts here; every other request goes to the network.
const codes = {};
const realFetch = globalThis.fetch;
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith(KV)) {
    const body = JSON.parse(init.body);
    if (u.endsWith('/pipeline')) return json(body.map(c => { try { return { result: run(c) }; } catch (e) { return { error: e.message }; } }));
    try { return json({ result: run(body) }); } catch (e) { return json({ error: e.message }, 400); }
  }
  if (u.startsWith(MAIL)) {
    const m = JSON.parse(init.body), code = (m.text.match(/\d{6}/) || [])[0];
    codes[m.to[0]] = code;
    console.log(`  Sign-in code for ${m.to[0]}: ${code}`);
    return json({ id: 'dev' });
  }
  return realFetch(url, init);
};

// The API files read the environment when they load, so import them after it is set.
const routes = {};
for (const n of ['auth', 'state', 'admin']) routes['/api/' + n] = (await import(path.join(root, 'api', n + '.js'))).default;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__dev/codes') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(codes)); }
  if (routes[u.pathname]) { req.query = Object.fromEntries(u.searchParams); return routes[u.pathname](req, res); }
  let f = decodeURIComponent(u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
  if (!path.extname(f)) f += '.html';                                   // same as "cleanUrls" in vercel.json
  const fp = path.join(root, f), rel = path.relative(root, fp);
  if (rel.startsWith('..') || rel.split(path.sep).some(p => p.startsWith('.') || p === 'node_modules') || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    res.statusCode = 404; return res.end('Not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(fp)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(fs.readFileSync(fp));
}).listen(PORT, () => {
  console.log(`Plinko dev server: http://localhost:${PORT}  (admin page: /admin)`);
  console.log('In-memory database, fake email. Sign-in codes print below.\n');
});
