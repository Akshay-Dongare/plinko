// Upstash Redis over its REST API (no client library needed).
// Reads KV_REST_API_URL / KV_REST_API_TOKEN (Vercel's default names), the UPSTASH_REDIS_REST_* names,
// or any custom-prefixed pair such as STORAGE_REST_API_URL / STORAGE_REST_API_TOKEN.
// Every key is stored under "plinko:" so this app can share a database with other projects.
function findEnv() {
  const e = process.env;
  if (e.KV_REST_API_URL && e.KV_REST_API_TOKEN) return [e.KV_REST_API_URL, e.KV_REST_API_TOKEN];
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) return [e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(e)) {
    if (k.endsWith('_REST_API_URL')) {
      const t = e[k.replace(/_URL$/, '_TOKEN')];
      if (t) return [e[k], t];
    }
  }
  return [null, null];
}
const [URL_, TOKEN] = findEnv();
const PREFIX = process.env.KV_PREFIX || 'plinko:';

export const kvReady = () => Boolean(URL_ && TOKEN);

// Add the prefix to the key arguments of the commands this app uses.
function scoped(cmd) {
  const [c, ...a] = cmd.map(String);
  if (c.toUpperCase() === 'DEL') return [c, ...a.map(k => PREFIX + k)];
  return [c, PREFIX + a[0], ...a.slice(1)];
}

async function post(path, body) {
  const r = await fetch(URL_ + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok && !Array.isArray(j)) throw new Error(j.error || `kv ${r.status}`);
  return j;
}

export async function kv(...cmd) {
  const j = await post('', scoped(cmd));
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function pipe(cmds) {
  if (!cmds.length) return [];
  const j = await post('/pipeline', cmds.map(scoped));
  return j.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
