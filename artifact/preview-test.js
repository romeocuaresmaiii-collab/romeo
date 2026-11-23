#!/usr/bin/env node
/* Checks the built artifact page in a browser with a stand-in for the artifact runtime
 * (in-memory database, file store and save prompt). Run after artifact/build.py. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = path.join(__dirname, 'dist'); const SHOTS = process.argv[2] || '';
const page0 = fs.readFileSync(path.join(DIST, 'RSH Sports Marketing OS.html'), 'utf8');
const seed = fs.existsSync(path.join(DIST, 'seed.json')) ? fs.readFileSync(path.join(DIST, 'seed.json'), 'utf8') : 'null';
const mock = `<script>(function(){const store={'live/comments':{fetchedAt:new Date().toISOString(),posts:JSON.stringify([['INSTAGRAM',Number(new Date().toISOString().slice(0,10).replace(/-/g,'')),'https://www.instagram.com/p/x/','Coach question post',3],['TIKTOK',20200101,'https://www.tiktok.com/x','Older clip',2]])}};const seed=${seed};if(seed&&!location.search.includes('empty'))store['workspace/main']=seed;Object.assign(store,window.__preStore||{});window.__store=store;window.__saves=[];window.__uploads=[];
const snap=(p)=>({id:p.split('/').pop(),exists:p in store,data:()=>store[p],metadata:{fromCache:false,hasPendingWrites:false}});
const subs={};const tell=p=>(subs[p]||[]).forEach(f=>setTimeout(()=>f(snap(p)),0));window.__remoteSet=(p,d)=>{store[p]=d;tell(p)};
const doc=p=>({id:p.split('/').pop(),path:p,get:async()=>snap(p),onSnapshot:(f)=>{(subs[p]=subs[p]||[]).push(f);return()=>{}},set:async d=>{store[p]=JSON.parse(JSON.stringify(d));tell(p)},update:async d=>{Object.assign(store[p],d)},delete:async()=>{delete store[p]}});window.__RSH_TEST_PART_BYTES=40000;
const coll=(c,o)=>({orderBy:(f,dir)=>coll(c,{...o,f,dir}),limit:n=>coll(c,{...o,n}),where:()=>coll(c,o),doc:id=>doc(c+'/'+id),get:async()=>{let ds=Object.keys(store).filter(k=>k.startsWith(c+'/')).map(snap);if(o&&o.f)ds.sort((a,b)=>(a.data()[o.f]-b.data()[o.f])*(o.dir==='desc'?-1:1));if(o&&o.n)ds=ds.slice(0,o.n);return{docs:ds,size:ds.length,empty:!ds.length}}});
const caps={db:{doc,collection:c=>coll(c,{})},assets:{upload:async(b,o)=>{if(location.search.includes('hang'))return new Promise(()=>{});if(location.search.includes('refuse'))throw {code:'not_granted',message:'test'};const id=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');window.__uploads.push({id,size:b.size,type:o&&o.type});await fetch('/__put/'+id,{method:'POST',body:b});return{id,url:'/_blob/'+id,sizeBytes:b.size,contentType:o.type}},list:async()=>({assets:window.__uploads.map(u=>({id:u.id})),usage:{}})},downloads:{save:async r=>{window.__saves.push({filename:r.filename,size:(r.data.size||r.data.length)});return{status:'saved'}}}};
const day=n=>{const d=new Date();d.setDate(d.getDate()-n);return String(d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate())+'230000'};
const who=(location.search.match(/as=([a-z_]+)/)||[])[1]||'u_owner';caps.user={id:async()=>who,isOwner:async()=>who==='u_owner',canEdit:async()=>who==='u_owner',profiles:async ids=>Object.fromEntries(ids.map(i=>[i,{id:i,name:i==='u_owner'?'Test Owner':i==='u_anthony'?'Anthony Test':''}]))};
caps.mcp={callTool:async(server,tool,input)=>{if(server==='Claude Code Remote'){window.__sent=(window.__sent||[]).concat([{tool,input}]);if(location.search.includes('noeditor'))throw {code:'blocked_by_policy'};return {payload:{ok:true}}}window.__mcpCalls=(window.__mcpCalls||[]).concat([{server,tool,input}]);if(location.search.includes('nometricool'))throw {code:'server_not_connected'};
if(tool==='getScheduledPosts'){const t=new Date();t.setDate(t.getDate()+1);const dt=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')+'T18:00:00';return {payload:{data:[{publicationDate:{dateTime:dt},text:'Every champion has someone',providers:[{network:'instagram'},{network:'tiktok'}],instagramData:{type:'REEL'},facebookData:{title:'The Round Nobody Claps For'},draft:false}]}}}
if(input.metrics[0]==='IGEV01'){return {payload:{rows:[['55.0','60.0','30.0','36.0','11.0','9.0','26.0',day(27).slice(0,8)],['55.0','69.0','38.0','36.0',null,null,'28.0',day(0).slice(0,8)],['55.0','70.0','37.0','36.0','13.0','9.0','28.0',day(1).slice(0,8)]]}}}
const rows=[];for(let i=0;i<28;i++){rows.push(['TIKTOK',day(i),'https://www.tiktok.com/x/'+i,'Clip '+i,String(i<14?200:100)+'.0',String(i<14?20:5)+'.0','VIDEO']);rows.push(['INSTAGRAM',day(i),'https://www.instagram.com/p/'+i,null,'50.0','2.0','IMAGE']);if(i<4)rows.push(['PINTEREST',day(i),i?'https://rshsports.com/':'https://www.rshsports.com/collections/volleyball?utm_source=pinterest','Pin '+i,'10.0','0.0','PIN']);rows.push(['FACEBOOK',day(i),'https://facebook.com/s/'+i,null,null,null,'STORY'])}
return {payload:{rows}}}};
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
  const JSZIP = process.env.JSZIP_PATH || '';
  const open = async (w, h, q) => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); if (JSZIP) await p.route('https://cdnjs.cloudflare.com/ajax/libs/jszip/**', r => r.fulfill({ path: JSZIP, contentType: 'application/javascript' })); await p.goto('http://127.0.0.1:8792/' + (q || '')); await p.waitForFunction(() => /Connected|mismatch|verified/.test(document.getElementById('rshBuildLabel').textContent) && !document.getElementById('rshHostLoading')); return p; };
  const WS = p => p.evaluate(() => JSON.parse(localStorage.getItem('rsh_growth_command_v1') || '{"posts":[]}'));
  const p = await open(1440, 900);
  ok('App starts and reports the right build', /Connected/.test(await p.textContent('#rshBuildLabel')), (await p.textContent('#rshBuildLabel')).trim());
  ok('Workspace loads from artifact storage', (await WS(p)).posts.length === 11, (await WS(p)).posts.length + ' campaigns');
  ok('Save status is shown', /team copy up to date/.test(await p.textContent('#rshSyncPill')), await p.textContent('#rshSyncPill'));
  await p.waitForFunction(() => /Updated/.test((document.querySelector('#rshLive [data-live-stamp]') || {}).textContent || '') && !!window.__store['live/scheduled'], null, { timeout: 8000 }).catch(() => {});
  const live = await p.evaluate(() => { const h = document.getElementById('rshLive'); if (h && h.querySelector('.live-detail')) h.querySelector('.live-detail').open = true; return { text: h ? h.innerText : '', calls: window.__mcpCalls || [], saved: !!window.__store['live/metricool'] }; });
  ok('Live results load from the Metricool connector and are saved', live.calls.length === 3 && live.calls[0].tool === 'getAnalyticsDataByMetrics' && live.calls[0].input.brandId === '5695688' && live.saved);
  ok('Live totals are computed correctly (posts 46, impressions 3,540, interactions 308)', /\b46\b/.test(live.text) && /3,540/.test(live.text) && /\b308\b/.test(live.text) && /TikTok videos/.test(live.text), live.text.replace(/\s+/g, ' ').slice(140, 420));
  ok('Followers show the latest value per channel and the change (total 248, +21)', /Followers · 248 across 7 channels/.test(live.text) && /\+21/.test(live.text), (live.text.match(/Followers[^]*?All channels[^\n]*\n?[^\n]*\n?[^\n]*/) || [''])[0].replace(/\s+/g, ' ').slice(0, 200));
  ok('Upcoming scheduled posts are listed', /1 post scheduled/.test(live.text) && /The Round Nobody Claps For/.test(live.text) && /Reel · Instagram, TikTok/.test(live.text));
  ok('The Executive Brief shows the same live results', await p.evaluate(() => /Followers · 248/.test(document.getElementById('rshLiveExecutive').textContent)));
  ok('The brief states the same figures in plain language', /This week in brief/.test(live.text) && /Impressions rose 69% \(2,100 → 3,540\) and interactions rose 214% \(98 → 308\)/.test(live.text) && /248 followers across 7 channels, \+21/.test(live.text) && /Facebook has posts going out but Metricool reports no impressions/.test(live.text) && /1 post scheduled for the next 7 days/.test(live.text) && /11 campaigns are with the team for manager review/.test(live.text), (live.text.match(/This week in brief[^]*?Posts published/) || [''])[0].replace(/\s+/g, ' ').slice(0, 900));
  ok('Untracked store links are counted and explained (3 of 4 untagged, 3 to the homepage)', /3 of 4 posts linking to rshsports.com carry no campaign tracking, and 3 point to the homepage/.test(live.text) && /Link tracking/.test(live.text) && /utm_source=pinterest&utm_medium=organic_social/.test(live.text));
  ok('Comments to answer are listed with links', /5 comments came in on 2 posts/.test(live.text) && /Coach question post/.test(live.text) && /Comments to answer/.test(live.text));
  ok('Logo renders', await p.evaluate(() => [...document.images].some(i => /rsh_logo/.test(i.src) && i.naturalWidth > 0)));
  const home = await p.evaluate(() => { const h = document.getElementById('view-overview'); const ld = h.querySelector('#rshLive .live-detail'); if (ld) ld.open = false; return { order: [...h.children].map(e => e.id || e.className.split(' ')[0]).join(' > '), height: h.scrollHeight, shown: [...document.getElementById('pipelineItems').children].filter(e => e.offsetParent !== null).length, total: document.getElementById('pipelineItems').children.length, quick: document.getElementById('rshQuick').textContent.replace(/\s+/g, ' '), heroHidden: h.querySelector('.card.hero').offsetParent === null || !h.querySelector('.card.hero').checkVisibility({ contentVisibilityAuto: true }) }; });
  ok('Home shows quick actions with a Checklist shortcut, live summary, then the rest on demand', home.order === 'rshQuick > rshLive > rshCampaigns > rshHomeMore' && home.total === 11 && /Checklist ?11 need work/.test(home.quick) && /Reviews ?11 waiting/.test(home.quick), home.order + ' · height ' + home.height + ' · ' + home.shown + '/' + home.total);
  await p.evaluate(() => { document.getElementById('rshCampTable').open = true; document.querySelector('#rshLive .live-detail').open = true; });
  await p.click('.nav button[data-view="tracker"]');
  const trkNav = await p.evaluate(() => ({ active: document.getElementById('view-tracker').classList.contains('active'), title: document.getElementById('pageTitle').textContent, navOn: document.querySelector('.nav button[data-view="tracker"]').classList.contains('active'), pos: [...document.querySelectorAll('.nav > button[data-view]')].map(b => b.dataset.view).join(',') }));
  ok('Checklist has its own sidebar entry and screen', trkNav.active && trkNav.title === 'Campaign Checklist' && trkNav.navOn && trkNav.pos.startsWith('overview,tracker,studio'), trkNav.pos);
  const trk = await p.evaluate(() => { const c = document.getElementById('rshTracker'); const rows = [...c.querySelectorAll('.row')]; const withMedia = rows.find(r => /Community Question/.test(r.textContent)), bare = rows.find(r => /Pre-Match Ritual/.test(r.textContent)); return { n: rows.length, intro: c.querySelector('.head p').textContent, days: c.querySelectorAll('.day').length, first: c.querySelector('.day').textContent, bare: bare.textContent.replace(/\s+/g, ' '), media: withMedia.textContent.replace(/\s+/g, ' '), chips: [...c.querySelectorAll('.sum button')].map(b => b.textContent).join(' | ') }; });
  ok('The checklist lists every campaign in the default two-week range, grouped by day', trk.n === 11 && trk.days === 11 && /11 campaigns planned for Dec 1 – Dec 14/.test(trk.intro) && /Tuesday, December 1/.test(trk.first), trk.intro + ' · ' + trk.chips);
  ok('Each campaign shows its real status and one plain next step', /✓ Brief ?Media ?Visual checks/.test(trk.bare) && /Next ?Attach the finished/.test(trk.bare) && /✓ Brief ?✓ Media ?✓ Visual checks ?Manager review/.test(trk.media) && /Manager: check the media, claims and rights/.test(trk.media), trk.bare.slice(0, 170));
  await p.click('#rshTracker .row [data-track-details]');
  const dv = await p.evaluate(() => { const d = document.getElementById('rshDetail'); return { text: d.innerText, labels: [...d.querySelectorAll('.lab')].map(x => x.textContent.replace('Copy', '').trim()).join(' | ') }; });
  ok('Details shows the whole idea for a campaign: hook, caption, on-image text, visual concept and image prompt', /Pre-Match Ritual/.test(dv.text) && /Hook \| Caption and call to action \| Text on the image \| Visual concept \| Image prompt/.test(dv.labels) && /Next: Attach the finished/.test(dv.text) && /Nothing attached yet/.test(dv.text), dv.labels);
  await p.click('#rshDetail [data-detail-edit]');
  await p.fill('#rshD_hook', 'NEW TEST HOOK'); await p.fill('#rshD_title', 'Pre-Match Ritual: Edited');
  await p.click('#rshDetail [data-detail-save]'); await p.waitForTimeout(300);
  const de = await p.evaluate(() => { const ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')), q = ws.posts.find(x => x.title === 'Pre-Match Ritual: Edited'); return { hook: q && q.hook, version: q && q.contentVersion, panel: document.getElementById('rshDetail').innerText, row: [...document.querySelectorAll('#rshTracker .row .title')].some(x => x.textContent === 'Pre-Match Ritual: Edited') }; });
  ok('Editing in the details panel saves through the app and updates the list', de.hook === 'NEW TEST HOOK' && de.version >= 2 && /Saved\./.test(de.panel) && /NEW TEST HOOK/.test(de.panel) && de.row, JSON.stringify({ hook: de.hook, version: de.version }));
  await p.click('#rshDetail [data-detail-close]');
  ok('The details panel closes', await p.evaluate(() => !document.getElementById('rshDetail') && !document.getElementById('rshDetailBack')));
  await p.click('#rshTracker [data-track-only="manager"]');
  const trk2 = await p.evaluate(() => document.querySelectorAll('#rshTracker .row').length);
  await p.click('#rshTracker .row [data-track-open]'); await p.waitForTimeout(300);
  const went = await p.evaluate(() => document.getElementById('view-approvals').classList.contains('active'));
  ok('Filtering by status works and the button opens the right screen', trk2 === 2 && went, trk2 + ' in manager review');
  await p.click('.nav button[data-view="tracker"]');
  await p.click('#rshTracker [data-track-only="all"]');
  await p.evaluate(() => document.querySelector('[data-view="overview"]').click());
  const tk = (await WS(p)).posts.find(x => x.platform === 'TikTok').id;
  const campBefore = await p.evaluate(() => document.getElementById('rshCampaigns').innerText);
  await p.selectOption(`#rshCampaigns select[data-pick="${tk}"]`, { index: 1 });
  await p.click(`#rshCampaigns [data-link-pick="${tk}"]`); await p.waitForTimeout(2200);
  const camp = await p.evaluate(id => { const ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')), cloud = JSON.parse(window.__store['workspace/main'].json); return { local: ws.posts.find(x => x.id === id).published, cloud: cloud.posts.find(x => x.id === id).published, text: document.getElementById('rshCampaigns').innerText }; }, tk);
  ok('Campaign results start empty and explain how to fill them', /0 of 11 campaigns linked/.test(campBefore) && /No results by sport, audience or season yet/.test(campBefore));
  ok('Linking a campaign to its published post saves the link and its real figures', !!camp.local && camp.local.impressions === 200 && camp.local.interactions === 20 && !!camp.cloud && camp.cloud.link === camp.local.link, JSON.stringify(camp.local).slice(0, 160));
  ok('Results are grouped by sport, audience, season phase and goal', /1 of 11 campaigns linked/.test(camp.text) && /By sport/.test(camp.text) && /By season phase/.test(camp.text) && /In season/.test(camp.text) && /Wrestling|Basketball/.test(camp.text));
  await p.evaluate(() => document.querySelector('[data-view="experiments"]').click());
  const gx = await p.evaluate(() => { const ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')).growthTests; const eng = ws.find(t => t.platform === 'TikTok' && t.kpi === 'engagement').id, fol = ws.find(t => t.kpi === 'follows').id; return { eng, folText: document.querySelector(`article[data-experiment="${fol}"] .gx-live`).textContent, boxes: document.querySelectorAll('#gxList .gx-live').length, cards: document.querySelectorAll('#gxList article').length }; });
  await p.selectOption(`article[data-experiment="${gx.eng}"] [data-gx-live="a"]`, { index: 1 });
  await p.selectOption(`article[data-experiment="${gx.eng}"] [data-gx-live="b"]`, { index: 15 });
  await p.click(`[data-gx-live-apply="${gx.eng}"]`); await p.waitForTimeout(400);
  const gxAfter = await p.evaluate(id => { const t = JSON.parse(localStorage.getItem('rsh_growth_command_v1')).growthTests.find(x => x.id === id); return { t: [t.aNumerator, t.aDenominator, t.bNumerator, t.bDenominator], source: t.source, result: document.querySelector(`article[data-experiment="${id}"] .sample`).textContent, redecorated: !!document.querySelector(`article[data-experiment="${id}"] .gx-live select`) }; }, gx.eng);
  ok('Every experiment offers results from published posts, or says why it cannot', gx.boxes === gx.cards && gx.cards === 5 && /does not report per post/.test(gx.folText));
  ok('An engagement test is filled with the two posts’ real figures (A 20/200, B 5/100)', gxAfter.t.join(',') === '20,200,5,100' && /Metricool figures read/.test(gxAfter.source) && /A leads/.test(gxAfter.result) && gxAfter.redecorated, gxAfter.t.join(',') + ' · ' + gxAfter.result.slice(0, 80));
  await p.evaluate(() => document.querySelector('[data-view="overview"]').click());
  await p.evaluate(() => document.querySelector('[data-view="calendar"]').click());
  const tomorrow = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return { iso: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), otherMonth: d.getMonth() !== new Date().getMonth() }; });
  const calBanner = await p.textContent('#rshCalCover');
  if (tomorrow.otherMonth) await p.click('#calNext');
  const calDay = await p.evaluate(k => { const d = document.querySelector(`.calday[data-date="${k}"]`); return d ? { mc: d.querySelectorAll('.calevent.mc').length, empty: d.classList.contains('mc-empty'), text: d.textContent } : null; }, tomorrow.iso);
  if (tomorrow.otherMonth) await p.click('#calPrev');
  const todayCell = await p.evaluate(() => { const d = document.querySelector('.calday.today'); return d ? { pub: /published/.test(d.textContent), empty: d.classList.contains('mc-empty') } : null; });
  ok('Calendar warns how many of the next 14 days are covered in Metricool', /1 of the next 14 days have a post scheduled in Metricool/.test(calBanner) && /Nothing is scheduled on/.test(calBanner), calBanner.slice(0, 150));
  ok('Metricool scheduled posts and published counts appear on the calendar days', !!calDay && calDay.mc === 1 && !calDay.empty && /Round Nobody/.test(calDay.text) && !!todayCell && todayCell.pub && todayCell.empty, JSON.stringify(calDay) + JSON.stringify(todayCell));
  await p.evaluate(() => document.querySelector('[data-view="overview"]').click());
  const views = await p.$$eval('[data-view]', e => [...new Set(e.map(x => x.dataset.view))].filter(v => /^[a-z]+$/.test(v)));
  const before = errs.length;
  for (const v of views) { await p.evaluate(v => document.querySelector(`[data-view="${v}"]`).click(), v); await p.waitForTimeout(200); }
  ok(`All ${views.length} views open without errors`, errs.length === before, errs.slice(before).join(' | '));
  const merged = await p.evaluate(() => {
    document.getElementById('navMoreDetails').open = true;
    const visible = [...document.querySelectorAll('#navMoreDetails button[data-view]')].filter(b => b.offsetParent !== null).map(b => b.dataset.view);
    document.querySelector('[data-view="competitors"]').click();
    const tabs = [...document.querySelectorAll('#view-competitors > .view-tabs button')].map(b => b.textContent);
    document.querySelector('#view-competitors > .view-tabs [data-tabview="compintel"]').click();
    return { visible, tabs, onIntel: document.getElementById('view-compintel').classList.contains('active'), navActive: document.querySelector('.nav button[data-view="competitors"]').classList.contains('active'), tabActive: document.querySelector('#view-compintel > .view-tabs .active').textContent };
  });
  ok('Overlapping screens share one sidebar entry (12 tools instead of 16)', merged.visible.length === 12 && !merged.visible.includes('compintel') && !merged.visible.includes('pitch'), merged.visible.join(','));
  ok('Tabs switch between the merged screens and keep the sidebar entry highlighted', merged.tabs.join('|') === 'Watchlist|Intelligence' && merged.onIntel && merged.navActive && merged.tabActive === 'Intelligence');
  await p.evaluate(() => document.querySelector('[data-view="approvals"]').click());
  const withMedia = (await WS(p)).posts.find(x => (x.creativeAssets || []).length).id;
  await p.click(`[data-review-select="${withMedia}"]`);
  await p.waitForFunction(() => { const i = document.querySelector('#reviewMediaGallery img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).then(() => ok('Campaign images display in Reviews', true), () => ok('Campaign images display in Reviews', false));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/artifact-reviews.png' });
  const rv = await p.evaluate(() => { const q = document.querySelector('.review-queue-card').getBoundingClientRect(), m = document.querySelector('.review-main').getBoundingClientRect(), sd = document.querySelector('.review-side').getBoundingClientRect(); return { queueLeft: q.right <= m.left + 1, sideRight: sd.left >= m.right - 1, mainWider: m.width > sd.width, checksInSide: !!document.querySelector('.review-side #reviewCheckAssets'), mediaInMain: !!document.querySelector('.review-main #reviewMediaGallery'), readiness: /Review readiness/.test(document.querySelector('.review-side #reviewReadiness').textContent), folds: document.querySelectorAll('.review-main details.review-fold').length }; });
  ok('Reviews puts the queue left, the content in the middle and checks and decisions on the right', rv.queueLeft && rv.sideRight && rv.mainWider && rv.checksInSide && rv.mediaInMain && rv.readiness && rv.folds === 2, JSON.stringify(rv));
  const create = await p.evaluate(() => { document.querySelector('[data-view="studio"]').click(); const s = document.getElementById('view-studio'); const kids = [...s.children].filter(e => e.offsetParent !== null).map(e => e.id || e.className.split(' ')[0]); const adv = document.getElementById('createAdvanced'); return { kids, advOpen: adv.open, formHidden: !document.getElementById('ideaForm').checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) || document.getElementById('ideaForm').getBoundingClientRect().height === 0, height: s.scrollHeight }; });
  ok('Create shows three steps, then creator, attachments and drafts; advanced tools are collapsed', create.kids[0] === 'createSteps' && create.kids[1] === 'simpleBuilder' && create.kids[2] === 'visualStudio' && !create.advOpen && create.formHidden, create.kids.join(' > ') + ' · height ' + create.height + ' · advanced open ' + create.advOpen + ' · form hidden ' + create.formHidden);
  await p.evaluate(() => document.querySelector('[data-view="approvals"]').click());
  const score = await p.evaluate(() => { const c = document.getElementById('rshScore'), v = document.getElementById('view-market'); const rows = window.RSH_SCORE.rows; return { head: c.querySelector('.score-big').textContent.trim(), avg: (Math.round(rows.reduce((a, r) => a + r[2], 0) / rows.length * 10 + 1e-9) / 10).toFixed(1), n: c.querySelectorAll('tbody tr').length, oldHidden: v.querySelector(':scope > .card.hero').hidden && v.querySelector(':scope > .card.hero').nextElementSibling.hidden }; });
  if (SHOTS) { await p.evaluate(() => document.querySelector('[data-view="market"]').click()); await p.screenshot({ path: SHOTS + '/artifact-score.png' }); await p.evaluate(() => document.querySelector('[data-view="studio"]').click()); await p.screenshot({ path: SHOTS + '/artifact-create.png' }); await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('[data-view="approvals"]').click(); }); }
  ok('Scorecard shows the average of its own ten ratings and replaces the old assessment', score.head.startsWith(score.avg) && score.n === 10 && score.oldHidden, score.head + ' from ' + score.n + ' ratings');
  // edit -> persisted to the database
  await p.fill('#reviewNotes', 'Artifact test note'); await p.click('#reviewSaveNotes'); await p.waitForTimeout(2500);
  const cloud = await p.evaluate(() => JSON.parse(window.__store['workspace/main'].json));
  ok('Edits are written to artifact storage', cloud.posts.find(x => x.id === withMedia).approvalMeta.notes === 'Artifact test note' && /team copy up to date/.test(await p.textContent('#rshSyncPill')));
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
  // several people editing at once
  const mg = await p.evaluate(() => {
    const base = { settings: { brand: 'RSH' }, posts: [{ id: 'a', title: 'A', caption: 'one', owner: 'Max' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }], approvalLog: [{ action: 'old' }] };
    const mine = JSON.parse(JSON.stringify(base)); mine.posts[0].caption = 'my caption'; mine.posts.push({ id: 'd', title: 'Mine new' }); mine.posts.splice(2, 1); mine.approvalLog.unshift({ action: 'mine' });
    const theirs = JSON.parse(JSON.stringify(base)); theirs.posts[0].owner = 'Jasper'; theirs.posts[1].title = 'B edited'; theirs.posts.push({ id: 'e', title: 'Theirs new' }); theirs.approvalLog.unshift({ action: 'theirs' }); theirs.settings.brand = 'RSH Sports';
    const m = window.RSH_HOST.merge3(base, mine, theirs);
    return { a: m.posts.find(x => x.id === 'a'), b: m.posts.find(x => x.id === 'b').title, ids: m.posts.map(x => x.id).sort().join(''), log: m.approvalLog.map(x => x.action).sort().join(','), brand: m.settings.brand };
  });
  ok('Two people’s changes merge record by record (edits, additions, a deletion and log entries all kept)', mg.a.caption === 'my caption' && mg.a.owner === 'Jasper' && mg.b === 'B edited' && mg.ids === 'abde' && mg.log === 'mine,old,theirs' && mg.brand === 'RSH Sports', JSON.stringify(mg));
  await p.evaluate(() => document.querySelector('[data-view="approvals"]').click());
  const pair = await p.evaluate(() => { const ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')); const free = ws.posts.filter(x => x.status === 'Review' && !(x.approvalMeta || {}).pmReviewedAt); return { mineId: free[0].id, theirId: free[1].id }; });
  // a teammate saves a change to another campaign while this page is open
  await p.evaluate(id => { const cur = JSON.parse(window.__store['workspace/main'].json); cur.posts.find(x => x.id === id).title = 'Teammate renamed this'; window.__remoteSet('workspace/main', { json: JSON.stringify(cur), updatedAt: new Date().toISOString() }); }, pair.theirId);
  await p.waitForFunction(id => JSON.parse(localStorage.getItem('rsh_growth_command_v1')).posts.find(x => x.id === id).title === 'Teammate renamed this', pair.theirId, { timeout: 6000 }).then(() => ok('A teammate’s save appears in the open page without reloading', true), () => ok('A teammate’s save appears in the open page without reloading', false));
  // both edit at nearly the same time: teammate's save lands silently (no notification), then I save
  await p.click(`[data-review-select="${pair.mineId}"]`);
  await p.fill('#reviewNotes', 'My note while a teammate also saved');
  await p.evaluate(id => { const cur = JSON.parse(window.__store['workspace/main'].json); cur.posts.find(x => x.id === id).hook = 'TEAMMATE HOOK'; window.__store['workspace/main'] = { json: JSON.stringify(cur), updatedAt: new Date().toISOString() }; }, pair.theirId);
  await p.click('#reviewSaveNotes'); await p.waitForTimeout(2600);
  const both = await p.evaluate(ids => { const c = JSON.parse(window.__store['workspace/main'].json), l = JSON.parse(localStorage.getItem('rsh_growth_command_v1')); return { cloudMine: c.posts.find(x => x.id === ids.mineId).approvalMeta.notes, cloudTheirs: c.posts.find(x => x.id === ids.theirId).hook, localTheirs: l.posts.find(x => x.id === ids.theirId).hook, title: c.posts.find(x => x.id === ids.theirId).title }; }, pair);
  ok('Saving at the same time keeps both people’s changes', both.cloudMine === 'My note while a teammate also saved' && both.cloudTheirs === 'TEAMMATE HOOK' && both.localTheirs === 'TEAMMATE HOOK' && both.title === 'Teammate renamed this', JSON.stringify(both));

  // signed final approval
  await p.evaluate(() => document.querySelector('[data-view="approvals"]').click());
  await p.click(`[data-review-select="${withMedia}"]`); await p.waitForSelector('#rshSign');
  await p.waitForFunction(() => /No final approver is registered yet/.test(document.getElementById('rshSign').textContent));
  await p.evaluate(() => { window.__store['signoffs/u_anthony'] = { requestedAt: new Date().toISOString() }; });
  await p.click('#rshSign [data-sign-register="u_owner"]');
  await p.waitForFunction(() => /Final approver: Test Owner \(you\)/.test((document.getElementById('rshSign') || {}).textContent || ''));
  const s1 = await p.evaluate(() => ({ text: document.getElementById('rshSign').textContent, cfg: window.__store['config/approver'], disabled: !!document.querySelector('#rshSign button[disabled]') }));
  ok('The owner can register a final approver, and signing stays blocked until manager review', s1.cfg && s1.cfg.userId === 'u_owner' && /Manager review must be completed first/.test(s1.text) && s1.disabled);
  for (const c of ['reviewCheckAssets', 'reviewCheckFacts', 'reviewCheckRights', 'reviewCheckPlatform']) await p.check('#' + c);
  await p.click('#reviewApprove'); await p.waitForSelector('#rshSign [data-sign-approve]');
  await p.click('#rshSign [data-sign-approve]');
  await p.waitForFunction(() => /Signed by Test Owner/.test((document.getElementById('rshSign') || {}).textContent || ''), null, { timeout: 8000 });
  const s2 = await p.evaluate(id => { const ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')), q = ws.posts.find(x => x.id === id); return { sig: window.__store['signoffs/u_owner/posts/' + id], status: q.status, by: q.approvalMeta.signedBy, log: ws.approvalLog[0].action }; }, withMedia);
  ok('The approver’s own click writes a signature under their identity and approves the campaign', !!s2.sig && /^[0-9a-f]{64}$/.test(s2.sig.hash) && s2.status === 'Approved' && s2.by === 'Test Owner' && /signed from the approver/.test(s2.log), JSON.stringify(s2).slice(0, 200));
  const other = await b.newPage({ viewport: { width: 1300, height: 900 } });
  other.on('pageerror', e => errs.push(e.message));
  await other.addInitScript(s => { window.__preStore = s; }, await p.evaluate(() => window.__store));
  await other.goto('http://127.0.0.1:8792/?as=u_maxine');
  await other.waitForFunction(() => /Connected|mismatch|verified/.test(document.getElementById('rshBuildLabel').textContent) && !document.getElementById('rshHostLoading'));
  await other.evaluate(() => document.querySelector('[data-view="approvals"]').click());
  await other.click(`[data-review-select="${withMedia}"]`).catch(() => {});
  await other.waitForTimeout(600);
  ok('Other people see who the approver is but get no approve button', await other.evaluate(() => { const b = document.getElementById('rshSign'); return !!b && /Signed by Test Owner/.test(b.textContent) && !b.querySelector('[data-sign-approve]') && !b.querySelector('[data-sign-register]'); }), await other.evaluate(() => (document.getElementById('rshSign') || {}).textContent || 'no box').then(t => t.slice(0, 140)));
  await other.close();

  // 24/7 Bots: its own screen, reads campaigns, changes nothing else
  const wsBefore = await p.evaluate(() => localStorage.getItem('rsh_growth_command_v1'));
  await p.click('.nav button[data-view="bots"]');
  const b0 = await p.evaluate(() => ({ active: document.getElementById('view-bots').classList.contains('active'), title: document.getElementById('pageTitle').textContent, text: document.getElementById('rshBots').innerText }));
  ok('24/7 Bots has its own sidebar entry and screen, with the posting step switched off', b0.active && b0.title === '24/7 Bots' && /The office/i.test(b0.text) && /Posting Bot/i.test(b0.text) && /not switched on/i.test(b0.text) && /Run everything/.test(b0.text));
  await p.click('#rshBots [data-bot-tab="setup"]'); await p.selectOption('#rshBotDays', '21'); await p.click('#rshBots [data-bot-tab="office"]');
  await p.click('#rshBots [data-bot-run]'); await p.waitForFunction(() => document.querySelectorAll('#rshBots .log-row').length === 6 && !document.querySelector('#rshBots .desk.working'), null, { timeout: 9000 });
  const b1 = await p.evaluate(() => { const plan = JSON.parse(window.__store['bots/plan'].json), ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')); const approved = ws.posts.filter(x => x.status === 'Approved').map(x => x.id); const it = plan.items; const pin = it.find(i => i.channel === 'pinterest'), bs = it.filter(i => i.channel === 'tiktok'); return { n: it.length, campaigns: new Set(it.map(i => i.postId)).size, ready: it.filter(i => i.ready).length, readyAllApproved: it.filter(i => i.ready).every(i => approved.includes(i.postId)), approvedCount: approved.length, pinLink: /utm_source=pinterest/.test(pin.caption), times: [...new Set(it.map(i => i.time))].sort().join(','), clash: (() => { const s = {}; let c = 0; for (const i of it) { const k = i.date + i.time + i.channel; if (s[k]) c++; s[k] = 1; } return c; })(), ttLen: Math.max(...bs.map(i => i.caption.length)), log: document.querySelector('#rshBots .log').innerText, logRows: [...document.querySelectorAll('#rshBots .log-row strong')].map(x => x.textContent).join(','), flow: document.querySelectorAll('#rshBots .desk.flow').length }; });
  ok('Run everything prepares a caption and time for every campaign and channel', b1.campaigns === 11 && b1.n >= 33 && b1.pinLink && b1.clash === 0 && b1.ttLen <= 600 && /12:00/.test(b1.times), JSON.stringify({ n: b1.n, times: b1.times, ready: b1.ready }));
  ok('The bot log has each bot report in its own voice, and the desks show the flow', b1.logRows === 'Reel,Pixel,Quill,Tempo,Ref,Courier' && /First one: “/.test(b1.log) && /lunch break/.test(b1.log) && /held back/.test(b1.log) && b1.flow === 5, b1.log.replace(/\s+/g, ' ').slice(0, 260));
  const as = await p.evaluate(() => { const ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')).posts, car = ws.find(x => /carousel/i.test(x.postType || '')), B = window.RSH_BOTS; const n = B.assetNeeds(car), img = B.imagePrompt(car), vid = B.videoBrief(car); return { needs: n.needs.map(x => x.state + ':' + x.label).join(' | '), img: /matching set of 3 to 5 images/.test(img) && /do not put any text in the image/.test(img), vid: /vertical 9:16 video/.test(vid) && /No third-party logos/.test(vid) && /No real, identifiable people/.test(vid), rows: document.querySelectorAll('#rshBots .assetrow').length, kit: document.querySelectorAll('#rshBots .assetrow').length, kitHint: /choose Wrestling/.test(document.getElementById('rshBots').textContent), ed: document.querySelectorAll('#rshBots button[data-bot-editor]').length, noLinks: !document.querySelector('a[href*="claude.ai"]'), job: (() => { const j = B.editJob(car); return /^EDIT JOB — /.test(j) && /1080×1920/.test(j) && /SCRIPT/.test(j) && /No third-party logos/.test(j) && /DELIVER/.test(j); })(), btns: document.querySelectorAll('#rshBots [data-bot-prompt]').length, pixel: document.querySelectorAll('#rshBots .log-row')[1].innerText }; });
  ok('Pixel lists the files each campaign needs and writes image and video prompts with the brand rules', /3 to 5 matching/.test(as.needs) && as.img && as.vid && as.rows >= 7 && as.btns === as.rows * 2 && as.kit === as.rows && as.kitHint && as.ed === as.rows && as.job && as.noLinks && /campaigns need files/.test(as.pixel), as.needs + ' · ' + as.pixel.replace(/\s+/g, ' ').slice(0, 150));
  ok('Only posts from fully approved campaigns are marked ready', b1.readyAllApproved && b1.ready > 0 && b1.ready < b1.n, b1.ready + ' ready of ' + b1.n + ' with ' + b1.approvedCount + ' approved campaign(s)');
  ok('Running the bots changes nothing in the campaigns', await p.evaluate(before => localStorage.getItem('rsh_growth_command_v1') === before, wsBefore) && /nothing was sent/.test(b1.log));
  const off = await p.evaluate(() => { const d = [...document.querySelectorAll('#rshBots .desk')]; return { n: d.length, names: d.map(x => x.querySelector('h4').textContent).join(','), moods: d.map(x => x.querySelector('.mood').textContent).join(','), ref: d[4].querySelector('.say').textContent, asleep: d.filter(x => x.classList.contains('asleep')).length, svg: d.every(x => !!x.querySelector('span.bot .head')) && !document.querySelector('svg') }; });
  ok('The office shows seven bots with moods taken from the real numbers', off.n === 7 && off.names === 'Pixel,Reel,Quill,Tempo,Ref,Courier,Night Owl' && /Busy,Ready,Proud,Worried,Strict,Asleep,Asleep/.test(off.moods) && /holding back \d+ of \d+ posts/.test(off.ref) && off.asleep === 2 && off.svg, off.moods + ' · ' + off.ref);
  const org = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('#rshBots .tabs button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).join(' | '), officeShown: !document.querySelector('#rshBots [data-bot-panel="office"]').hidden, planHidden: document.querySelector('#rshBots [data-bot-panel="plan"]').hidden }));
  await p.click('#rshBots [data-bot-tab="plan"]');
  const org2 = await p.evaluate(() => ({ camps: document.querySelectorAll('#rshBots details.camp').length, open: document.querySelectorAll('#rshBots details.camp[open]').length, filters: [...document.querySelectorAll('#rshBots .filters button')].map(b => b.textContent).join(' | '), planShown: !document.querySelector('#rshBots [data-bot-panel="plan"]').hidden }));
  ok('The Bots screen is organised into Office, Plan and Setup, and the plan lists campaigns collapsed', /^Office \| Plan \d+ of \d+ ready \| Setup$/.test(org.tabs) && org.officeShown && org.planHidden && org2.planShown && org2.camps === 11 && org2.open === 0 && /^All 11/.test(org2.filters), org.tabs + ' · ' + org2.filters);
  await p.click('#rshBots [data-bot-filter="files"]');
  const nf = await p.evaluate(() => document.querySelectorAll('#rshBots details.camp').length);
  await p.click('#rshBots [data-bot-filter="all"]'); await p.click('#rshBots [data-bot-expand]');
  ok('The plan can be filtered by status and expanded', nf > 0 && nf < 11 && await p.evaluate(() => document.querySelectorAll('#rshBots details.camp[open]').length === 11), nf + ' need files');
  await p.click('#rshBots [data-bot-edit]'); await p.fill('#rshBots textarea', 'Hand-written caption'); await p.click('#rshBots [data-bot-savecap]'); await p.waitForTimeout(200);
  await p.click('#rshBots [data-bot-run]'); await p.waitForTimeout(500);
  // Reel: one click sends the job to the editor session; the finished video is attached when it reports back
  const vid = (await WS(p)).posts.find(x => !(x.creativeAssets || []).length && !x.creativeAsset).id;
  await p.click(`#rshBots [data-bot-askvideo="${vid}"]`); await p.waitForTimeout(700);
  const sent = await p.evaluate(id => ({ calls: window.__sent || [], job: window.__store['editJobs/' + id] }), vid);
  ok('Reel sends the edit job to the RSH SPORTS session without any copying', sent.calls.length === 1 && sent.calls[0].tool === 'send_message' && sent.calls[0].input.session_id === 'session_01EomsW2MJWVwshJ5YMhGGBP' && /EDIT JOB/.test(sent.calls[0].input.message) && /editJobs/.test(sent.calls[0].input.message) && sent.job && sent.job.status === 'sent', JSON.stringify(sent.job).slice(0, 140));
  await p.evaluate(async id => { const bytes = new Uint8Array(3000); bytes.set([0, 0, 0, 24, 102, 116, 121, 112], 0); await fetch('/__put/' + 'ab'.repeat(16), { method: 'POST', body: new Blob([bytes], { type: 'video/mp4' }) }); window.__store['editJobs/' + id] = { ...window.__store['editJobs/' + id], status: 'done', assetId: 'ab'.repeat(16), mime: 'video/mp4', bytes: 3000, name: 'edited.mp4' }; await window.RSH_BOTS.collect(); }, vid);
  await p.waitForTimeout(600);
  const back = await p.evaluate(id => ({ files: (JSON.parse(localStorage.getItem('rsh_growth_command_v1')).posts.find(x => x.id === id).creativeAssets || []).map(a => a.id + ':' + a.mime), status: window.__store['editJobs/' + id].status, calls: (window.__sent || []).length }), vid);
  ok('When the editor reports back, the video is attached to its campaign and not sent twice', back.files.join() === 'ab'.repeat(16) + ':video/mp4' && back.status === 'attached' && back.calls === 1, JSON.stringify(back));
  // a zip with a script and every file goes to Reel as one job; a split video comes back and is attached
  if (JSZIP) {
    const JSZipNode = require(JSZIP.replace(/dist\/jszip\.min\.js$/, ''));
    const z = new JSZipNode();
    z.file('Script.txt', 'SCENE 1: athlete laces shoes. VO: "Every match starts before the whistle."\nSCENE 2: team huddle.');
    const mp4 = Buffer.alloc(20000); Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]).copy(mp4); z.file('clips/clip1.mp4', mp4);
    z.file('music.mp3', Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7) % 251)));
    z.file('__MACOSX/._clip1.mp4', 'junk');
    const zipBytes = [...await z.generateAsync({ type: 'nodebuffer' })];
    const zc = await p.evaluate(() => { const ws = JSON.parse(localStorage.getItem('rsh_growth_command_v1')).posts; const busy = Object.keys(window.__store).filter(k => k.startsWith('editJobs/')).map(k => k.slice(9)); return ws.find(x => !(x.creativeAssets || []).length && !x.creativeAsset && !busy.includes(x.id)).id; });
    await p.click('#rshBots [data-bot-tab="office"]');
    await p.selectOption('#rshBots [data-bot-dropcamp]', zc);
    await p.evaluate(bytes => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], 'Pre-match video.zip', { type: 'application/zip' })); document.querySelector('#rshBots [data-bot-drop]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); }, zipBytes);
    await p.waitForFunction(id => (window.__store['editJobs/' + id] || {}).status === 'sent', zc, { timeout: 12000 }).catch(() => {});
    const zj = await p.evaluate(id => { const j = window.__store['editJobs/' + id] || {}; const m = JSON.parse(j.manifest || '[]'); const msg = ((window.__sent || []).slice(-1)[0] || { input: {} }).input.message || ''; return { status: j.status, files: m.map(f => f.name + ':' + f.encoding).join(','), msg: /SCRIPT \(Script\.txt\):\nSCENE 1: athlete laces shoes/.test(msg) && /path set to the asset id/.test(msg) && /base64/.test(msg) && m.every(f => msg.includes(f.parts[0].id)), dropmsg: document.querySelector('#rshBots [data-bot-dropmsg]').textContent }; }, zc);
    ok('A zip with a script and files is stored and sent to the editor as one job, without copying', zj.status === 'sent' && zj.files === 'Script.txt:raw,clips/clip1.mp4:raw,music.mp3:base64' && zj.msg && /Stored 3 files/.test(zj.dropmsg), JSON.stringify(zj).slice(0, 260));
    await p.evaluate(async id => { const ids = ['cd'.repeat(16), 'ef'.repeat(16)]; const a = new Uint8Array(4000); a.set([0, 0, 0, 24, 102, 116, 121, 112], 0); const bb = new Uint8Array(2500).fill(9); await fetch('/__put/' + ids[0], { method: 'POST', body: a }); await fetch('/__put/' + ids[1], { method: 'POST', body: bb }); window.__store['editJobs/' + id] = { ...window.__store['editJobs/' + id], status: 'done', assetId: ids[0], parts: [{ id: ids[0], start: 0, end: 4000 }, { id: ids[1], start: 4000, end: 6500 }], mime: 'video/mp4', bytes: 6500, name: 'final.mp4' }; await window.RSH_BOTS.collect(); }, zc);
    const zb = await p.evaluate(id => { const a = (JSON.parse(localStorage.getItem('rsh_growth_command_v1')).posts.find(x => x.id === id).creativeAssets || [])[0] || {}; return { parts: (a.parts || []).length, mime: a.mime, status: window.__store['editJobs/' + id].status }; }, zc);
    ok('The finished video comes back in pieces and is attached to its campaign as one video', zb.parts === 2 && zb.mime === 'video/mp4' && zb.status === 'attached', JSON.stringify(zb));
    const nv = await p.evaluate(() => ({ office: [...document.querySelectorAll('#rshBots .nv')].map(x => x.textContent).join(' | '), home: document.getElementById('rshQuick').textContent }));
    ok('A returned video is announced in the office and on Home', /New video ready to review/.test(nv.office) && /2 new videos to review/.test(nv.home), nv.home.slice(0, 80));
    await p.click(`#rshBots [data-bot-watch="${zc}"]`); await p.waitForTimeout(1500);
    const rv2 = await p.evaluate(id => ({ onReviews: document.getElementById('view-approvals').classList.contains('active'), selected: !!document.querySelector(`#approvalQueue [data-review-select="${id}"].active`), video: !!document.querySelector('#reviewMediaGallery video'), reviewed: window.__store['editJobs/' + id].reviewed === true, home: document.getElementById('rshQuick').textContent }), zc);
    ok('Watch and review opens Reviews on that campaign with the video, and marks it seen', rv2.onReviews && rv2.selected && rv2.video && rv2.reviewed && /1 new video to review/.test(rv2.home), JSON.stringify(rv2).slice(0, 200));
    await p.click('.nav button[data-view="bots"]');
  } else console.log('SKIP  zip job tests (set JSZIP_PATH)');
  // dropping a file on the Bots screen attaches it to the chosen campaign and wakes the team
  await p.click('#rshBots [data-bot-tab="office"]');
  await p.waitForFunction(() => !document.querySelector('#rshBots .desk.working') && !/Running/.test(document.querySelector('#rshBots [data-bot-run]').textContent), null, { timeout: 9000 });
  const wk = (await WS(p)).posts.find(x => !(x.creativeAssets || []).length && !x.creativeAsset);
  const planAt = await p.evaluate(() => JSON.parse(window.__store['bots/plan'].json).generatedAt);
  await p.selectOption('#rshBots [data-bot-dropcamp]', wk.id);
  await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#135'; g.fillRect(0, 0, 640, 640); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'wake-photo.png', { type: 'image/png' })); const z = document.querySelector('#rshBots [data-bot-drop]'); z.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); });
  await p.waitForFunction(() => /Attached to/.test((document.querySelector('#rshBots [data-bot-dropmsg]') || {}).textContent || ''), null, { timeout: 9000 }).catch(() => {});
  const dropped = await p.evaluate(id => ({ n: (JSON.parse(localStorage.getItem('rsh_growth_command_v1')).posts.find(x => x.id === id).creativeAssets || []).length, msg: document.querySelector('#rshBots [data-bot-dropmsg]').textContent, onBots: document.getElementById('view-bots').classList.contains('active') }), wk.id);
  ok('Dropping a file on the Bots screen attaches it to the chosen campaign', dropped.n === 1 && /Attached to/.test(dropped.msg) && dropped.onBots, dropped.msg);
  await p.waitForFunction(() => /The team got to work/.test(document.getElementById('rshBots').innerText) && !document.querySelector('#rshBots .desk.working'), null, { timeout: 9000 }).catch(() => {});
  const woke = await p.evaluate(a => ({ text: document.querySelector('#rshBots .office-top').innerText, newer: JSON.parse(window.__store['bots/plan'].json).generatedAt > a }), planAt);
  ok('Attaching a file to a campaign makes the bots run by themselves', /New file on/.test(woke.text) && woke.newer, woke.text);
  ok('A caption edited by hand is kept when the bots run again', await p.evaluate(() => { const it = JSON.parse(window.__store['bots/plan'].json).items[0]; return it.caption === 'Hand-written caption' && it.edited; }));

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
  const nm = await open(1200, 800, '?empty&nometricool');
  await nm.waitForTimeout(800);
  ok('Without the connector the panel explains itself instead of showing numbers', await nm.evaluate(() => /No live results loaded yet/.test(document.getElementById('rshLive').innerText)));
  await nm.close();
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
