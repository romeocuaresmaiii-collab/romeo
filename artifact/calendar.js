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
  .calday[data-date]{cursor:pointer}
  .calday[data-date]:hover{box-shadow:inset 0 0 0 2px #b9d4f5}
  .calevent.rp{background:#eaf7ee;border:1px solid #8fd19e;color:#14532d;font-weight:700}
  .calevent.rp.sch{background:#1a7f37;border-color:#1a7f37;color:#fff}
  .calevent.rp.que{background:#fff8ec;border-color:#f3d9a8;color:#92400e}
  .calevent.rp.err{background:#fdecea;border-color:#f3c4bf;color:#b42318}
  #rshDayBack{position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:10020}
  #rshDay{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);background:#fff;color:#1d1d1f;z-index:10021;box-shadow:-12px 0 40px rgba(0,0,0,.18);display:flex;flex-direction:column}
  #rshDay header{padding:calc(18px + env(safe-area-inset-top,0px)) 20px 12px;border-bottom:1px solid #ececf0}
  #rshDay .body{flex:1;overflow:auto;padding:14px 20px 22px}
  #rshDay h3{font-size:14px;margin:18px 0 8px}
  #rshDay .row{border:1px solid #e5e5ea;border-radius:12px;padding:10px 12px;margin-top:8px;font-size:12.5px;display:grid;gap:6px}
  #rshDay .row .t{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  #rshDay .cap{color:#515154;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  #rshDay input[type=time],#rshDay input[type=url],#rshDay select{font:inherit;font-size:12.5px;padding:6px 8px;border:1px solid #d2d2d7;border-radius:8px;background:#fff;color:#1d1d1f}
  #rshDay input[type=url]{width:100%;box-sizing:border-box}
  #rshDay .acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  #rshDay .st{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:#f0f0f3;color:#515154}
  #rshDay .st.sch{background:#eaf7ee;color:#1a7f37}#rshDay .st.que{background:#fff3e0;color:#b45309}#rshDay .st.err{background:#fdecea;color:#b42318}
  #rshDay .opts{border:1px solid #e5e5ea;border-radius:12px;padding:10px 12px;margin-top:12px;font-size:12.5px;display:grid;gap:8px;background:#fbfbfd}
  .calday.mc-empty{background:#fff6e3!important;border-color:#f3d9a8!important}
  .calday .mcseason{font-size:10.5px;color:#5b21b6;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calday .mcseason.order{color:#b45309}
  .calday .mcnone{font-size:10.5px;color:#92400e;font-weight:700;margin-top:3px}
  #calendarGrid.mc-live .nov-embed-count{display:none}`;
  document.head.appendChild(css);

  // Season dates from the researched Playbook (only exact, confirmed dates) and an order reminder 6 weeks before each.
  // Six weeks is a planning default, not RSH's confirmed production time.
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, Oct: 9, Nov: 10, Dec: 11 };
  window.RSH_SEASON_MARKS = () => seasonMarks();
  function seasonMarks() {
    const B = window.RSH_BOTS, pb = B && B.playbook ? B.playbook() : null, out = {}; if (!pb) return out;
    const add = (d, m) => { const k = iso(d); (out[k] = out[k] || []).push(m); };
    for (const [when, what, note] of pb.calendar || []) {
      const m = String(when).match(/^(Jan|Feb|Mar|Apr|Oct|Nov|Dec) (\d{1,2})\b/); if (!m || /not confirmed|not yet|tentative|confirm/i.test(note + ' ' + what)) continue;
      const mo = MON[m[1]], d = new Date(mo >= 9 ? 2026 : 2027, mo, +m[2]), o = new Date(d); o.setDate(o.getDate() - 42);
      add(d, { text: '🏆 ' + what.split(',')[0].slice(0, 22), tip: `${what} (${when}). From the Season Playbook.` });
      add(o, { order: true, text: '⏱ Order window: ' + what.split(',')[0].slice(0, 14), tip: `Six weeks before ${what} (${when}): remind teams to order uniforms now. Six weeks is a planning default; confirm RSH’s real production time before saying it in a post.` });
    }
    return out;
  }
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
    const marks = seasonMarks();
    grid.querySelectorAll('.calday[data-date]').forEach(day => {
      if (day.dataset.mc) return; day.dataset.mc = '1';
      for (const m of marks[day.dataset.date] || []) { const el = document.createElement('div'); el.className = 'mcseason' + (m.order ? ' order' : ''); el.title = m.tip; el.textContent = m.text; day.appendChild(el); }
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

  /* ---------- day panel: place ready posts on a date and send them to Metricool ---------- */
  const bots = () => window.RSH_BOTS;
  let dayOpen = null, dayMsg = '', sendMode = 'schedule', aiFlag = true;
  const statusOf = it => !it.sent ? ['', 'Placed, not sent yet'] : it.sent.via === 'direct' && it.sent.status === 'scheduled' ? ['sch', 'Scheduled to post directly (no Metricool)'] : it.sent.status === 'posted' ? ['sch', 'Posted directly'] : it.sent.status === 'scheduled' ? ['sch', 'Scheduled in Metricool'] : it.sent.status === 'draft' ? ['sch', 'Draft in Metricool'] : it.sent.status === 'queued' ? ['que', 'Waiting to be sent'] : ['err', 'Not accepted'];
  function closeDay() { dayOpen = null; dayMsg = ''; ['rshDay', 'rshDayBack'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); }
  function paintDay() {
    if (!dayOpen || !bots() || !bots().readyItems) return;
    let back = document.getElementById('rshDayBack'), box = document.getElementById('rshDay');
    if (!box) { back = document.createElement('div'); back.id = 'rshDayBack'; back.addEventListener('click', closeDay); box = document.createElement('aside'); box.id = 'rshDay'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Plan this day'); document.body.appendChild(back); document.body.appendChild(box); box.addEventListener('click', onDayClick); box.addEventListener('change', onDayChange); }
    const B = bots(), N = B.NAME || {}, posts = (window.RSH_APP && window.RSH_APP.data().posts) || [], title = id => ((posts.find(p => p.id === id) || {}).title || 'Campaign');
    const here = B.placedOn(dayOpen), past = dayOpen < iso(new Date());
    const avail = B.readyItems().filter(i => !(i.placed && i.date === dayOpen) && !(i.sent && i.sent.status === 'scheduled'));
    const key = i => i.postId + '|' + i.channel;
    box.innerHTML = `<header><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="eyebrow">PLAN THIS DAY</div><h2 style="margin:6px 0 0;font-size:20px">${esc(new Date(dayOpen + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</h2></div><button type="button" class="btn ghost smallbtn" data-day-close>Close ✕</button></div></header>
      <div class="body">
        ${dayMsg ? `<div class="hint" role="status">${esc(dayMsg)}</div>` : ''}
        ${past ? '<div class="hint">This day has passed, so nothing new can be placed on it.</div>' : ''}
        <div class="opts"><div><strong>When you send to Metricool</strong></div>
          <label><input type="radio" name="rshDayMode" value="schedule" ${sendMode === 'schedule' ? 'checked' : ''}> Schedule it: Metricool publishes it at the time shown</label>
          <label><input type="radio" name="rshDayMode" value="draft" ${sendMode === 'draft' ? 'checked' : ''}> Send as a draft: finish and schedule it in Metricool</label>
          <div class="small">The app sends the campaign's attached photo or video with the post: it puts the file in your Google Drive as a share link (Google Drive must be connected inside Metricool too).</div>
          <label><input type="checkbox" data-day-ai ${aiFlag ? 'checked' : ''}> The photo or video was made with AI (adds the AI label on Instagram, TikTok, YouTube and Pinterest)</label></div>
        <h3>On this day</h3>
        ${here.length ? here.map(i => { const [c, l] = statusOf(i); return `<div class="row"><div class="t"><strong>${esc(N[i.channel] || i.channel)} · <span class="rsh-camp-link" data-campaign-open="${esc(i.postId)}">${esc(title(i.postId))}</span></strong><span class="st ${c}">${esc(l)}</span></div>
          <div class="cap">${esc(i.caption)}</div>
          ${i.sent && i.sent.reason ? `<div class="small" style="color:#b42318">${esc(i.sent.reason)}</div>` : ''}
          ${i.sent && i.sent.plannerUrl ? `<a class="small" href="${esc(i.sent.plannerUrl)}" target="_blank" rel="noopener noreferrer">Open it in Metricool ↗</a>` : ''}
          ${!(i.sent && /scheduled|draft|posted/.test(i.sent.status)) ? `<label class="small">${i.mediaUrl ? 'Link to the file Metricool will use' : (B.fileFor(i) ? 'Leave empty: the app uploads the campaign’s file to your Google Drive and makes the link when you send. Or press “Attach file” to pick a different one' : (B.needsFile(i) ? `No file attached yet; ${esc(N[i.channel])} needs one. Press “Attach file”, or paste a public link` : 'Optional: a public link to a photo or video'))}<input type="url" data-day-media="${esc(key(i))}" value="${esc(i.mediaUrl || '')}" placeholder="https://drive.google.com/…"></label><div class="acts"><button type="button" class="btn ghost smallbtn" data-day-attach="${esc(key(i))}">Attach file</button><input type="file" accept="video/*,image/*" hidden data-day-file="${esc(key(i))}"><span class="small">A photo or video up to 16 MB goes to your Google Drive and its link is filled in for you.</span></div>` : ''}
          <div class="acts"><input type="time" data-day-time="${esc(key(i))}" value="${esc(i.time)}" aria-label="Time" ${i.sent && /scheduled|draft|posted/.test(i.sent.status) ? 'disabled' : ''}><span class="small">US Eastern</span>
          ${i.sent && /scheduled|draft|posted/.test(i.sent.status) ? '' : `<button type="button" class="btn smallbtn" data-day-send="${esc(key(i))}">Send to Metricool</button><button type="button" class="btn ghost smallbtn" data-day-remove="${esc(key(i))}">Remove from day</button>`}</div></div>`; }).join('') : '<div class="small">Nothing placed on this day yet.</div>'}
        <h3>Ready to place</h3>
        ${past ? '' : avail.length ? avail.map(i => `<div class="row"><div class="t"><strong>${esc(N[i.channel] || i.channel)} · <span class="rsh-camp-link" data-campaign-open="${esc(i.postId)}">${esc(title(i.postId))}</span></strong>${i.placed ? `<span class="st">On ${esc(i.date.slice(5))}</span>` : ''}</div><div class="cap">${esc(i.caption)}</div>
          <div class="acts"><input type="time" data-day-newtime="${esc(key(i))}" value="${esc(i.time || '18:00')}" aria-label="Time"><button type="button" class="btn ghost smallbtn" data-day-add="${esc(key(i))}">${i.placed ? 'Move to this day' : 'Add to this day'}</button></div></div>`).join('')
          : '<div class="small">No posts are ready. A post is ready when its campaign has its files, the five visual checks and both approvals. Run the bots in 24/7 Bots to refresh the list.</div>'}
      </div>`;
  }
  async function onDayClick(e) {
    const B = bots(); if (!B) return;
    if (e.target.closest('[data-day-close]')) return closeDay();
    const add = e.target.closest('[data-day-add]');
    if (add) { const k = add.dataset.dayAdd, t = (document.querySelector(`#rshDay [data-day-newtime="${CSS.escape(k)}"]`) || {}).value; dayMsg = (await B.place(k, dayOpen, t)) ? 'Placed on this day.' : 'That post can’t be placed on this day.'; return paintDay(); }
    const at = e.target.closest('[data-day-attach]'); if (at) { const f = document.querySelector(`#rshDay [data-day-file="${CSS.escape(at.dataset.dayAttach)}"]`); if (f) f.click(); return; }
    const rm = e.target.closest('[data-day-remove]'); if (rm) { await B.unplace(rm.dataset.dayRemove); dayMsg = 'Removed from this day. The post is still ready.'; return paintDay(); }
    const sd = e.target.closest('[data-day-send]');
    if (sd) { const k = sd.dataset.daySend, t = (document.querySelector(`#rshDay [data-day-time="${CSS.escape(k)}"]`) || {}).value; if (t) await B.place(k, dayOpen, t);
      sd.disabled = true; sd.textContent = 'Sending…'; const r = await B.sendToMetricool(k, sendMode, aiFlag, t => { sd.textContent = t; });
      dayMsg = r.ok ? (r.queued ? 'This view can’t reach Metricool, so the post is waiting to be sent by a Claude session. Ask Claude to “send the waiting posts to Metricool”.' : sendMode === 'draft' ? 'Sent to Metricool as a draft.' : 'Scheduled in Metricool.') : r.reason; return paintDay(); }
  }
  async function onDayChange(e) {
    const t = e.target;
    if (t.name === 'rshDayMode') { sendMode = t.value; return; }
    if (t.matches('[data-day-ai]')) { aiFlag = t.checked; return; }
    if (t.matches('[data-day-file]')) { const k = t.dataset.dayFile, f = t.files && t.files[0], btn = document.querySelector(`#rshDay [data-day-attach="${CSS.escape(k)}"]`); t.value = ''; if (!f) return;
      if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
      const r = await bots().attachForPost(k, f, s => { if (btn) btn.textContent = s; });
      dayMsg = r.ok ? `“${f.name}” is in your Google Drive and its link is filled in. Press Send to Metricool.` : r.reason; return paintDay(); }
    if (t.matches('[data-day-media]')) { await bots().setMediaUrl(t.dataset.dayMedia, t.value); return; }
  }
  function markPlaced() {
    const grid = document.getElementById('calendarGrid'); if (!grid || !bots() || !bots().placedOn) return;
    grid.querySelectorAll('.calevent.rp').forEach(x => x.remove());
    grid.querySelectorAll('.calday[data-date]').forEach(day => { for (const i of bots().placedOn(day.dataset.date)) { const el = document.createElement('div'), st = statusOf(i)[0]; el.className = 'calevent rp' + (st ? ' ' + st.replace('sch', 'sch').replace('que', 'que').replace('err', 'err') : ''); el.textContent = `${i.time.replace(/^0/, '')} ${(bots().NAME[i.channel] || i.channel).slice(0, 2)} · ready`; if (i.sent && /scheduled|draft|posted/.test(i.sent.status)) el.textContent = `${i.time.replace(/^0/, '')} ${(bots().NAME[i.channel] || i.channel).slice(0, 2)} · sent`; el.title = statusOf(i)[1]; day.appendChild(el); } });
  }

  function start() {
    const grid = document.getElementById('calendarGrid'); if (!grid || !live() || grid.dataset.rshCal) return; grid.dataset.rshCal = '1';
    new MutationObserver(() => { paint(); markPlaced(); }).observe(grid, { childList: true });
    grid.addEventListener('click', e => { const d = e.target.closest('.calday[data-date]'); if (!d || e.target.closest('a,button')) return; dayOpen = d.dataset.date; dayMsg = ''; paintDay(); });
    if (bots() && bots().onChange) bots().onChange(() => { markPlaced(); if (dayOpen) paintDay(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dayOpen) closeDay(); });
    live().onData(() => { grid.querySelectorAll('.calday[data-mc]').forEach(d => { delete d.dataset.mc; d.classList.remove('mc-empty'); d.querySelectorAll('.mc,.mcpub,.mcnone').forEach(x => x.remove()); }); paint(); });
    paint(); markPlaced();
  }
  window.RSH_CALENDAR = { start, coverage, openDay: d => { dayOpen = d; dayMsg = ''; paintDay(); } };
})();
