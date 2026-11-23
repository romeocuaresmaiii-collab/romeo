/* RSH Sports Marketing OS — campaign checklist (artifact edition only).
 *
 * One simple list: every campaign in a date range, where it stands, and the single next thing to
 * do, with a button that opens the right screen. The status is worked out from the campaign's
 * real state using the same rules as the rest of the app; ticking nothing here changes anything.
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = () => window.RSH_APP, PREF = 'rsh:tracker';
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const at = s => new Date(s + 'T12:00:00');
  const todayIso = () => iso(new Date());
  let range = null, only = 'all';

  const css = document.createElement('style');
  css.textContent = `
  #rshTracker .head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-end}
  #rshTracker .controls{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
  #rshTracker .controls label{display:block;font-size:11px;font-weight:700;color:#515154;margin-bottom:3px}
  #rshTracker .controls input,#rshTracker .controls select{font:inherit;font-size:12.5px;padding:7px 9px;border:1px solid #d2d2d7;border-radius:9px;background:#fff;color:#1d1d1f}
  #rshTracker .sum{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  #rshTracker .sum button{border:1px solid #e5e5ea;background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;color:#1d1d1f;cursor:pointer}
  #rshTracker .sum button.on{background:#1d1d1f;border-color:#1d1d1f;color:#fff}
  #rshTracker .sum button:focus-visible{outline:2px solid #0071e3;outline-offset:2px}
  #rshTracker .day{margin-top:16px;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#515154;display:flex;gap:8px;align-items:baseline}
  #rshTracker .day .when{font-weight:600;text-transform:none;letter-spacing:0;color:#6e6e73}
  #rshTracker .row{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1.5fr) auto;gap:14px;align-items:center;border:1px solid #e5e5ea;border-radius:14px;padding:12px 14px;margin-top:8px;background:#fff}
  @media(max-width:900px){#rshTracker .row{grid-template-columns:minmax(0,1fr)}}
  #rshTracker .title{font-weight:800;font-size:14px;color:#1d1d1f}
  #rshTracker .steps{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
  #rshTracker .step{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}
  #rshTracker .step.done{background:#eaf7ee;color:#1a7f37}#rshTracker .step.now{background:#0071e3;color:#fff}#rshTracker .step.todo{background:#f0f0f3;color:#8e8e93}
  #rshTracker .next{font-size:13px;line-height:1.45;color:#1d1d1f}
  #rshTracker .next strong{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;margin-bottom:2px}
  #rshTracker .late{color:#b42318;font-weight:700}
  #rshTracker .empty{margin-top:14px;padding:18px;border:1px dashed #c7c7cc;border-radius:14px;color:#515154;font-size:13px;text-align:center}`;
  document.head.appendChild(css);

  const STEPS = [['brief', 'Brief'], ['media', 'Media'], ['checks', 'Visual checks'], ['manager', 'Manager review'], ['anthony', 'Anthony approval']];
  const GROUPS = { brief: 'Needs brief', media: 'Needs media or checks', manager: 'In manager review', anthony: 'Waiting for Anthony', ready: 'Approved' };

  function describe(p) {
    const t = app().track(p), done = { brief: t.brief, media: t.media, checks: t.media && t.qa, manager: t.manager, anthony: t.stage === 'ready' };
    let next, button;
    if (t.stage === 'brief') { next = 'Finish the hook, caption and planned date.'; button = 'Edit brief'; }
    else if (t.stage === 'media') {
      if (!t.assets) { next = `Attach the finished ${/reel|video/i.test(p.postType || '') ? 'video' : /carousel/i.test(p.postType || '') ? 'photos' : 'photo'}.`; button = 'Attach media'; }
      else if (!t.media) { next = 'The attached files don’t match this post’s format. Attach the right type.'; button = 'Fix media'; }
      else if (!t.qa) { next = 'Tick the five visual checks for the attached files.'; button = 'Do checks'; }
      else { next = 'Media and checks are done. Send it to manager review.'; button = 'Send to review'; }
    }
    else if (t.stage === 'manager') { next = p.status === 'Approved' ? 'An earlier approval no longer applies. Review the current content again.' : 'Manager: check the media, claims and rights, then pass it on.'; button = 'Review'; }
    else if (t.stage === 'anthony') { next = 'Waiting for Anthony’s final approval.'; button = 'Open'; }
    else { next = p.published ? 'Published and linked to its results.' : p.status === 'Published' ? 'Marked as published. Link it to its post to see results.' : 'Approved. Schedule it in Metricool for this date.'; button = 'Open'; }
    return { t, done, next, button, group: t.stage };
  }

  function defaultRange(posts) {
    const today = todayIso(), dates = posts.map(p => p.date).filter(Boolean).sort();
    const first = dates.find(d => d >= today) || dates[dates.length - 1] || today;
    const end = at(first); end.setDate(end.getDate() + 13);
    return { from: first < today ? first : (dates[0] && dates[0] < today && dates.some(d => d >= today) ? first : first), to: iso(end) };
  }
  function dayLabel(dateIso) {
    const d = at(dateIso), diff = Math.round((d - at(todayIso())) / 86400000);
    return { name: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), when: diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff > 1 ? `in ${diff} days` : diff === -1 ? 'yesterday' : `${-diff} days ago`, past: diff < 0 };
  }

  function render() {
    const host = document.getElementById('rshTracker'); if (!host || !app()) return;
    const all = (app().data().posts || []).filter(p => p.date);
    if (!range) { try { range = JSON.parse(localStorage.getItem(PREF) || 'null'); } catch (_) {} if (!range || !range.from || !range.to) range = defaultRange(all); }
    const inRange = all.filter(p => p.date >= range.from && p.date <= range.to).sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
    const rows = inRange.map(p => ({ p, ...describe(p) }));
    const counts = {}; for (const r of rows) counts[r.group] = (counts[r.group] || 0) + 1;
    if (only !== 'all' && !counts[only]) only = 'all';
    const shown = rows.filter(r => only === 'all' || r.group === only);
    let html = '', lastDay = '';
    for (const r of shown) {
      if (r.p.date !== lastDay) { lastDay = r.p.date; const d = dayLabel(lastDay); html += `<div class="day">${esc(d.name)}<span class="when">${esc(d.when)}</span></div>`; }
      const late = dayLabel(r.p.date).past && r.group !== 'ready';
      let seenNow = false;
      const steps = STEPS.map(([k, label]) => { const done = r.done[k]; const cls = done ? 'done' : (!seenNow ? 'now' : 'todo'); if (!done) seenNow = true; return `<span class="step ${cls}">${done ? '✓ ' : ''}${esc(label)}</span>`; }).join('');
      html += `<div class="row" data-track-row="${esc(r.p.id)}"><div><div class="title">${esc(r.p.title)}</div><div class="small">${esc(r.p.platform || '')} · ${esc(r.p.owner || 'No owner')}${late ? ' · <span class="late">past its date</span>' : ''}</div><div class="steps">${steps}</div></div>
        <div class="next"><strong>Next</strong>${esc(r.next)}</div>
        <div><button type="button" class="btn ${r.group === 'ready' || r.group === 'anthony' ? 'ghost ' : ''}smallbtn" data-track-open="${esc(r.p.id)}">${esc(r.button)} →</button></div></div>`;
    }
    const rangeLabel = `${at(range.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${at(range.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    host.innerHTML = `
      <div class="head"><div><div class="eyebrow">CAMPAIGN CHECKLIST</div><h2 style="margin-top:6px">What’s done and what’s next</h2><p style="margin-top:6px">${rows.length} campaign${rows.length === 1 ? '' : 's'} planned for ${esc(rangeLabel)}${rows.length ? `, ${counts.ready || 0} approved` : ''}.</p></div>
        <div class="controls"><div><label for="rshTrackFrom">From</label><input type="date" id="rshTrackFrom" value="${esc(range.from)}"></div><div><label for="rshTrackTo">To</label><input type="date" id="rshTrackTo" value="${esc(range.to)}"></div>
        <div><label for="rshTrackPreset">Quick range</label><select id="rshTrackPreset"><option value="">Choose…</option><option value="upcoming">Next campaigns (2 weeks)</option><option value="month">This month</option><option value="next">Next month</option><option value="all">All campaigns</option></select></div>
        <button type="button" class="btn ghost smallbtn" data-track-copy>Copy list</button></div></div>
      ${rows.length ? `<div class="sum"><button type="button" data-track-only="all" class="${only === 'all' ? 'on' : ''}">All ${rows.length}</button>${Object.keys(GROUPS).filter(g => counts[g]).map(g => `<button type="button" data-track-only="${g}" class="${only === g ? 'on' : ''}">${esc(GROUPS[g])} ${counts[g]}</button>`).join('')}</div>` : ''}
      ${rows.length ? html : `<div class="empty">No campaigns are planned between these dates. Change the range, or create a post.</div>`}`;
    host._rows = rows; host._label = rangeLabel;
  }

  function setRange(from, to) { if (!from || !to) return; if (from > to) [from, to] = [to, from]; range = { from, to }; try { localStorage.setItem(PREF, JSON.stringify(range)); } catch (_) {} render(); }
  function preset(kind) {
    const posts = (app().data().posts || []).filter(p => p.date), now = new Date();
    if (kind === 'upcoming') { range = defaultRange(posts); try { localStorage.removeItem(PREF); } catch (_) {} return render(); }
    if (kind === 'month') return setRange(iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    if (kind === 'next') return setRange(iso(new Date(now.getFullYear(), now.getMonth() + 1, 1)), iso(new Date(now.getFullYear(), now.getMonth() + 2, 0)));
    if (kind === 'all' && posts.length) { const ds = posts.map(p => p.date).sort(); return setRange(ds[0], ds[ds.length - 1]); }
  }
  function copyText(host) {
    let last = '', out = `RSH Sports campaigns, ${host._label}\n`;
    for (const r of host._rows) { if (r.p.date !== last) { last = r.p.date; out += `\n${dayLabel(last).name}\n`; } out += `• ${r.p.title} (${r.p.platform}, ${r.p.owner || 'no owner'}) — ${GROUPS[r.group]}. Next: ${r.next}\n`; }
    return out;
  }

  function start() {
    const home = document.getElementById('view-overview'); if (!home || !app() || !app().track || document.getElementById('rshTracker')) return;
    const card = document.createElement('div'); card.className = 'card'; card.id = 'rshTracker'; card.style.marginBottom = '16px';
    const quick = document.getElementById('rshQuick'); home.insertBefore(card, quick ? quick.nextSibling : home.firstChild);
    card.addEventListener('click', e => {
      const o = e.target.closest('[data-track-open]'); if (o) return app().openNext(o.dataset.trackOpen);
      const f = e.target.closest('[data-track-only]'); if (f) { only = f.dataset.trackOnly; return render(); }
      const c = e.target.closest('[data-track-copy]'); if (c) { const done = ok => { c.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { c.textContent = 'Copy list'; }, 1800); }; try { navigator.clipboard.writeText(copyText(card)).then(() => done(true), () => done(false)); } catch (_) { done(false); } }
    });
    card.addEventListener('change', e => {
      if (e.target.id === 'rshTrackFrom' || e.target.id === 'rshTrackTo') setRange(card.querySelector('#rshTrackFrom').value, card.querySelector('#rshTrackTo').value);
      if (e.target.id === 'rshTrackPreset' && e.target.value) preset(e.target.value);
    });
    document.querySelectorAll('.nav button[data-view="overview"]').forEach(b => b.addEventListener('click', () => setTimeout(render, 0)));
    const list = document.getElementById('pipelineItems'); if (list) new MutationObserver(() => render()).observe(list, { childList: true });   // the app redraws this whenever campaigns change
    render();
  }
  window.RSH_TRACKER = { start, render };
})();
