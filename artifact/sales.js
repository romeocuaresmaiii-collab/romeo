/* Sales attribution without a store connection: Shopify CSV exports read in the browser.
 *  1. Orders export (Shopify admin → Orders → Export): each order is credited to a channel by its discount code
 *     (one code per channel, set here). Only order number, date, total, discount code and source are read; names,
 *     emails, addresses and phone numbers never leave the file and are never saved.
 *  2. Marketing report (Shopify → Analytics → Reports → sales attributed to marketing / by UTM): sales credited by the
 *     utm_source / utm_campaign the app puts on every link (utm_campaign = the campaign's title as a slug).
 * Only monthly totals are saved (db sales/<YYYY-MM>). The monthly report and the System check read them. */
(function () {
  'use strict';
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = () => window.RSH_APP;
  const CH = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['pinterest', 'Pinterest'], ['threads', 'Threads'], ['bluesky', 'Bluesky']];
  const NAME = Object.fromEntries(CH.concat([['other', 'Other / no code'], ['direct', 'Direct or unknown']]));
  const money = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monthKey = d => d.slice(0, 7);
  let db = null, me = null, codes = {}, months = {}, msg = '', loaded = false;

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  const num = v => { const n = parseFloat(String(v || '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
  const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const isoDay = v => { const s = String(v || '').trim(); const m = s.match(/^(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
  const chOfSource = s => { s = String(s || '').toLowerCase(); return s.includes('insta') || s === 'ig' ? 'instagram' : s.includes('face') || s === 'fb' ? 'facebook' : s.includes('tiktok') ? 'tiktok' : s.includes('youtube') || s === 'yt' ? 'youtube' : s.includes('pinterest') ? 'pinterest' : s.includes('threads') ? 'threads' : s.includes('bsky') || s.includes('bluesky') ? 'bluesky' : ''; };

  /* Shopify orders export: one row per line item; the order total is on its first row. */
  function fromOrders(rows) {
    const h = rows[0].map(norm), col = n => h.indexOf(n);
    const iName = col('name'), iTotal = col('total'), iCode = col('discount code'), iAt = col('created at') >= 0 ? col('created at') : col('paid at'), iCancel = col('cancelled at'), iFin = col('financial status'), iSrc = col('source'), iNotes = col('note attributes');
    if (iName < 0 || iTotal < 0 || iAt < 0) return null;
    const byCode = {}; for (const [ch, c] of Object.entries(codes)) for (const k of String(c || '').split(/[,\s]+/).filter(Boolean)) byCode[k.toUpperCase()] = ch;
    const seen = new Set(), out = {};
    for (const r of rows.slice(1)) {
      const id = r[iName]; if (!id || seen.has(id)) continue; const total = num(r[iTotal]), day = isoDay(r[iAt]); if (!day || (!total && !r[iTotal])) continue;
      seen.add(id); if ((iCancel >= 0 && String(r[iCancel]).trim()) || (iFin >= 0 && /refunded|voided/i.test(r[iFin]))) continue;
      const code = iCode >= 0 ? String(r[iCode] || '').trim().toUpperCase() : '';
      let ch = code && byCode[code] ? byCode[code] : '';
      if (!ch && iNotes >= 0) { const m = String(r[iNotes] || '').match(/utm_source[=:]\s*([a-z_]+)/i); if (m) ch = chOfSource(m[1]); }
      if (!ch) ch = code ? 'other' : 'direct';
      const M = out[monthKey(day)] || (out[monthKey(day)] = { orders: 0, revenue: 0, byChannel: {}, byCampaign: {}, codesSeen: {} });
      M.orders++; M.revenue += total; const c = M.byChannel[ch] || (M.byChannel[ch] = { orders: 0, revenue: 0 }); c.orders++; c.revenue += total;
      if (code) { const cs = M.codesSeen[code] || (M.codesSeen[code] = { orders: 0, revenue: 0 }); cs.orders++; cs.revenue += total; }
    }
    return { kind: 'orders', months: out };
  }
  /* Shopify marketing / UTM report: one row per source x campaign (optionally per day or month). */
  function fromMarketing(rows) {
    const h = rows[0].map(norm), find = (...ns) => { for (const n of ns) { const i = h.findIndex(x => x === n || x.includes(n)); if (i >= 0) return i; } return -1; };
    const iSrc = find('utm campaign source', 'utm source', 'referrer source', 'source'), iCamp = find('utm campaign name', 'utm campaign', 'campaign'), iSales = find('total sales', 'net sales', 'sales'), iOrders = find('orders'), iDay = find('day', 'date', 'month');
    if (iSrc < 0 || iSales < 0) return null;
    const out = {}, def = new Date().toISOString().slice(0, 7);
    for (const r of rows.slice(1)) {
      if (/^total/i.test(String(r[0] || ''))) continue;
      const ch = chOfSource(r[iSrc]) || 'direct', sales = num(r[iSales]), orders = iOrders >= 0 ? num(r[iOrders]) : 0, mk = iDay >= 0 && isoDay(r[iDay]) ? monthKey(isoDay(r[iDay])) : (String(r[iDay] || '').match(/^\d{4}-\d{2}/) || [def])[0];
      if (!sales && !orders) continue;
      const M = out[mk] || (out[mk] = { orders: 0, revenue: 0, byChannel: {}, byCampaign: {} });
      M.orders += orders; M.revenue += sales; const c = M.byChannel[ch] || (M.byChannel[ch] = { orders: 0, revenue: 0 }); c.orders += orders; c.revenue += sales;
      const camp = iCamp >= 0 ? String(r[iCamp] || '').trim() : ''; if (camp) { const x = M.byCampaign[camp] || (M.byCampaign[camp] = { orders: 0, revenue: 0, channel: ch }); x.orders += orders; x.revenue += sales; }
    }
    return { kind: 'marketing', months: out };
  }
  function read(text) {
    const rows = parseCSV(String(text || '').replace(/^﻿/, '')); if (rows.length < 2) return null;
    const h = rows[0].map(norm);
    if (h.includes('name') && h.includes('total') && (h.includes('created at') || h.includes('paid at'))) return fromOrders(rows);
    if (h.some(x => /utm|referrer/.test(x)) && h.some(x => /sales/.test(x))) return fromMarketing(rows);
    return null;
  }
  // campaign slug -> campaign title, to show campaign names from the marketing report
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);   // the same as the app's link tags
  function campaignTitle(s) { const p = ((app() && app().data().posts) || []).find(x => slug(x.title) === s || x.id === s); return p ? p.title : s; }

  /* ---------- storage ---------- */
  async function load() {
    if (!db) return;
    try { const s = await db.doc('sales/codes').get(); codes = s.exists ? JSON.parse(s.data().json || '{}') : {}; } catch (_) {}
    try { const q = await db.collection('sales').get(); months = {}; for (const d of q.docs) if (/^\d{4}-\d{2}$/.test(d.id)) { try { months[d.id] = JSON.parse(d.data().json); } catch (_) {} } } catch (_) {}
    loaded = true; render();
  }
  async function saveImport(res, fileName) {
    const now = new Date().toISOString(); let n = 0;
    for (const [mk, M] of Object.entries(res.months)) {
      const prev = months[mk] || {}, rec = { ...prev, month: mk, [res.kind]: { ...M, importedAt: now, file: String(fileName || '').slice(0, 80), by: me || '' } };
      months[mk] = rec; n++; if (db) await db.doc('sales/' + mk).set({ json: JSON.stringify(rec), updatedAt: now });
    }
    return n;
  }
  async function saveCodes(next) { codes = next; if (db) await db.doc('sales/codes').set({ json: JSON.stringify(codes), updatedAt: new Date().toISOString(), by: me || '' }); }

  /* ---------- summary for other modules ---------- */
  function summary(mk) {
    const r = months[mk]; if (!r) return null;
    const o = r.orders, m = r.marketing, src = o || m; if (!src) return null;
    const by = {}; for (const s of [o, m]) if (s) for (const [ch, x] of Object.entries(s.byChannel || {})) { const t = by[ch] || (by[ch] = { orders: 0, revenue: 0, from: [] }); if (x.revenue > t.revenue) { t.orders = x.orders; t.revenue = x.revenue; } t.from.push(s === o ? 'codes' : 'links'); }
    const social = Object.entries(by).filter(([ch]) => NAME[ch] && !/other|direct/.test(ch)).reduce((a, [, x]) => a + x.revenue, 0);
    const camps = m ? Object.entries(m.byCampaign || {}).map(([k, x]) => ({ name: campaignTitle(k), ...x })).sort((a, b) => b.revenue - a.revenue).slice(0, 5) : [];
    return { month: mk, orders: o ? o.orders : m.orders, revenue: o ? o.revenue : m.revenue, social: Math.min(social, o ? o.revenue : m.revenue), byChannel: by, campaigns: camps, sources: [o && 'orders export', m && 'marketing report'].filter(Boolean), importedAt: [o && o.importedAt, m && m.importedAt].filter(Boolean).sort().pop() };
  }

  /* ---------- view ---------- */
  const css = document.createElement('style');
  css.textContent = `#rshSales h2{font-size:18px;margin:0}#rshSales h3{font-size:14px;margin:16px 0 6px}#rshSales table{width:100%;border-collapse:collapse;font-size:12.5px}#rshSales th,#rshSales td{text-align:left;padding:7px 8px;border-bottom:1px solid #eef2f7}#rshSales th{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}#rshSales td.r,#rshSales th.r{text-align:right}
  #rshSales .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}#rshSales .t{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px}#rshSales .t .n{font-size:22px;font-weight:800}
  #rshSales .codes{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:6px}#rshSales input{font:inherit;font-size:12.5px;padding:7px 8px;border:1px solid #d2d2d7;border-radius:8px;width:100%;box-sizing:border-box;text-transform:uppercase}#rshSales label{font-size:11px;font-weight:700;color:#515154}
  #rshSales details{margin-top:12px}#rshSales summary{cursor:pointer;font-weight:700;font-size:13px}#rsMsg{font-size:12.5px;color:#0f5132;margin-top:8px;min-height:1em}`;
  document.head.appendChild(css);
  function render() {
    const host = document.getElementById('rshSales'); if (!host) return;
    const keys = Object.keys(months).sort().reverse(), cur = keys[0], s = cur && summary(cur), hasCodes = Object.values(codes).some(Boolean);
    const tiles = s ? `<div class="tiles"><div class="t"><div class="small">Orders · ${esc(s.month)}</div><div class="n">${s.orders.toLocaleString('en-US')}</div></div><div class="t"><div class="small">Revenue</div><div class="n">${money(s.revenue)}</div></div><div class="t"><div class="small">From social (codes or links)</div><div class="n">${money(s.social)}</div><div class="small">${s.revenue ? Math.round(s.social / s.revenue * 100) + '% of revenue' : ''}</div></div></div>` : '';
    const rows = s ? Object.entries(s.byChannel).sort((a, b) => b[1].revenue - a[1].revenue).map(([ch, x]) => `<tr><td>${esc(NAME[ch] || ch)}</td><td class="r">${x.orders.toLocaleString('en-US')}</td><td class="r">${money(x.revenue)}</td><td class="small">${esc([...new Set(x.from)].join(' + '))}</td></tr>`).join('') : '';
    const camps = s && s.campaigns.length ? `<h3>Top campaigns by sales (from link tags)</h3><table><thead><tr><th>Campaign</th><th>Channel</th><th class="r">Orders</th><th class="r">Sales</th></tr></thead><tbody>${s.campaigns.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(NAME[c.channel] || c.channel)}</td><td class="r">${c.orders}</td><td class="r">${money(c.revenue)}</td></tr>`).join('')}</tbody></table>` : '';
    host.innerHTML = `<h2>Sales from social</h2><p class="small" style="max-width:720px;margin-top:4px">Without a store connection: export from Shopify and drop the file here. Orders are credited to a channel by its discount code; the marketing report credits sales by the tracking tags the app adds to every link. Only monthly totals are saved. Names, emails and addresses are never read or stored.</p>
      ${s ? `${tiles}<h3>By channel · ${esc(s.month)}</h3><table><thead><tr><th>Channel</th><th class="r">Orders</th><th class="r">Sales</th><th>Credited by</th></tr></thead><tbody>${rows}</tbody></table>${camps}<p class="small">From the ${esc(s.sources.join(' and '))}, imported ${esc(String(s.importedAt || '').slice(0, 10))}.</p>` : `<p class="small"><strong>No sales imported yet.</strong></p>`}
      <div id="rsMsg">${esc(msg)}</div>
      <h3>1. One discount code per channel ${hasCodes ? '' : '<span class="small">(not set yet)</span>'}</h3>
      <p class="small">Create these codes in Shopify (Discounts) with whatever offer Anthony approves, put each one only in that channel's posts, then type them here. Several codes per channel: separate with commas.</p>
      <form id="rsCodes" class="codes">${CH.map(([k, n]) => `<div><label for="rsc_${k}">${esc(n)}</label><input id="rsc_${k}" name="${k}" value="${esc(codes[k] || '')}" placeholder="e.g. ${esc(n.slice(0, 4).toUpperCase())}10"></div>`).join('')}<div style="align-self:end"><button type="submit" class="btn ghost smallbtn">Save codes</button></div></form>
      <h3>2. Import from Shopify</h3>
      <p class="small"><strong>Orders:</strong> Shopify admin → Orders → Export → “Current page” or a date range, CSV. <strong>Marketing:</strong> Analytics → Reports → “Sales attributed to marketing” (or sessions/sales by UTM), Export. Import each month; a new file for the same month replaces it.</p>
      <label class="btn smallbtn" style="cursor:pointer;margin-top:6px;display:inline-block">↥ Import Shopify CSV<input type="file" id="rsFile" accept=".csv,text/csv" hidden></label>`;
  }
  async function onFile(file) {
    if (!file) return; if (file.size > 25 * 1024 * 1024) { msg = 'That file is over 25 MB; export a shorter date range.'; render(); return; }
    const res = read(await file.text());
    if (!res || !Object.keys(res.months).length) { msg = 'This does not look like a Shopify orders export or marketing report (no order totals or UTM/sales columns found).'; render(); return; }
    const n = await saveImport(res, file.name); const tot = Object.values(res.months).reduce((a, m) => a + m.revenue, 0);
    msg = `Imported the ${res.kind === 'orders' ? 'orders export' : 'marketing report'}: ${n} month${n === 1 ? '' : 's'}, ${money(tot)} in sales.${res.kind === 'orders' && !Object.values(codes).some(Boolean) ? ' Set the channel codes above to credit orders to channels.' : ''}`;
    render();
  }
  async function start() {
    const view = document.getElementById('view-revenue'); if (!view || document.getElementById('rshSales')) return;
    const card = document.createElement('div'); card.className = 'card'; card.id = 'rshSales'; card.style.marginBottom = '16px'; view.insertBefore(card, view.firstChild);
    card.addEventListener('change', e => { if (e.target.id === 'rsFile') onFile(e.target.files && e.target.files[0]).catch(err => { msg = 'Could not read the file: ' + err.message; render(); }); });
    card.addEventListener('submit', async e => { if (e.target.id !== 'rsCodes') return; e.preventDefault(); const f = Object.fromEntries(new FormData(e.target).entries()); for (const k in f) f[k] = String(f[k]).trim().toUpperCase().slice(0, 120); await saveCodes(f); msg = 'Codes saved. Re-import the orders export to credit past orders.'; render(); });
    render(); db = await use('db'); try { const u = await use('user'); me = u ? await u.id() : null; } catch (_) {} await load();
  }
  window.RSH_SALES = { start, read, summary, months: () => months, codes: () => codes, load, slug, saveImport };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
