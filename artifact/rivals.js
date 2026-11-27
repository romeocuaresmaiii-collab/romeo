/* Competitors, tracked inside the app (no Metricool needed).
 *  - The list: 5–8 similar-sized custom team-uniform brands with their website and the social accounts their own
 *    site links to (db rivals/list). Anyone on the team can add or remove one.
 *  - A monthly digest (db rivals/digest-YYYY-MM): each rival's standout recent posts, why they worked, and ideas for
 *    RSH. Claude researches it on the web at the start of each month, or within the hour after “Research now”.
 *  - Posts the team spots themselves (db rivalNotes/*).
 *  - “Make it a test” turns an idea into an A/B test on Growth Experiments, so ideas are tried, not just read.
 * Every figure names where and when it was seen; nothing is estimated. */
(function () {
  'use strict';
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = () => window.RSH_APP;
  const NETS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['pinterest', 'Pinterest'], ['x', 'X']];
  const monthKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const monthLabel = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const safeUrl = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '';
  const fmt = n => Number(n).toLocaleString('en-US');
  let db = null, me = null, state = { list: [], digest: null, prevDigest: null, notes: [], request: null, loaded: false, msg: '' };

  async function read(path) { try { const s = await Promise.race([db.doc(path).get(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]); return s && s.exists ? s.data() : null; } catch (_) { return null; } }
  const parse = (d, k, dflt) => { try { return d && d[k] ? JSON.parse(d[k]) : dflt; } catch (_) { return dflt; } };
  async function load() {
    if (!db) return;
    const k = monthKey(), pk = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
    const [l, dg, pdg, rq] = await Promise.all([read('rivals/list'), read('rivals/digest-' + k), read('rivals/digest-' + pk), read('rivals/request')]);
    state.list = parse(l, 'json', []); state.digest = parse(dg, 'json', null); state.prevDigest = parse(pdg, 'json', null); state.request = rq;
    try { const q = await db.collection('rivalNotes').get(); state.notes = q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30); } catch (_) {}
    state.loaded = true; render();
  }
  async function saveList() { if (!db) return; await db.doc('rivals/list').set({ json: JSON.stringify(state.list), updatedAt: new Date().toISOString(), by: me || '' }); }
  const digest = () => state.digest || state.prevDigest;

  /* ---------- actions ---------- */
  async function addRival(f) {
    const name = String(f.name || '').trim().slice(0, 60), site = safeUrl(f.website);
    if (!name) return say('Give the competitor a name.');
    if (state.list.some(r => r.name.toLowerCase() === name.toLowerCase())) return say(`${name} is already on the list.`);
    const r = { id: 'r' + Date.now().toString(36), name, website: site, social: {}, sells: String(f.sells || '').slice(0, 160), addedBy: me || '', addedAt: new Date().toISOString().slice(0, 10), source: 'Added by the team' };
    for (const [k] of NETS) if (safeUrl(f[k])) r.social[k] = safeUrl(f[k]);
    state.list.push(r); await saveList(); say(`${name} added. Claude includes it in the next monthly research.`); render();
  }
  let armed = null;
  async function removeRival(id) {
    const r = state.list.find(x => x.id === id); if (!r) return;
    if (armed !== id) { armed = id; say(`Press Remove again to take ${r.name} off the list.`); setTimeout(() => { if (armed === id) armed = null; }, 15000); return; }
    armed = null; state.list = state.list.filter(x => x.id !== id); await saveList(); say(`${r.name} removed.`); render();
  }
  async function requestResearch() {
    if (!db) return;
    await db.doc('rivals/request').set({ status: 'queued', month: monthKey(), at: new Date().toISOString(), by: me || '' });
    state.request = { status: 'queued', at: new Date().toISOString() }; say('Asked Claude to research the competitors. It runs within the hour.'); render();
    try { const B = window.RSH_BOTS; if (B && B.pingEditor) B.pingEditor('Competitor research requested from the app (rivals/request).'); } catch (_) {}
  }
  async function addNote(f) {
    const url = safeUrl(f.url), what = String(f.what || '').trim().slice(0, 300), rival = String(f.rival || '').slice(0, 60);
    if (!url || !what) return say('Paste the post’s link (https://…) and say what stood out.');
    const id = 'n' + Date.now().toString(36);
    const n = { rival, url, what, by: me || '', at: new Date().toISOString() };
    if (db) await db.doc('rivalNotes/' + id).set(n); state.notes.unshift({ id, ...n }); say('Saved. Claude looks at it in the next monthly digest.'); render();
  }
  function makeTest(i) {
    const d = digest(), idea = d && (d.ideas || [])[i], A = app(); if (!idea || !A) return;
    const data = A.data(); data.growthTests = data.growthTests || [];
    if (data.growthTests.some(t => t.fromRivalIdea === idea.title)) return say('That idea is already a test on Growth Experiments.');
    data.growthTests.push({ id: (crypto.randomUUID ? crypto.randomUUID() : 'gx' + Date.now()), title: String(idea.title).slice(0, 90), platform: idea.platform || 'Instagram', kpi: idea.kpi === 'engagement' ? 'engagement' : 'views', owner: 'Project Manager', a: String(idea.a || 'Our usual version').slice(0, 160), b: String(idea.b || idea.title).slice(0, 160), hypothesis: String(idea.hypothesis || '').slice(0, 300), aNumerator: 0, aDenominator: 0, bNumerator: 0, bDenominator: 0, source: `Idea from the ${monthLabel(d.month)} competitor digest${idea.from ? ' (' + idea.from + ')' : ''}.`, learning: '', fromRivalIdea: idea.title, createdAt: new Date().toISOString() });
    A.save(); say('Added to Growth Experiments as an A/B test. Make both versions, publish them in the same week, then pick the two posts there.'); render();
  }
  function say(m) { state.msg = m; const e = document.getElementById('rvMsg'); if (e) e.textContent = m; }

  /* ---------- view ---------- */
  const css = document.createElement('style');
  css.textContent = `#rshRivals h2{font-size:18px;margin:0}#rshRivals h3{font-size:14px;margin:16px 0 6px}#rshRivals table{width:100%;border-collapse:collapse;font-size:12.5px}#rshRivals th,#rshRivals td{text-align:left;padding:7px 8px;border-bottom:1px solid #eef2f7;vertical-align:top}#rshRivals th{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  #rshRivals .soc a{display:inline-block;margin:0 6px 2px 0;font-weight:700;color:#0066cc;text-decoration:none}#rshRivals .post{border:1px solid #e5e7eb;border-radius:10px;padding:9px 11px;margin-bottom:8px}#rshRivals .post a{font-weight:700;color:#0066cc;text-decoration:none}
  #rshRivals .idea{border-left:3px solid #b45309;background:#fffbeb;border-radius:8px;padding:8px 11px;margin-bottom:8px}#rshRivals form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:8px}#rshRivals input,#rshRivals select{font:inherit;font-size:12.5px;padding:7px 8px;border:1px solid #d2d2d7;border-radius:8px;min-width:0}
  #rshRivals .scroll{overflow-x:auto}#rshRivals details{margin-top:12px}#rshRivals summary{cursor:pointer;font-weight:700;font-size:13px}#rvMsg{font-size:12.5px;color:#0f5132;margin-top:8px;min-height:1em}`;
  document.head.appendChild(css);

  function render() {
    const host = document.getElementById('rshRivals'); if (!host) return;
    if (!db) { host.innerHTML = '<h2>Competitors</h2><p class="small">This view cannot reach the app’s storage, so the competitor list cannot load.</p>'; return; }
    if (!state.loaded) { host.innerHTML = '<h2>Competitors</h2><p class="small">Loading…</p>'; return; }
    const d = digest(), cur = !!state.digest, L = state.list, rq = state.request && state.request.status === 'queued';
    const soc = r => NETS.filter(([k]) => r.social && r.social[k]).map(([k, n]) => `<a href="${esc(r.social[k])}" target="_blank" rel="noopener noreferrer">${n}</a>`).join('') || '<span class="small">none linked on their site</span>';
    const fol = r => { const f = r.followers || {}; const ks = Object.keys(f).filter(k => f[k] && f[k].n != null); return ks.length ? ks.map(k => `${esc((NETS.find(x => x[0] === k) || [k, k])[1])} ${fmt(f[k].n)}<span class="small"> (${esc(f[k].at || '')})</span>`).join('<br>') : '<span class="small">not public yet</span>'; };
    const rows = L.map(r => `<tr><td><strong>${esc(r.name)}</strong>${r.website ? `<div><a href="${esc(r.website)}" target="_blank" rel="noopener noreferrer" class="small">${esc(r.website.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></div>` : ''}${r.sells ? `<div class="small">${esc(r.sells)}</div>` : ''}</td><td class="soc">${soc(r)}</td><td>${fol(r)}</td><td><button type="button" class="btn ghost smallbtn" data-rv-remove="${esc(r.id)}">Remove</button></td></tr>`).join('');
    const byRival = {}; for (const p of (d && d.posts) || []) (byRival[p.rival] = byRival[p.rival] || []).push(p);
    const posts = Object.entries(byRival).map(([rv, ps]) => `<div><strong>${esc(rv)}</strong>${ps.slice(0, 3).map(p => `<div class="post">${safeUrl(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.what || 'Open post')}</a>` : esc(p.what || '')}<div class="small">${esc([p.net, p.date, p.numbers].filter(Boolean).join(' · '))}</div>${p.why ? `<div class="small"><strong>Why it worked:</strong> ${esc(p.why)}</div>` : ''}</div>`).join('')}</div>`).join('');
    const ideas = ((d && d.ideas) || []).map((x, i) => `<div class="idea"><strong>${esc(x.title)}</strong>${x.from ? `<span class="small"> · from ${esc(x.from)}</span>` : ''}<div class="small">${esc(x.hypothesis || '')}</div><button type="button" class="btn smallbtn" style="margin-top:6px" data-rv-test="${i}">Make it an A/B test</button></div>`).join('');
    const notes = state.notes.length ? state.notes.slice(0, 8).map(n => `<div class="post">${safeUrl(n.url) ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.what)}</a>` : esc(n.what)}<div class="small">${esc(n.rival || '')} · ${esc(String(n.at).slice(0, 10))}</div></div>`).join('') : '<p class="small">Nothing logged yet.</p>';
    host.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h2>Competitors · similar-size brands</h2><p class="small" style="max-width:700px;margin-top:4px">Tracked in this app, no Metricool needed. Claude researches their public posts at the start of every month and writes a digest with ideas for RSH. Turn the best idea into an A/B test each month.</p></div>
      <button type="button" class="btn smallbtn" id="rvResearch" ${rq ? 'disabled' : ''}>${rq ? 'Research requested…' : '↻ Research now'}</button></div>
      <div id="rvMsg">${esc(state.msg)}</div>
      <h3>Tracked (${L.length})${L.length < 5 ? ' · add at least 5' : ''}</h3>
      ${L.length ? `<div class="scroll"><table><thead><tr><th>Brand</th><th>Social accounts (from their own site)</th><th>Followers</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="small">No competitors yet.</p>'}
      <h3>${d ? `Digest · ${esc(monthLabel(d.month))}${cur ? '' : ' (this month’s is not ready yet)'}` : 'Monthly digest'}</h3>
      ${d ? `${d.summary ? `<p class="small">${esc(d.summary)}</p>` : ''}${posts || '<p class="small">No standout posts were found this month.</p>'}${ideas ? `<h3>Ideas for RSH</h3>${ideas}` : ''}<p class="small">Researched ${esc(String(d.researchedAt || '').slice(0, 10))} from public pages${d.note ? '. ' + esc(d.note) : ''}.</p>` : '<p class="small">No digest yet. Press “Research now”, or wait for the start of the month.</p>'}
      <details><summary>Log a competitor post you saw</summary><form id="rvNoteForm"><select name="rival" aria-label="Competitor">${L.map(r => `<option>${esc(r.name)}</option>`).join('')}<option value="">Other</option></select><input name="url" type="url" placeholder="https://… link to the post" aria-label="Post link"><input name="what" placeholder="What stood out (hook, format, comments)" aria-label="What stood out"><button type="submit" class="btn ghost smallbtn">Save</button></form><div style="margin-top:8px">${notes}</div></details>
      <details><summary>Add a competitor</summary><form id="rvAddForm"><input name="name" placeholder="Brand name" aria-label="Brand name"><input name="website" type="url" placeholder="https://website" aria-label="Website"><input name="instagram" type="url" placeholder="https://instagram.com/…" aria-label="Instagram link"><input name="tiktok" type="url" placeholder="https://tiktok.com/@…" aria-label="TikTok link"><input name="facebook" type="url" placeholder="https://facebook.com/…" aria-label="Facebook link"><input name="sells" placeholder="What they sell (one line)" aria-label="What they sell"><button type="submit" class="btn ghost smallbtn">Add</button></form></details>`;
  }

  async function start() {
    const view = document.getElementById('view-competitors'); if (!view || document.getElementById('rshRivals')) return;
    const card = document.createElement('div'); card.className = 'card'; card.id = 'rshRivals'; card.style.marginBottom = '16px';
    view.insertBefore(card, view.firstChild);
    card.addEventListener('click', e => {
      const t = e.target;
      if (t.id === 'rvResearch') requestResearch();
      else if (t.dataset.rvRemove) removeRival(t.dataset.rvRemove);
      else if (t.dataset.rvTest) makeTest(+t.dataset.rvTest);
    });
    card.addEventListener('submit', e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target).entries());
      if (e.target.id === 'rvAddForm') addRival(f); else if (e.target.id === 'rvNoteForm') addNote(f);
    });
    render();
    db = await use('db');
    try { const u = await use('user'); me = u ? await u.id() : null; } catch (_) {}
    await load();
  }
  window.RSH_RIVALS = { start, load, list: () => state.list, digest, notes: () => state.notes, requested: () => !!(state.request && state.request.status === 'queued'), monthKey };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
