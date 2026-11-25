import crypto from 'node:crypto';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { kv, pipe, kvReady } from '../lib/kv.js';
import { mailReady, sendCode } from '../lib/mail.js';
import {
  send, readBody, getCookies, site, cookie, rid, sha, clientIp, admins,
  currentUser, startSession
} from '../lib/http.js';
import { cleanName, cleanStake, hasHistory } from '../lib/state.js';

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const CODE_TTL = 600;

async function passkeyCount(uid) { return (await kv('SCARD', 'creds:' + uid)) || 0; }

async function publicUser(u) {
  return { name: u.name || '', email: u.email, cur: u.cur || '', buyin: u.buyin || 0, admin: admins().includes(u.email), passkeys: await passkeyCount(u.id) };
}

async function limit(key, max, ttl) {
  const n = await kv('INCR', key);
  if (n === 1) await kv('EXPIRE', key, ttl);
  return n <= max;
}

// Returns [user record, isNew]. A name and a buy-in are stored for a new account,
// or added to an account that has none.
async function findOrCreateUser(email, name, stake) {
  const existing = await kv('GET', 'email:' + email);
  if (existing) {
    const raw = await kv('GET', 'user:' + existing);
    if (raw) {
      const u = JSON.parse(raw);
      let changed = false;
      if (name && !u.name) { u.name = name; changed = true; }
      if (stake && !u.buyin && (stake.cur === (u.cur || 'USD') || !(await hasHistory(u.id)))) { Object.assign(u, stake); changed = true; }
      if (changed) await kv('SET', 'user:' + u.id, JSON.stringify(u));
      return [u, false];
    }
  }
  const now = new Date().toISOString();
  const user = { id: rid(16), email, name: name || '', ...(stake || {}), created: now, lastSeen: now };
  const ok = await kv('SET', 'email:' + email, user.id, 'NX');
  if (ok !== 'OK') return findOrCreateUser(email, name, stake);
  await pipe([['SET', 'user:' + user.id, JSON.stringify(user)], ['SADD', 'users', user.id]]);
  return [user, true];
}

