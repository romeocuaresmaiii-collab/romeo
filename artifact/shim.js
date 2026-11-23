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
  const MEDIA_TYPES = { 'image/jpeg': 12e6, 'image/png': 12e6, 'image/webp': 12e6, 'video/mp4': 20e6, 'video/webm': 20e6, 'video/quicktime': 20e6 };
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

  /* ---------- workspace persistence ---------- */
  const WS_DOC = 'workspace/main';
  let pendingJson = null, writing = false, saveTimer = null;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  function persist(key, json) {
    ls.set(key, json);
    if (key !== KEY) return;
    ls.set(KEY + ':dirty', '1');
    if (!db) { pill('error', 'Saved in this browser only'); return; }
    pendingJson = json; pill('saving', 'Saving…');
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1500);
  }
  async function flush() {
    if (writing || pendingJson === null || !db) return;
    writing = true; const json = pendingJson; pendingJson = null;
    try {
      if (json.length > 240000) throw Object.assign(new Error('too large'), { code: 'too_large' });
      await db.doc(WS_DOC).set({ json, updatedAt: new Date().toISOString(), appVersion: VERSION });
      if (pendingJson === null) { ls.set(KEY + ':dirty', ''); pill('saved', 'Saved to this artifact'); }
    } catch (e) {
      const why = e && e.code === 'too_large' ? 'Workspace is too large to save here' : (e && (e.code === 'permission_denied' || e.code === 'not_granted')) ? 'View only: changes are not saved' : 'Not saved yet: will retry on your next change';
      pill('error', why);
      if (pendingJson === null && !(e && (e.code === 'too_large' || e.code === 'permission_denied' || e.code === 'not_granted'))) pendingJson = json;
    } finally {
      writing = false;
      if (pendingJson !== null && ls.get(KEY + ':dirty')) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, pendingJson === json ? 15000 : 1500); }
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pendingJson !== null) { clearTimeout(saveTimer); flush(); } });

  async function hydrate() {
    if (!db) return 'browser';
    let snap;
    try { snap = await withTimeout(db.doc(WS_DOC).get(), 10000); } catch (_) { return 'unreachable'; }
    const body = snap && snap.exists ? snap.data() : null;
    const local = ls.get(KEY), dirty = !!ls.get(KEY + ':dirty');
    if (local && dirty) { pendingJson = local; return 'local-newer'; }   // unsaved edits from this browser win
    if (body && typeof body.json === 'string') {
      try { JSON.parse(body.json); ls.set(KEY, body.json); ls.set(KEY + ':dirty', ''); return 'cloud'; } catch (_) { return 'cloud-invalid'; }
    }
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
  function mediaUrl(a) {
    const id = a && a.id ? String(a.id) : '';
    if (BUNDLED_MEDIA[id]) return BUNDLED_MEDIA[id];
    return '/_blob/' + encodeURIComponent(id);
  }
  function referenced(workspace) {
    const seen = new Set();
    for (const p of (workspace.posts || [])) for (const a of [p && p.creativeAsset].concat(Array.isArray(p && p.creativeAssets) ? p.creativeAssets : [])) if (a && typeof a.id === 'string') seen.add(a.id);
    return [...seen];
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
      if (!assets) return json(400, { error: 'Uploading files is not available in this view. Open the artifact as its owner or an editor.' });
      const file = init.body, mime = (file && file.type || '').toLowerCase();
      if (!(file instanceof Blob) || !(mime in MEDIA_TYPES)) return json(415, { error: 'Upload PNG, JPEG, WebP, MP4, WebM or MOV only' });
      if (file.size < 256 || file.size > MEDIA_TYPES[mime]) return json(413, { error: 'File exceeds its limit here: 12 MB per image or 20 MB per video' });
      try {
        const r = await assets.upload(file, { type: mime });
        return json(201, { id: r.id, mime, bytes: r.sizeBytes, name: file.name || 'upload', storage: 'media' });
      } catch (e) { return json(400, { error: 'Could not store media: ' + ((e && e.code) || 'upload failed') }); }
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

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
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

  window.RSH_HOST = { version: VERSION, read: k => ls.get(k), persist, mediaUrl, exportFile, ask, toast };

  /* ---------- start: load storage, then start the app ---------- */
  (async function start() {
    const loading = document.createElement('div'); loading.id = 'rshHostLoading'; loading.textContent = 'Loading your workspace…';
    (document.body || document.documentElement).appendChild(loading);
    const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
    [db, assets, downloads] = await Promise.all([use('db'), use('assets'), use('downloads')]);
    const source = await hydrate();
    loading.remove();
    try { window.__rshBoot(); } catch (e) { if (window.RSH_DIAGNOSTICS) window.RSH_DIAGNOSTICS.report('startup', e); throw e; }
    if (source === 'cloud') pill('saved', 'Saved to this artifact');
    else if (source === 'browser') pill('error', 'Saved in this browser only');
    else if (source === 'unreachable') pill('error', 'Storage not reached: showing this browser’s copy');
    else if (source === 'cloud-invalid') pill('error', 'Saved copy could not be read');
    else if (source === 'empty') pill('saved', 'New workspace');
    else { pill('saving', 'Saving…'); flush(); }
    if (!assets) for (const id of ['visualFile']) { const f = document.getElementById(id); if (f) f.title = 'Uploading needs owner or editor access'; }
  })();
})();
