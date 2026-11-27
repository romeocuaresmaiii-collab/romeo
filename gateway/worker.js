/* RSH Sports posting gateway (Cloudflare Worker).
 *
 * Holds RSH's platform credentials so neither the app page nor Claude ever sees them, and posts on request.
 * Phase 1: Bluesky. Every request needs  Authorization: Bearer <GATEWAY_TOKEN>.
 *
 * Secrets (Cloudflare dashboard → Worker → Settings → Variables and Secrets, type "Secret"):
 *   GATEWAY_TOKEN       a long random string; the same value is saved once in Claude's secure credential form
 *   BSKY_HANDLE         e.g. rshsports.bsky.social
 *   BSKY_APP_PASSWORD   a Bluesky *app password* (Bluesky → Settings → Privacy and security → App passwords),
 *                       never the account's main password
 *
 * Routes
 *   GET  /health                      → { ok, handle, did }            (logs in to prove the credentials work)
 *   POST /bluesky/post                → { uri, cid, url }
 *        body { text, image?: { base64, mime, alt }, langs?: ["en"] }  text ≤ 300 characters; image ≤ 950 KB
 *   GET  /bluesky/stats?uris=a,b      → { posts: [{ uri, likes, reposts, replies, quotes, indexedAt }] }  (≤ 25 uris)
 *   GET  /bluesky/profile             → { handle, followers, follows, posts }
 */
const PDS = 'https://bsky.social', APPVIEW = 'https://public.api.bsky.app';
let session = null;   // { accessJwt, did, handle, at } cached per isolate for 60 minutes

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
function same(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

async function xrpc(env, method, nsid, { body, query, raw, mime, auth = true } = {}) {
  const url = new URL((auth ? PDS : APPVIEW) + '/xrpc/' + nsid); if (query) for (const [k, v] of Object.entries(query)) [].concat(v).forEach(x => url.searchParams.append(k, x));
  const headers = {}; if (auth) headers.authorization = 'Bearer ' + (await login(env)).accessJwt;
  if (body !== undefined) headers['content-type'] = 'application/json'; if (raw) headers['content-type'] = mime || 'application/octet-stream';
  const r = await fetch(url, { method, headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok) { const e = new Error((j && (j.message || j.error)) || ('HTTP ' + r.status)); e.status = r.status; e.code = j && j.error; throw e; }
  return j;
}
async function login(env, force) {
  if (!force && session && Date.now() - session.at < 60 * 60e3) return session;
  if (!env.BSKY_HANDLE || !env.BSKY_APP_PASSWORD) throw Object.assign(new Error('Bluesky secrets are not set on the gateway'), { status: 500 });
  const r = await fetch(PDS + '/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('Bluesky login failed: ' + (j.message || r.status)), { status: 502 });
  session = { accessJwt: j.accessJwt, did: j.did, handle: j.handle, at: Date.now() }; return session;
}

// Links become clickable only with "facets" (byte offsets in UTF-8). Bare domains like rshsports.com are linked too.
function facets(text) {
  const enc = new TextEncoder(), out = [], re = /(https?:\/\/[^\s)]+|\b(?:www\.)?rshsports\.com(?:\/[^\s)]*)?)/gi; let m;
  while ((m = re.exec(text))) {
    let s = m[0].replace(/[.,!?;:]+$/, ''); const start = enc.encode(text.slice(0, m.index)).length, end = start + enc.encode(s).length;
    out.push({ index: { byteStart: start, byteEnd: end }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: /^https?:/i.test(s) ? s : 'https://' + s.replace(/^www\./i, 'www.') }] });
  }
  return out;
}
const graphemes = s => { try { return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length; } catch (_) { return [...s].length; } };

async function post(env, req) {
  const b = await req.json().catch(() => null); if (!b || typeof b.text !== 'string' || !b.text.trim()) return json({ error: 'text is required' }, 400);
  const text = b.text.trim(); if (graphemes(text) > 300) return json({ error: 'Bluesky allows 300 characters; this is ' + graphemes(text) }, 400);
  const s = await login(env), record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: Array.isArray(b.langs) ? b.langs.slice(0, 3) : ['en'] };
  const f = facets(text); if (f.length) record.facets = f;
  if (b.image && b.image.base64) {
    const bin = Uint8Array.from(atob(b.image.base64), c => c.charCodeAt(0)); if (bin.length > 950000) return json({ error: 'image is over Bluesky’s ~1 MB limit; send a smaller JPEG' }, 400);
    const up = await xrpc(env, 'POST', 'com.atproto.repo.uploadBlob', { raw: bin, mime: b.image.mime || 'image/jpeg' });
    record.embed = { $type: 'app.bsky.embed.images', images: [{ image: up.blob, alt: String(b.image.alt || '').slice(0, 1000) }] };
  }
  const r = await xrpc(env, 'POST', 'com.atproto.repo.createRecord', { body: { repo: s.did, collection: 'app.bsky.feed.post', record } });
  return json({ uri: r.uri, cid: r.cid, url: `https://bsky.app/profile/${s.handle}/post/${r.uri.split('/').pop()}` });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.GATEWAY_TOKEN || !same(auth, env.GATEWAY_TOKEN)) return json({ error: 'unauthorized' }, 401);
    try {
      if (url.pathname === '/health') { const s = await login(env, true); return json({ ok: true, handle: s.handle, did: s.did }); }
      if (url.pathname === '/bluesky/post' && req.method === 'POST') return await post(env, req);
      if (url.pathname === '/bluesky/stats') {
        const uris = (url.searchParams.get('uris') || '').split(',').filter(u => /^at:\/\//.test(u)).slice(0, 25); if (!uris.length) return json({ posts: [] });
        const r = await xrpc(env, 'GET', 'app.bsky.feed.getPosts', { query: { uris }, auth: false });
        return json({ posts: (r.posts || []).map(p => ({ uri: p.uri, likes: p.likeCount || 0, reposts: p.repostCount || 0, replies: p.replyCount || 0, quotes: p.quoteCount || 0, indexedAt: p.indexedAt })) });
      }
      if (url.pathname === '/bluesky/profile') {
        const s = await login(env), r = await xrpc(env, 'GET', 'app.bsky.actor.getProfile', { query: { actor: s.did }, auth: false });
        return json({ handle: r.handle, followers: r.followersCount || 0, follows: r.followsCount || 0, posts: r.postsCount || 0 });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) { if (e.status === 401 || e.code === 'ExpiredToken') session = null; return json({ error: String(e.message || e) }, e.status && e.status < 600 ? e.status : 500); }
  }
};
