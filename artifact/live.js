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
  const NETS = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', PINTEREST: 'Pinterest', THREADS: 'Threads', BLUESKY: 'Bluesky', TWITTER: 'X', LINKEDIN: 'LinkedIn' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  let db = null, state = { rows: null, fetchedAt: null, busy: false, note: '' };

  const css = document.createElement('style');
  css.textContent = `
  #rshLive .live-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start}
  #rshLive .live-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:16px}
  #rshLive .live-tile{border:1px solid #e5e5ea;border-radius:14px;padding:14px 16px;background:#fff;min-width:0}
  #rshLive .live-tile .n{font-size:28px;font-weight:800;letter-spacing:-.02em;color:#1d1d1f;font-variant-numeric:tabular-nums;margin-top:4px}
  #rshLive .delta{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
  #rshLive .delta.up{color:#1a7f37}#rshLive .delta.down{color:#b42318}#rshLive .delta.flat{color:#6e6e73}
  #rshLive .live-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;margin-top:16px}
  @media (max-width:900px){#rshLive .live-grid{grid-template-columns:minmax(0,1fr)}}
  #rshLive .live-box{border:1px solid #e5e5ea;border-radius:14px;padding:14px 16px;background:#fff;min-width:0}
  #rshLive h3{margin:0 0 10px;font-size:14px}
  #rshLive .scroll{overflow-x:auto}
  #rshLive table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
  #rshLive th{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;text-align:right;padding:6px 8px;font-weight:700;white-space:nowrap}
  #rshLive th:first-child,#rshLive td:first-child{text-align:left}
  #rshLive td{padding:8px;border-top:1px solid #f0f0f3;text-align:right;color:#1d1d1f;white-space:nowrap}
  #rshLive .bar{height:6px;border-radius:3px;background:#0071e3;min-width:2px;margin-top:5px}
  #rshLive .top{display:flex;gap:10px;align-items:baseline;padding:9px 0;border-top:1px solid #f0f0f3;font-size:12.5px}
  #rshLive .top:first-of-type{border-top:0}
  #rshLive .top .rank{font-weight:800;color:#6e6e73;width:14px;flex:none}
  #rshLive .top .what{flex:1;min-width:0}
  #rshLive .top .what a{color:#0066cc;font-weight:700;text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #rshLive .top .what a:hover{text-decoration:underline}
  #rshLive .top .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:#1d1d1f;font-weight:700}
  #rshLive .insight{margin-top:14px;padding:12px 14px;border-radius:12px;background:#f5f8ff;border:1px solid #dbe7fb;font-size:13px;color:#1d1d1f;line-height:1.5}
  #rshLive .live-empty{margin-top:14px;padding:22px;border:1px dashed #c7c7cc;border-radius:14px;text-align:center;color:#515154;font-size:13px;line-height:1.5}
  #rshLive .live-foot{margin-top:12px;font-size:11.5px;color:#6e6e73;line-height:1.5}`;
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
  const compact = rows => rows.filter(r => Array.isArray(r) && r[0] && r[1]).map(r => [String(r[0]).toUpperCase(), Number(String(r[1]).slice(0, 8)), String(r[2] || '').slice(0, 300), String(r[3] || '').replace(/\s+/g, ' ').trim().slice(0, 90), num(r[4]), num(r[5]), String(r[6] || '').toUpperCase()]);

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

  function render() {
    const host = document.getElementById('rshLive'); if (!host) return;
    const when = state.fetchedAt ? new Date(state.fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    let body;
    if (!state.rows) {
      body = `<div class="live-empty"><strong>No live results loaded yet.</strong><br>Press “Refresh from Metricool” to pull the last ${DAYS * 2} days of published posts for RSH Sports. The first time, Claude asks you to allow the Metricool connector for this page.</div>`;
    } else {
      const s = summarise(state.rows, state.fetchedAt);
      const er = rate(s.cur), erPrev = rate(s.prev);
      const netRows = Object.keys(s.nets).map(k => ({ k, ...s.nets[k] })).filter(n => n.cur.posts || n.prev.posts).sort((a, b) => b.cur.impressions - a.cur.impressions);
      const maxImp = Math.max(1, ...netRows.map(n => n.cur.impressions));
      const change = (a, b) => !b ? '<span class="delta flat">—</span>' : (() => { const p = (a - b) / b * 100; return `<span class="delta ${Math.abs(p) < 0.5 ? 'flat' : p > 0 ? 'up' : 'down'}">${p > 0 ? '+' : ''}${p.toFixed(0)}%</span>`; })();
      const unmeasured = s.cur.posts - s.cur.measured;
      const bestText = s.best ? (() => { const [n, f] = s.best.key.split('|'); return `<strong>Strongest format right now:</strong> ${esc(NETS[n] || n)} ${esc(formatName(f))}s, with a median of ${fmt(s.best.median)} impressions per post across ${s.best.count} posts in the last ${DAYS} days. This describes what happened; it does not prove why.`; })() : '';
      body = `
      <div class="live-tiles">
        <div class="live-tile"><div class="small">Posts published</div><div class="n">${fmt(s.cur.posts)}</div>${delta(s.cur.posts, s.prev.posts)}</div>
        <div class="live-tile"><div class="small">Impressions / views</div><div class="n">${fmt(s.cur.impressions)}</div>${delta(s.cur.impressions, s.prev.impressions)}</div>
        <div class="live-tile"><div class="small">Interactions</div><div class="n">${fmt(s.cur.interactions)}</div>${delta(s.cur.interactions, s.prev.interactions)}</div>
        <div class="live-tile"><div class="small">Interactions per 100 impressions</div><div class="n">${er === null ? '—' : er.toFixed(1)}</div>${erPrev === null ? '<span class="delta flat">no earlier data to compare</span>' : `<span class="small">previous ${DAYS} days: ${erPrev.toFixed(1)}</span>`}</div>
      </div>
      ${bestText ? `<div class="insight">${bestText}</div>` : ''}
      <div class="live-grid">
        <div class="live-box"><h3>By channel · last ${DAYS} days</h3><div class="scroll"><table>
          <thead><tr><th>Channel</th><th>Posts</th><th>Impressions</th><th>vs prev.</th><th>Interactions</th></tr></thead>
          <tbody>${netRows.map(n => `<tr><td><strong>${esc(NETS[n.k] || n.k)}</strong><div class="bar" style="width:${Math.max(2, n.cur.impressions / maxImp * 100)}%"></div></td><td>${fmt(n.cur.posts)}</td><td>${n.cur.measured ? fmt(n.cur.impressions) : '<span class="small">no data</span>'}</td><td>${change(n.cur.impressions, n.prev.impressions)}</td><td>${n.cur.measured ? fmt(n.cur.interactions) : '<span class="small">no data</span>'}</td></tr>`).join('')}</tbody>
        </table></div></div>
        <div class="live-box"><h3>Top posts · last ${DAYS} days</h3>${s.tops.length ? s.tops.map((r, i) => `<div class="top"><span class="rank">${i + 1}</span><div class="what"><a href="${esc(/^https:\/\//.test(r[2]) ? r[2] : '#')}" target="_blank" rel="noopener noreferrer">${esc(r[3] || ((NETS[r[0]] || r[0]) + ' ' + formatName(r[6])))}</a><span class="small">${esc(NETS[r[0]] || r[0])} · ${esc(formatName(r[6]))} · ${esc(shortDate(r[1]))}</span></div><div class="num">${fmt(r[5] || 0)} <span class="small">interactions</span><br><span class="small">${fmt(r[4])} impressions</span></div></div>`).join('') : '<div class="small">No measured posts in this period.</div>'}</div>
      </div>
      <div class="live-foot">Period: ${esc(shortDate(dayKey(s.w.curFrom)))} – ${esc(shortDate(dayKey(s.w.curTo)))}, compared with ${esc(shortDate(dayKey(s.w.prevFrom)))} – ${esc(shortDate(dayKey(s.w.prevTo)))}. Impressions and interactions are per-post figures exactly as Metricool reports them${unmeasured ? `; ${unmeasured} post${unmeasured === 1 ? '' : 's'} (mostly Stories and very recent posts) have no figures yet and are counted as published only` : ''}. Follower counts and website sales are not included here.</div>`;
    }
    host.innerHTML = `
      <div class="live-head">
        <div><div class="eyebrow">LIVE RESULTS · METRICOOL</div><h2 style="margin-top:6px">How RSH Sports is performing right now</h2>
        <p style="margin-top:6px">Every published post across your channels, pulled straight from Metricool.</p></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${state.rows ? 'good' : 'warn'}" id="rshLiveStamp">${state.busy ? 'Refreshing…' : when ? 'Updated ' + esc(when) : 'Not loaded'}</span><button class="btn smallbtn" id="rshLiveRefresh" type="button" ${state.busy ? 'disabled' : ''}>↻ Refresh from Metricool</button></div>
      </div>
      ${state.note ? `<div class="hint" role="status" style="margin-top:12px">${esc(state.note)}</div>` : ''}${body}`;
    document.getElementById('rshLiveRefresh').addEventListener('click', () => refresh(true));
  }

  /* ---------- loading ---------- */
  async function refresh(byClick) {
    if (state.busy) return; state.busy = true; state.note = ''; render();
    try {
      const mcp = await use('mcp');
      if (!mcp) throw { code: 'no_connector' };
      const w = windows(Date.now());
      const result = await mcp.callTool(SERVER, TOOL, { brandId: BRAND_ID, from: iso(w.prevFrom, '00:00:00'), to: iso(w.curTo, '23:59:59'), metrics: FIELDS });
      const raw = findRows(result && (result.payload !== undefined ? result.payload : result), 0) || findRows(result, 0);
      if (!raw) throw { code: 'unreadable_answer' };
      state.rows = compact(raw); state.fetchedAt = new Date().toISOString();
      if (db) { try { await db.doc(DOC).set({ fetchedAt: state.fetchedAt, days: DAYS, rows: JSON.stringify(state.rows).slice(0, 230000) }); } catch (_) { state.note = 'Loaded, but the results could not be saved for other viewers.'; } }
    } catch (e) {
      const code = (e && e.code) || 'unknown';
      const why = code === 'no_connector' ? 'Live refresh needs the Metricool connector in your own Claude account, and is not available in this view.'
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
    const card = document.createElement('div'); card.className = 'card'; card.id = 'rshLive'; card.style.marginBottom = '16px';
    home.insertBefore(card, home.firstChild); render();
    db = await use('db');
    if (db) {
      try {
        const snap = await Promise.race([db.doc(DOC).get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
        if (snap.exists) { const d = snap.data(); state.rows = JSON.parse(d.rows); state.fetchedAt = d.fetchedAt; render(); }
      } catch (_) {}
    }
    // Refresh on open only when results are missing or older than three hours.
    if (!state.fetchedAt || Date.now() - new Date(state.fetchedAt).getTime() > STALE_MS) refresh(false);
  }
  window.RSH_LIVE = { start, summarise, compact, findRows };
})();
