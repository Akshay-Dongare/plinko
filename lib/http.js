import crypto from 'node:crypto';
import { kv } from './kv.js';

export const DAY = 86400;
export const SESSION_DAYS = 30;

export function send(res, status, obj, cookies = []) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(JSON.stringify(obj));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 400000) return {}; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

export function getCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function site(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = String(req.headers['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0].trim();
  return { host, rpID: host.split(':')[0], origin: `${proto}://${host}`, secure: proto === 'https' };
}

export function cookie(name, value, maxAge, secure) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export const rid = (n = 24) => crypto.randomBytes(n).toString('base64url');
export const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
export const admins = () => (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

export async function currentUser(req) {
  const sid = getCookies(req).sid;
  if (!sid || sid.length > 100) return null;
  const uid = await kv('GET', 'sess:' + sid);
  if (!uid) return null;
  const raw = await kv('GET', 'user:' + uid);
  if (!raw) return null;
  return { ...JSON.parse(raw), sid };
}

export async function startSession(res, req, user, extraCookies = []) {
  const sid = rid(32);
  const { secure } = site(req);
  await kv('SET', 'sess:' + sid, user.id, 'EX', SESSION_DAYS * DAY);
  return [cookie('sid', sid, SESSION_DAYS * DAY, secure), ...extraCookies];
}
