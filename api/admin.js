import { kv, pipe, kvReady } from '../lib/kv.js';
import { send, currentUser, admins } from '../lib/http.js';

const n = v => (Number.isFinite(+v) ? +v : 0);
const t = v => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null);

export default async function handler(req, res) {
  if (!kvReady()) return send(res, 503, { error: 'Accounts are not set up yet.' });
  try {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: 'Sign in first.' });
    if (!admins().includes(user.email)) return send(res, 403, { error: 'Only the site owner can see this page.' });

    const ids = (await kv('SMEMBERS', 'users')) || [];
    const rows = await pipe(ids.flatMap(id => [['GET', 'user:' + id], ['GET', 'state:' + id], ['SCARD', 'creds:' + id]]));
    const players = [];
    for (let i = 0; i < ids.length; i++) {
      const u = rows[i * 3] ? JSON.parse(rows[i * 3]) : null;
      if (!u) continue;
      const st = rows[i * 3 + 1] ? JSON.parse(rows[i * 3 + 1]).state || {} : {};
      const log = (Array.isArray(st.log) ? st.log : []).slice(-500).map(x => ({
        end: t(x && x.end), in: n(x && x.in), out: n(x && x.out), net: n(x && x.net), wag: n(x && x.wag),
        balls: n(x && x.balls), best: n(x && x.best), exp: x && x.exp != null ? n(x.exp) : null, legacy: !!(x && x.legacy), n: n(x && x.n) || 1
      }));
      players.push({
        email: String(u.email || ''), created: t(u.created), lastSeen: t(u.lastSeen), passkeys: n(rows[i * 3 + 2]),
        balance: n(st.balance), boughtIn: n(st.boughtIn), wagered: n(st.wagered), dropped: n(st.dropped), log
      });
    }
    players.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
    return send(res, 200, { players });
  } catch (e) {
    console.error('admin', e);
    return send(res, 500, { error: 'Something went wrong on the server. Try again.' });
  }
}
