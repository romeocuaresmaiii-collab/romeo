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
  #rshTracker .acts{display:flex;flex-direction:column;gap:6px;align-items:stretch}
  @media(max-width:900px){#rshTracker .acts{flex-direction:row}}
  #rshDetailBack{position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:10020}
  #rshDetail{position:fixed;top:0;right:0;bottom:0;width:min(620px,100vw);background:#fff;color:#1d1d1f;z-index:10021;box-shadow:-12px 0 40px rgba(0,0,0,.18);display:flex;flex-direction:column}
  #rshDetail header{padding:calc(18px + env(safe-area-inset-top,0px)) 22px 14px;border-bottom:1px solid #ececf0}
  #rshDetail header h2{margin:6px 0 0;font-size:21px;line-height:1.25}
  #rshDetail .scrollbody{flex:1;overflow:auto;padding:16px 22px 22px}
  #rshDetail footer{padding:12px 22px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #ececf0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#fbfbfd}
  #rshDetail .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
  #rshDetail .chip{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:#f0f0f3;color:#515154}
  #rshDetail .nextbox{margin-top:14px;padding:12px 14px;border-radius:12px;background:#f5f8ff;border:1px solid #dbe7fb;font-size:13px;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}
  #rshDetail section{margin-top:18px}
  #rshDetail .lab{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#6e6e73;margin-bottom:6px}
  #rshDetail .val{font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
  #rshDetail .val.big{font-size:17px;font-weight:800}
  #rshDetail .val.none{color:#8e8e93;font-style:italic}
  #rshDetail textarea,#rshDetail input[type=text],#rshDetail input[type=date],#rshDetail select{width:100%;box-sizing:border-box;font:inherit;font-size:13.5px;line-height:1.5;padding:9px 10px;border:1px solid #d2d2d7;border-radius:10px;background:#fff;color:#1d1d1f}
  #rshDetail .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  #rshDetail .thumbs{display:flex;flex-wrap:wrap;gap:8px}
  #rshDetail .thumbs img,#rshDetail .thumbs .vid{width:92px;height:92px;object-fit:cover;border-radius:10px;border:1px solid #e5e5ea;background:#f5f5f7;display:flex;align-items:center;justify-content:center;font-size:11px;color:#515154}
  #rshDetail .copy{border:1px solid #d2d2d7;background:#fff;border-radius:7px;padding:2px 8px;font:inherit;font-size:10.5px;font-weight:700;color:#0066cc;cursor:pointer;text-transform:none;letter-spacing:0}
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
    const fs = window.RSH_BOTS && window.RSH_BOTS.factState ? window.RSH_BOTS.factState(p.id) : null;
    const vo = window.RSH_BOTS && window.RSH_BOTS.voState ? window.RSH_BOTS.voState(p.id) : '';
    if (vo === 'missing' && !t.assets) { next = 'Record the voiceover (Part 5 of Sage’s pack) in ElevenLabs and add the audio file to 📁 Assets: every Did You Know video has a voiceover.'; button = 'Open'; }
    if (fs && !fs.ok) next = fs.label + (/corrected|failed/.test(fs.s) ? '' : '. Sage writes the script once the facts pass.');
    return { t, done, next, button, group: t.stage };
  }

  // Sage's production pack for this campaign: written, being written now, or next in line.
  function scriptChip(id) {
    const B = window.RSH_BOTS, st = B && B.sageState ? B.sageState(id) : '', fs = B && B.factState ? B.factState(id) : null;
    const fchip = !fs ? '' : fs.ok ? `<span class="step done" title="${esc(fs.label)}">✓ Facts</span>` : /checking|none|changed/.test(fs.s) ? `<span class="step now" title="${esc(fs.label)}">🔎 Facts being checked</span>` : `<span class="step now late" title="${esc(fs.label)}">⚠ Facts: ${fs.s === 'corrected' ? 'fix needed' : 'not confirmed'}</span>`;
    const vo = B && B.voState ? B.voState(id) : '', vchip = vo === 'ok' ? '<span class="step done">✓ Voiceover</span>' : vo === 'missing' ? '<span class="step now">🎙 Voiceover needed</span>' : '';
    if (fs && !fs.ok) return fchip + '<span class="step todo">Script (after facts)</span>' + vchip;
    return fchip + scriptBody(st) + vchip;
  }
  function scriptBody(st) {
    if (!st) return '';
    return st === 'done' ? '<span class="step done">✓ Script</span>' : st === 'writing' ? '<span class="step now">✎ Sage is writing the script…</span>' : st === 'next' ? '<span class="step now">Script: Sage starts next</span>' : '<span class="step todo">Script</span>';
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
    const B = window.RSH_BOTS, fresh = (app().data().posts || []).filter(p => B && B.isNew && B.isNew(p)).sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const inRange = all.filter(p => p.date >= range.from && p.date <= range.to && !fresh.includes(p)).sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
    const rows = fresh.map(p => ({ p, fresh: true, ...describe(p) })).concat(inRange.map(p => ({ p, ...describe(p) })));
    const counts = {}; for (const r of rows) counts[r.group] = (counts[r.group] || 0) + 1;
    if (only !== 'all' && !counts[only]) only = 'all';
    const shown = rows.filter(r => only === 'all' || r.group === only);
    let html = '', lastDay = '';
    for (const r of shown) {
      if (r.fresh) { if (lastDay !== 'fresh') { lastDay = 'fresh'; html += `<div class="day">Just added<span class="when">new campaigns from the last 7 days, wherever their date falls</span></div>`; } }
      else if (r.p.date !== lastDay) { lastDay = r.p.date; const d = dayLabel(lastDay); html += `<div class="day">${esc(d.name)}<span class="when">${esc(d.when)}</span></div>`; }
      const late = !!r.p.date && dayLabel(r.p.date).past && r.group !== 'ready';
      let seenNow = false;
      const steps = scriptChip(r.p.id) + STEPS.map(([k, label]) => { const done = r.done[k]; const cls = done ? 'done' : (!seenNow ? 'now' : 'todo'); if (!done) seenNow = true; return `<span class="step ${cls}">${done ? '✓ ' : ''}${esc(label)}</span>`; }).join('');
      html += `<div class="row" data-track-row="${esc(r.p.id)}"><div><div class="title">${esc(r.p.title)}</div><div class="small">${r.fresh ? (r.p.date ? esc(dayLabel(r.p.date).name) + ' · ' : '<span class="late">no date yet</span> · ') : ''}${esc(r.p.platform || '')} · ${esc(r.p.owner || 'No owner')}${late ? ' · <span class="late">past its date</span>' : ''}</div><div class="steps">${steps}</div></div>
        <div class="next"><strong>Next</strong>${esc(r.next)}</div>
        <div class="acts"><button type="button" class="btn ${r.group === 'ready' || r.group === 'anthony' ? 'ghost ' : ''}smallbtn" data-track-open="${esc(r.p.id)}">${esc(r.button)} →</button><button type="button" class="btn ghost smallbtn" data-track-details="${esc(r.p.id)}">Details</button><button type="button" class="btn ghost smallbtn" data-track-assets="${esc(r.p.id)}">📁 Assets & 💬 ${window.RSH_BOTS && window.RSH_BOTS.rawCount ? window.RSH_BOTS.rawCount(r.p.id) + ' · ' + window.RSH_BOTS.cmtCount(r.p.id) : ''}</button></div></div>`;
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
    for (const r of host._rows) { const k = r.fresh ? 'fresh' : r.p.date; if (k !== last) { last = k; out += `\n${r.fresh ? 'Just added' : dayLabel(last).name}\n`; } out += `• ${r.p.title} (${r.p.platform}, ${r.p.owner || 'no owner'}) — ${GROUPS[r.group]}. Next: ${r.next}\n`; }
    return out;
  }

  /* ---------- details panel: the whole idea for one campaign, to read, copy from, or edit ---------- */
  const FIELDS = [['hook', 'Hook', 'big', 2], ['caption', 'Caption and call to action', '', 9], ['onImageText', 'Text on the image', '', 2], ['visualConcept', 'Visual concept', '', 4], ['visualPrompt', 'Image prompt / storyboard', '', 10], ['script', 'Script (scene by scene, with timings such as 0–2s:)', '', 12], ['voiceover', 'Voice-over', '', 6]];
  let detailId = null, editing = false, detailNote = '';
  function closeDetail() { detailId = null; editing = false; detailNote = ''; const d = document.getElementById('rshDetail'), b = document.getElementById('rshDetailBack'); if (d) d.remove(); if (b) b.remove(); }
  function openDetail(id, edit) { detailId = id; editing = !!edit; detailNote = ''; paintDetail(); }
  function paintDetail() {
    const p = (app().data().posts || []).find(x => x.id === detailId); if (!p) return closeDetail();
    const r = describe(p), day = p.date ? dayLabel(p.date) : null;
    let back = document.getElementById('rshDetailBack'), box = document.getElementById('rshDetail');
    if (!box) { back = document.createElement('div'); back.id = 'rshDetailBack'; back.addEventListener('click', closeDetail); box = document.createElement('aside'); box.id = 'rshDetail'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Campaign details'); document.body.appendChild(back); document.body.appendChild(box); box.addEventListener('click', onDetailClick); }
    const files = [p.creativeAsset].concat(Array.isArray(p.creativeAssets) ? p.creativeAssets : []).filter(Boolean).filter((a, i, all) => all.findIndex(x => x.id === a.id) === i);
    const chips = [p.platform, p.postType, p.aspectRatio, p.sport, p.audience, p.goal].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('');
    const owners = ['Project Manager', 'Maxine', 'Jasper']; if (p.owner && !owners.includes(p.owner)) owners.push(p.owner);
    let seenNow = false;
    const steps = STEPS.map(([k, label]) => { const done = r.done[k]; const cls = done ? 'done' : (!seenNow ? 'now' : 'todo'); if (!done) seenNow = true; return `<span class="step ${cls}" style="font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;${done ? 'background:#eaf7ee;color:#1a7f37' : cls === 'now' ? 'background:#0071e3;color:#fff' : 'background:#f0f0f3;color:#8e8e93'}">${done ? '✓ ' : ''}${esc(label)}</span>`; }).join(' ');
    const field = ([k, label, cls, rowsN]) => editing
      ? `<section><div class="lab"><label for="rshD_${k}">${esc(label)}</label></div><textarea id="rshD_${k}" data-detail-field="${k}" rows="${rowsN}">${esc(p[k] || '')}</textarea></section>`
      : `<section><div class="lab"><span>${esc(label)}</span>${p[k] ? `<button type="button" class="copy" data-detail-copy="${k}">Copy</button>` : ''}</div><div class="val ${cls} ${p[k] ? '' : 'none'}">${p[k] ? esc(p[k]) : 'Not written yet'}</div></section>`;
    box.innerHTML = `
      <header><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div class="eyebrow">CAMPAIGN DETAILS</div><button type="button" class="btn ghost smallbtn" data-detail-close aria-label="Close details">Close ✕</button></div>
        ${editing ? `<div style="margin-top:8px"><label class="small" for="rshD_title">Title</label><input type="text" id="rshD_title" data-detail-field="title" value="${esc(p.title || '')}"></div><div class="two" style="margin-top:8px"><div><label class="small" for="rshD_date">Planned date</label><input type="date" id="rshD_date" data-detail-field="date" value="${esc(p.date || '')}"></div><div><label class="small" for="rshD_owner">Assigned to</label><select id="rshD_owner" data-detail-field="owner">${owners.map(o => `<option${o === p.owner ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div></div>`
          : `<h2>${esc(p.title)}</h2><div class="small" style="margin-top:4px">${day ? esc(day.name) + ' · ' + esc(day.when) : 'No date'} · ${esc(p.owner || 'No owner')}</div>`}
        <div class="chips">${chips}</div></header>
      <div class="scrollbody">
        ${editing ? '<div class="hint" role="note">Saving a change records it in the history and clears this campaign’s visual checks and any approvals, so the new version is reviewed again.</div>' : `<div>${steps}</div><div class="nextbox"><span><strong>Next:</strong> ${esc(r.next)}</span><button type="button" class="btn smallbtn" data-detail-next>${esc(r.button)} →</button></div>`}
        ${detailNote ? `<div class="hint" role="status" style="margin-top:12px">${esc(detailNote)}</div>` : ''}
        ${FIELDS.map(field).join('')}
        ${editing ? '' : `<section><div class="lab"><span>Attached files · ${files.length} of 10</span></div>${files.length ? `<div class="thumbs">${files.map(a => /^video\//.test(a.mime || '') ? `<div class="vid">▶ video</div>` : `<img src="${esc(window.RSH_HOST.mediaUrl(a))}" alt="${esc(a.name || 'Attached image')}" loading="lazy">`).join('')}</div>` : '<div class="val none">Nothing attached yet</div>'}</section>
        ${(p.approvalMeta && p.approvalMeta.notes) ? `<section><div class="lab"><span>Reviewer notes</span></div><div class="val">${esc(p.approvalMeta.notes)}</div></section>` : ''}`}
      </div>
      <footer>${editing ? '<button type="button" class="btn smallbtn" data-detail-save>Save changes</button><button type="button" class="btn ghost smallbtn" data-detail-cancel>Cancel</button>' : '<button type="button" class="btn smallbtn" data-detail-edit>Edit this campaign</button><button type="button" class="btn ghost smallbtn" data-detail-copy="all">Copy full brief for AI</button>'}</footer>`;
    if (!editing) { const c = box.querySelector('[data-detail-close]'); if (c) c.focus(); }
  }
  function briefText(p) { return `${p.title}\n${p.platform || ''} · ${p.date || 'no date'} · ${p.owner || ''}\n\n` + FIELDS.filter(f => p[f[0]]).map(f => `${f[1].toUpperCase()}\n${p[f[0]]}`).join('\n\n'); }
  function onDetailClick(e) {
    const p = (app().data().posts || []).find(x => x.id === detailId); if (!p) return;
    if (e.target.closest('[data-detail-close]')) return closeDetail();
    if (e.target.closest('[data-detail-next]')) { const id = detailId; closeDetail(); return app().openNext(id); }
    if (e.target.closest('[data-detail-edit]')) { editing = true; detailNote = ''; return paintDetail(); }
    if (e.target.closest('[data-detail-cancel]')) { editing = false; return paintDetail(); }
    const cp = e.target.closest('[data-detail-copy]');
    if (cp) { const text = cp.dataset.detailCopy === 'all' ? (app().aiBrief ? app().aiBrief(p.id) : briefText(p)) : String(p[cp.dataset.detailCopy] || ''), old = cp.textContent, done = ok => { cp.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { cp.textContent = old; }, 1600); }; try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); } return; }
    if (e.target.closest('[data-detail-save]')) {
      const changes = {}; document.querySelectorAll('#rshDetail [data-detail-field]').forEach(el => { changes[el.dataset.detailField] = el.value; });
      const res = app().editCampaign(detailId, changes); editing = false;
      detailNote = !res.ok ? 'The campaign could not be saved.' : !res.changed ? 'Nothing was changed.' : 'Saved.' + (res.clearedApproval ? ' Approvals were cleared, so it needs review again.' : '') + (res.clearedChecks ? ' The visual checks need to be done again.' : '');
      paintDetail(); render();
    }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && detailId && !editing) closeDetail(); });

  function start() {
    const view = document.getElementById('view-tracker'); if (!view || !app() || !app().track || document.getElementById('rshTracker')) return;
    const card = document.createElement('div'); card.className = 'card'; card.id = 'rshTracker';
    view.appendChild(card);
    card.addEventListener('click', e => {
      const ra = e.target.closest('[data-track-assets]'); if (ra) { if (window.RSH_BOTS && window.RSH_BOTS.openRaw) window.RSH_BOTS.openRaw(ra.dataset.trackAssets); return; }
      const o = e.target.closest('[data-track-open]'); if (o) return app().openNext(o.dataset.trackOpen);
      const dt = e.target.closest('[data-track-details]'); if (dt) return openDetail(dt.dataset.trackDetails);
      const f = e.target.closest('[data-track-only]'); if (f) { only = f.dataset.trackOnly; return render(); }
      const c = e.target.closest('[data-track-copy]'); if (c) { const done = ok => { c.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { c.textContent = 'Copy list'; }, 1800); }; try { navigator.clipboard.writeText(copyText(card)).then(() => done(true), () => done(false)); } catch (_) { done(false); } }
    });
    card.addEventListener('change', e => {
      if (e.target.id === 'rshTrackFrom' || e.target.id === 'rshTrackTo') setRange(card.querySelector('#rshTrackFrom').value, card.querySelector('#rshTrackTo').value);
      if (e.target.id === 'rshTrackPreset' && e.target.value) preset(e.target.value);
    });
    document.querySelectorAll('[data-view="tracker"]').forEach(b => b.addEventListener('click', () => setTimeout(render, 0)));
    const list = document.getElementById('pipelineItems'); if (list) new MutationObserver(() => render()).observe(list, { childList: true });   // the app redraws this whenever campaigns change
    render();
  }
  // How many campaigns in the current range still need work (for the Home shortcut).
  function openCount() { if (!app() || !app().track) return 0; const all = (app().data().posts || []).filter(p => p.date); const r = range || defaultRange(all); return all.filter(p => p.date >= r.from && p.date <= r.to && app().track(p).stage !== 'ready').length; }
  window.RSH_TRACKER = { start, render, openCount, describe: p => describe(p), openDetail };
})();
