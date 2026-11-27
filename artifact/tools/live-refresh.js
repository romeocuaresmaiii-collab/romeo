#!/usr/bin/env node
/* Turns Metricool answers into the app's live records, using the app's own code (artifact/live.js), so a Claude session
 * can keep the numbers fresh even when nobody has the app open.
 *   node artifact/tools/live-refresh.js fields                       → prints the metric ids and brand id to request
 *   node artifact/tools/live-refresh.js posts  cur.json prev.json out.json   (getAnalyticsDataByMetrics answers, two 14-day windows)
 *   node artifact/tools/live-refresh.js sched  sched.json out.json           (getScheduledPosts answer, 3 days back to 14 ahead)
 * out.json is the record to write with ArtifactData set: live/metricool or live/scheduled. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const el = () => ({ style: {}, appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] });
const win = { claude: null, addEventListener() {}, setInterval() {}, setTimeout() {} };
const ctx = { window: win, document: { createElement: el, head: el(), body: el(), readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], getElementById: () => null }, setInterval() {}, setTimeout() {}, console, Intl, Date, Math, JSON };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'live.js'), 'utf8'), ctx);
const L = win.RSH_LIVE, [cmd, ...a] = process.argv.slice(2), read = f => { const t = fs.readFileSync(f, 'utf8'); try { return JSON.parse(t); } catch (_) { return t; } };
const now = new Date().toISOString();
if (cmd === 'fields') { console.log(JSON.stringify({ brandId: L.BRAND_ID, metrics: L.FIELDS })); }
else if (cmd === 'posts') {
  const rows = [a[0], a[1]].map(f => L.findRows(read(f), 0) || []).flat(); if (!rows.length) { console.error('no rows found in the answers'); process.exit(1); }
  const out = { fetchedAt: now, days: 14, rows: JSON.stringify(L.compact(rows)).slice(0, 230000), by: 'Claude session (hourly)' };
  fs.writeFileSync(a[2], JSON.stringify(out)); console.log(`${rows.length} posts → ${a[2]}`);
} else if (cmd === 'sched') {
  const sp = L.compactScheduled(read(a[0])); if (!sp) { console.error('no scheduled posts found in the answer'); process.exit(1); }
  fs.writeFileSync(a[1], JSON.stringify({ fetchedAt: now, posts: JSON.stringify(sp).slice(0, 230000), by: 'Claude session (hourly)' })); console.log(`${sp.length} scheduled → ${a[1]}`);
} else { console.error('usage: fields | posts cur.json prev.json out.json | sched sched.json out.json'); process.exit(2); }
