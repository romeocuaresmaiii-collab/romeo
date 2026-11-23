/* RSH Sports Marketing OS — artifact host layer.
 *
 * The local app talks to server.py. Inside a Claude artifact there is no server, so this
 * layer answers the same requests from the artifact's own private storage:
 *   - workspace      -> one document in the artifact database (plus a browser copy)
 *   - Data Vault     -> revision documents in the artifact database
 *   - media uploads  -> the artifact's file store
 *   - file exports   -> the viewer's save prompt
 * Nothing here publishes, schedules or sends anything to Metricool or any social network.
 */
(function () {
  'use strict';
  const VERSION = '__APP_VERSION__';
  const KEY = 'rsh_growth_command_v1';
  const BUNDLED_MEDIA = __BUNDLED_MEDIA__;       // id -> relative file published beside the page
  const WEEKLY_PACKS = __WEEKLY_PACKS__;         // read-only weekly evidence packs shipped with the app
  const MEDIA_TYPES = { 'image/jpeg': 12e6, 'image/png': 12e6, 'image/webp': 12e6, 'video/mp4': 120e6, 'video/webm': 120e6 };
  // The file store takes at most 20 MiB per file, so larger videos are stored in parts and joined for playback.
  const PART_BYTES = window.__RSH_TEST_PART_BYTES || 16 * 1024 * 1024;
  const VAULT_KEEP = 12;

  let db = null, assets = null, downloads = null;
  const mem = {};
  const ls = {
    get(k) { try { const v = localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : null) : v; } catch (_) { return k in mem ? mem[k] : null; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (_) {} },
  };

  /* ---------- small UI pieces: toast, sync pill, confirm banner, text prompt ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #rshHostToast{position:fixed;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:#1d1d1f;color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;line-height:1.4;z-index:10050;box-shadow:0 8px 28px rgba(0,0,0,.22)}
  #rshHostConfirm{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);width:min(620px,calc(100vw - 32px));background:#fff;color:#1d1d1f;border:1px solid #d2d2d7;border-left:4px solid #b45309;padding:14px 16px;border-radius:12px;font-size:13px;line-height:1.45;z-index:10060;box-shadow:0 10px 34px rgba(0,0,0,.18)}
  #rshHostConfirm strong{display:block;margin-bottom:4px}
  #rshHostConfirm button{margin-top:10px;border:1px solid #d2d2d7;background:#f5f5f7;color:#1d1d1f;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}
  #rshSyncPill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid #d2d2d7;background:#fff;color:#515154;font-size:11px;font-weight:700;white-space:nowrap}
  #rshSyncPill[data-state="saved"]{color:#1a7f37;border-color:#b7e1c0;background:#f1faf3}
  #rshSyncPill[data-state="saving"]{color:#515154}
  #rshSyncPill[data-state="error"]{color:#b42318;border-color:#f3c4bf;background:#fff5f4}
  #rshHostLoading{position:fixed;inset:0;background:rgba(245,245,247,.94);display:flex;align-items:center;justify-content:center;z-index:10040;font-size:15px;font-weight:600;color:#1d1d1f}
  #rshHostAsk{position:fixed;inset:0;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;z-index:10070;padding:16px}
  #rshHostAsk form{background:#fff;color:#1d1d1f;border-radius:16px;padding:20px;width:min(520px,100%);box-shadow:0 18px 50px rgba(0,0,0,.25)}
  #rshHostAsk label{display:block;font-weight:700;font-size:14px;margin-bottom:10px}
  #rshHostAsk textarea{width:100%;box-sizing:border-box;min-height:110px;border:1px solid #d2d2d7;border-radius:10px;padding:10px;font:inherit;font-size:13px;color:#1d1d1f;background:#fff}
  #rshHostAsk .row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
  #rshHostAsk button{border:1px solid #d2d2d7;background:#f5f5f7;color:#1d1d1f;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer}
  #rshHostAsk button[type=submit]{background:#0071e3;border-color:#0071e3;color:#fff}`;
  document.head.appendChild(css);

  let toastTimer = null;
  function toast(text, ms) {
    let t = document.getElementById('rshHostToast');
    if (!t) { t = document.createElement('div'); t.id = 'rshHostToast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = String(text); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms || 5200);
  }

  function pill(state, text) {
    let p = document.getElementById('rshSyncPill');
    if (!p) {
      const anchor = document.getElementById('rshBuildLabel'); if (!anchor) return;
      p = document.createElement('span'); p.id = 'rshSyncPill'; p.setAttribute('role', 'status'); anchor.insertAdjacentElement('afterend', p);
    }
    p.dataset.state = state; p.textContent = text;
  }

  // Artifact frames never show confirm()/alert()/prompt(). Confirmation becomes a visible
  // two-step: the first click explains what will happen, repeating the same action confirms it.
  let armed = { msg: null, until: 0 }, confirmTimer = null;
  function hideConfirm() { const b = document.getElementById('rshHostConfirm'); if (b) b.hidden = true; }
  window.confirm = function (message) {
    const msg = String(message || 'Are you sure?'), now = Date.now();
    if (armed.msg === msg && now < armed.until) { armed = { msg: null, until: 0 }; hideConfirm(); return true; }
    armed = { msg, until: now + 20000 };
    let b = document.getElementById('rshHostConfirm');
    if (!b) {
      b = document.createElement('div'); b.id = 'rshHostConfirm'; b.setAttribute('role', 'alertdialog');
      b.innerHTML = '<strong>Please confirm</strong><div data-msg></div><div style="margin-top:6px;font-weight:700">Do the same action again within 20 seconds to confirm.</div><button type="button">Cancel</button>';
      b.querySelector('button').addEventListener('click', () => { armed = { msg: null, until: 0 }; hideConfirm(); });
      document.body.appendChild(b);
    }
    b.querySelector('[data-msg]').textContent = msg; b.hidden = false;
    clearTimeout(confirmTimer); confirmTimer = setTimeout(hideConfirm, 20000);
    return false;
  };
  window.alert = function (message) { toast(message, 8000); };
  window.prompt = function () { return null; };

  function ask(label, initial) {
    return new Promise(resolve => {
      const wrap = document.createElement('div'); wrap.id = 'rshHostAsk';
      wrap.innerHTML = '<form><label for="rshHostAskText"></label><textarea id="rshHostAskText"></textarea><div class="row"><button type="button" data-cancel>Cancel</button><button type="submit">Save</button></div></form>';
      wrap.querySelector('label').textContent = label;
      const ta = wrap.querySelector('textarea'); ta.value = initial || '';
      const done = v => { wrap.remove(); resolve(v); };
      wrap.querySelector('[data-cancel]').addEventListener('click', () => done(null));
      wrap.querySelector('form').addEventListener('submit', e => { e.preventDefault(); done(ta.value); });
      document.body.appendChild(wrap); ta.focus();
    });
  }

  /* ---------- workspace persistence (safe for several people at once) ----------
   * Everyone shares one saved workspace. Before saving, this browser reads the saved copy; if a
   * teammate saved in the meantime, the two sets of changes are merged record by record (campaign
   * by campaign, field by field) instead of one overwriting the other. Other people's saves are
   * also picked up while the page is open. Only when two people change the SAME field of the SAME
   * record does one value win (the later save).
   */
  const WS_DOC = 'workspace/main', BASE = KEY + ':base';
  let pendingJson = null, writing = false, saveTimer = null, remoteWaiting = null, lastWritten = null;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const idList = v => Array.isArray(v) && v.length > 0 && v.every(x => isObj(x) && typeof x.id === 'string');

  function mergeFields(b, m, t) {                       // one record: field-by-field
    const out = {}; for (const k of new Set(Object.keys(m).concat(Object.keys(t)))) {
      const inM = k in m, inT = k in t, inB = b && k in b;
      if (inM && inT) out[k] = same(m[k], b ? b[k] : undefined) ? t[k] : m[k];
      else if (inM) { if (!inB || !same(m[k], b[k])) out[k] = m[k]; }          // they removed it; keep only if I changed it
      else { if (!inB || !same(t[k], b[k])) out[k] = t[k]; }                    // I removed it; keep only if they changed it
    } return out;
  }
  function mergeValue(b, m, t) {
    if (same(m, b)) return t; if (same(t, b)) return m; if (same(m, t)) return m;
    if ((idList(m) || (Array.isArray(m) && !m.length)) && (idList(t) || (Array.isArray(t) && !t.length))) {
      const bm = new Map((idList(b) ? b : []).map(x => [x.id, x])), tm = new Map(t.map(x => [x.id, x])), mm = new Map(m.map(x => [x.id, x])), out = [];
      for (const x of m) { const bi = bm.get(x.id), ti = tm.get(x.id); if (ti) out.push(bi ? mergeFields(bi, x, ti) : x); else if (!bi || !same(x, bi)) out.push(x); }
      for (const x of t) { if (mm.has(x.id)) continue; const bi = bm.get(x.id); if (!bi || !same(x, bi)) out.push(x); }
      return out;
    }
    if (Array.isArray(m) && Array.isArray(t)) {         // lists without ids (logs, notes): keep everyone's new entries
      const key = x => JSON.stringify(x), mine = new Set(m.map(key)), base = new Set((Array.isArray(b) ? b : []).map(key));
      return t.filter(x => !mine.has(key(x)) && !base.has(key(x))).concat(m);
    }
    if (isObj(m) && isObj(t)) { const out = {}; for (const k of new Set(Object.keys(m).concat(Object.keys(t)))) { const v = mergeValue(isObj(b) ? b[k] : undefined, m[k], t[k]); if (v !== undefined) out[k] = v; } return out; }
    return m;
  }
  function merge3(base, mine, theirs) {
    if (!base) {                                        // no common starting point known: keep their copy, add my records it lacks
      const out = { ...theirs };
      for (const k of Object.keys(mine)) if (!(k in theirs)) out[k] = mine[k]; else if (idList(mine[k]) && Array.isArray(theirs[k])) { const have = new Set(theirs[k].map(x => x && x.id)); out[k] = theirs[k].concat(mine[k].filter(x => !have.has(x.id))); }
      return out;
    }
    return mergeValue(base, mine, theirs);
  }
  const parse = j => { try { return JSON.parse(j); } catch (_) { return null; } };
  const typing = () => { const a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };

  function persist(key, json) {
    ls.set(key, json);
    if (key !== KEY) return;
    if (json === ls.get(BASE)) { ls.set(KEY + ':dirty', ''); return; }       // nothing new compared with the saved copy
    ls.set(KEY + ':dirty', '1');
    if (!db) { pill('error', 'Saved in this browser only'); return; }
    pendingJson = json; pill('saving', 'Saving…');
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1500);
  }
  // Put a workspace into the running app (a teammate's save, or a merge result).
  function adopt(json, message) {
    const obj = parse(json); if (!obj) return false;
    ls.set(BASE, json); ls.set(KEY, json); ls.set(KEY + ':dirty', '');
    if (window.RSH_APP && window.RSH_APP.load) { if (!window.RSH_APP.load(obj)) return false; }
    if (message) toast(message, 4500);
    return true;
  }
  async function flush() {
    if (writing || pendingJson === null || !db) return;
    writing = true; let json = pendingJson; pendingJson = null; let merged = false;
    try {
      const snap = await withTimeout(db.doc(WS_DOC).get(), 10000), body = snap.exists ? snap.data() : null, theirs = body && typeof body.json === 'string' ? body.json : null;
      const baseJson = ls.get(BASE);
      if (theirs && theirs !== baseJson && theirs !== json) {            // a teammate saved since this browser last synced
        const m = merge3(parse(baseJson), parse(json), parse(theirs));
        if (m) { const mj = JSON.stringify(m); merged = mj !== json; json = mj; }
      }
      if (json.length > 240000) throw Object.assign(new Error('too large'), { code: 'too_large' });
      lastWritten = json;
      await db.doc(WS_DOC).set({ json, updatedAt: new Date().toISOString(), appVersion: VERSION });
      ls.set(BASE, json);
      if (merged && pendingJson === null) adopt(json, 'A teammate’s changes were merged with yours.');
      if (pendingJson === null) { ls.set(KEY + ':dirty', ''); pill('saved', 'Saved · team copy up to date'); }
    } catch (e) {
      const why = e && e.code === 'too_large' ? 'Workspace is too large to save here' : (e && (e.code === 'permission_denied' || e.code === 'not_granted')) ? 'View only: changes are not saved' : 'Not saved yet: will retry on your next change';
      pill('error', why);
      if (pendingJson === null && !(e && (e.code === 'too_large' || e.code === 'permission_denied' || e.code === 'not_granted'))) pendingJson = ls.get(KEY);
    } finally {
      writing = false;
      if (pendingJson !== null && ls.get(KEY + ':dirty')) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1500); }
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pendingJson !== null) { clearTimeout(saveTimer); flush(); } });

  // A teammate saved while this page is open.
  function onRemote(json) {
    if (!json || json === ls.get(BASE) || json === lastWritten) return;
    if (pendingJson !== null || writing || ls.get(KEY + ':dirty')) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 300); return; }   // I have edits: merge on save
    if (typing()) { remoteWaiting = json; pill('saving', 'Teammate update waiting…'); return; }                                            // do not redraw under someone typing
    remoteWaiting = null;
    if (adopt(json, 'Updated with a teammate’s changes.')) pill('saved', 'Saved · team copy up to date');
  }
  document.addEventListener('focusout', () => { if (remoteWaiting) setTimeout(() => { if (remoteWaiting && !typing()) onRemote(remoteWaiting); }, 400); });
  function watchTeam() {
    if (!db) return;
    try { db.doc(WS_DOC).onSnapshot(snap => { if (!snap.exists || (snap.metadata && snap.metadata.hasPendingWrites)) return; const d = snap.data(); if (d && typeof d.json === 'string') onRemote(d.json); }, () => {}); } catch (_) {}
  }

  async function hydrate() {
    if (!db) return 'browser';
    let snap;
    try { snap = await withTimeout(db.doc(WS_DOC).get(), 10000); } catch (_) { return 'unreachable'; }
    const body = snap && snap.exists ? snap.data() : null, cloud = body && typeof body.json === 'string' && parse(body.json) ? body.json : null;
    const local = ls.get(KEY), dirty = !!ls.get(KEY + ':dirty');
    if (local && dirty && cloud) {                      // unsaved edits from this browser: merge them into the team copy, never overwrite it
      const m = merge3(parse(ls.get(BASE)), parse(local), parse(cloud));
      if (m) { const mj = JSON.stringify(m); ls.set(KEY, mj); ls.set(BASE, cloud); if (mj === cloud) { ls.set(KEY + ':dirty', ''); return 'cloud'; } pendingJson = mj; return 'local-newer'; }
    }
    if (cloud) { ls.set(KEY, cloud); ls.set(BASE, cloud); ls.set(KEY + ':dirty', ''); return 'cloud'; }
    if (body && typeof body.json === 'string') return 'cloud-invalid';
    if (local) { pendingJson = local; return 'local-only'; }
    return 'empty';
  }

  /* ---------- Data Vault (revision history) ---------- */
  const vaultId = n => 'r' + String(n).padStart(8, '0');
  async function vaultRows() {
    const q = await db.collection('vault').orderBy('revision', 'desc').limit(VAULT_KEEP + 8).get();
    return q.docs.map(x => x.data()).filter(r => r && typeof r.revision === 'number');
  }
  const vaultValid = d => !!(d && typeof d === 'object' && d.settings && typeof d.settings === 'object' && d.tasks && typeof d.tasks === 'object' && Array.isArray(d.posts) && Array.isArray(d.metrics) && Array.isArray(d.competitors));

  /* ---------- media ---------- */
  const partSets = new Map(), joined = new Map();
  function mediaUrl(a) {
    const id = a && a.id ? String(a.id) : '';
    if (BUNDLED_MEDIA[id]) return BUNDLED_MEDIA[id];
    if (a && a.store === 'db') { partSets.set(id, { db: true }); return '#rsh-parts-' + id; }
    if (a && Array.isArray(a.parts) && a.parts.length > 1) { partSets.set(id, { parts: a.parts, mime: a.mime || 'video/mp4' }); return '#rsh-parts-' + id; }
    return '/_blob/' + encodeURIComponent(id);
  }
  // A video stored in parts: download the parts, join them, and hand the player one local URL.
  function joinParts(id) {
    if (joined.has(id)) return joined.get(id);
    const set = partSets.get(id);
    const job = (async () => {
      if (set.db) return loadFromDatabase(id);
      const pieces = []; let have = 0;
      for (const part of set.parts) {
        const resp = await realFetch('/_blob/' + encodeURIComponent(part.id));
        if (!resp.ok) throw new Error('part missing');
        const buf = await resp.arrayBuffer();
        const skip = Math.max(0, have - part.start);          // drop bytes already covered by the previous part
        pieces.push(skip ? buf.slice(skip) : buf); have = part.end;
      }
      return URL.createObjectURL(new Blob(pieces, { type: set.mime }));
    })();
    joined.set(id, job); job.catch(() => joined.delete(id));
    return job;
  }
  function wirePartMedia(el) {
    for (const attr of ['src', 'href']) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (!v || v.indexOf('#rsh-parts-') !== 0) continue;
      const id = v.slice('#rsh-parts-'.length);
      el.removeAttribute(attr);
      if (!partSets.has(id)) continue;
      if (el.tagName === 'VIDEO') el.title = 'Loading video…';
      joinParts(id).then(url => { el.setAttribute(attr, url); if (el.tagName === 'VIDEO') { el.title = ''; el.load(); } }, () => { if (el.tagName === 'VIDEO') el.title = 'This video could not be loaded'; toast('A file could not be loaded from storage. Reload the page and try again.'); });
    }
  }
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'attributes') wirePartMedia(m.target);
      else for (const n of m.addedNodes) if (n.nodeType === 1) { wirePartMedia(n); n.querySelectorAll && n.querySelectorAll('[src^="#rsh-parts-"],[href^="#rsh-parts-"]').forEach(wirePartMedia); }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });
  function referenced(workspace) {
    const seen = new Set();
    for (const p of (workspace.posts || [])) for (const a of [p && p.creativeAsset].concat(Array.isArray(p && p.creativeAssets) ? p.creativeAssets : [])) if (a && typeof a.id === 'string' && a.store !== 'db') { seen.add(a.id); for (const part of (Array.isArray(a.parts) ? a.parts : [])) if (part && typeof part.id === 'string') seen.add(part.id); }
    return [...seen];
  }

  /* ---------- storing a file ---------- */
  const SKIP_KEY = 'rsh:fileStoreFailedAt';      // after a failure, go straight to the database for a day
  const DB_VIDEO_MAX = 30e6, DB_CHUNK = 120000;
  const limit = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej({ code: 'timed_out', message: 'no answer after ' + Math.round(ms / 1000) + ' s' }), ms))]);

  async function storeInFileStore(file, mime) {
    if (!assets && window.claude && typeof window.claude.use === 'function') { try { assets = await limit(window.claude.use('assets'), 8000); } catch (_) {} }
    if (!assets) throw { code: 'assets_null', message: 'no file store in this view' };
    const putOne = async blob => {
      for (let attempt = 0; ; attempt++) {
        try { const r = await limit(assets.upload(blob, { type: mime }), 20000 + blob.size / 100); if (!r || typeof r.id !== 'string') throw { code: 'no_id' }; return r; }
        catch (e) { if (attempt === 0 && e && e.code === 'store_unavailable') { await new Promise(res => setTimeout(res, 1500)); continue; } throw e; }
      }
    };
    if (file.size <= PART_BYTES) { const r = await putOne(new Blob([await file.arrayBuffer()], { type: mime })); return { id: r.id }; }
    const stored = [];
    try {
      let start = 0;
      while (start < file.size) {
        // A part must not begin with markup-looking bytes, or the store refuses it as a video.
        for (;;) { const head = new Uint8Array(await file.slice(start, Math.min(file.size, start + 64)).arrayBuffer()); let i = 0; while (i < head.length && (head[i] === 32 || (head[i] >= 9 && head[i] <= 13))) i++; if (stored.length && head[i] === 60 && start > 1) { start--; continue; } break; }
        const end = Math.min(file.size, start + PART_BYTES);
        if (window.RSH_HOST.onUploadProgress) window.RSH_HOST.onUploadProgress(start, file.size);
        const r = await putOne(new Blob([await file.slice(start, end).arrayBuffer()], { type: mime }));
        stored.push({ id: r.id, start, end }); start = end;
      }
      return { id: stored[0].id, parts: stored };
    } catch (e) { for (const x of stored) { try { await assets.delete(x.id); } catch (_) {} } throw e; }
  }

  async function reviewCopy(file) {            // large photos are saved as a high-quality review copy
    if (file.size <= 700000) return file;
    try {
      const bmp = await createImageBitmap(file); const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
      const out = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.86));
      return out && out.size < file.size ? out : file;
    } catch (_) { return file; }
  }
  function b64(bytes) { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
  function unb64(text) { const bin = atob(text), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  const chunkId = n => 'c' + String(n).padStart(5, '0');

  async function storeInDatabase(file, mime) {
    if (!db) throw { code: 'no_db' };
    let blob = file;
    if (mime.startsWith('image/')) blob = await reviewCopy(file);
    else if (file.size > DB_VIDEO_MAX) throw { code: 'video_too_large' };
    const type = blob.type || mime;
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    const total = Math.ceil(blob.size / DB_CHUNK); let next = 0, finished = 0;
    const worker = async () => {
      while (next < total) {
        const n = next++;
        const bytes = new Uint8Array(await blob.slice(n * DB_CHUNK, (n + 1) * DB_CHUNK).arrayBuffer());
        await db.doc('media/' + id + '/chunks/' + chunkId(n)).set({ n, data: b64(bytes) });
        finished++; if (total > 4 && window.RSH_HOST.onUploadProgress) window.RSH_HOST.onUploadProgress(finished, total);
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
      await db.doc('media/' + id).set({ mime: type, bytes: blob.size, chunks: total, name: String(file.name || 'upload').slice(0, 130), originalBytes: file.size, at: new Date().toISOString() });
    } catch (e) {
      for (let n = 0; n < total; n++) { try { await db.doc('media/' + id + '/chunks/' + chunkId(n)).delete(); } catch (_) {} }
      throw e;
    }
    return { id, store: 'db' };
  }
  async function loadFromDatabase(id) {
    const meta = await db.doc('media/' + id).get();
    if (!meta.exists) throw new Error('not found');
    const info = meta.data(), pieces = new Array(info.chunks); let next = 0;
    const worker = async () => { while (next < info.chunks) { const n = next++; const s = await db.doc('media/' + id + '/chunks/' + chunkId(n)).get(); if (!s.exists) throw new Error('part missing'); pieces[n] = unb64(s.data().data); } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return URL.createObjectURL(new Blob(pieces, { type: info.mime }));
  }

  /* ---------- request router (replaces server.py) ---------- */
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const NEED_DB = 'Shared storage is not available in this view. Open the artifact while signed in to Claude.';
  const LOCAL_ONLY = 'Complete ZIP backup and restore run in the local Python app. In this artifact your workspace and media are saved automatically; use the JSON backup for a copy of the campaign data';

  async function route(path, query, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (path === '/api/app-info') return json(200, { app: 'RSH Sports Marketing OS', version: VERSION, server: 'artifact', mediaSupported: !!assets, directMetricoolSync: false });
    if (path === '/api/status') return json(200, { server: 'artifact', aiConfigured: false, model: '', appVersion: VERSION });
    if (path === '/api/reports/inbox') return json(200, { packs: WEEKLY_PACKS, rejected: [], scannedLocations: ['Packs shipped with this artifact'], liveMetricoolSync: false });
    if (path === '/api/generate') return json(503, { error: 'Live AI generation is not configured in this artifact. Use the free manual bridge.' });

    if (path === '/api/vault/status') {
      if (!db) return json(500, { error: NEED_DB });
      const rows = await vaultRows();
      return json(200, { available: true, latestRevision: rows[0] ? rows[0].revision : 0, updatedAt: rows[0] ? rows[0].created : null, revisions: rows.slice(0, VAULT_KEEP).map(r => ({ revision: r.revision, at: r.created, bytes: (r.json || '').length })), location: "This artifact's private storage; not shared team storage" });
    }
    if (path === '/api/vault/load') {
      if (!db) return json(500, { error: NEED_DB });
      const want = query.get('revision'); let row;
      if (want) { const s = await db.doc('vault/' + vaultId(Number(want))).get(); row = s.exists ? s.data() : null; }
      else row = (await vaultRows())[0];
      if (!row) return json(404, { error: 'No saved workspace for that revision' });
      return json(200, { revision: row.revision, savedAt: row.created, data: JSON.parse(row.json) });
    }
    if (path === '/api/vault/save' && method === 'POST') {
      if (!db) return json(500, { error: NEED_DB });
      const item = JSON.parse(init.body);
      if (!Number.isInteger(item.baseRevision) || item.baseRevision < 0) return json(400, { error: 'Invalid base revision' });
      if (!vaultValid(item.data)) return json(400, { error: 'Invalid workspace format' });
      const content = JSON.stringify(item.data);
      if (content.length > 240000) return json(413, { error: 'Workspace is too large for one saved revision here (about 240 KB).' });
      const rows = await vaultRows(); const latest = rows[0] ? rows[0].revision : 0;
      if (latest !== item.baseRevision) return json(409, { error: 'Saved data changed since this browser loaded it. Load the vault before saving.', latestRevision: latest });
      const revision = latest + 1, at = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
      await db.doc('vault/' + vaultId(revision)).set({ revision, created: at, json: content });
      for (const old of rows.slice(VAULT_KEEP - 1)) { try { await db.doc('vault/' + vaultId(old.revision)).delete(); } catch (_) {} }
      return json(200, { ok: true, revision, savedAt: at });
    }

    if (path === '/api/media' && method === 'POST') {
      const file = init.body, mime = (file && file.type || '').toLowerCase();
      if (mime === 'video/quicktime') return json(415, { error: 'MOV videos cannot be stored in this artifact. Export the video as MP4 and attach that' });
      if (!(file instanceof Blob) || !(mime in MEDIA_TYPES)) return json(415, { error: 'Attach PNG, JPEG, WebP, MP4 or WebM files' });
      if (file.size < 256 || file.size > MEDIA_TYPES[mime]) return json(413, { error: 'File is over the limit: 12 MB per image, 120 MB per video' });
      const done = r => json(201, { id: r.id, mime, bytes: file.size, name: file.name || 'upload', storage: 'media', ...(r.parts ? { parts: r.parts } : {}), ...(r.store ? { store: r.store } : {}) });
      let fileStoreError = null;
      if (!ls.get(SKIP_KEY) || Date.now() - Number(ls.get(SKIP_KEY)) > 86400000) {
        try { return done(await storeInFileStore(file, mime)); }
        catch (e) { fileStoreError = e; ls.set(SKIP_KEY, String(Date.now())); diag({ stage: 'file store', code: (e && e.code) || 'unknown', message: e && String(e.message || '').slice(0, 300), mime, bytes: file.size }); }
      }
      try { return done(await storeInDatabase(file, mime)); }
      catch (e) {
        const code = (e && e.code) || 'unknown';
        diag({ stage: 'database fallback', code, message: e && String(e.message || '').slice(0, 300), mime, bytes: file.size, fileStoreCode: fileStoreError && fileStoreError.code });
        const why = code === 'video_too_large' ? 'this artifact can store videos up to ' + Math.round(DB_VIDEO_MAX / 1e6) + ' MB right now. Attach a shorter or compressed MP4, or use the local app for the full file'
          : code === 'quota_exceeded' ? 'the artifact storage is full' : code === 'no_db' ? 'storage is not available in this view. Open the artifact signed in as its owner'
          : (code === 'permission_denied' || code === 'not_granted') ? 'this view is read-only' : 'storage did not accept the file';
        return json(400, { error: 'Upload failed: ' + why + ' [' + code + ']' });
      }
    }
    if (path === '/api/backup/check' && method === 'POST') {
      const ids = referenced(JSON.parse(init.body)); const missing = [];
      let stored = null;
      if (assets) { try { stored = new Set((await assets.list()).assets.map(a => a.id)); } catch (_) {} }
      for (const id of ids) if (!BUNDLED_MEDIA[id] && stored && !stored.has(id)) missing.push({ id, kind: 'media' });
      return json(200, { referenced: ids.length, available: ids.length - missing.length, missing });
    }
    if (path === '/api/backup/export' || path === '/api/backup/restore') return json(400, { error: LOCAL_ONLY });
    return json(404, { error: 'Not found' });
  }

  async function diag(info) {
    try {
      let who = {};
      try { const user = await window.claude.use('user'); if (user) who = { isOwner: await user.isOwner(), canEdit: await user.canEdit() }; } catch (_) {}
      if (db) await db.doc('diagnostics/upload').set({ ...info, ...who, hasAssets: !!assets, hasDownloads: !!downloads, at: new Date().toISOString(), agent: navigator.userAgent.slice(0, 160) });
    } catch (_) {}
  }
  const realFetch = window.fetch.bind(window);
  const hostFetch = function (input, init) {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    let u; try { u = new URL(raw, location.href); } catch (_) { return realFetch(input, init); }
    if (!u.pathname.startsWith('/api/') || u.origin !== location.origin) return realFetch(input, init);
    return route(u.pathname, u.searchParams, init || {}).catch(e => json(500, { error: 'Storage request failed: ' + String((e && (e.code || e.message)) || e).slice(0, 120) }));
  };

  /* ---------- file exports ---------- */
  async function exportFile(name, data) {
    if (!downloads) { toast('Saving files is not available in this view.'); return; }
    try { await downloads.save({ filename: name, data: data instanceof Blob ? data : String(data) }); }
    catch (e) {
      const c = e && e.code;
      if (c === 'declined') return;
      toast(c === 'rejected_extension' || c === 'extension_not_enabled' ? 'This file type cannot be saved from here: ' + name : c === 'rate_limited' ? 'Another save prompt is open. Finish it, then try again.' : 'The file could not be saved (' + (c || 'unavailable') + ').');
    }
  }

  async function imageSize(file) {
    if (typeof createImageBitmap === 'function') { try { const bmp = await createImageBitmap(file); const info = { width: bmp.width, height: bmp.height }; if (bmp.close) bmp.close(); return info; } catch (_) {} }
    return new Promise((resolve, reject) => { const url = URL.createObjectURL(file), img = new Image(); img.onload = () => { const info = { width: img.naturalWidth, height: img.naturalHeight }; URL.revokeObjectURL(url); resolve(info); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected file is not a readable image.')); }; img.src = url; });
  }

  window.RSH_HOST = { merge3, version: VERSION, fetch: hostFetch, imageSize, read: k => ls.get(k), persist, mediaUrl, exportFile, ask, toast };

  /* ---------- start: load storage, then start the app ---------- */
  (async function start() {
    const loading = document.createElement('div'); loading.id = 'rshHostLoading'; loading.textContent = 'Loading your workspace…';
    (document.body || document.documentElement).appendChild(loading);
    const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
    [db, assets, downloads] = await Promise.all([use('db'), use('assets'), use('downloads')]);
    const source = await hydrate();
    loading.remove();
    try { window.__rshBoot(); if (window.RSH_LIVE) window.RSH_LIVE.start(); if (window.RSH_SCORE) window.RSH_SCORE.start(); if (window.RSH_CAMPAIGNS) window.RSH_CAMPAIGNS.start(); if (window.RSH_EXPERIMENTS) window.RSH_EXPERIMENTS.start(); if (window.RSH_SIGNOFF) window.RSH_SIGNOFF.start(); } catch (e) { if (window.RSH_DIAGNOSTICS) window.RSH_DIAGNOSTICS.report('startup', e); throw e; }
    watchTeam();
    if (source === 'cloud') pill('saved', 'Saved · team copy up to date');
    else if (source === 'browser') pill('error', 'Saved in this browser only');
    else if (source === 'unreachable') pill('error', 'Storage not reached: showing this browser’s copy');
    else if (source === 'cloud-invalid') pill('error', 'Saved copy could not be read');
    else if (source === 'empty') pill('saved', 'New workspace');
    else { pill('saving', 'Saving…'); flush(); }
  })();
})();