export default async function handler(req, res) {
  const op = String((req.query && req.query.op) || new URL(req.url, 'http://x').searchParams.get('op') || '');
  if (!kvReady()) return send(res, op === 'me' ? 200 : 503, { user: null, ready: { db: false, email: mailReady() }, error: 'Accounts are not available at this time.' });

  try {
    if (op === 'me') {
      const u = await currentUser(req);
      return send(res, 200, { user: u ? await publicUser(u) : null, ready: { db: true, email: mailReady() } });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
    const b = await readBody(req);
    const s = site(req);

    if (op === 'email-start') {
      const email = String(b.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'The email address is not correct.' });
      if (!mailReady()) return send(res, 503, { error: 'Email sign-in is not available at this time.' });
      if (!(await limit('rl:e:' + sha(email), 5, 3600)) || !(await limit('rl:ip:' + sha(clientIp(req)), 30, 3600)))
        return send(res, 429, { error: 'You asked for too many codes. Wait 1 hour. Then ask for a new code.' });
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await kv('SET', 'code:' + email, JSON.stringify({ h: sha(email + ':' + code), tries: 0 }), 'EX', CODE_TTL);
      await sendCode(email, code);
      return send(res, 200, { ok: true });
    }

    if (op === 'email-verify') {
      const email = String(b.email || '').trim().toLowerCase();
      const code = String(b.code || '').replace(/\D/g, '');
      const raw = EMAIL_RE.test(email) ? await kv('GET', 'code:' + email) : null;
      if (!raw) return send(res, 400, { error: 'The code is not valid now. Ask for a new code.' });
      const rec = JSON.parse(raw);
      if (rec.tries >= 5) { await kv('DEL', 'code:' + email); return send(res, 429, { error: 'You typed too many wrong codes. Ask for a new code.' }); }
      const good = code.length === 6 && crypto.timingSafeEqual(Buffer.from(rec.h), Buffer.from(sha(email + ':' + code)));
      if (!good) {
        rec.tries++;
        await kv('SET', 'code:' + email, JSON.stringify(rec), 'KEEPTTL');
        return send(res, 400, { error: `The code is not correct. You can type the code ${5 - rec.tries} more time${5 - rec.tries === 1 ? '' : 's'}.` });
      }
      await kv('DEL', 'code:' + email);
      const [user, isNew] = await findOrCreateUser(email, cleanName(b.name), cleanStake(b.cur, b.buyin));
      const cookies = await startSession(res, req, user);
      return send(res, 200, { user: await publicUser(user), created: isNew }, cookies);
    }

    if (op === 'passkey-login-options') {
      const options = await generateAuthenticationOptions({ rpID: s.rpID, userVerification: 'preferred' });
      const cid = rid(16);
      await kv('SET', 'chal:auth:' + cid, options.challenge, 'EX', 300);
      return send(res, 200, { options }, [cookie('pkc', cid, 300, s.secure)]);
    }

    if (op === 'passkey-login-verify') {
      const cid = getCookies(req).pkc;
      const challenge = cid ? await kv('GET', 'chal:auth:' + cid) : null;
      if (!challenge) return send(res, 400, { error: 'The time limit for sign-in ended. Sign in again.' });
      await kv('DEL', 'chal:auth:' + cid);
      const response = b.response || {};
      const rawCred = typeof response.id === 'string' && response.id.length < 600 ? await kv('GET', 'cred:' + response.id) : null;
      if (!rawCred) return send(res, 400, { error: 'This passkey is not linked to an account here. Push Sign up and use your email. Then add a passkey.' });
      const cred = JSON.parse(rawCred);
      const v = await verifyAuthenticationResponse({
        response, expectedChallenge: challenge, expectedOrigin: s.origin, expectedRPID: s.rpID,
        credential: { id: response.id, publicKey: Buffer.from(cred.pk, 'base64url'), counter: cred.counter, transports: cred.transports }
      });
      if (!v.verified) return send(res, 400, { error: 'We could not verify the passkey. Use it again.' });
      cred.counter = v.authenticationInfo.newCounter;
      await kv('SET', 'cred:' + response.id, JSON.stringify(cred));
      const raw = await kv('GET', 'user:' + cred.uid);
      if (!raw) return send(res, 400, { error: 'This account does not exist now.' });
      const user = JSON.parse(raw);
      const cookies = await startSession(res, req, user, [cookie('pkc', '', 0, s.secure)]);
      return send(res, 200, { user: await publicUser(user) }, cookies);
    }

    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: 'Sign in first.' });

    if (op === 'passkey-reg-options') {
      const ids = (await kv('SMEMBERS', 'creds:' + user.id)) || [];
      const options = await generateRegistrationOptions({
        rpName: 'Plinko', rpID: s.rpID, userName: user.email, userDisplayName: user.email,
        userID: new TextEncoder().encode(user.id), attestationType: 'none',
        excludeCredentials: ids.map(id => ({ id })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
      });
      await kv('SET', 'chal:reg:' + user.id, options.challenge, 'EX', 300);
      return send(res, 200, { options });
    }

    if (op === 'passkey-reg-verify') {
      const challenge = await kv('GET', 'chal:reg:' + user.id);
      if (!challenge) return send(res, 400, { error: 'The time limit ended. Add the passkey again.' });
      await kv('DEL', 'chal:reg:' + user.id);
      const v = await verifyRegistrationResponse({
        response: b.response || {}, expectedChallenge: challenge, expectedOrigin: s.origin, expectedRPID: s.rpID
      });
      if (!v.verified) return send(res, 400, { error: 'We could not verify the passkey. Use it again.' });
      const c = v.registrationInfo.credential;
      await pipe([
        ['SET', 'cred:' + c.id, JSON.stringify({ uid: user.id, pk: Buffer.from(c.publicKey).toString('base64url'), counter: c.counter, transports: c.transports || [], created: new Date().toISOString() })],
        ['SADD', 'creds:' + user.id, c.id]
      ]);
      return send(res, 200, { user: await publicUser(user) });
    }

    if (op === 'set-name') {
      const name = cleanName(b.name);
      if (!name) return send(res, 400, { error: 'Type a name with 1 to 30 characters.' });
      const { sid, ...rec } = user;
      const next = { ...rec, name };
      await kv('SET', 'user:' + user.id, JSON.stringify(next));
      return send(res, 200, { user: await publicUser(next) });
    }

    if (op === 'set-stake') {
      const stake = cleanStake(b.cur, b.buyin);
      if (!stake) return send(res, 400, { error: 'This amount is not in the permitted range.' });
      if (stake.cur !== (user.cur || 'USD') && await hasHistory(user.id)) {
        return send(res, 400, { error: 'You cannot change the currency after your first session.' });
      }
      const { sid, ...rec } = user;
      const next = { ...rec, ...stake };
      await kv('SET', 'user:' + user.id, JSON.stringify(next));
      return send(res, 200, { user: await publicUser(next) });
    }

    if (op === 'logout') {
      await kv('DEL', 'sess:' + user.sid);
      return send(res, 200, { ok: true }, [cookie('sid', '', 0, s.secure)]);
    }

    if (op === 'delete-account') {
      const ids = (await kv('SMEMBERS', 'creds:' + user.id)) || [];
      await pipe([
        ...ids.map(id => ['DEL', 'cred:' + id]),
        ['DEL', 'creds:' + user.id], ['DEL', 'state:' + user.id], ['DEL', 'user:' + user.id],
        ['DEL', 'email:' + user.email], ['SREM', 'users', user.id], ['DEL', 'sess:' + user.sid]
      ]);
      return send(res, 200, { ok: true }, [cookie('sid', '', 0, s.secure)]);
    }

    return send(res, 404, { error: 'Unknown action.' });
  } catch (e) {
    console.error('auth', op, e);
    return send(res, 500, { error: 'The server had an error. Do the step again.' });
  }
}
