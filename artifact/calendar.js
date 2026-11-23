/* RSH Sports Marketing OS — Metricool on the Calendar (artifact edition only).
 *
 * Shows what is actually scheduled in Metricool, and what was published, on the same calendar as
 * the team's own plans, and warns when the next 14 days are not fully covered. Read-only: it
 * displays Metricool's schedule and never changes it.
 */
(function () {
  'use strict';
  const NETS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', threads: 'Threads', bluesky: 'Bluesky', twitter: 'X', linkedin: 'LinkedIn' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const live = () => window.RSH_LIVE, TARGET = 14;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nice = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const css = document.createElement('style');
  css.textContent = `
  #rshCalCover{border-radius:14px;padding:13px 16px;margin-bottom:14px;font-size:13px;line-height:1.5;border:1px solid #e5e5ea;background:#fff;color:#1d1d1f}
  #rshCalCover.ok{background:#f1faf3;border-color:#b7e1c0}#rshCalCover.gap{background:#fff8ec;border-color:#f3d9a8}
  #rshCalCover .legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11.5px;color:#515154}
  #rshCalCover .mcdot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;box-sizing:border-box}
  .calevent.mc{background:#fff;border:1px solid #0071e3;color:#0058b0;font-weight:600}
  .calevent.mc.draft{border-style:dashed;border-color:#b45309;color:#92400e}
  .calday .mcpub{font-size:10.5px;color:#1a7f37;font-weight:700;margin-top:3px}
  .calday.mc-empty{background:#fff6e3!important;border-color:#f3d9a8!important}
  .calday .mcnone{font-size:10.5px;color:#92400e;font-weight:700;margin-top:3px}
  #calendarGrid.mc-live .nov-embed-count{display:none}`;
  document.head.appendChild(css);

  function coverage() {
    const sched = live().scheduled(); if (!sched) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const byDay = {}; for (const p of sched) { const k = p[0].slice(0, 10); (byDay[k] = byDay[k] || []).push(p); }
    const empty = [], drafts = [];
    for (let i = 0; i < TARGET; i++) { const d = new Date(today); d.setDate(d.getDate() + i); const k = iso(d), list = byDay[k] || []; if (!list.some(p => !p[4])) empty.push(k); drafts.push(...list.filter(p => p[4]).map(() => k)); }
    const ranges = []; for (const k of empty) { const last = ranges[ranges.length - 1], prev = last && new Date(last[1] + 'T12:00:00'); if (prev && (new Date(k + 'T12:00:00') - prev) / 86400000 === 1) last[1] = k; else ranges.push([k, k]); }
    return { byDay, empty, ranges, drafts: drafts.length, total: sched.filter(p => p[0].slice(0, 10) >= iso(today)).length };
  }

  function paint() {
    const grid = document.getElementById('calendarGrid'); if (!grid || !live()) return;
    const cov = coverage(), rows = live().rows() || [];
    // banner
    let banner = document.getElementById('rshCalCover');
    if (!banner) { banner = document.createElement('div'); banner.id = 'rshCalCover'; const card = grid.closest('.card'); card.parentNode.insertBefore(banner, card); }
    if (!cov) { banner.className = ''; banner.innerHTML = '<strong>Metricool schedule not loaded.</strong> The calendar below shows the team’s own plans only.'; }
    else {
      const covered = TARGET - cov.empty.length, ok = cov.empty.length === 0;
      banner.className = ok ? 'ok' : 'gap';
      banner.innerHTML = `<strong>${ok ? `All of the next ${TARGET} days have a post scheduled in Metricool.` : `${covered} of the next ${TARGET} days have a post scheduled in Metricool.`}</strong> `
        + (ok ? '' : `Nothing is scheduled on ${cov.ranges.map(r => r[0] === r[1] ? esc(nice(r[0])) : esc(nice(r[0])) + '–' + esc(nice(r[1]))).join(', ')}. `)
        + (cov.drafts ? `${cov.drafts} scheduled post${cov.drafts === 1 ? ' is' : 's are'} still in draft and will not publish until finished. ` : '')
        + `<div class="legend"><span><span class="mcdot" style="background:#e8f0fe;border:1px solid #c5d7f5"></span>Team plan in this app</span><span><span class="mcdot" style="border:1px solid #0071e3"></span>Scheduled in Metricool</span><span><span class="mcdot" style="border:1px dashed #b45309"></span>Metricool draft</span><span><span class="mcdot" style="background:#1a7f37"></span>Published</span><span><span class="mcdot" style="background:#fff3dc;border:1px solid #f3d9a8"></span>Nothing scheduled</span></div>`;
    }
    // days
    const pubByDay = {}; for (const r of rows) { const k = String(r[1]); const key = k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8); pubByDay[key] = (pubByDay[key] || 0) + 1; }
    const emptySet = new Set(cov ? cov.empty : []);
    grid.classList.toggle('mc-live', !!cov);   // live Metricool data replaces the older dated snapshot counts
    grid.querySelectorAll('.calday[data-date]').forEach(day => {
      if (day.dataset.mc) return; day.dataset.mc = '1';
      const k = day.dataset.date, list = (cov && cov.byDay[k]) || [];
      list.slice().sort((a, b) => a[0] < b[0] ? -1 : 1).slice(0, 3).forEach(p => {
        const el = document.createElement('div'); el.className = 'calevent mc' + (p[4] ? ' draft' : '');
        const time = new Date(p[0] + ':00').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        el.title = `${p[4] ? 'Draft in Metricool' : 'Scheduled in Metricool'} · ${time} Eastern · ${p[3]} · ${p[1].split(',').map(n => NETS[n] || n).join(', ')}\n${p[2]}`;
        el.textContent = time.replace(':00', '').replace(' ', '').toLowerCase() + ' ' + (p[2] || p[3]).slice(0, 18);
        day.appendChild(el);
      });
      if (list.length > 3) { const more = document.createElement('div'); more.className = 'small'; more.textContent = `+${list.length - 3} more in Metricool`; day.appendChild(more); }
      if (pubByDay[k]) { const pub = document.createElement('div'); pub.className = 'mcpub'; pub.textContent = `✓ ${pubByDay[k]} published`; day.appendChild(pub); }
      if (emptySet.has(k)) { day.classList.add('mc-empty'); const none = document.createElement('div'); none.className = 'mcnone'; none.textContent = 'Nothing scheduled'; day.appendChild(none); }
    });
  }

  function start() {
    const grid = document.getElementById('calendarGrid'); if (!grid || !live() || grid.dataset.rshCal) return; grid.dataset.rshCal = '1';
    new MutationObserver(() => paint()).observe(grid, { childList: true });
    live().onData(() => { grid.querySelectorAll('.calday[data-mc]').forEach(d => { delete d.dataset.mc; d.classList.remove('mc-empty'); d.querySelectorAll('.mc,.mcpub,.mcnone').forEach(x => x.remove()); }); paint(); });
    paint();
  }
  window.RSH_CALENDAR = { start, coverage };
})();
