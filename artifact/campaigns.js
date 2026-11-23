/* RSH Sports Marketing OS — campaign results (artifact edition only).
 *
 * Links a campaign planned in this app to the post that was actually published, so the app can
 * say what each campaign achieved and compare results by sport, audience, season phase and goal.
 * A link is always confirmed by a person; suggestions are never applied automatically.
 * Results are the figures Metricool reports for the linked post. Nothing is estimated.
 */
(function () {
  'use strict';
  const NETS = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', PINTEREST: 'Pinterest', THREADS: 'Threads', BLUESKY: 'Bluesky' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const app = () => window.RSH_APP, rows = () => (window.RSH_LIVE && window.RSH_LIVE.rows()) || [];
  let showAll = false, tableOpen = false;

  const css = document.createElement('style');
  css.textContent = `
  #rshCampaigns .scroll{overflow-x:auto;margin-top:12px}
  #rshCampaigns table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
  #rshCampaigns th{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;text-align:left;padding:7px 8px;font-weight:700;border-bottom:1px solid #e5e5ea;white-space:nowrap}
  #rshCampaigns td{padding:9px 8px;border-top:1px solid #f0f0f3;vertical-align:top;color:#1d1d1f;line-height:1.4}
  #rshCampaigns td.r,#rshCampaigns th.r{text-align:right;white-space:nowrap}
  #rshCampaigns .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
  #rshCampaigns .chip{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px;background:#f0f0f3;color:#515154;white-space:nowrap}
  #rshCampaigns select{max-width:260px;width:100%;font:inherit;font-size:12px;padding:6px 8px;border:1px solid #d2d2d7;border-radius:8px;background:#fff;color:#1d1d1f}
  #rshCampaigns .linkrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  #rshCampaigns .suggest{background:#f5f8ff;border:1px solid #dbe7fb;border-radius:10px;padding:7px 9px;margin-bottom:6px;font-size:12px}
  #rshCampaigns a{color:#0066cc;font-weight:700;text-decoration:none}
  #rshCampaigns a:hover{text-decoration:underline}
  #rshCampaigns .tagsgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:12px;margin-top:12px}
  #rshCampaigns .box{border:1px solid #e5e5ea;border-radius:14px;padding:12px 14px;background:#fff;min-width:0}
  #rshCampaigns h3{margin:0 0 6px;font-size:14px}
  #rshCampaigns .empty{margin-top:12px;padding:18px;border:1px dashed #c7c7cc;border-radius:14px;color:#515154;font-size:13px;line-height:1.5}`;
  document.head.appendChild(css);

  /* ---------- tags ---------- */
  // Typical US school seasons; states differ, so this is a starting label, not a schedule.
  function seasonPhase(sport, date) {
    const m = Number(String(date || '').slice(5, 7)), d = Number(String(date || '').slice(8, 10)), s = String(sport || '').toLowerCase();
    if (!m) return 'Not set';
    if (s.includes('wrestl') || s.includes('basketball')) {
      if (m === 10) return 'Pre-season'; if (m === 11 || m === 12 || m === 1 || (m === 2 && d < 15)) return 'In season';
      if ((m === 2 && d >= 15) || m === 3) return 'Postseason'; return 'Off-season';
    }
    if (s.includes('volley')) { if (m === 7) return 'Pre-season'; if (m >= 8 && m <= 10) return 'In season'; if (m === 11) return 'Postseason'; return 'Off-season'; }
    return 'Not set';
  }
  const audiences = p => String(p.audience || '').split(',').map(x => x.trim()).filter(Boolean);
  const netOf = p => String(p.platform || '').toUpperCase().replace(/[^A-Z]/g, '');
  const dayNum = iso => Number(String(iso || '').slice(0, 10).replace(/-/g, ''));
  const dayLabel = k => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const daysApart = (a, b) => Math.abs((new Date(Math.floor(a / 10000), Math.floor(a / 100) % 100 - 1, a % 100) - new Date(Math.floor(b / 10000), Math.floor(b / 100) % 100 - 1, b % 100)) / 86400000);

  /* ---------- matching ---------- */
  const words = t => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 3));
  function suggestion(p, taken) {
    const net = netOf(p), day = dayNum(p.date), mine = words([p.caption, p.hook, p.title, p.onImageText].join(' ')); if (!day || !mine.size) return null;
    let best = null;
    for (const r of rows()) {
      if (r[0] !== net || !r[2] || taken.has(r[2]) || daysApart(r[1], day) > 3) continue;
      const theirs = words(r[3]); if (theirs.size < 3) continue;
      let shared = 0; theirs.forEach(w => { if (mine.has(w)) shared++; });
      const score = shared / theirs.size;
      if (shared >= 3 && score >= 0.5 && (!best || score > best.score)) best = { row: r, score };
    }
    return best && best.row;
  }

  /* ---------- data changes (always through the app, so they are saved like any other edit) ---------- */
  function link(id, url) {
    const d = app().data(), p = d.posts.find(x => x.id === id), r = rows().find(x => x[2] === url); if (!p || !r) return;
    p.published = { link: r[2], network: r[0], date: r[1], text: r[3], format: r[6], impressions: r[4], interactions: r[5], linkedAt: new Date().toISOString(), seenAt: new Date().toISOString() };
    app().save(); app().notice('Campaign linked to its published post.'); render();
  }
  function unlink(id) { const p = app().data().posts.find(x => x.id === id); if (!p || !p.published) return; delete p.published; app().save(); app().notice('Link removed. The campaign itself is unchanged.'); render(); }
  // When fresh Metricool figures arrive, update the stored results of linked campaigns (only if they changed).
  function syncResults() {
    if (!app()) return; let changed = false;
    for (const p of app().data().posts) {
      if (!p.published) continue; const r = rows().find(x => x[2] === p.published.link); if (!r) continue;
      if (p.published.impressions !== r[4] || p.published.interactions !== r[5]) { p.published.impressions = r[4]; p.published.interactions = r[5]; p.published.seenAt = new Date().toISOString(); changed = true; }
    }
    if (changed) app().save();
  }

  /* ---------- rendering ---------- */
  function tagTable(title, groups) {
    const keys = Object.keys(groups).sort((a, b) => groups[b].interactions - groups[a].interactions);
    return `<div class="box"><h3>${esc(title)}</h3><div style="overflow-x:auto"><table><thead><tr><th></th><th class="r">Posts</th><th class="r">Impr.</th><th class="r">Interact.</th></tr></thead><tbody>${keys.map(k => `<tr><td><strong>${esc(k)}</strong></td><td class="r">${groups[k].n}</td><td class="r">${fmt(groups[k].impressions)}</td><td class="r">${fmt(groups[k].interactions)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function render() {
    const host = document.getElementById('rshCampaigns'); if (!host || !app()) return;
    const posts = app().data().posts.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const linked = posts.filter(p => p.published), measured = linked.filter(p => p.published.impressions != null);
    const taken = new Set(linked.map(p => p.published.link));
    const group = fn => { const g = {}; for (const p of measured) for (const k of [].concat(fn(p))) { const t = g[k] || (g[k] = { n: 0, impressions: 0, interactions: 0 }); t.n++; t.impressions += p.published.impressions || 0; t.interactions += p.published.interactions || 0; } return g; };
    const byTag = measured.length ? `<div class="tagsgrid">${tagTable('By sport', group(p => p.sport || 'Not set'))}${tagTable('By audience', group(p => audiences(p).length ? audiences(p) : ['Not set']))}${tagTable('By season phase', group(p => seasonPhase(p.sport, p.date)))}${tagTable('By goal', group(p => p.goal || 'Not set'))}</div><div class="small" style="margin-top:8px">A campaign aimed at several audiences is counted under each of them. With only ${measured.length} linked campaign${measured.length === 1 ? '' : 's'}, treat differences as early signals, not conclusions.</div>` : '';
    const list = showAll ? posts : posts.slice(0, 8);
    const body = posts.length ? `<div class="scroll"><table>
      <thead><tr><th>Campaign</th><th>Published post</th><th class="r">Impressions</th><th class="r">Interactions</th></tr></thead>
      <tbody>${list.map(p => {
        const net = netOf(p), pub = p.published;
        const chips = `<div class="chips">${[p.sport, seasonPhase(p.sport, p.date)].concat(audiences(p)).filter(x => x && x !== 'Not set').map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>`;
        let cell;
        if (pub) cell = `<a href="${esc(/^https:\/\//.test(pub.link) ? pub.link : '#')}" target="_blank" rel="noopener noreferrer">${esc(pub.text || 'Open post')}</a><div class="small">${esc(NETS[pub.network] || pub.network)} · ${esc(dayLabel(pub.date))} · <button type="button" class="btn ghost smallbtn" data-unlink="${esc(p.id)}" style="padding:2px 8px">Remove link</button></div>`;
        else {
          const cand = rows().filter(r => r[0] === net && r[2] && !taken.has(r[2])).sort((a, b) => b[1] - a[1]).slice(0, 40), sug = suggestion(p, taken);
          cell = (sug ? `<div class="suggest">Looks like: <strong>${esc(sug[3] || 'post')}</strong> (${esc(dayLabel(sug[1]))}) <button type="button" class="btn smallbtn" data-link="${esc(p.id)}" data-url="${esc(sug[2])}" style="padding:3px 9px;margin-left:4px">Confirm</button></div>` : '')
            + (cand.length ? `<div class="linkrow"><select aria-label="Published ${esc(p.platform)} posts for ${esc(p.title)}" data-pick="${esc(p.id)}"><option value="">Choose the published ${esc(p.platform)} post…</option>${cand.map(r => `<option value="${esc(r[2])}">${esc(dayLabel(r[1]))} · ${esc((r[3] || r[6]).slice(0, 52))}</option>`).join('')}</select><button type="button" class="btn ghost smallbtn" data-link-pick="${esc(p.id)}">Link</button></div>` : `<span class="small">No published ${esc(p.platform)} posts are loaded to link yet.</span>`);
        }
        return `<tr><td><strong>${esc(p.title)}</strong><div class="small">${esc(p.platform || '')} · planned ${esc(p.date || 'no date')}</div>${chips}</td><td>${cell}</td><td class="r">${pub ? (pub.impressions == null ? '<span class="small">no data</span>' : fmt(pub.impressions)) : '—'}</td><td class="r">${pub ? (pub.interactions == null ? '<span class="small">no data</span>' : fmt(pub.interactions)) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>${posts.length > 8 ? `<button type="button" class="btn ghost smallbtn" data-toggle-all style="margin-top:10px">${showAll ? 'Show fewer' : `Show all ${posts.length} campaigns`}</button>` : ''}`
      : '<div class="empty">No campaigns yet. Create one, and link it here once it has been published.</div>';
    host.innerHTML = `
      <div class="eyebrow">CAMPAIGN RESULTS</div>
      <h2 style="margin-top:6px">What each campaign achieved</h2>
      <p style="margin-top:6px">Link a campaign to the post that went out, and its results follow it. ${linked.length} of ${posts.length} campaign${posts.length === 1 ? '' : 's'} linked.</p>
      ${!measured.length && posts.length ? '<div class="empty" style="margin-top:12px"><strong>No results by sport, audience or season yet.</strong><br>They appear here as soon as one campaign is linked to a published post that has figures. Campaigns planned for a future date can be linked after they go out.</div>' : byTag}
      <details id="rshCampTable" ${tableOpen ? 'open' : ''} style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;font-weight:700;color:#0066cc">Link campaigns to published posts</summary>${body}</details>
      <div class="small" style="margin-top:10px">Season phase follows a typical US school season for the sport and can differ by state. Results are the figures Metricool reports for the linked post and update when the numbers are refreshed.</div>`;
  }

  function start() {
    const home = document.getElementById('view-overview'), live = document.getElementById('rshLive'); if (!home || !app() || document.getElementById('rshCampaigns')) return;
    const card = document.createElement('div'); card.className = 'card'; card.id = 'rshCampaigns'; card.style.marginBottom = '16px';
    home.insertBefore(card, live ? live.nextSibling : home.firstChild);
    card.addEventListener('click', e => {
      const c = e.target.closest('[data-link]'); if (c) return link(c.dataset.link, c.dataset.url);
      const pk = e.target.closest('[data-link-pick]'); if (pk) { const sel = card.querySelector(`select[data-pick="${pk.dataset.linkPick}"]`); if (sel && sel.value) link(pk.dataset.linkPick, sel.value); else app().notice('Choose a published post first.'); return; }
      const u = e.target.closest('[data-unlink]'); if (u) return unlink(u.dataset.unlink);
      if (e.target.closest('[data-toggle-all]')) { showAll = !showAll; render(); }
    });
    card.addEventListener('toggle', e => { if (e.target.id === 'rshCampTable') tableOpen = e.target.open; }, true);
    if (window.RSH_LIVE && window.RSH_LIVE.onData) window.RSH_LIVE.onData(() => { syncResults(); render(); });
    document.querySelectorAll('.nav button[data-view="overview"]').forEach(b => b.addEventListener('click', () => setTimeout(render, 0)));
    render();
  }
  window.RSH_CAMPAIGNS = { start, seasonPhase, render };
})();
