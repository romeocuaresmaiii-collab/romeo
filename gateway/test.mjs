// Offline test of worker.js with a stand-in for Bluesky (no network): node gateway/test.mjs
import worker from './worker.js';
const env = { GATEWAY_TOKEN: 't0ken-123', BSKY_HANDLE: 'rshsports.bsky.social', BSKY_APP_PASSWORD: 'xxxx-xxxx-xxxx-xxxx' };
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  const ok = b => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('createSession')) { const b = JSON.parse(init.body); return b.password === env.BSKY_APP_PASSWORD ? ok({ accessJwt: 'jwt1', did: 'did:plc:rsh', handle: 'rshsports.bsky.social' }) : new Response('{"message":"Invalid identifier or password"}', { status: 401 }); }
  if (url.includes('uploadBlob')) return ok({ blob: { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'image/jpeg', size: 3 } });
  if (url.includes('createRecord')) return ok({ uri: 'at://did:plc:rsh/app.bsky.feed.post/3abc', cid: 'cid1' });
  if (url.includes('getPosts')) return ok({ posts: [{ uri: 'at://did:plc:rsh/app.bsky.feed.post/3abc', likeCount: 4, repostCount: 1, replyCount: 2, quoteCount: 0 }] });
  if (url.includes('getProfile')) return ok({ handle: 'rshsports.bsky.social', followersCount: 120, followsCount: 10, postsCount: 40 });
  return new Response('{}', { status: 404 });
};
const req = (path, { method = 'GET', body, token = env.GATEWAY_TOKEN } = {}) => worker.fetch(new Request('https://gw.example' + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env);
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d ? ' — ' + d : '')); };

ok('Rejects a wrong token', (await req('/health', { token: 'nope' })).status === 401);
const h = await (await req('/health')).json(); ok('Health logs in and names the account', h.ok && h.handle === 'rshsports.bsky.social', JSON.stringify(h));
const text = 'Two colors in one singlet. Home and away covered: rshsports.com 🤼';
const r = await req('/bluesky/post', { method: 'POST', body: { text, image: { base64: btoa('abc'), mime: 'image/jpeg', alt: 'A reversible singlet' } } }); const p = await r.json();
const rec = JSON.parse(calls.find(c => c.url.includes('createRecord')).init.body).record, f = rec.facets && rec.facets[0];
const bytes = new TextEncoder().encode(text), linked = f && new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
ok('Posts text + image and returns the public link', r.status === 200 && p.url === 'https://bsky.app/profile/rshsports.bsky.social/post/3abc' && rec.embed && rec.embed.images[0].alt === 'A reversible singlet', JSON.stringify(p));
ok('Makes rshsports.com a clickable link (UTF-8 byte offsets, emoji-safe)', linked === 'rshsports.com' && f.features[0].uri === 'https://rshsports.com', linked);
ok('Refuses text over 300 characters', (await req('/bluesky/post', { method: 'POST', body: { text: 'x'.repeat(301) } })).status === 400);
const st = await (await req('/bluesky/stats?uris=at://did:plc:rsh/app.bsky.feed.post/3abc')).json(); ok('Reads likes, reposts and replies', st.posts[0].likes === 4 && st.posts[0].replies === 2, JSON.stringify(st));
const pr = await (await req('/bluesky/profile')).json(); ok('Reads follower count', pr.followers === 120);
const bad = await worker.fetch(new Request('https://gw.example/health', { headers: { authorization: 'Bearer ' + env.GATEWAY_TOKEN } }), { ...env, BSKY_APP_PASSWORD: 'wrong' });
ok('A wrong app password is reported, not hidden', bad.status === 502, (await bad.json()).error);
ok('The app password is never sent anywhere but Bluesky’s login', calls.every(c => !String(c.init.body || '').includes(env.BSKY_APP_PASSWORD) || c.url === 'https://bsky.social/xrpc/com.atproto.server.createSession'));
process.exit(fails ? 1 : 0);
