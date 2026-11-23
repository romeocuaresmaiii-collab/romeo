#!/usr/bin/env node
/* Checks the built artifact page in a browser with a stand-in for the artifact runtime
 * (in-memory database, file store and save prompt). Run after artifact/build.py. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = path.join(__dirname, 'dist'); const SHOTS = process.argv[2] || '';
const page0 = fs.readFileSync(path.join(DIST, 'RSH Sports Marketing OS.html'), 'utf8');
const seed = fs.existsSync(path.join(DIST, 'seed.json')) ? fs.readFileSync(path.join(DIST, 'seed.json'), 'utf8') : 'null';
const mock = `<script>(function(){const store={};const seed=${seed};if(seed&&!location.search.includes('empty'))store['workspace/main']=seed;window.__store=store;window.__saves=[];window.__uploads=[];
const snap=(p)=>({id:p.split('/').pop(),exists:p in store,data:()=>store[p],metadata:{fromCache:false,hasPendingWrites:false}});
const doc=p=>({id:p.split('/').pop(),path:p,get:async()=>snap(p),set:async d=>{store[p]=JSON.parse(JSON.stringify(d))},update:async d=>{Object.assign(store[p],d)},delete:async()=>{delete store[p]}});window.__RSH_TEST_PART_BYTES=40000;
const coll=(c,o)=>({orderBy:(f,dir)=>coll(c,{...o,f,dir}),limit:n=>coll(c,{...o,n}),where:()=>coll(c,o),doc:id=>doc(c+'/'+id),get:async()=>{let ds=Object.keys(store).filter(k=>k.startsWith(c+'/')).map(snap);if(o&&o.f)ds.sort((a,b)=>(a.data()[o.f]-b.data()[o.f])*(o.dir==='desc'?-1:1));if(o&&o.n)ds=ds.slice(0,o.n);return{docs:ds,size:ds.length,empty:!ds.length}}});
const caps={db:{doc,collection:c=>coll(c,{})},assets:{upload:async(b,o)=>{if(location.search.includes('hang'))return new Promise(()=>{});if(location.search.includes('refuse'))throw {code:'not_granted',message:'test'};const id=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');window.__uploads.push({id,size:b.size,type:o&&o.type});await fetch('/__put/'+id,{method:'POST',body:b});return{id,url:'/_blob/'+id,sizeBytes:b.size,contentType:o.type}},list:async()=>({assets:window.__uploads.map(u=>({id:u.id})),usage:{}})},downloads:{save:async r=>{window.__saves.push({filename:r.filename,size:(r.data.size||r.data.length)});return{status:'saved'}}}};
window.claude={use:async n=>(n==='assets'&&location.search.includes('noassets'))?null:(caps[n]||null)};})();</script>`;
const wrap = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${mock}${page0}</body></html>`;
const blobs = {};
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/__put/')) { const c = []; q.on('data', x => c.push(x)); q.on('end', () => { blobs[u.slice(7)] = Buffer.concat(c); r.writeHead(200); r.end(); }); return; }
  if (u.startsWith('/_blob/')) { const d = blobs[u.slice(7)]; r.writeHead(d ? 200 : 404, { 'Content-Type': 'video/mp4' }); return r.end(d); }
  if (u === '/') { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return r.end(wrap); }
  const f = path.join(DIST, u); if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': 'image/png' }); fs.createReadStream(f).pipe(r);
});
const out = []; const ok = (n, c, d) => { out.push(c); console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d ? ' — ' + d : '')); };
(async () => {
  await new Promise(r => srv.listen(8792, '127.0.0.1', r));
  const b = await chromium.launch();
  const errs = [];
  const open = async (w, h, q) => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://127.0.0.1:8792/' + (q || '')); await p.waitForFunction(() => /Connected|mismatch|verified/.test(document.getElementById('rshBuildLabel').textContent) && !document.getElementById('rshHostLoading')); return p; };
  const WS = p => p.evaluate(() => JSON.parse(localStorage.getItem('rsh_growth_command_v1') || '{"posts":[]}'));
  const p = await open(1440, 900);
  ok('App starts and reports the right build', /Connected/.test(await p.textContent('#rshBuildLabel')), (await p.textContent('#rshBuildLabel')).trim());
  ok('Workspace loads from artifact storage', (await WS(p)).posts.length === 11, (await WS(p)).posts.length + ' campaigns');
  ok('Save status is shown', /Saved to this artifact/.test(await p.textContent('#rshSyncPill')), await p.textContent('#rshSyncPill'));
  ok('Logo renders', await p.evaluate(() => [...document.images].some(i => /rsh_logo/.test(i.src) && i.naturalWidth > 0)));
  const views = await p.$$eval('[data-view]', e => [...new Set(e.map(x => x.dataset.view))].filter(v => /^[a-z]+$/.test(v)));
  const before = errs.length;
  for (const v of views) { await p.evaluate(v => document.querySelector(`[data-view="${v}"]`).click(), v); await p.waitForTimeout(200); }
  ok(`All ${views.length} views open without errors`, errs.length === before, errs.slice(before).join(' | '));
  await p.evaluate(() => document.querySelector('[data-view="approvals"]').click());
  const withMedia = (await WS(p)).posts.find(x => (x.creativeAssets || []).length).id;
  await p.click(`[data-review-select="${withMedia}"]`);
  await p.waitForFunction(() => { const i = document.querySelector('#reviewMediaGallery img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).then(() => ok('Campaign images display in Reviews', true), () => ok('Campaign images display in Reviews', false));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/artifact-reviews.png' });
  // edit -> persisted to the database
  await p.fill('#reviewNotes', 'Artifact test note'); await p.click('#reviewSaveNotes'); await p.waitForTimeout(2500);
  const cloud = await p.evaluate(() => JSON.parse(window.__store['workspace/main'].json));
  ok('Edits are written to artifact storage', cloud.posts.find(x => x.id === withMedia).approvalMeta.notes === 'Artifact test note' && /Saved to this artifact/.test(await p.textContent('#rshSyncPill')));
  // approval guard still holds
  const bare = cloud.posts.find(x => !(x.creativeAssets || []).length && !x.creativeAsset).id;
  await p.click(`[data-review-select="${bare}"]`);
  for (const c of ['reviewCheckAssets', 'reviewCheckFacts', 'reviewCheckRights', 'reviewCheckPlatform']) await p.check('#' + c);
  await p.click('#reviewApprove');
  ok('Manager review still blocked without media', !((await WS(p)).posts.find(x => x.id === bare).approvalMeta || {}).pmReviewedAt);
  // vault
  await p.evaluate(() => document.querySelector('[data-view="settings"]').click());
  await p.click('#vaultSave'); await p.waitForTimeout(800);
  ok('Data Vault saves a revision', await p.evaluate(() => !!window.__store['vault/r00000001']), (await p.textContent('#vaultStatusText')).slice(0, 80));
  // export
  await p.click('#exportJson'); await p.waitForTimeout(400);
  ok('JSON backup goes to the save prompt', await p.evaluate(() => window.__saves.some(s => /\.json$/.test(s.filename) && s.size > 1000)), JSON.stringify(await p.evaluate(() => window.__saves)));
  await p.click('#backupZipExport'); await p.waitForTimeout(400);
  ok('ZIP backup explains it is local-app only', /local Python app/.test(await p.textContent('#backupZipStatus')));
  // two-step confirm on reset
  await p.click('#resetData');
  const first = (await WS(p)).posts.length; const banner = await p.isVisible('#rshHostConfirm');
  ok('Destructive actions ask for confirmation first', first === 11 && banner);
  await p.click('#rshHostConfirm button');
  // media upload
  await p.evaluate(() => document.querySelector('[data-view="studio"]').click());
  const target = (await WS(p)).posts.find(x => !(x.creativeAssets || []).length && !x.creativeAsset).id;
  await p.selectOption('#visualPostSelect', target);
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#246'; g.fillRect(0, 0, 640, 640); g.fillStyle = '#fff'; g.fillRect(100, 100, 300, 200);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'test-photo.png', { type: 'image/png' }));
    const inp = document.getElementById('visualFile'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.click('#visualUpload'); await p.waitForTimeout(1200);
  const up = await p.evaluate(() => window.__uploads);
  const attached = ((await WS(p)).posts.find(x => x.id === target).creativeAssets || []);
  ok('Attaching a photo stores it and links it to the campaign', up.length === 1 && attached.length === 1 && attached[0].id === up[0].id, (await p.textContent('#visualUploadMsg')).slice(0, 120));
  ok('Attached photo is requested from the artifact file store', await p.evaluate(id => [...document.images].some(i => i.src.includes('/_blob/' + id)), up[0] && up[0].id));
  await p.evaluate(async () => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(5000)], 'clip.mov', { type: 'video/quicktime' }));
    const inp = document.getElementById('visualFile'); inp.files = dt.files;
  });
  await p.click('#visualUpload'); await p.waitForTimeout(600);
  ok('MOV is refused with a clear reason', /Export the video as MP4/.test(await p.textContent('#visualUploadMsg')), (await p.textContent('#visualUploadMsg')).slice(0, 140));
  await p.evaluate(async () => {
    const bytes = new Uint8Array(130000); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 251; bytes[40000] = 60; bytes[80000] = 32; bytes[80001] = 60;
    bytes.set([0, 0, 0, 24, 102, 116, 121, 112], 0); window.__bigSum = bytes.reduce((a, b) => (a + b) % 1000000007, 0);
    const dt = new DataTransfer(); dt.items.add(new File([bytes], 'big-clip.mp4', { type: 'video/mp4' }));
    document.getElementById('visualFile').files = dt.files;
  });
  await p.click('#visualUpload'); await p.waitForTimeout(2500);
  const big = ((await WS(p)).posts.find(x => x.id === target).creativeAssets || []).find(a => a.name === 'big-clip.mp4');
  ok('A video over the single-file limit is stored in parts', !!big && Array.isArray(big.parts) && big.parts.length >= 3, big ? big.parts.length + ' parts' : (await p.textContent('#visualUploadMsg')).slice(0, 140));
  const same = big && await p.evaluate(async () => { const v = [...document.querySelectorAll('video')].find(x => (x.getAttribute('src') || '').startsWith('blob:')); if (!v) return 'no player with joined video'; const b = new Uint8Array(await (await fetch(v.src)).arrayBuffer()); return b.length === 130000 && b.reduce((a, c) => (a + c) % 1000000007, 0) === window.__bigSum ? true : 'bytes differ: ' + b.length; });
  ok('The parts are joined back into the identical file for the player', same === true, String(same));
  // file store unavailable -> files are saved through the database instead
  for (const mode of ['refuse', 'noassets']) {
    const f = await open(1300, 900, '?' + mode);
    await f.evaluate(() => { try { localStorage.removeItem('rsh:fileStoreFailedAt'); } catch (_) {} });
    await f.evaluate(() => document.querySelector('[data-view="studio"]').click());
    const tid = (await WS(f)).posts.find(x => !(x.creativeAssets || []).length && !x.creativeAsset).id;
    await f.selectOption('#visualPostSelect', tid);
    await f.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 2600; c.height = 2600; const g = c.getContext('2d');
      const im = g.createImageData(2600, 2600); for (let i = 0; i < im.data.length; i++) im.data[i] = (i * 2654435761 >>> 13) & 255; g.putImageData(im, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const vid = new Uint8Array(400000); vid.set([0, 0, 0, 24, 102, 116, 121, 112], 0); for (let i = 8; i < vid.length; i++) vid[i] = (i * 17) % 253; window.__vidSum = vid.reduce((a, b) => (a + b) % 1000000007, 0);
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'big-photo.png', { type: 'image/png' })); dt.items.add(new File([vid], 'clip.mp4', { type: 'video/mp4' }));
      document.getElementById('visualFile').files = dt.files; window.__photoBytes = blob.size;
    });
    await f.click('#visualUpload');
    await f.waitForFunction(() => /attached|stopped|failed/i.test(document.getElementById('visualUploadMsg').textContent), null, { timeout: 60000 });
    const recs = ((await WS(f)).posts.find(x => x.id === tid).creativeAssets || []);
    ok(`[${mode}] Photo and video attach through the database when the file store is unavailable`, recs.length === 2 && recs.every(r => r.store === 'db'), (await f.textContent('#visualUploadMsg')).slice(0, 120));
    const shown = await f.evaluate(async () => { await new Promise(r => setTimeout(r, 1500)); const im = [...document.images].filter(i => i.src.startsWith('blob:') && i.naturalWidth > 0).length; return im; });
    ok(`[${mode}] The stored photo displays`, shown > 0, shown + ' image(s) shown');
    const vidOk = recs[1] && await f.evaluate(async id => { const s = window.__store; const meta = s['media/' + id]; let sum = 0, len = 0; for (let n = 0; n < meta.chunks; n++) { const bin = atob(s['media/' + id + '/chunks/c' + String(n).padStart(5, '0')].data); len += bin.length; for (let i = 0; i < bin.length; i++) sum = (sum + bin.charCodeAt(i)) % 1000000007; } return len === 400000 && sum === window.__vidSum; }, recs[1].id);
    ok(`[${mode}] The stored video is byte-identical`, vidOk === true);
    await f.close();
  }
  // phone width
  const m = await open(400, 800);
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('No sideways page scroll at phone width', over <= 1, 'overflow ' + over + 'px');
  if (SHOTS) await m.screenshot({ path: SHOTS + '/artifact-phone.png' });
  // empty database
  const e = await open(1200, 800, '?empty');
  ok('Empty storage starts a blank workspace without errors', (await e.evaluate(() => !!document.getElementById('rshSyncPill'))) );
  ok('No page errors overall', errs.length === 0, errs.join(' | '));
  await b.close(); srv.close();
  process.exit(out.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
