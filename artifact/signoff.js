/* RSH Sports Marketing OS — signed final approval (artifact edition only).
 *
 * Makes the final approval the approver's own act. One person is registered as the final approver
 * by the workspace owner. When that person presses Approve while signed in to their own Claude
 * account, a sign-off record is written under their identity; the artifact's access rules let
 * nobody else, the owner included, write or change it. The record carries a fingerprint of the
 * campaign's content, so a signature stops counting if the content changes afterwards.
 *
 * Limits, stated plainly: this proves which Claude account pressed Approve, not who was at the
 * keyboard; and anyone who can republish this page could change these rules.
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  const app = () => window.RSH_APP;
  let db = null, user = null, me = null, isOwner = false, approverId = null, loaded = false, busy = false, note = '';
  const names = {}, sigs = {}, requests = [];

  const css = document.createElement('style');
  css.textContent = `
  #rshSign{border:1px solid #d2d2d7;border-radius:14px;padding:14px 16px;margin:14px 0;background:#fff}
  #rshSign h4{margin:0 0 6px;font-size:14px;color:#1d1d1f}
  #rshSign .state{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.45;margin-top:8px}
  #rshSign .state.ok{background:#eaf7ee;color:#14532d}#rshSign .state.wait{background:#f5f5f7;color:#1d1d1f}#rshSign .state.warn{background:#fff3e0;color:#7c2d12}
  #rshSign .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}`;
  document.head.appendChild(css);

  const selectedId = () => { const b = document.querySelector('#approvalQueue .review-queue-entry.active[data-review-select]'); return b ? b.dataset.reviewSelect : null; };
  const post = id => app().data().posts.find(p => p.id === id);
  const nameOf = id => names[id] || 'the registered approver';
  async function fingerprint(p) {
    const ids = [p.creativeAsset].concat(Array.isArray(p.creativeAssets) ? p.creativeAssets : []).filter(Boolean).map(a => a.id).sort();
    const text = JSON.stringify([p.title || '', p.hook || '', p.caption || '', p.video || '', p.platform || '', ids]);
    try { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    catch (_) { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0; return 'x' + h.toString(16) + '-' + text.length; }
  }
  async function resolveNames(ids) {
    const need = ids.filter(i => i && !(i in names)); if (!need.length || !user) return;
    try { const ps = await user.profiles(need); for (const i of need) names[i] = (ps[i] && ps[i].name) || ''; } catch (_) {}
  }
  async function loadSig(id) {
    if (!approverId || !db) return null;
    try { const s = await db.doc('signoffs/' + approverId + '/posts/' + id).get(); sigs[id] = s.exists ? s.data() : null; } catch (_) { sigs[id] = undefined; }
    return sigs[id];
  }

  async function init() {
    [db, user] = await Promise.all([use('db'), use('user')]);
    if (db && user) {
      try { me = await user.id(); isOwner = !!(await user.isOwner()); } catch (_) {}
      try { const c = await db.doc('config/approver').get(); approverId = c.exists ? (c.data().userId || null) : null; } catch (_) {}
      if (isOwner && !approverId) await loadRequests();
      await resolveNames([approverId, me]);
    }
    loaded = true; paint();
  }
  async function loadRequests() {
    requests.length = 0;
    try { const q = await db.collection('signoffs').get(); for (const s of q.docs) { const d = s.data(); if (d && d.requestedAt && /^[A-Za-z0-9_\-]+$/.test(s.id)) requests.push(s.id); } } catch (_) {}
    await resolveNames(requests);
  }

  /* ---------- actions ---------- */
  async function act(fn) { if (busy) return; busy = true; note = ''; paint(); try { await fn(); } catch (e) { note = 'That did not go through' + (e && e.code ? ' [' + e.code + ']' : '') + '. Nothing was changed.'; } busy = false; paint(); }
  const askToRegister = () => act(async () => { await db.doc('signoffs/' + me).set({ requestedAt: new Date().toISOString() }); note = 'Request sent. The workspace owner needs to confirm it.'; });
  const register = id => act(async () => { await db.doc('config/approver').set({ userId: id, setAt: new Date().toISOString() }); approverId = id; await resolveNames([id]); });
  const sign = id => act(async () => {
    const p = post(id); if (!p || me !== approverId) return;
    const blocked = app().finalCheck(id); if (blocked && blocked !== 'already') { note = blocked; return; }
    const hash = await fingerprint(p), at = new Date().toISOString();
    await db.doc('signoffs/' + me + '/posts/' + id).set({ postId: id, title: String(p.title || '').slice(0, 200), hash, at });
    sigs[id] = { postId: id, hash, at };
    if (!blocked) app().signFinal(id, nameOf(me) === 'the registered approver' ? 'Registered final approver' : nameOf(me), 'Approved in the app from the approver’s own Claude account on ' + new Date(at).toLocaleString('en-US') + '.');
  });

  /* ---------- rendering ---------- */
  let painting = false;
  async function paint() {
    const editor = document.getElementById('approvalEditor'); if (!editor || !app() || painting) return;
    const id = selectedId(); if (!id || !post(id)) { const old = document.getElementById('rshSign'); if (old) old.remove(); return; }
    painting = true;
    try {
      let html = '<h4>Signed final approval</h4>';
      if (!loaded) html += '<div class="small">Checking who is signed in…</div>';
      else if (!db || !user || !me) html += '<div class="state wait">Signed approvals need you to be signed in to Claude with access to this workspace. The recorded-approval steps above still work.</div>';
      else if (!approverId) {
        html += '<div class="state wait">No final approver is registered yet. Until one is, final approvals are typed in by the team and cannot be verified.</div>';
        if (isOwner) {
          html += `<div class="row"><button type="button" class="btn smallbtn" data-sign-register="${esc(me)}" ${busy ? 'disabled' : ''}>Make me the final approver</button></div>`;
          html += requests.length ? '<div class="small" style="margin-top:10px">Requests to be the final approver:</div>' + requests.map(r => `<div class="row"><strong>${esc(names[r] || 'A signed-in person')}</strong><button type="button" class="btn ghost smallbtn" data-sign-register="${esc(r)}" ${busy ? 'disabled' : ''}>Make final approver</button></div>`).join('') : '<div class="small" style="margin-top:8px">To register someone else, ask them to open this screen and press “Ask to be the final approver”.</div>';
        } else html += `<div class="row"><button type="button" class="btn smallbtn" data-sign-ask ${busy ? 'disabled' : ''}>Ask to be the final approver</button><span class="small">The workspace owner confirms the request.</span></div>`;
      } else {
        if (!(id in sigs)) await loadSig(id);
        const p = post(id), sig = sigs[id], current = sig ? await fingerprint(p) : null, mine = me === approverId;
        html += `<div class="small">Final approver: <strong>${esc(nameOf(approverId))}</strong>${mine ? ' (you)' : ''}. Only this person’s own Claude account can sign.</div>`;
        if (sig && sig.hash === current) html += `<div class="state ok"><span>✓</span><span><strong>Signed by ${esc(nameOf(approverId))}</strong> on ${esc(new Date(sig.at).toLocaleString('en-US'))}, from their own account. The content has not changed since.</span></div>`;
        else if (sig) html += `<div class="state warn"><span>!</span><span><strong>Signature no longer applies.</strong> ${esc(nameOf(approverId))} signed an earlier version on ${esc(new Date(sig.at).toLocaleString('en-US'))}; the content or attachments changed afterwards and need a new signature.</span></div>`;
        else if (sig === undefined) html += '<div class="state wait">The signature record could not be read just now.</div>';
        else html += `<div class="state wait">Not signed yet${p.status === 'Approved' ? '. The approval above was typed in by the team and is not verified.' : '.'}</div>`;
        if (mine && !(sig && sig.hash === current)) {
          const blocked = app().finalCheck(id);
          if (blocked && blocked !== 'already') html += `<div class="row"><button type="button" class="btn smallbtn" disabled>Approve as ${esc(nameOf(me))}</button><span class="small">${esc(blocked)}</span></div>`;
          else html += `<div class="row"><button type="button" class="btn smallbtn" data-sign-approve="${esc(id)}" ${busy ? 'disabled' : ''}>✓ ${blocked === 'already' ? 'Add my signature' : 'Approve as ' + esc(nameOf(me))}</button><span class="small">Records your approval of exactly this content and these attachments. Nothing is scheduled or published.</span></div>`;
        }
      }
      if (note) html += `<div class="hint" role="status" style="margin-top:10px">${esc(note)}</div>`;
      let box = document.getElementById('rshSign');
      if (!box || !editor.contains(box)) { box = document.createElement('div'); box.id = 'rshSign'; const side = editor.querySelector('.review-side'), home = side || editor; const hints = home.querySelectorAll(':scope > .hint'); const last = hints[hints.length - 1]; home.insertBefore(box, last || null); }
      if (box.innerHTML !== html) box.innerHTML = html;
    } finally { painting = false; }
  }

  function start() {
    const editor = document.getElementById('approvalEditor'); if (!editor || !app() || editor.dataset.rshSign) return; editor.dataset.rshSign = '1';
    editor.addEventListener('click', e => {
      const r = e.target.closest('[data-sign-register]'); if (r) return register(r.dataset.signRegister);
      if (e.target.closest('[data-sign-ask]')) return askToRegister();
      const a = e.target.closest('[data-sign-approve]'); if (a) return sign(a.dataset.signApprove);
    });
    new MutationObserver(() => { if (!document.getElementById('rshSign')) paint(); }).observe(editor, { childList: true });
    init();
  }
  window.RSH_SIGNOFF = { start };
})();
