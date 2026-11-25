import { kv } from './kv.js';

// Data version 2 started on 25 November 2026. At the site owner's request, every save
// from before it is replaced by an empty game. The rev goes up, so a device that still
// holds an old copy gets a 409 and adopts the empty game instead of uploading the old one.
export const DATA_V = 2;

export function upgrade(rec) {
  if (rec && rec.v === DATA_V) return { rec, changed: false };
  const muted = !!(rec && rec.state && rec.state.muted);
  return { rec: { rev: ((rec && rec.rev) || 0) + 1, state: { muted }, updated: new Date().toISOString(), v: DATA_V }, changed: true };
}

export async function readState(uid) {
  const raw = await kv('GET', 'state:' + uid);
  if (!raw) return null;
  const { rec, changed } = upgrade(JSON.parse(raw));
  if (changed) await kv('SET', 'state:' + uid, JSON.stringify(rec));
  return rec;
}

// Buy-in: the price of a good evening out, a whole amount in the account's currency.
// The same limits are in index.html (CURS).
export const STAKE = { USD: { min: 10, max: 5000 }, INR: { min: 200, max: 200000 } };

export function cleanStake(cur, amount) {
  const lim = Object.hasOwn(STAKE, cur) ? STAKE[cur] : null;
  const n = Math.round(Number(amount));
  if (!lim || !Number.isFinite(n) || n < lim.min || n > lim.max) return null;
  return { cur, buyin: n };
}

// True when the account has a cash-out or an open session. After that its currency cannot change,
// because amounts in two currencies cannot be added. Saves from before currencies are all in USD.
export async function hasHistory(uid) {
  const rec = await readState(uid);
  const st = (rec && rec.state) || {};
  return (Array.isArray(st.log) && st.log.length > 0) || Number(st.buyins) > 0;
}

export function cleanName(v) {
  return String(v || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}
