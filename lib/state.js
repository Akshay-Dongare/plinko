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

export function cleanName(v) {
  return String(v || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}
