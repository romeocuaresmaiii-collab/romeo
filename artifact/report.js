/* Monthly report: one page for Anthony, built in seconds from Metricool's per-post rows and the campaigns, with no
 * manual copying. Every number names its source. Opened from Insights ("Monthly report") and the header's ⋯ More menu.
 * Choose any month; download it as a page (print to PDF from there) or copy it as text. Reads only. */
(function () {
  'use strict';
  const app = () => window.RSH_APP, live = () => window.RSH_LIVE;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NETS = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', PINTEREST: 'Pinterest', THREADS: 'Threads', BLUESKY: 'Bluesky', LINKEDIN: 'LinkedIn', TWITTER: 'X' };
  const fmt = n => Math.round(n || 0).toLocaleString('en-US'), pct = (a, b) => b ? Math.round((a - b) / b * 100) : null, rate = (i, v) => v ? (i / v * 100) : 0;
  const monthKey = d => d.getFullYear() * 100 + d.getMonth() + 1, label = k => new Date(Math.floor(k / 100), k % 100 - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevKey = k => (k % 100 === 1 ? (Math.floor(k / 100) - 1) * 100 + 12 : k - 1);
  const rowsIn = (rows, k) => rows.filter(r => Math.floor(r[1] / 100) === k);
  const tot = rows => { const m = rows.filter(r => r[4] !== null && r[4] !== undefined); return { posts: rows.length, measured: m.length, views: m.reduce((a, r) => a + (r[4] || 0), 0), inter: m.reduce((a, r) => a + (r[5] || 0), 0) }; };
  let enough = true;   // a % change means little when the month before had only a handful of posts
  const chg = (a, b) => { const c = pct(a, b); return c === null || !enough ? '' : ` (${c >= 0 ? '+' : ''}${c}% vs previous month)`; };


  // Did the bots' advice work? Learn Tempo's best hour and Quill's best hashtags from the posts BEFORE the month
  // (the same rules the bots use: an hour or tag needs 2+ measured posts), then test them on the month's own posts:
  // the share of posts following the advice that beat their channel's median for the month. Out of sample, so the
  // advice cannot "win" just by being learned from the posts it is judged on.
  const etHour = (d, t) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(Date.UTC(+String(d).slice(0, 4), +String(d).slice(4, 6) - 1, +String(d).slice(6, 8), +t.slice(0, 2), +t.slice(2, 4)))));
  const advLine = (nm, a) => a.n ? `${nm}: ${a.won} of ${a.n} posts that followed it beat their channel’s median (${Math.round(a.won / a.n * 100)}%).` : `${nm}: no post this month followed it yet, or there was not enough earlier data to learn from.`;
  const score = r => r[4] != null ? r[4] : r[5];
  function adviceCheck(rows, k) {
    const before = rows.filter(r => Math.floor(r[1] / 100) < k && score(r) != null), cur = rowsIn(rows, k).filter(r => score(r) != null);
    const hours = {}, tags = {};
    for (const r of before) {
      const ch = r[0];
      if (/^\d{4}$/.test(r[7] || '')) { const h = etHour(r[1], r[7]); ((hours[ch] = hours[ch] || {})[h] = hours[ch][h] || []).push(score(r)); }
      for (const t of String(r[8] || '').split(' ').filter(Boolean)) { const x = t.toLowerCase(); ((tags[ch] = tags[ch] || {})[x] = tags[ch][x] || []).push(score(r)); }
    }
    const avg = v => v.reduce((a, b) => a + b, 0) / v.length;
    const bestHour = {}, bestTags = {};
    for (const ch of Object.keys(hours)) { const h = Object.entries(hours[ch]).filter(([, v]) => v.length >= 2).sort((a, b) => avg(b[1]) - avg(a[1]))[0]; if (h) bestHour[ch] = +h[0]; }
    for (const ch of Object.keys(tags)) { const l = Object.entries(tags[ch]).filter(([, v]) => v.length >= 2).sort((a, b) => avg(b[1]) - avg(a[1])); if (l.length >= 2) bestTags[ch] = new Set(l.slice(0, 6).map(x => x[0])); }
    const med = {}; for (const ch of new Set(cur.map(r => r[0]))) { const v = cur.filter(r => r[0] === ch).map(score).sort((a, b) => a - b); med[ch] = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; }
    const test = follows => { const f = cur.filter(follows), won = f.filter(r => score(r) > med[r[0]]); return { n: f.length, won: won.length }; };
    const time = test(r => r[0] in bestHour && /^\d{4}$/.test(r[7] || '') && Math.abs(etHour(r[1], r[7]) - bestHour[r[0]]) <= 1);
    const tag = test(r => r[0] in bestTags && String(r[8] || '').split(' ').some(t => bestTags[r[0]].has(t.toLowerCase())));
    return { time, tag, learnedFrom: before.length, hours: bestHour };
  }
  function build(k) {
    const L = live(), rows = (L && L.rows && L.rows()) || [], fetched = L && L.fetchedAt && L.fetchedAt();
    const cur = rowsIn(rows, k), prev = rowsIn(rows, prevKey(k)), T = tot(cur), P = tot(prev); enough = P.posts >= 5;
    const nets = {}; for (const r of cur) (nets[r[0]] || (nets[r[0]] = [])).push(r);
    const byNet = Object.entries(nets).map(([n, rs]) => { const t = tot(rs), pr = tot(prev.filter(r => r[0] === n)); return { n: NETS[n] || n, ...t, rate: rate(t.inter, t.views), prevViews: pr.views }; }).sort((a, b) => b.views - a.views);
    const top = cur.filter(r => r[4] !== null).sort((a, b) => (b[5] || 0) - (a[5] || 0) || (b[4] || 0) - (a[4] || 0)).slice(0, 5);
    const fmts = {}; for (const r of cur) if (r[4] !== null) { const f = (NETS[r[0]] || r[0]) + ' ' + (r[6] || 'POST').toLowerCase(); (fmts[f] || (fmts[f] = [])).push(rate(r[5] || 0, r[4] || 0)); }
    const bestFmt = Object.entries(fmts).filter(([, v]) => v.length >= 2).map(([f, v]) => [f, v.reduce((a, b) => a + b, 0) / v.length, v.length]).sort((a, b) => b[1] - a[1])[0];
    // campaigns published this month, by sport and season phase (from the campaigns linked to their post)
    const posts = (app() && app().data().posts) || [], linked = posts.filter(p => p.published && Math.floor(Number(String(p.published.date || '').replace(/-/g, '').slice(0, 8)) / 100) === k);
    const phase = p => (window.RSH_CAMPAIGNS && window.RSH_CAMPAIGNS.seasonPhase) ? window.RSH_CAMPAIGNS.seasonPhase(p.date || '') : '';
    const groups = {}; for (const p of linked) { const g = `${p.sport || 'Other'}${phase(p) ? ' · ' + phase(p) : ''}`; const x = groups[g] || (groups[g] = { n: 0, views: 0, inter: 0 }); x.n++; x.views += p.published.impressions || 0; x.inter += p.published.interactions || 0; }
    const planned = posts.filter(p => Math.floor(Number(String(p.date || '').replace(/-/g, '').slice(0, 8)) / 100) === k), approved = planned.filter(p => p.status === 'Approved' || p.status === 'Published');
    const links = cur.filter(r => /rshsports\.com/i.test(r[3] || '') || /rshsports\.com/i.test(r[2] || '')), tagged = links.filter(r => /utm_/i.test(r[3] || '') || /utm_/i.test(r[2] || ''));
    const next = [];
    if (byNet[0]) next.push(`Keep ${byNet[0].n} as the main reach channel (${fmt(byNet[0].views)} views this month).`);
    if (bestFmt) next.push(`Make more ${bestFmt[0]}s: the best interaction rate this month (${bestFmt[1].toFixed(1)} per 100 views over ${bestFmt[2]} posts).`);
    const weak = byNet.filter(x => x.measured >= 2 && x.rate < 1); if (weak.length) next.push(`Rethink ${weak.map(x => x.n).join(' and ')}: under 1 interaction per 100 views.`);
    if (links.length && tagged.length < links.length) next.push(`Tag every store link: ${links.length - tagged.length} of ${links.length} posts with a link carried no tracking (the app now tags new posts automatically).`);
    if (!linked.length) next.push('Link each campaign to its published post (Home → Campaign results) so results can be reported by sport and season.');
    const advice = adviceCheck(rows, k);
    for (const [nm, a] of [['Tempo’s posting times', advice.time], ['Quill’s hashtags', advice.tag]]) if (a.n >= 3 && a.won * 2 < a.n) next.push(`${nm} did not beat the median this month (${a.won} of ${a.n}); treat that advice as a test, not a rule.`);
    // Rivals: the app's own monthly digest (researched on the web); Metricool's competitor data only as a fallback.
    const RV = window.RSH_RIVALS, dgs = RV && RV.digest(), mk = Math.floor(k / 100) + '-' + String(k % 100).padStart(2, '0');
    const rivals = dgs && dgs.month === mk && (dgs.posts || []).length ? dgs.posts.slice(0, 15).map(p => [p.rival, p.what, 0, null, p.why]) : ((L && L.rivalPosts && L.rivalPosts()) || []).slice(0, 15);
    const rivalIdeas = dgs && dgs.month === mk ? (dgs.ideas || []).map(x => x.title) : [];
    return { k, fetched, T, P, byNet, top, groups, advice, rivals, rivalIdeas, planned: planned.length, approved: approved.length, links: links.length, tagged: tagged.length, next, empty: !cur.length };
  }

  function html(R, standalone) {
    const t = R.T, p = R.P, src = `Source: Metricool per-post results${R.fetched ? ', loaded ' + new Date(R.fetched).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}; campaigns from the RSH Sports Marketing OS.`;
    const tile = (n, v, s) => `<div class="t"><div class="l">${esc(n)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`;
    const body = R.empty ? `<p>No posts from ${esc(label(R.k))} are in the Metricool results loaded in this app yet. Refresh from Metricool on Home, or choose another month.</p>` : `
      <div class="tiles">${tile('Posts published', fmt(t.posts), p.posts ? `${fmt(p.posts)} the month before` : '')}${tile('Views', fmt(t.views), chg(t.views, p.views).replace(/[()]/g, ''))}${tile('Interactions', fmt(t.inter), chg(t.inter, p.inter).replace(/[()]/g, ''))}${tile('Interactions per 100 views', rate(t.inter, t.views).toFixed(1), p.views ? `${rate(p.inter, p.views).toFixed(1)} the month before` : '')}</div>
      <h3>By channel</h3><table><thead><tr><th>Channel</th><th>Posts</th><th>Views</th><th>Interactions</th><th>Per 100 views</th></tr></thead><tbody>${R.byNet.map(x => `<tr><td>${esc(x.n)}</td><td>${fmt(x.posts)}</td><td>${fmt(x.views)}${x.prevViews ? ` <span class="s">${esc(chg(x.views, x.prevViews))}</span>` : ''}</td><td>${fmt(x.inter)}</td><td>${x.rate.toFixed(1)}</td></tr>`).join('')}</tbody></table>
      <h3>Top posts</h3><ol>${R.top.map(r => `<li><strong>${esc(NETS[r[0]] || r[0])}</strong> · ${esc(String(r[1]).replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3'))} · ${fmt(r[5])} interactions, ${fmt(r[4])} views · “${esc(r[3] || 'no text')}”${/^https:\/\//.test(r[2]) ? ` · <a href="${esc(r[2])}" target="_blank" rel="noopener noreferrer">open</a>` : ''}</li>`).join('')}</ol>
      <h3>By sport and season phase</h3>${Object.keys(R.groups).length ? `<table><thead><tr><th>Group</th><th>Campaigns</th><th>Views</th><th>Interactions</th></tr></thead><tbody>${Object.entries(R.groups).sort((a, b) => b[1].views - a[1].views).map(([g, x]) => `<tr><td>${esc(g)}</td><td>${x.n}</td><td>${fmt(x.views)}</td><td>${fmt(x.inter)}</td></tr>`).join('')}</tbody></table>` : '<p class="s">No campaign from this month is linked to its published post yet, so results cannot be split by sport and season.</p>'}
      <h3>Rivals’ standout posts</h3>${R.rivals.length ? `<table><thead><tr><th>Competitor</th><th>Post</th><th>Why it worked / interactions</th></tr></thead><tbody>${R.rivals.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1] || 'Post')}</td><td>${r[3] == null ? esc(r[4] || '') : fmt(r[3])}</td></tr>`).join('')}</tbody></table>${R.rivalIdeas.length ? `<p class="s">Ideas to test from them: ${esc(R.rivalIdeas.join(' · '))}.</p>` : ''}` : '<p class="s">No competitor digest for this month yet (Competitors → Research now).</p>'}
      <h3>Did the bots’ advice work?</h3><p>${esc(advLine('Tempo’s posting times', R.advice.time))}<br>${esc(advLine('Quill’s hashtags', R.advice.tag))}</p><p class="s">Learned only from the ${fmt(R.advice.learnedFrom)} measured posts before this month, then checked on this month’s posts. The goal is at least half.</p>
      <h3>Pipeline and tracking</h3><p>${R.planned} campaigns planned for the month, ${R.approved} approved. ${R.links ? `${R.tagged} of ${R.links} posts with a store link carried tracking tags.` : 'No post linked to the store this month.'}</p>`;
    const inner = `<div class="eyebrow">RSH SPORTS · MONTHLY SOCIAL REPORT</div><h2>${esc(label(R.k))}</h2>${body}<h3>Next month</h3><ul>${R.next.map(x => `<li>${esc(x)}</li>`).join('') || '<li>Keep the current plan.</li>'}</ul><p class="src">${esc(src)}</p>`;
    const style = `.rep{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a}.rep h2{margin:4px 0 12px;font-size:24px}.rep h3{margin:18px 0 6px;font-size:15px}.rep .eyebrow{font-size:11px;letter-spacing:.08em;color:#64748b;font-weight:700}
      .rep .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.rep .t{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px}.rep .l{font-size:11px;color:#64748b}.rep .v{font-size:24px;font-weight:800}.rep .s{font-size:12px;color:#64748b}
      .rep table{width:100%;border-collapse:collapse;font-size:13px}.rep th,.rep td{text-align:left;padding:6px 8px;border-bottom:1px solid #eef2f7}.rep th{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}.rep .src{font-size:11.5px;color:#64748b;margin-top:16px}
      @media (max-width:640px){.rep .tiles{grid-template-columns:repeat(2,1fr)}}`;
    return standalone ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSH Sports social report ${esc(label(R.k))}</title><style>body{margin:32px;max-width:900px}${style}</style></head><body><div class="rep">${inner}</div></body></html>` : `<style>${style}</style><div class="rep">${inner}</div>`;
  }
  function text(R) {
    const t = R.T, lines = [`RSH Sports — monthly social report, ${label(R.k)}`, ''];
    if (R.empty) lines.push('No posts from this month in the loaded Metricool results.');
    else {
      lines.push(`${fmt(t.posts)} posts · ${fmt(t.views)} views${chg(t.views, R.P.views)} · ${fmt(t.inter)} interactions${chg(t.inter, R.P.inter)} · ${rate(t.inter, t.views).toFixed(1)} per 100 views`, '', 'BY CHANNEL');
      for (const x of R.byNet) lines.push(`• ${x.n}: ${fmt(x.posts)} posts, ${fmt(x.views)} views, ${fmt(x.inter)} interactions (${x.rate.toFixed(1)} per 100 views)`);
      lines.push('', 'TOP POSTS'); for (const r of R.top) lines.push(`• ${NETS[r[0]] || r[0]}: ${fmt(r[5])} interactions, ${fmt(r[4])} views — “${r[3] || 'no text'}”`);
    }
    lines.push('', 'DID THE BOTS’ ADVICE WORK?', '• ' + advLine('Tempo’s posting times', R.advice.time), '• ' + advLine('Quill’s hashtags', R.advice.tag));
    lines.push('', 'NEXT MONTH'); for (const x of R.next) lines.push('• ' + x);
    lines.push('', 'Source: Metricool per-post results; campaigns from the RSH Sports Marketing OS.'); return lines.join('\n');
  }
  let cur = null;
  function months() { const rows = (live() && live().rows && live().rows()) || [], ks = [...new Set(rows.map(r => Math.floor(r[1] / 100)))].filter(k => k > 200000).sort((a, b) => b - a); const now = monthKey(new Date()); if (!ks.includes(now)) ks.unshift(now); return ks; }
  function open(k) {
    let host = document.getElementById('rshReport');
    if (!host) {
      host = document.createElement('div'); host.id = 'rshReport'; host.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9998;display:none;align-items:flex-start;justify-content:center;padding:32px 16px;overflow:auto'; document.body.appendChild(host);
      host.addEventListener('click', async e => {
        if (e.target === host || e.target.closest('[data-rep-close]')) { host.style.display = 'none'; return; }
        if (e.target.closest('[data-rep-copy]')) { const b = e.target.closest('[data-rep-copy]'); try { await navigator.clipboard.writeText(text(cur)); b.textContent = 'Copied'; } catch (_) { b.textContent = 'Copy failed'; } setTimeout(() => { b.textContent = 'Copy as text'; }, 1800); }
        if (e.target.closest('[data-rep-save]')) { const b = e.target.closest('[data-rep-save]'); try { const dl = window.claude ? await window.claude.use('downloads') : null; const data = new Blob([html(cur, true)], { type: 'text/html' }); const name = `rsh-social-report-${cur.k}.html`; if (dl) await dl.save({ filename: name, data }); else { const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = name; a.click(); } } catch (_) { b.textContent = 'Not saved'; setTimeout(() => { b.textContent = '↧ Download'; }, 1800); } }
      });
      host.addEventListener('change', e => { if (e.target.id === 'rshRepMonth') open(Number(e.target.value)); });
    }
    const ks = months(); k = k || (new Date().getDate() <= 7 ? prevKey(monthKey(new Date())) : monthKey(new Date())); cur = build(k);
    host.innerHTML = `<div style="background:var(--card,#fff);border-radius:18px;max-width:900px;width:100%;padding:22px 26px;box-shadow:0 24px 70px rgba(0,0,0,.3)" role="dialog" aria-label="Monthly report">
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-bottom:8px"><select id="rshRepMonth" aria-label="Month" style="width:auto;min-width:180px">${[...new Set(ks.concat([k]))].sort((a, b) => b - a).map(m => `<option value="${m}" ${m === k ? 'selected' : ''}>${esc(label(m))}</option>`).join('')}</select><button type="button" class="btn ghost smallbtn" data-rep-copy>Copy as text</button><button type="button" class="btn smallbtn" data-rep-save>↧ Download</button><button type="button" class="btn ghost smallbtn" data-rep-close>✕ Close</button></div>
      ${html(cur, false)}</div>`;
    host.style.display = 'flex';
  }
  function start() {
    const menu = document.querySelector('.topmore-menu');
    if (menu && !document.getElementById('rshReportBtn')) { const b = document.createElement('button'); b.type = 'button'; b.id = 'rshReportBtn'; b.className = 'btn ghost smallbtn'; b.textContent = '▤ Monthly report'; b.addEventListener('click', () => { const d = b.closest('details'); if (d) d.open = false; open(); }); menu.insertBefore(b, menu.children[1] || null); }
    const ins = document.getElementById('view-weekly');
    if (ins && !document.getElementById('rshReportCard')) { const c = document.createElement('div'); c.className = 'card'; c.id = 'rshReportCard'; c.style.marginBottom = '16px'; c.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><div class="eyebrow">MONTHLY REPORT</div><h2 style="margin-top:4px">One page for Anthony, ready in seconds</h2><p class="small" style="margin-top:4px">Views, interactions, channels, top posts, results by sport and season, link tracking and what to do next month, straight from Metricool. Download it or copy it as text.</p></div><button type="button" class="btn" data-rep-open>▤ Open the monthly report</button></div>'; c.querySelector('[data-rep-open]').addEventListener('click', () => open()); ins.insertBefore(c, ins.firstChild); }
  }
  start(); document.addEventListener('DOMContentLoaded', start); setTimeout(start, 1500);
  window.RSH_REPORT = { build, open, text, html, adviceCheck };
})();
