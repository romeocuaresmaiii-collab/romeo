/* Comment inbox: reply to every comment within 60 minutes (Posting Rulebook rule 7).
 * Metricool reports comment COUNTS per post (Instagram posts and reels, TikTok), not the comment text. So the inbox:
 *  - pulls the counts every 15 minutes while the app is open (the last 7 days of posts),
 *  - subtracts RSH's own first comment on Instagram (the link comment the rulebook puts there),
 *  - shows each post with new comments, newest first by urgency, with a 60-minute timer from when they were spotted,
 *  - opens the post, drafts replies in RSH's voice from the comment the team pastes in, offers approved quick replies,
 *  - and records who answered and when (db inbox/<id>). Bluesky replies with their text come later through RSH's gateway. */
(function () {
  'use strict';
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SERVER = 'Metricool Social Media Management', TOOL = 'getAnalyticsDataByMetrics', BRAND = '5695688', LIMIT_MIN = 60;
  const SOURCES = [['INSTAGRAM', ['IGRE06', 'IGRE02', 'IGRE07', 'IGRE03']], ['INSTAGRAM', ['IGPO06', 'IGPO02', 'IGPO08', 'IGPO03']], ['TIKTOK', ['TKPO03', 'TKPO02', 'TKPO09', 'TKPO05']]];
  const NAME = { INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', FACEBOOK: 'Facebook', YOUTUBE: 'YouTube', BLUESKY: 'Bluesky', THREADS: 'Threads' };
  const QUICK = [
    ['Thanks', 'Thank you! 🙌 Look fearless.'],
    ['Team order', 'We’d love to outfit your team! Send us a DM or start at rshsports.com and we’ll help with colors, logos and sizes.'],
    ['Sizing', 'Great question! Each product page on rshsports.com has the size details, and if your team needs help choosing, DM us and we’ll walk you through it.'],
    ['Price', 'Pricing depends on the design and quantity. DM us what you have in mind and we’ll send you a quote.'],
    ['Timing', 'Timing depends on the order, so DM us your date and we’ll tell you exactly what’s possible.'],
    ['Colors', 'We can match your school colors! DM us your colors and logo and we’ll show you options.'],
    ['Answer to our question', 'Love that answer! 💪 What about the rest of you?']];
  let db = null, me = null, counts = [], states = {}, fetchedAt = null, busy = false, msg = '', openUI = false, drafts = {}, lastPull = 0;
  const key = u => { let h = 2166136261; for (const c of String(u)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return 'c' + h.toString(36); };
  const norm = u => String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  const iso = (d, t) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${t}-05:00`;
  const ago = t => { const m = Math.round((Date.now() - Date.parse(t)) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };

  // Instagram: the rulebook's first comment (the store link) is RSH's own. Known from Metricool's schedule (fingerprint of the first comment).
  function ownComments(net, url) {
    if (net !== 'INSTAGRAM') return 0;
    const L = window.RSH_LIVE, sch = (L && L.scheduled && L.scheduled()) || [], empty = L && L.fp ? L.fp('') : null;
    const p = sch.find(s => Array.isArray(s[6]) && s[6].some(x => x[0] === 'instagram' && norm(x[2]) === norm(url)));
    if (p) return p[8] && p[8] !== empty ? 1 : 0;
    return 1;   // not in the 3-day schedule window: RSH posts carry the link comment since the rulebook, so assume one
  }
  function rowsOf(res) {
    let x = res && (res.payload !== undefined ? res.payload : res); if (typeof x === 'string') { try { x = JSON.parse(x); } catch (_) { return []; } }
    if (x && Array.isArray(x.content) && x.content[0] && typeof x.content[0].text === 'string') { try { x = JSON.parse(x.content[0].text); } catch (_) { return []; } }
    return x && Array.isArray(x.rows) ? x.rows : [];
  }
  async function pull(byClick) {
    if (busy) return; busy = true; render();
    try {
      const mcp = await use('mcp'); if (!mcp) { msg = 'Comment counts load when the app is opened from your Claude account.'; return; }
      const to = new Date(), from = new Date(); from.setDate(from.getDate() - 7); const out = [];
      for (const [net, m] of SOURCES) {
        try { for (const r of rowsOf(await mcp.callTool(SERVER, TOOL, { brandId: BRAND, from: iso(from, '00:00:00'), to: iso(to, '23:59:59'), metrics: m }))) if (r && /^https:\/\//.test(r[0] || '')) out.push([net, String(r[0]).slice(0, 300), String(r[1] || ''), Number(r[2]) || 0, String(r[3] || '').replace(/\s+/g, ' ').trim().slice(0, 90)]); } catch (_) {}
      }
      const seen = new Set(); counts = out.filter(r => { const k = norm(r[1]); if (seen.has(k)) return false; seen.add(k); return true; });
      fetchedAt = new Date().toISOString(); lastPull = Date.now();
      // a new comment is spotted: start its 60-minute timer now. Only changed posts are saved.
      const changed = [];
      for (const r of counts) {
        const k = key(norm(r[1])), old = states[k], st = old ? { ...old } : { url: r[1], net: r[0], handled: Math.min(r[3], ownComments(r[0], r[1])) };
        if (!old && Date.now() - Date.parse(postedAt(r) || 0) > 24 * 3600e3) st.handled = r[3];   // comments on older posts seen for the first time count as handled
        const open = r[3] - (st.handled || 0), grew = old && r[3] > (old.lastCount || 0);
        if (open <= 0) st.spottedAt = null; else if (!st.spottedAt || (grew && (old.lastCount || 0) <= (old.handled || 0))) st.spottedAt = fetchedAt;
        st.lastCount = r[3]; st.text = r[4]; st.postedAt = postedAt(r);
        if (!old || old.lastCount !== st.lastCount || old.spottedAt !== st.spottedAt || old.handled !== st.handled) changed.push(k);
        states[k] = st;
      }
      if (db) { await db.doc('inbox/_counts').set({ fetchedAt, rows: JSON.stringify(counts).slice(0, 200000) }); for (const k of changed) { try { await db.doc('inbox/' + k).set(states[k]); } catch (_) {} } }
      msg = byClick ? 'Comment counts refreshed.' : msg;
    } finally { busy = false; render(); paintButton(); }
  }
  const postedAt = r => { const s = String(r[2] || ''); return /^\d{14}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00Z` : ''; };

  function waiting() {
    return counts.map(r => { const k = key(norm(r[1])), st = states[k] || {}; return { k, net: r[0], url: r[1], text: r[4] || st.text || '', count: r[3], open: Math.max(0, r[3] - (st.handled || 0)), spottedAt: st.spottedAt, answeredAt: st.answeredAt, by: st.by }; })
      .filter(x => x.open > 0).sort((a, b) => String(a.spottedAt || '').localeCompare(String(b.spottedAt || '')));
  }
  function timer(x) {
    if (!x.spottedAt) return ['', ''];
    const left = LIMIT_MIN - Math.round((Date.now() - Date.parse(x.spottedAt)) / 6e4);
    return left > 15 ? ['ok', `${left} min left`] : left > 0 ? ['warn', `${left} min left`] : ['late', `${-left} min over`];
  }
  async function answered(k) {
    const r = counts.find(c => key(norm(c[1])) === k); if (!r) return;
    const st = states[k] || { url: r[1], net: r[0] }; st.handled = r[3]; st.answeredAt = new Date().toISOString(); st.by = me || ''; st.spottedAt = null; states[k] = st;
    if (db) { try { await db.doc('inbox/' + k).set(st); } catch (_) {} }
    msg = 'Marked as answered.'; render(); paintButton();
  }
  async function draft(k, comment) {
    const x = waiting().find(w => w.k === k) || {}, sample = await use('sample');
    if (!comment.trim()) { msg = 'Paste the comment first.'; return render(); }
    if (!sample) { msg = 'Asking Claude is not available in this view; use a quick reply.'; return render(); }
    drafts[k] = { busy: true }; render();
    const prompt = `You reply to comments for RSH Sports (rshsports.com), a US maker of custom team uniforms (wrestling singlets, basketball, soccer and more) and online team stores. Voice: a friendly coach, warm, short, real. Write 3 different replies to the comment below.
Rules: 1–2 short sentences each; at most one emoji; answer what they asked; never promise prices, stock, delivery dates or discounts (for those, invite a DM or point to rshsports.com); never argue; no engagement bait ("tag 3 friends", "comment YES"); if the comment is negative or a complaint, apologize briefly and invite a DM; if it is spam or offensive, reply SKIP.
Post (${NAME[x.net] || ''}): "${String(x.text || '').slice(0, 200)}"
Comment: "${comment.slice(0, 600)}"
Return only the 3 replies, one per line, no numbering.`;
    try { const r = await sample(prompt, { modelTier: 'quick' }); drafts[k] = { list: String((r && r.text) || '').split('\n').map(s => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 3), comment }; }
    catch (e) { drafts[k] = null; msg = window.RSH_BOTS && window.RSH_BOTS.aiFail ? window.RSH_BOTS.aiFail('Quill', e, 'a comment reply') : 'Could not draft a reply just now.'; }
    render();
  }

  /* ---------- view ---------- */
  const css = document.createElement('style');
  css.textContent = `#rshInbox{position:fixed;inset:0;z-index:9991;background:rgba(15,23,42,.45);display:none;justify-content:center;align-items:flex-start;overflow:auto;padding:24px 12px}
  #rshInbox .sheet{background:var(--card,#fff);color:var(--ink,#1d1d1f);width:min(860px,100%);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:22px 24px 26px}
  #rshInbox h2{font-size:21px;margin:4px 0}#rshInbox .item{border:1px solid #e5e7eb;border-radius:14px;padding:12px 14px;margin-top:10px}#rshInbox .item.late{border-color:#fecaca;background:#fff7f7}
  #rshInbox .top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}#rshInbox .tm{font-size:12px;font-weight:800;border-radius:999px;padding:3px 10px}#rshInbox .tm.ok{background:#dcfce7;color:#166534}#rshInbox .tm.warn{background:#fef3c7;color:#92400e}#rshInbox .tm.late{background:#fee2e2;color:#991b1b}
  #rshInbox .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}#rshInbox textarea{width:100%;box-sizing:border-box;border:1px solid #d2d2d7;border-radius:10px;padding:8px;font:13px system-ui;margin-top:8px}
  #rshInbox .q{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}#rshInbox .q button{font-size:11.5px;border:1px solid #d2d2d7;background:#f8fafc;border-radius:999px;padding:4px 10px;cursor:pointer}
  #rshInbox .reply{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;border:1px dashed #cbd5e1;border-radius:10px;padding:7px 10px;margin-top:6px;font-size:13px}#rshInbox .msg{font-size:12.5px;color:#0f5132;min-height:1em;margin-top:6px}
  #rshInbox .sheet>div:first-child .btn{white-space:nowrap}#rshInbox a.btn{text-decoration:none}
  #rshInboxBtn{white-space:nowrap}#rshInboxBtn .n{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#fff;color:#b91c1c;font-weight:800}`;
  document.head.appendChild(css);
  function render() {
    const h = document.getElementById('rshInbox'); if (!h || !openUI) return;
    const list = waiting();
    h.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Comment inbox"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div class="small" style="font-weight:800;letter-spacing:.08em;color:#64748b">REPLY WITHIN 60 MINUTES</div><h2>💬 Comment inbox</h2>
      <div class="small">Instagram and TikTok posts from the last 7 days with comments nobody has answered yet. Counts refresh every 15 minutes while the app is open${fetchedAt ? ` (last ${esc(ago(fetchedAt))})` : ''}. Metricool gives the number of comments, not the text: open the post, read them, then paste one here for reply ideas.</div></div>
      <div style="display:flex;gap:8px"><button type="button" class="btn ghost smallbtn" data-ib-refresh ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : '↻ Check now'}</button><button type="button" class="btn ghost smallbtn" data-ib-close>Close ✕</button></div></div>
      <div class="msg" role="status">${esc(msg)}</div>
      ${list.length ? list.map(x => { const [c, t] = timer(x), d = drafts[x.k]; return `<div class="item ${c === 'late' ? 'late' : ''}"><div class="top"><div><strong>${esc(NAME[x.net] || x.net)}</strong> · ${x.open} new comment${x.open === 1 ? '' : 's'}<div class="small">${esc(x.text || 'Post')}</div></div>${t ? `<span class="tm ${c}">${esc(t)}</span>` : ''}</div>
        <div class="acts"><a class="btn smallbtn" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Open the post ↗</a><button type="button" class="btn ghost smallbtn" data-ib-done="${x.k}">✓ Answered</button></div>
        <div class="q">${QUICK.map(([l, txt], i) => `<button type="button" data-ib-quick="${i}" title="${esc(txt)}">Copy: ${esc(l)}</button>`).join('')}</div>
        <textarea rows="2" data-ib-text="${x.k}" placeholder="Paste a comment here to get three replies in RSH’s voice" aria-label="Comment text">${esc((d && d.comment) || '')}</textarea>
        <div class="acts"><button type="button" class="btn ghost smallbtn" data-ib-draft="${x.k}" ${d && d.busy ? 'disabled' : ''}>${d && d.busy ? 'Writing…' : '✎ Draft replies'}</button></div>
        ${d && d.list ? d.list.map(r => /^skip$/i.test(r) ? '<div class="small">Looks like spam or abuse: no reply needed (hide or report it in the app).</div>' : `<div class="reply"><span>${esc(r)}</span><button type="button" class="btn ghost smallbtn" data-ib-copy="${esc(r)}">Copy</button></div>`).join('') : ''}</div>`; }).join('')
        : `<p style="margin-top:14px"><strong>All caught up.</strong> ${counts.length ? `No unanswered comments on ${counts.length} recent posts.` : 'No recent posts loaded yet: press “Check now”.'}</p>`}
    </div>`;
  }
  function paintButton() {
    const b = document.getElementById('rshInboxBtn'); if (!b) return; const list = waiting(), late = list.some(x => timer(x)[0] === 'late');
    b.innerHTML = `💬 Inbox${list.length ? `<span class="n">${list.reduce((a, x) => a + x.open, 0)}</span>` : ''}`; b.style.background = late ? '#b91c1c' : list.length ? '#b45309' : '#334155';
    b.title = list.length ? `${list.length} post${list.length === 1 ? '' : 's'} with unanswered comments` : 'No unanswered comments';
  }
  function openInbox() { openUI = true; msg = ''; let h = document.getElementById('rshInbox'); if (!h) { h = document.createElement('div'); h.id = 'rshInbox'; document.body.appendChild(h); h.addEventListener('click', onClick); } h.style.display = 'flex'; render(); if (Date.now() - lastPull > 5 * 60000) pull(false); }
  function closeInbox() { openUI = false; const h = document.getElementById('rshInbox'); if (h) h.style.display = 'none'; }
  async function onClick(e) {
    const t = e.target;
    if (t.id === 'rshInbox' || t.closest('[data-ib-close]')) return closeInbox();
    if (t.closest('[data-ib-refresh]')) return pull(true);
    const dn = t.closest('[data-ib-done]'); if (dn) return answered(dn.dataset.ibDone);
    const dr = t.closest('[data-ib-draft]'); if (dr) { const ta = document.querySelector(`#rshInbox [data-ib-text="${dr.dataset.ibDraft}"]`); return draft(dr.dataset.ibDraft, ta ? ta.value : ''); }
    const q = t.closest('[data-ib-quick]'), cp = t.closest('[data-ib-copy]');
    if (q || cp) { const txt = q ? QUICK[+q.dataset.ibQuick][1] : cp.dataset.ibCopy; try { await navigator.clipboard.writeText(txt); msg = 'Copied. Paste it as your reply on the post.'; } catch (_) { msg = 'Copy failed: select the text and copy it.'; } return render(); }
  }
  async function start() {
    if (document.getElementById('rshInboxBtn')) return;
    const top = document.getElementById('rshQRBtn') || document.getElementById('openCommandPalette');
    if (top) { const b = document.createElement('button'); b.type = 'button'; b.id = 'rshInboxBtn'; b.className = 'btn smallbtn'; b.style.color = '#fff'; b.addEventListener('click', openInbox); top.parentNode.insertBefore(b, top.nextSibling); paintButton(); }
    db = await use('db'); try { const u = await use('user'); me = u ? await u.id() : null; } catch (_) {}
    if (db) {
      try { const c = await db.doc('inbox/_counts').get(); if (c.exists) { counts = JSON.parse(c.data().rows || '[]'); fetchedAt = c.data().fetchedAt; } } catch (_) {}
      try { const q = await db.collection('inbox').get(); for (const d of q.docs) if (d.id !== '_counts') states[d.id] = d.data(); } catch (_) {}
    }
    paintButton(); render();
    const mcp = await use('mcp'); if (mcp) { if (!fetchedAt || Date.now() - Date.parse(fetchedAt) > 15 * 60000) pull(false); setInterval(() => { if (!busy) pull(false); }, 15 * 60000); }
    setInterval(() => { paintButton(); if (openUI) render(); }, 60000);
  }
  window.RSH_INBOX = { start, open: openInbox, close: closeInbox, pull, waiting, answered, ownComments, QUICK };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 1500)); else setTimeout(start, 1500);
})();
