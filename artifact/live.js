/* RSH Sports Marketing OS — live results panel (artifact edition only).
 *
 * Reads published-post results for the RSH Sports brand from Metricool through the viewer's own
 * Claude connector, keeps the latest pull in the artifact database so anyone who opens the page
 * sees it, and shows it at the top of Home. Read-only: it never schedules, edits or publishes.
 * Numbers are shown exactly as Metricool reports them; nothing is estimated or filled in.
 */
(function () {
  'use strict';
  const SERVER = 'Metricool Social Media Management', TOOL = 'getAnalyticsDataByMetrics';
  const BRAND_ID = '5695688';                      // RSH Sports brand in Metricool
  const FIELDS = ['BSPO01', 'BSPO02', 'BSPO03', 'BSPO05', 'BSPO06', 'BSPO07', 'BSPO09'];
  const DOC = 'live/metricool', DAYS = 14, STALE_MS = 3 * 3600 * 1000;
  const SCHED_TOOL = 'getScheduledPosts', FOLLOW_FIELDS = ['IGEV01', 'FBEV17', 'TKEV07', 'YTEV01', 'PIEV09', 'THEV01', 'BKEV01'], FOLLOW_NETS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'THREADS', 'BLUESKY'];
  const NETS = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', PINTEREST: 'Pinterest', THREADS: 'Threads', BLUESKY: 'Bluesky', TWITTER: 'X', LINKEDIN: 'LinkedIn' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  let db = null, canRefresh = false, state = { rows: null, fetchedAt: null, followers: null, scheduled: null, comments: null, rivals: null, busy: false, note: '' };

  const css = document.createElement('style');
  css.textContent = `
  .rsh-live .live-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start}
  .rsh-live .live-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:16px}
  .rsh-live .live-tile{border:1px solid #e5e5ea;border-radius:14px;padding:14px 16px;background:#fff;min-width:0}
  .rsh-live .live-tile .n{font-size:28px;font-weight:800;letter-spacing:-.02em;color:#1d1d1f;font-variant-numeric:tabular-nums;margin-top:4px}
  .rsh-live .delta{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
  .rsh-live .delta.up{color:#1a7f37}.rsh-live .delta.down{color:#b42318}.rsh-live .delta.flat{color:#6e6e73}
  .rsh-live .live-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;margin-top:16px}
  @media (max-width:900px){.rsh-live .live-grid{grid-template-columns:minmax(0,1fr)}}
  .rsh-live .live-box{border:1px solid #e5e5ea;border-radius:14px;padding:14px 16px;background:#fff;min-width:0}
  .rsh-live h3{margin:0 0 10px;font-size:14px}
  .rsh-live .scroll{overflow-x:auto}
  .rsh-live table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
  .rsh-live th{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;text-align:right;padding:6px 8px;font-weight:700;white-space:nowrap}
  .rsh-live th:first-child,.rsh-live td:first-child{text-align:left}
  .rsh-live td{padding:8px;border-top:1px solid #f0f0f3;text-align:right;color:#1d1d1f;white-space:nowrap}
  .rsh-live .bar{height:6px;border-radius:3px;background:#0071e3;min-width:2px;margin-top:5px}
  .rsh-live .top{display:flex;gap:10px;align-items:baseline;padding:9px 0;border-top:1px solid #f0f0f3;font-size:12.5px}
  .rsh-live .top:first-of-type{border-top:0}
  .rsh-live .top .rank{font-weight:800;color:#6e6e73;width:14px;flex:none}
  .rsh-live .top .what{flex:1;min-width:0}
  .rsh-live .top .what a{color:#0066cc;font-weight:700;text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rsh-live .top .what a:hover{text-decoration:underline}
  .rsh-live .top .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:#1d1d1f;font-weight:700}
  .rsh-live .insight{margin-top:14px;padding:12px 14px;border-radius:12px;background:#f5f8ff;border:1px solid #dbe7fb;font-size:13px;color:#1d1d1f;line-height:1.5}
  .rsh-live .live-empty{margin-top:14px;padding:22px;border:1px dashed #c7c7cc;border-radius:14px;text-align:center;color:#515154;font-size:13px;line-height:1.5}
  .rsh-live .sched{display:flex;gap:10px;padding:8px 0;border-top:1px solid #f0f0f3;font-size:12.5px;align-items:baseline}
  .rsh-live .sched:first-of-type{border-top:0}
  .rsh-live .sched .when{flex:none;width:96px;font-weight:700;color:#1d1d1f;font-variant-numeric:tabular-nums}
  .rsh-live .sched .what{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rsh-live .brief{margin-top:16px;border:1px solid #e5e5ea;border-radius:14px;background:#fff;padding:14px 16px}
  .rsh-live .brief-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .rsh-live .brief-item{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid #f0f0f3;font-size:13px;line-height:1.5;color:#1d1d1f}
  .rsh-live .brief-item:first-of-type{border-top:0}
  .rsh-live .brief-tag{flex:none;width:92px;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 0;border-radius:6px;text-align:center;margin-top:1px}
  .rsh-live .brief-tag.good{background:#eaf7ee;color:#1a7f37}.rsh-live .brief-tag.act{background:#fff3e0;color:#b45309}.rsh-live .brief-tag.info{background:#f0f0f3;color:#515154}
  .rsh-live .live-detail{margin-top:16px}
  .rsh-live .live-detail>summary{cursor:pointer;font-size:13px;font-weight:700;color:#0066cc;padding:6px 0}
  .rsh-live .live-foot{margin-top:12px;font-size:11.5px;color:#6e6e73;line-height:1.5}`;
  document.head.appendChild(css);

  /* ---------- data ---------- */
  const dayKey = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  function windows(endMs) {
    const end = new Date(endMs); end.setHours(0, 0, 0, 0);
    const at = n => { const d = new Date(end); d.setDate(d.getDate() - n); return d; };
    return { curFrom: at(DAYS - 1), curTo: at(0), prevFrom: at(2 * DAYS - 1), prevTo: at(DAYS) };
  }
  const iso = (d, time) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${time}-05:00`;
  const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

  function findRows(x, depth) {
    if (depth > 6 || x == null) return null;
    if (typeof x === 'string') { const t = x.trim(); if (t[0] === '{' || t[0] === '[') { try { return findRows(JSON.parse(t), depth + 1); } catch (_) {} } return null; }
    if (Array.isArray(x)) { if (x.length && Array.isArray(x[0]) && x[0].length >= FIELDS.length) return x; for (const v of x) { const r = findRows(v, depth + 1); if (r) return r; } return x.length === 0 ? null : null; }
    if (typeof x === 'object') { if (Array.isArray(x.rows)) return x.rows; for (const k of Object.keys(x)) { const r = findRows(x[k], depth + 1); if (r) return r; } }
    return null;
  }
  // Compact rows: [network, yyyymmdd, link, text, impressions|null, interactions|null, format]
  const compact = rows => rows.filter(r => Array.isArray(r) && r[0] && r[1]).map(r => [String(r[0]).toUpperCase(), Number(String(r[1]).slice(0, 8)), String(r[2] || '').slice(0, 300), String(r[3] || '').replace(/\s+/g, ' ').trim().slice(0, 90), num(r[4]), num(r[5]), String(r[6] || '').toUpperCase(), /^\d{12}/.test(String(r[1])) ? String(r[1]).slice(8, 12) : '', (String(r[3] || '').match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 15).join(' ')]);

  function summarise(rows, endMs) {
    const w = windows(endMs), cf = dayKey(w.curFrom), ct = dayKey(w.curTo), pf = dayKey(w.prevFrom), pt = dayKey(w.prevTo);
    const blank = () => ({ posts: 0, measured: 0, impressions: 0, interactions: 0 });
    const cur = blank(), prev = blank(), nets = {}, formats = {}, tops = [];
    for (const r of rows) {
      const inCur = r[1] >= cf && r[1] <= ct, inPrev = r[1] >= pf && r[1] <= pt; if (!inCur && !inPrev) continue;
      const net = nets[r[0]] || (nets[r[0]] = { cur: blank(), prev: blank() });
      for (const t of [inCur ? cur : prev, inCur ? net.cur : net.prev]) { t.posts++; if (r[4] !== null) { t.measured++; t.impressions += r[4]; t.interactions += r[5] || 0; } }
      if (inCur && r[4] !== null) {
        tops.push(r);
        const key = r[0] + '|' + r[6]; (formats[key] || (formats[key] = [])).push(r[4]);
      }
    }
    tops.sort((a, b) => (b[5] || 0) - (a[5] || 0) || b[4] - a[4]);
    let best = null;
    for (const key of Object.keys(formats)) { const v = formats[key].sort((a, b) => a - b); if (v.length < 3) continue; const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; if (!best || med > best.median) best = { key, median: med, count: v.length }; }
    return { w, cur, prev, nets, tops: tops.slice(0, 5), best };
  }

  /* ---------- rendering ---------- */
  function delta(now, before) {
    if (!before) return now ? '<span class="delta flat">no earlier data to compare</span>' : '<span class="delta flat">—</span>';
    const pct = (now - before) / before * 100, cls = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : ''}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%</span> <span class="small">vs previous ${DAYS} days (${fmt(before)})</span>`;
  }
  const rate = t => t.impressions ? (t.interactions / t.impressions * 100) : null;
  const shortDate = k => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatName = f => ({ REEL: 'Reel', VIDEO: 'video', IMAGE: 'photo', CAROUSEL: 'carousel', ALBUM: 'album', PIN: 'Pin', STORY: 'Story' }[f] || f.toLowerCase());

  function followersBox() {
    const f = state.followers; if (!f || !f.length) return '';
    const total = f.reduce((a, r) => a + (r[4] || 0), 0), start = f.reduce((a, r) => a + (r[2] || 0), 0), gain = total - start;
    const rows = f.slice().sort((a, b) => (b[4] || 0) - (a[4] || 0)).map(r => { const d = (r[4] || 0) - (r[2] || 0); return `<tr><td><strong>${esc(NETS[r[0]] || r[0])}</strong></td><td>${fmt(r[4] || 0)}</td><td><span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' : ''}${fmt(d)}</span></td></tr>`; }).join('');
    const since = f.reduce((m, r) => Math.min(m, r[1]), 99999999);
    return `<div class="live-box"><h3>Followers · ${fmt(total)} across ${f.length} channels</h3><div class="scroll"><table><thead><tr><th>Channel</th><th>Followers</th><th>Since ${esc(shortDate(since))}</th></tr></thead><tbody>${rows}<tr><td><strong>All channels</strong></td><td><strong>${fmt(total)}</strong></td><td><span class="delta ${gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat'}">${gain > 0 ? '+' : ''}${fmt(gain)}</span></td></tr></tbody></table></div></div>`;
  }
  function scheduledBox() {
    const all = state.scheduled; if (!all) return '';
    const now = new Date(), stamp = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const limit = new Date(now); limit.setDate(limit.getDate() + 7);
    const next = all.filter(p => p[0] >= stamp(now).slice(0, 10) && p[0] <= stamp(limit)).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const drafts = next.filter(p => p[4]).length;
    const label = t => { const d = new Date(t + ':00'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
    const list = next.slice(0, 7).map(p => `<div class="sched"><span class="when">${esc(label(p[0]))}</span><span class="what"><strong>${esc(p[2] || p[3])}</strong><br><span class="small">${esc(p[3])} · ${esc(p[1].split(',').map(n => NETS[n.toUpperCase()] || n).join(', '))}${p[4] ? ' · draft' : ''}</span></span></div>`).join('');
    return `<div class="live-box"><h3>Scheduled in Metricool · next 7 days</h3>${next.length ? `<div class="small" style="margin-bottom:6px">${next.length} post${next.length === 1 ? '' : 's'} scheduled${drafts ? `, ${drafts} still draft` : ''}. Times are US Eastern.</div>${list}${next.length > 7 ? `<div class="small" style="margin-top:6px">…and ${next.length - 7} more.</div>` : ''}` : '<div class="small">Nothing is scheduled in Metricool for the next 7 days.</div>'}</div>`;
  }

  // Plain-language findings for Anthony, each computed directly from the figures on this page.
  function findings(s) {
    const out = [], pct = (a, b) => b ? Math.round((a - b) / b * 100) : null, sign = n => (n > 0 ? '+' : '') + n;
    const pi = pct(s.cur.impressions, s.prev.impressions), pn = pct(s.cur.interactions, s.prev.interactions);
    if (pi !== null && pn !== null) {
      const up = pi >= 0 && pn >= 0, mixed = (pi < 0) !== (pn < 0);
      out.push([up ? 'good' : mixed ? 'info' : 'act', up ? 'Growing' : mixed ? 'Mixed' : 'Declining',
        `Impressions ${pi >= 0 ? 'rose' : 'fell'} ${Math.abs(pi)}% (${fmt(s.prev.impressions)} → ${fmt(s.cur.impressions)}) and interactions ${pn >= 0 ? 'rose' : 'fell'} ${Math.abs(pn)}% (${fmt(s.prev.interactions)} → ${fmt(s.cur.interactions)}) compared with the previous ${DAYS} days.` + (pi < 0 && pn > 0 ? ' Fewer people saw the posts, but those who did engaged more.' : '')]);
    }
    const f = state.followers;
    if (f && f.length) {
      const total = f.reduce((a, r) => a + (r[4] || 0), 0), gain = total - f.reduce((a, r) => a + (r[2] || 0), 0);
      const grew = f.filter(r => r[4] > r[2]).sort((a, b) => (b[4] - b[2]) - (a[4] - a[2])).map(r => `${NETS[r[0]] || r[0]} ${sign(r[4] - r[2])}`), flat = f.filter(r => r[4] === r[2]).map(r => NETS[r[0]] || r[0]), lost = f.filter(r => r[4] < r[2]).map(r => `${NETS[r[0]] || r[0]} ${sign(r[4] - r[2])}`);
      out.push([gain > 0 ? 'good' : gain < 0 ? 'act' : 'info', 'Audience', `${fmt(total)} followers across ${f.length} channels, ${sign(gain)} since ${shortDate(f.reduce((m, r) => Math.min(m, r[1]), 99999999))}.` + (grew.length ? ` Growth came from ${grew.join(', ')}.` : '') + (flat.length ? ` No change on ${flat.join(', ')}.` : '') + (lost.length ? ` Lost: ${lost.join(', ')}.` : '')]);
    }
    if (s.tops[0]) { const t = s.tops[0]; out.push(['good', 'Best post', `${NETS[t[0]] || t[0]} ${formatName(t[6])} on ${shortDate(t[1])}${t[3] ? ` (“${t[3].slice(0, 60)}${t[3].length > 60 ? '…' : ''}”)` : ''}: ${fmt(t[5] || 0)} interactions from ${fmt(t[4])} impressions.`]); }
    const quiet = Object.keys(s.nets).filter(k => s.nets[k].cur.posts && !s.nets[k].cur.measured).map(k => NETS[k] || k);
    if (quiet.length) out.push(['info', 'No data', `${quiet.join(' and ')} ${quiet.length === 1 ? 'has' : 'have'} posts going out but Metricool reports no impressions for ${quiet.length === 1 ? 'it' : 'them'}, so ${quiet.length === 1 ? 'its' : 'their'} results cannot be judged here.`]);
    const sc = state.scheduled;
    if (sc) {
      const today = new Date(), key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const wk = new Date(today); wk.setDate(wk.getDate() + 7);
      const up = sc.filter(p => p[0].slice(0, 10) >= key(today)), next = up.filter(p => p[0].slice(0, 10) <= key(wk)), drafts = next.filter(p => p[4]);
      if (!up.length) out.push(['act', 'Schedule', 'Nothing is scheduled in Metricool from today onward.']);
      else {
        const last = up[up.length - 1][0].slice(0, 10), lastDate = new Date(last + 'T12:00:00'), gapDays = Math.round((wk - lastDate) / 86400000);
        const lastLabel = lastDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        out.push([drafts.length || gapDays > 0 ? 'act' : 'good', 'Schedule', `${next.length} post${next.length === 1 ? '' : 's'} scheduled for the next 7 days.` + (drafts.length ? ` ${drafts.length} ${drafts.length === 1 ? 'is' : 'are'} still in draft and will not publish until finished (next: ${new Date(drafts[0][0] + ':00').toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} Eastern).` : '') + (gapDays > 0 ? ` The schedule ends on ${lastLabel}; nothing is planned after that yet.` : '')]);
      }
    }
    if (state.comments && state.comments.length) { const n = state.comments.reduce((a, r) => a + (r[4] || 0), 0); out.push(['act', 'Replies', `${fmt(n)} comment${n === 1 ? '' : 's'} came in on ${state.comments.length} post${state.comments.length === 1 ? '' : 's'} in the last ${DAYS} days. Answering each one is the cheapest way to grow at this size.`]); }
    const la = linkAudit(s);
    if (la.store.length && la.untagged.length) out.push(['act', 'Tracking', `${la.untagged.length} of ${la.store.length} posts linking to rshsports.com carry no campaign tracking${la.home.length ? `, and ${la.home.length} point to the homepage` : ''}. Until links are tagged, store sales cannot be credited to social posts.`]);
    try {
      const ws = JSON.parse((window.RSH_HOST && window.RSH_HOST.read('rsh_growth_command_v1')) || '{}'), posts = Array.isArray(ws.posts) ? ws.posts : [];
      const mgr = posts.filter(p => p.status === 'Review' && !(p.approvalMeta && p.approvalMeta.pmReviewedAt)).length, ant = posts.filter(p => p.status === 'Review' && p.approvalMeta && p.approvalMeta.pmReviewedAt && !p.approvalMeta.anthonyConfirmedAt).length;
      if (ant) out.push(['act', 'Your decision', `${ant} campaign${ant === 1 ? ' is' : 's are'} waiting for Anthony’s final approval in Reviews.`]);
      if (mgr) out.push(['info', 'In review', `${mgr} campaign${mgr === 1 ? ' is' : 's are'} with the team for manager review; none of these need Anthony yet.`]);
    } catch (_) {}
    return out;
  }
  function briefBox(s) {
    const items = findings(s); if (!items.length) return '';
    return `<div class="brief"><div class="brief-head"><h3 style="margin:0">This week in brief</h3><button class="btn ghost smallbtn" type="button" data-live-copy>Copy summary</button></div>${items.map(i => `<div class="brief-item"><span class="brief-tag ${i[0]}">${esc(i[1])}</span><span>${esc(i[2])}</span></div>`).join('')}</div>`;
  }
  function briefText(s) {
    return `RSH Sports — social summary (${shortDate(dayKey(s.w.curFrom))} – ${shortDate(dayKey(s.w.curTo))})\n` + findings(s).map(i => `• ${i[1]}: ${i[2]}`).join('\n') + '\nSource: Metricool, updated ' + new Date(state.fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.';
  }

  // Outbound links: which published posts send people to the store without campaign tracking.
  function linkAudit(s) {
    const cf = dayKey(s.w.curFrom), ct = dayKey(s.w.curTo);
    const store = state.rows.filter(r => r[1] >= cf && r[1] <= ct && /^https?:\/\/(www\.)?rshsports\.com/i.test(r[2]));
    const untagged = store.filter(r => !/[?&]utm_/i.test(r[2])), home = store.filter(r => /^https?:\/\/(www\.)?rshsports\.com\/?(\?.*)?$/i.test(r[2]));
    return { store, untagged, home };
  }
  function linkBox(s) {
    const a = linkAudit(s); if (!a.store.length) return '';
    const ok = !a.untagged.length;
    const month = new Date().toISOString().slice(0, 7);
    return `<div class="live-box"><h3>Link tracking · last ${DAYS} days</h3>
      <div class="small" style="margin-bottom:8px">${a.store.length} published post${a.store.length === 1 ? '' : 's'} linked to rshsports.com.</div>
      <div class="sched"><span class="when">${a.untagged.length} of ${a.store.length}</span><span><strong>${ok ? 'All links carry campaign tracking' : 'have no campaign tracking'}</strong><br><span class="small">${ok ? 'Visits from these posts can be told apart in store analytics.' : 'Visits from these posts cannot be told apart from any other visit, so sales cannot be credited to them.'}</span></span></div>
      <div class="sched"><span class="when">${a.home.length} of ${a.store.length}</span><span><strong>point to the homepage</strong><br><span class="small">A product or collection page gives the visitor less to do before buying.</span></span></div>
      ${ok ? '' : `<div class="small" style="margin-top:8px">Tagged link to use on Pinterest this month:</div><div class="sample" style="margin-top:4px;font-size:11.5px;word-break:break-all;user-select:all">https://www.rshsports.com/collections/wrestling?utm_source=pinterest&amp;utm_medium=organic_social&amp;utm_campaign=${esc(month)}</div><div class="small" style="margin-top:6px">Swap the collection and campaign name per post. Build others in Revenue &amp; ROI.</div>`}</div>`;
  }
  function replyBox() {
    const c = state.comments; if (!c) return '';
    const total = c.reduce((a, r) => a + (r[4] || 0), 0);
    const list = c.slice().sort((a, b) => b[1] - a[1] || b[4] - a[4]).slice(0, 7).map(r => `<div class="top"><div class="what"><a href="${esc(/^https:\/\//.test(r[2]) ? r[2] : '#')}" target="_blank" rel="noopener noreferrer">${esc(r[3] || ((NETS[r[0]] || r[0]) + ' post'))}</a><span class="small">${esc(NETS[r[0]] || r[0])} · ${esc(shortDate(r[1]))}</span></div><div class="num">${fmt(r[4])} <span class="small">comment${r[4] === 1 ? '' : 's'}</span></div></div>`).join('');
    return `<div class="live-box"><h3>Comments to answer · last ${DAYS} days</h3>${c.length ? `<div class="small" style="margin-bottom:4px">${fmt(total)} comment${total === 1 ? '' : 's'} on ${c.length} post${c.length === 1 ? '' : 's'}. Open each post to reply; this list cannot show whether a reply was already sent.</div>${list}${c.length > 7 ? `<div class="small" style="margin-top:6px">…and ${c.length - 7} more posts.</div>` : ''}` : '<div class="small">No comments were recorded on posts from this period.</div>'}</div>`;
  }
  function rivalBox() {
    const r = state.rivals; if (!r || !r.length) return '';
    const rows = r.slice().sort((a, b) => (b[2] || 0) - (a[2] || 0)).map(x => `<tr><td><strong>${esc(x[1])}</strong><div class="small">${esc(NETS[x[0]] || x[0])}</div></td><td>${x[2] == null ? '—' : fmt(x[2])}</td><td>${x[3] == null ? '—' : fmt(x[3])}</td><td>${x[4] == null ? '—' : fmt(x[4])}</td></tr>`).join('');
    return `<div class="live-box"><h3>Competitors tracked in Metricool · last ${DAYS} days</h3><div class="scroll"><table><thead><tr><th>Account</th><th>Followers</th><th>Posts</th><th>Interactions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  const listeners = [];
  function render() { document.querySelectorAll('.rsh-live').forEach(renderInto); for (const fn of listeners) { try { fn(); } catch (_) {} } }
  const detailOpen = {};
  function renderInto(host) {
    if (!(host.id in detailOpen)) detailOpen[host.id] = host.id !== 'rshLive';
    const when = state.fetchedAt ? new Date(state.fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    let body;
    if (!state.rows) {
      body = `<div class="live-empty"><strong>No live results loaded yet.</strong><br>${canRefresh ? `Press “Refresh from Metricool” to pull the last ${DAYS * 2} days of published posts for RSH Sports. The first time, Claude asks you to allow the Metricool connector for this page.` : 'Results from Metricool appear here as soon as they are loaded into this workspace.'}</div>`;
    } else {
      const s = summarise(state.rows, state.fetchedAt);
      const er = rate(s.cur), erPrev = rate(s.prev);
      const netRows = Object.keys(s.nets).map(k => ({ k, ...s.nets[k] })).filter(n => n.cur.posts || n.prev.posts).sort((a, b) => b.cur.impressions - a.cur.impressions);
      const maxImp = Math.max(1, ...netRows.map(n => n.cur.impressions));
      const change = (a, b) => !b ? '<span class="delta flat">—</span>' : (() => { const p = (a - b) / b * 100; return `<span class="delta ${Math.abs(p) < 0.5 ? 'flat' : p > 0 ? 'up' : 'down'}">${p > 0 ? '+' : ''}${p.toFixed(0)}%</span>`; })();
      const unmeasured = s.cur.posts - s.cur.measured;
      const bestText = s.best ? (() => { const [n, f] = s.best.key.split('|'); return `<strong>Strongest format right now:</strong> ${esc(NETS[n] || n)} ${esc(formatName(f))}s, with a median of ${fmt(s.best.median)} impressions per post across ${s.best.count} posts in the last ${DAYS} days. This describes what happened; it does not prove why.`; })() : '';
      body = `${briefBox(s)}
      <div class="live-tiles">
        <div class="live-tile"><div class="small">Posts published</div><div class="n">${fmt(s.cur.posts)}</div>${delta(s.cur.posts, s.prev.posts)}</div>
        <div class="live-tile"><div class="small">Impressions / views</div><div class="n">${fmt(s.cur.impressions)}</div>${delta(s.cur.impressions, s.prev.impressions)}</div>
        <div class="live-tile"><div class="small">Interactions</div><div class="n">${fmt(s.cur.interactions)}</div>${delta(s.cur.interactions, s.prev.interactions)}</div>
        <div class="live-tile"><div class="small">Interactions per 100 impressions</div><div class="n">${er === null ? '—' : er.toFixed(1)}</div>${erPrev === null ? '<span class="delta flat">no earlier data to compare</span>' : `<span class="small">previous ${DAYS} days: ${erPrev.toFixed(1)}</span>`}</div>
      </div>
      ${bestText ? `<div class="insight">${bestText}</div>` : ''}
      <details class="live-detail" ${detailOpen[host.id] ? 'open' : ''}><summary>Channels, top posts, followers, schedule, comments and links</summary>
      <div class="live-grid">
        <div class="live-box"><h3>By channel · last ${DAYS} days</h3><div class="scroll"><table>
          <thead><tr><th>Channel</th><th>Posts</th><th>Impressions</th><th>vs prev.</th><th>Interactions</th></tr></thead>
          <tbody>${netRows.map(n => `<tr><td><strong>${esc(NETS[n.k] || n.k)}</strong><div class="bar" style="width:${Math.max(2, n.cur.impressions / maxImp * 100)}%"></div></td><td>${fmt(n.cur.posts)}</td><td>${n.cur.measured ? fmt(n.cur.impressions) : '<span class="small">no data</span>'}</td><td>${change(n.cur.impressions, n.prev.impressions)}</td><td>${n.cur.measured ? fmt(n.cur.interactions) : '<span class="small">no data</span>'}</td></tr>`).join('')}</tbody>
        </table></div></div>
        <div class="live-box"><h3>Top posts · last ${DAYS} days</h3>${s.tops.length ? s.tops.map((r, i) => `<div class="top"><span class="rank">${i + 1}</span><div class="what"><a href="${esc(/^https:\/\//.test(r[2]) ? r[2] : '#')}" target="_blank" rel="noopener noreferrer">${esc(r[3] || ((NETS[r[0]] || r[0]) + ' ' + formatName(r[6])))}</a><span class="small">${esc(NETS[r[0]] || r[0])} · ${esc(formatName(r[6]))} · ${esc(shortDate(r[1]))}</span></div><div class="num">${fmt(r[5] || 0)} <span class="small">interactions</span><br><span class="small">${fmt(r[4])} impressions</span></div></div>`).join('') : '<div class="small">No measured posts in this period.</div>'}</div>
      </div>
      ${(state.followers && state.followers.length) || state.scheduled ? `<div class="live-grid">${followersBox()}${scheduledBox()}</div>` : ''}
      ${(() => { const boxes = replyBox() + linkBox(s); return boxes ? `<div class="live-grid">${boxes}</div>` : ''; })()}
      ${rivalBox() ? `<div class="live-grid" style="grid-template-columns:minmax(0,1fr)">${rivalBox()}</div>` : ''}
      </details>
      <div class="live-foot">Period: ${esc(shortDate(dayKey(s.w.curFrom)))} – ${esc(shortDate(dayKey(s.w.curTo)))}, compared with ${esc(shortDate(dayKey(s.w.prevFrom)))} – ${esc(shortDate(dayKey(s.w.prevTo)))}. Impressions and interactions are per-post figures exactly as Metricool reports them${unmeasured ? `; ${unmeasured} post${unmeasured === 1 ? '' : 's'} (mostly Stories and very recent posts) have no figures yet and are counted as published only` : ''}. Website sales are not included here.</div>`;
    }
    host.innerHTML = `
      <div class="live-head">
        <div><div class="eyebrow">LIVE RESULTS · METRICOOL</div><h2 style="margin-top:6px">How RSH Sports is performing right now</h2>
        <p style="margin-top:6px">Every published post across your channels, pulled straight from Metricool.</p></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${state.rows ? 'good' : 'warn'}" data-live-stamp>${state.busy ? 'Refreshing…' : when ? 'Updated ' + esc(when) : 'Not loaded'}</span>${canRefresh ? `<button class="btn smallbtn" data-live-refresh type="button" ${state.busy ? 'disabled' : ''}>↻ Refresh from Metricool</button>` : ''}</div>
      </div>
      ${state.note ? `<div class="hint" role="status" style="margin-top:12px">${esc(state.note)}</div>` : ''}${body}`;
    const det = host.querySelector('.live-detail'); if (det) det.addEventListener('toggle', () => { detailOpen[host.id] = det.open; });
    const btn = host.querySelector('[data-live-refresh]'); if (btn) btn.addEventListener('click', () => refresh(true));
    const copy = host.querySelector('[data-live-copy]');
    if (copy) copy.addEventListener('click', () => {
      const text = briefText(summarise(state.rows, state.fetchedAt)), done = ok => { copy.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { copy.textContent = 'Copy summary'; }, 1800); };
      try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); }
    });
  }

  function findFollowerRows(result) {
    const rows = findRows(result && (result.payload !== undefined ? result.payload : result), 0); if (!rows) return null;
    const sorted = rows.filter(r => Array.isArray(r) && r.length >= FOLLOW_FIELDS.length + 1).map(r => ({ day: Number(String(r[r.length - 1]).slice(0, 8)), v: r })).sort((a, b) => a.day - b.day);
    const out = [];
    FOLLOW_NETS.forEach((net, i) => { const have = sorted.filter(x => num(x.v[i]) !== null); if (have.length) out.push([net, have[0].day, num(have[0].v[i]), have[have.length - 1].day, num(have[have.length - 1].v[i])]); });
    return out.length ? out : null;
  }
  function compactScheduled(result) {
    let x = result && (result.payload !== undefined ? result.payload : result);
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch (_) { return null; } }
    if (x && Array.isArray(x.content) && x.content[0] && typeof x.content[0].text === 'string') { try { x = JSON.parse(x.content[0].text); } catch (_) { return null; } }
    const data = x && Array.isArray(x.data) ? x.data : null; if (!data) return null;
    return data.map(p => {
      const nets = (p.providers || []).map(v => String(v.network || '').toLowerCase()).filter(Boolean);
      const only = n => nets.length === 1 && nets[0] === n, has = n => nets.indexOf(n) >= 0;
      const text = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 70);
      const title = only('youtube') && p.youtubeData && p.youtubeData.title ? p.youtubeData.title : (p.facebookData && p.facebookData.title) || text;
      const reel = (has('instagram') && p.instagramData && p.instagramData.type === 'REEL') || (has('facebook') && p.facebookData && p.facebookData.type === 'REEL');
      const kind = reel ? 'Reel' : only('youtube') && p.youtubeData && p.youtubeData.type === 'short' ? 'Short' : p.videoThumbnailUrl ? 'Video' : only('pinterest') ? 'Pin' : 'Post';
      return [String((p.publicationDate && p.publicationDate.dateTime) || '').slice(0, 16), nets.join(','), String(title).slice(0, 90), kind, p.draft ? 1 : 0];
    }).filter(p => p[0]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  }

  /* ---------- loading ---------- */
  async function refresh(byClick) {
    if (state.busy) return; state.busy = true; state.note = ''; render();
    try {
      const mcp = await use('mcp');
      if (!mcp) throw { code: 'no_connector' };
      const w = windows(Date.now());
      // Two 14-day pulls: one 28-day pull came back larger than Metricool allows (“The result exceeds the maximum allowed size”).
      const pull = async (from, to) => { const res = await mcp.callTool(SERVER, TOOL, { brandId: BRAND_ID, from: iso(from, '00:00:00'), to: iso(to, '23:59:59'), metrics: FIELDS }); return findRows(res && (res.payload !== undefined ? res.payload : res), 0) || findRows(res, 0); };
      const cur = await pull(w.curFrom, w.curTo), prev = await pull(w.prevFrom, w.prevTo);
      if (!cur && !prev) throw { code: 'unreadable_answer' };
      const raw = (cur || []).concat(prev || []);
      state.rows = compact(raw); state.fetchedAt = new Date().toISOString();
      try {
        const fr = findFollowerRows(await mcp.callTool(SERVER, TOOL, { brandId: BRAND_ID, from: iso(w.prevFrom, '00:00:00'), to: iso(w.curTo, '23:59:59'), metrics: FOLLOW_FIELDS }));
        if (fr) { state.followers = fr; if (db) await db.doc('live/followers').set({ fetchedAt: state.fetchedAt, followers: JSON.stringify(fr) }); }
      } catch (_) {}
      try {
        const until = new Date(w.curTo); until.setDate(until.getDate() + 14);
        const sp = compactScheduled(await mcp.callTool(SERVER, SCHED_TOOL, { brandId: BRAND_ID, fromDate: iso(w.curTo, '00:00:00'), toDate: iso(until, '23:59:59'), timezone: 'America/New_York' }));
        if (sp) { state.scheduled = sp; if (db) await db.doc('live/scheduled').set({ fetchedAt: state.fetchedAt, posts: JSON.stringify(sp).slice(0, 230000) }); }
      } catch (_) {}
      if (db) { try { await db.doc(DOC).set({ fetchedAt: state.fetchedAt, days: DAYS, rows: JSON.stringify(state.rows).slice(0, 230000) }); } catch (_) { state.note = 'Loaded, but the results could not be saved for other viewers.'; } }
    } catch (e) {
      const code = (e && e.code) || 'unknown';
      const why = code === 'no_connector' ? 'Live refresh is not available in this view.'
        : (code === 'consent_denied' || code === 'not_granted' || code === 'denied') ? 'Metricool access was not allowed for this page, so nothing was refreshed.'
        : code === 'server_not_connected' ? 'The Metricool connector is not connected in your Claude account.'
        : code === 'unreadable_answer' ? 'Metricool answered, but not in a form this page can read.'
        : 'Metricool could not be reached just now.';
      state.note = why + (state.rows ? ' Showing the last saved results.' : '') + ' [' + code + ']';
      if (db) { try { await db.doc('diagnostics/live').set({ code, message: String((e && e.message) || '').slice(0, 300), byClick: !!byClick, at: new Date().toISOString() }); } catch (_) {} }
    } finally { state.busy = false; render(); }
  }

  async function start() {
    const home = document.getElementById('view-overview'); if (!home || document.getElementById('rshLive')) return;
    const card = document.createElement('div'); card.className = 'card rsh-live'; card.id = 'rshLive'; card.style.marginBottom = '16px';
    home.insertBefore(card, home.firstChild);
    const exec = document.getElementById('view-executive');
    if (exec) { const c2 = document.createElement('div'); c2.className = 'card rsh-live'; c2.id = 'rshLiveExecutive'; c2.style.marginBottom = '16px'; const tabs = exec.querySelector(':scope > .view-tabs'); exec.insertBefore(c2, tabs ? tabs.nextSibling : exec.firstChild); }
    render();
    const [d, mcp] = await Promise.all([use('db'), use('mcp')]); db = d; canRefresh = !!mcp;
    if (db) {
      const read = async (path) => { try { const snap = await Promise.race([db.doc(path).get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]); return snap.exists ? snap.data() : null; } catch (_) { return null; } };
      const [posts, fol, sch, com, riv] = await Promise.all([read(DOC), read('live/followers'), read('live/scheduled'), read('live/comments'), read('live/rivals')]);
      try { if (com) state.comments = JSON.parse(com.posts); } catch (_) {}
      try { if (riv) state.rivals = JSON.parse(riv.rivals); } catch (_) {}
      try { if (posts) { state.rows = JSON.parse(posts.rows); state.fetchedAt = posts.fetchedAt; } } catch (_) {}
      try { if (fol) state.followers = JSON.parse(fol.followers); } catch (_) {}
      try { if (sch) state.scheduled = JSON.parse(sch.posts); } catch (_) {}
    }
    render();
    // With the connector available, refresh on open when results are missing or older than three hours.
    if (canRefresh && (!state.fetchedAt || Date.now() - new Date(state.fetchedAt).getTime() > STALE_MS)) refresh(false);
  }
  window.RSH_LIVE = { refresh: byClick => refresh(byClick), fetchedAt: () => state.fetchedAt, brief: () => (state.rows && state.rows.length ? briefText(summarise(state.rows, state.fetchedAt)) : ''), rows: () => state.rows, scheduled: () => state.scheduled, onData: fn => listeners.push(fn), start, summarise, compact, findRows };
})();
