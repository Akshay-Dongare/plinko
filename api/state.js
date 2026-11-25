import { kv, kvReady } from '../lib/kv.js';
import { send, readBody, currentUser } from '../lib/http.js';
import { readState, DATA_V } from '../lib/state.js';

const MAX = 300000;

export default async function handler(req, res) {
  if (!kvReady()) return send(res, 503, { error: 'Accounts are not available at this time.' });
  try {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: 'Sign in first.' });
    const key = 'state:' + user.id;
    const { sid, ...rec } = user;
    const touch = () => kv('SET', 'user:' + user.id, JSON.stringify({ ...rec, lastSeen: new Date().toISOString() }));

    if (req.method === 'GET') {
      const cur = await readState(user.id);
      await touch();
      if (!cur) return send(res, 200, { state: null, rev: 0 });
      return send(res, 200, { state: cur.state, rev: cur.rev });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const b = await readBody(req);
      if (!b.state || typeof b.state !== 'object' || Array.isArray(b.state)) return send(res, 400, { error: 'Nothing to save.' });
      const body = JSON.stringify(b.state);
      if (body.length > MAX) return send(res, 413, { error: 'The save file is too large.' });
      const cur = (await readState(user.id)) || { rev: 0 };
      if (Number(b.rev) !== cur.rev) return send(res, 409, { state: cur.state || null, rev: cur.rev });
      const rev = cur.rev + 1;
      await kv('SET', key, JSON.stringify({ rev, state: b.state, updated: new Date().toISOString(), v: DATA_V }));
      await touch();
      return send(res, 200, { rev });
    }

    return send(res, 405, { error: 'Use GET or PUT.' });
  } catch (e) {
    console.error('state', e);
    return send(res, 500, { error: 'The server had an error. Do the step again.' });
  }
}
