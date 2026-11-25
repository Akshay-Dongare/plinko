import { kv, kvReady } from '../lib/kv.js';
import { send, readBody, currentUser } from '../lib/http.js';

const MAX = 300000;

export default async function handler(req, res) {
  if (!kvReady()) return send(res, 503, { error: 'Accounts are not set up yet.' });
  try {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: 'Sign in first.' });
    const key = 'state:' + user.id;
    const touch = () => kv('SET', 'user:' + user.id, JSON.stringify({ id: user.id, email: user.email, created: user.created, lastSeen: new Date().toISOString() }));

    if (req.method === 'GET') {
      const raw = await kv('GET', key);
      await touch();
      if (!raw) return send(res, 200, { state: null, rev: 0 });
      const rec = JSON.parse(raw);
      return send(res, 200, { state: rec.state, rev: rec.rev });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const b = await readBody(req);
      if (!b.state || typeof b.state !== 'object' || Array.isArray(b.state)) return send(res, 400, { error: 'Nothing to save.' });
      const body = JSON.stringify(b.state);
      if (body.length > MAX) return send(res, 413, { error: 'Save is too large.' });
      const raw = await kv('GET', key);
      const cur = raw ? JSON.parse(raw) : { rev: 0 };
      if (Number(b.rev) !== cur.rev) return send(res, 409, { state: cur.state || null, rev: cur.rev });
      const rev = cur.rev + 1;
      await kv('SET', key, JSON.stringify({ rev, state: b.state, updated: new Date().toISOString() }));
      await touch();
      return send(res, 200, { rev });
    }

    return send(res, 405, { error: 'Use GET or PUT.' });
  } catch (e) {
    console.error('state', e);
    return send(res, 500, { error: 'Something went wrong on the server. Try again.' });
  }
}
