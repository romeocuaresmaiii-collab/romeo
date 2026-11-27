/* RSH Sports Marketing OS — Quick Review (artifact edition, Nov 26, 2026).
 * One screen to review campaigns one after another: the photo or video, the post exactly as it goes out, the bots'
 * checks, one checklist (the five visual checks plus platform and time), the team's comments, and the decision:
 * approve, request changes, or (for Anthony) the signed final approval. It uses the app's own review rules
 * (RSH_APP.review, RSH_SIGNOFF); nothing is scheduled or published from here.
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = () => window.RSH_APP, bots = () => window.RSH_BOTS || {}, sign = () => window.RSH_SIGNOFF || {};
  const CHECKS = [
    ['uniform', 'Kit is right for the sport', 'Team or school name and crest; wrestling singlets have no number'],
    ['logos', 'No third-party logo or mark anywhere', 'Shoes, socks, leg print, tags, scoreboards'],
    ['quality', 'Sharp, right size, nothing cut off', 'The platform’s size; text inside the safe area'],
    ['rights', 'We have the rights to everything', 'Photos, clips, music; no identifiable person without consent'],
    ['copy', 'Words and facts are correct', 'No price, stock or delivery claims; spelling; tagline verb']
  ];
  const S = { notes: {}, open: false, list: [], i: 0, filter: 'todo', file: 0, msg: '', busy: false, platformOk: {}, urls: {} };
  const posts = () => (app() && app().data().posts) || [];
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const files = p => [p.creativeAsset].concat(p.creativeAssets || []).filter((a, i, arr) => a && a.id && arr.findIndex(b => b && b.id === a.id) === i);
  // Where a campaign stands in review.
  function stepOf(p) {
    const m = p.approvalMeta || {};
    if (m.anthonyConfirmedAt || /^(Approved|Scheduled|Published)$/.test(p.status || '')) return 'done';
    if (!files(p).length) return 'files';
    const h = Array.isArray(p.revisionHistory) ? p.revisionHistory : [], last = h.reduce((a, b) => (!a || String(b.at || '') > String(a.at || '')) ? b : a, null);
    if (p.status === 'Draft' && last && last.type === 'Changes requested') return 'changes';
    if (m.pmReviewedAt) return 'anthony';
    return app().review.valid(p.id) ? 'manager' : 'checks';
  }
  const STEP = { files: ['Needs files', '#9a3412', '#fff7ed'], checks: ['Needs checking', '#1d4ed8', '#eff6ff'], manager: ['Ready to approve', '#047857', '#ecfdf5'], anthony: ['Waiting for Anthony', '#7c3aed', '#f5f3ff'], done: ['Approved', '#15803d', '#f0fdf4'], changes: ['Changes requested', '#b91c1c', '#fef2f2'] };
  function build() {
    const all = posts().filter(p => p.date && p.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
    const want = { todo: s => s === 'checks' || s === 'manager' || s === 'anthony', mine: s => s === 'checks' || s === 'manager', anthony: s => s === 'anthony', files: s => s === 'files', changes: s => s === 'changes' }[S.filter] || (() => true);
    const cur = S.list[S.i];
    S.list = all.filter(p => want(stepOf(p))).map(p => p.id);
    S.i = Math.max(0, Math.min(S.list.length - 1, cur ? Math.max(0, S.list.indexOf(cur)) : 0));
  }
  const counts = () => { const c = { todo: 0, mine: 0, anthony: 0, files: 0, changes: 0 }; for (const p of posts().filter(p => p.date && p.date >= todayIso())) { const s = stepOf(p); if (s === 'checks' || s === 'manager') { c.mine++; c.todo++; } if (s === 'anthony') { c.anthony++; c.todo++; } if (s === 'files') c.files++; if (s === 'changes') c.changes++; } return c; };

  // ---------- markup ----------
  const css = document.createElement('style');
  css.textContent = `
  #rshQR{position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.55);display:none;align-items:stretch;justify-content:center;padding:18px}
  #rshQR .qr{background:#f5f5f7;border-radius:18px;width:min(1280px,100%);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)}
  #rshQR .qr-top{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 16px;background:#fff;border-bottom:1px solid #e5e5ea}
  #rshQR .chips{display:flex;gap:6px;flex-wrap:wrap}#rshQR .chips button{border:1px solid #d2d2d7;background:#fff;border-radius:999px;padding:6px 12px;font:600 12px system-ui,sans-serif;cursor:pointer}
  #rshQR .chips button.on{background:#1d1d1f;color:#fff;border-color:#1d1d1f}
  #rshQR .qr-body{flex:1;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:14px;padding:14px;overflow:auto}
  #rshQR .pane{background:#fff;border-radius:14px;padding:14px;border:1px solid #e5e5ea;min-width:0}
  #rshQR .media{display:flex;flex-direction:column;gap:10px}
  #rshQR .stage{background:#0f172a;border-radius:12px;display:flex;align-items:center;justify-content:center;min-height:360px;max-height:62vh;overflow:hidden}
  #rshQR .stage img,#rshQR .stage video{max-width:100%;max-height:62vh;object-fit:contain;display:block}
  #rshQR .thumbs{display:flex;gap:6px;flex-wrap:wrap}#rshQR .thumbs button{border:2px solid transparent;border-radius:8px;padding:0;background:#e5e5ea;width:58px;height:58px;cursor:pointer;overflow:hidden;font:700 10px system-ui}
  #rshQR .thumbs button.on{border-color:#0071e3}#rshQR .thumbs img{width:100%;height:100%;object-fit:cover}
  #rshQR h3{margin:0;font-size:18px}#rshQR h4{margin:14px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6e6e73}
  #rshQR .pill{display:inline-block;border-radius:999px;padding:3px 10px;font:700 12px system-ui}
  #rshQR .post{white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e5ea;border-radius:10px;padding:10px;font-size:13px;line-height:1.45;max-height:220px;overflow:auto}
  #rshQR .ck{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid #e5e5ea;border-radius:10px;margin-top:6px;cursor:pointer;background:#fff}
  #rshQR .ck input{width:18px;height:18px;margin-top:1px;flex:none}#rshQR .ck.on{background:#f0fdf4;border-color:#bbf7d0}
  #rshQR .bot{font-size:12px;padding:3px 8px;border-radius:8px;display:inline-block;margin:2px 4px 2px 0}
  #rshQR .bot.stop{background:#fef2f2;color:#991b1b}#rshQR .bot.warn{background:#fffbeb;color:#92400e}#rshQR .bot.ok{background:#f0fdf4;color:#166534}
  #rshQR .cm{border:1px solid #e5e5ea;border-radius:10px;padding:8px 10px;margin-top:6px;font-size:13px}
  #rshQR .qr-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:#fff;border-top:1px solid #e5e5ea}
  #rshQR textarea{width:100%;box-sizing:border-box;border:1px solid #d2d2d7;border-radius:10px;padding:8px;font:13px system-ui;resize:vertical}
  #rshQR .msg{font-size:13px;padding:8px 10px;border-radius:10px;background:#eff6ff;color:#1e3a8a;margin-top:8px}
  #rshQR .empty{grid-column:1/-1;text-align:center;padding:60px 20px;color:#3a3a3c}
  @media(max-width:860px){#rshQR{padding:0}#rshQR .qr{border-radius:0}#rshQR .qr-body{grid-template-columns:1fr}#rshQR .stage{min-height:240px}}
  #rshQRBtn .count{background:#ff3b30;color:#fff;border-radius:999px;padding:0 7px;margin-left:6px;font-size:11px}`;
  document.head.appendChild(css);

  async function urlFor(a) {
    if (S.urls[a.id]) return S.urls[a.id];
    try { const blob = await window.RSH_HOST.fileBlob(a); S.urls[a.id] = URL.createObjectURL(blob); } catch (_) { S.urls[a.id] = ''; }
    return S.urls[a.id];
  }
  function postBlock(p) {
    const B = bots(), items = (B.planItems && B.planItems(p.id)) || [];
    const chans = items.length ? items : ((B.targets && B.targets(p)) || []).map(ch => ({ channel: ch, caption: B.captionFor ? B.captionFor(p, ch) : '', date: p.date, time: '' }));
    return chans.map(it => {
      const pl = !it.time && B.rbOn && B.rbOn(p.date) && B.rbPlace ? B.rbPlace(p, it.channel) : null, date = it.date || (pl && pl.date) || p.date, time = it.time || (pl && pl.time) || '';
      const when = `${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${time ? ' · ' + (+time.slice(0, 2) % 12 || 12) + (time.slice(3) !== '00' ? ':' + time.slice(3) : '') + (+time.slice(0, 2) < 12 ? ' AM' : ' PM') + ' ET' + (B.manila ? ' (' + B.manila(date, time) + ' Manila)' : '') : ''}`;
      const text = B.sendText && items.length ? B.sendText(it) : it.caption;
      const extra = it.rb && (it.channel === 'facebook' || it.channel === 'instagram') ? '<div class="small" style="margin-top:4px">First comment: the website link (rulebook).</div>' : it.rb && it.channel === 'youtube' && B.rbYouTubeTitle ? `<div class="small" style="margin-top:4px">Title: ${esc(B.rbYouTubeTitle(p))}</div>` : '';
      const checks = (it.checks || []).filter(c => c[0] !== 'ok' || /^AI|^Title|^Reply/.test(c[1]));
      return `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>${esc((B.NAME && B.NAME[it.channel]) || it.channel)}</strong><span class="small">${esc(when)}</span></div><div class="post">${esc(text || '(no caption yet)')}</div>${extra}${checks.length ? `<div style="margin-top:6px">${checks.map(c => `<span class="bot ${c[0]}">${c[0] === 'stop' ? '✕ ' : c[0] === 'warn' ? '! ' : '✓ '}${esc(c[1])}</span>`).join('')}</div>` : ''}</div>`;
    }).join('') || '<div class="small">This campaign has no platform yet.</div>';
  }
  async function paint() {
    const host = document.getElementById('rshQR'); if (!host || !S.open) return;
    build(); const c = counts(), id = S.list[S.i], p = posts().find(x => x.id === id);
    const chip = (k, label, n) => `<button type="button" data-qr-filter="${k}" class="${S.filter === k ? 'on' : ''}">${label}${n != null ? ` · ${n}` : ''}</button>`;
    let body, foot = '';
    if (!p) body = `<div class="empty"><div style="font-size:40px">✓</div><h3 style="margin-top:8px">${S.filter === 'files' ? 'No campaign is waiting for files.' : 'Nothing is waiting for review here.'}</h3><p class="small" style="margin-top:6px">${c.files ? `${c.files} campaign${c.files === 1 ? ' still needs' : 's still need'} files before review: see “Needs files”.` : 'Every upcoming campaign is reviewed.'}</p></div>`;
    else {
      const step = stepOf(p), st = STEP[step], fl = files(p), f = fl[Math.min(S.file, fl.length - 1)], ck = app().review.checks(p.id), allCk = CHECKS.every(x => ck[x[0]]) && !!S.platformOk[p.id];
      const sig = step === 'anthony' && sign().info ? await sign().info(p.id) : null;
      const cm = (bots().commentsFor ? bots().commentsFor(p.id) : []).slice(-5), who = cm.length && bots().whoIs ? await bots().whoIs(cm.map(x => x.by)) : {};
      let stageHtml = '<div class="small" style="color:#cbd5e1">No photo or video attached yet.</div>';
      if (f) { const u = await urlFor(f); stageHtml = !u ? '<div class="small" style="color:#cbd5e1">This file could not be loaded.</div>' : /^video\//.test(f.mime || '') ? `<video src="${esc(u)}" controls playsinline preload="metadata"></video>` : `<img src="${esc(u)}" alt="${esc(f.name || 'Campaign photo')}">`; }
      const thumbs = await Promise.all(fl.map(async (a, k) => { const u = /^image\//.test(a.mime || '') ? await urlFor(a) : ''; return `<button type="button" data-qr-file="${k}" class="${k === S.file ? 'on' : ''}" title="${esc(a.name || '')}">${u ? `<img src="${esc(u)}" alt="">` : '▶ video'}</button>`; }));
      body = `<div class="pane media"><div class="stage">${stageHtml}</div>${fl.length > 1 ? `<div class="thumbs">${thumbs.join('')}</div>` : ''}<div class="small">${f ? `${esc(f.name || '')}${f.width ? ` · ${f.width}×${f.height}` : ''}${f.bytes ? ` · ${(f.bytes / 1048576).toFixed(1)} MB` : ''}` : ''}</div></div>
        <div class="pane"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><h3>${esc(p.title)}</h3><span class="pill" style="color:${st[1]};background:${st[2]}">${st[0]}</span></div>
          <div class="small" style="margin-top:4px">${esc(p.sport || '')}${p.postType ? ' · ' + esc(String(p.postType).replace('_', ' ')) : ''} · planned ${esc(new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))}</div>
          <h4>The post, exactly as it goes out</h4>${postBlock(p)}
          ${step === 'changes' ? `<div class="msg" style="background:#fef2f2;color:#991b1b">Changes were requested: ${esc((p.approvalMeta || {}).notes || '')}. When the new version is attached it comes back to “To check and approve”.</div>` : ''}${step === 'files' || step === 'changes' ? (step === 'files' ? '<div class="msg">Attach the finished photo or video first (Create, or drop it in 24/7 Bots → Office). Then it comes back here.</div>' : '') : `<h4>Your checklist ${allCk ? '<span style="color:#047857">· all done</span>' : ''}</h4>
          ${CHECKS.map(([k, t, d]) => `<label class="ck ${ck[k] ? 'on' : ''}"><input type="checkbox" data-qr-check="${k}" ${ck[k] ? 'checked' : ''} ${step !== 'checks' && step !== 'manager' ? 'disabled' : ''}><span><strong>${esc(t)}</strong><br><span class="small">${esc(d)}</span></span></label>`).join('')}
          <label class="ck ${S.platformOk[p.id] ? 'on' : ''}"><input type="checkbox" data-qr-platform ${S.platformOk[p.id] ? 'checked' : ''} ${step !== 'checks' && step !== 'manager' ? 'disabled' : ''}><span><strong>Right platform, day and time</strong><br><span class="small">As shown above, per the Posting Rulebook</span></span></label>`}
          <h4>Team comments${cm.length ? ` · ${cm.length}` : ''}</h4>${cm.map(x => `<div class="cm"${x.change ? ' style="border-color:#fca5a5;background:#fff5f5"' : ''}><strong>${esc(who[x.by] || 'Teammate')}</strong> <span class="small">${esc(new Date(x.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${x.change ? ' · change requested' : ''}</span><div>${esc(x.text)}</div></div>`).join('') || '<div class="small">No comments yet.</div>'}
          ${S.msg ? `<div class="msg" role="status">${esc(S.msg)}</div>` : ''}</div>`;
      const decide = step === 'checks' || step === 'manager'
        ? `<button type="button" class="btn" data-qr-approve ${allCk && !S.busy ? '' : 'disabled'} title="${allCk ? '' : 'Tick every item in the checklist first'}">✓ Approve</button>`
        : step === 'anthony' ? (sig && sig.mine ? `<button type="button" class="btn" data-qr-sign ${S.busy ? 'disabled' : ''}>✓ Final approve as ${esc(sig.name)}</button>` : `<span class="small">${sig && sig.signed ? 'Signed by ' + esc(sig.name) : 'Waiting for ' + esc((sig && sig.approverId && sig.name) || 'Anthony') + ': he approves here from his own account.'}</span>`) : '';
      foot = `<textarea data-qr-note rows="2" placeholder="Comment or what needs to change (shared with the team)" aria-label="Comment" style="flex:1;min-width:220px">${esc(S.notes[id] || '')}</textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn ghost smallbtn" data-qr-comment>Add comment</button>${step !== 'files' && step !== 'changes' ? '<button type="button" class="btn ghost smallbtn" data-qr-changes style="color:#b91c1c">Request changes</button>' : ''}${decide}</div>`;
    }
    host.innerHTML = `<div class="qr" role="dialog" aria-modal="true" aria-label="Quick review"><div class="qr-top"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><strong style="font-size:16px">Quick review</strong><span class="small">${S.list.length ? `${S.i + 1} of ${S.list.length}` : ''}</span>
      <button type="button" class="btn ghost smallbtn" data-qr-prev ${S.i > 0 ? '' : 'disabled'} aria-label="Previous">←</button><button type="button" class="btn ghost smallbtn" data-qr-next ${S.i < S.list.length - 1 ? '' : 'disabled'} aria-label="Next">→</button></div>
      <div class="chips">${chip('todo', 'All waiting', c.todo)}${chip('mine', 'To check and approve', c.mine)}${chip('anthony', 'Anthony’s final', c.anthony)}${chip('changes', 'Changes requested', c.changes)}${chip('files', 'Needs files', c.files)}</div>
      <button type="button" class="btn ghost smallbtn" data-qr-close aria-label="Close">✕ Close</button></div>
      <div class="qr-body">${body}</div>${foot ? `<div class="qr-foot">${foot}</div>` : ''}</div>`;
    paintButton();
  }
  function paintButton() {
    const b = document.getElementById('rshQRBtn'); if (!b || !app()) return;
    const c = counts(); b.innerHTML = `✓ Review${c.todo ? `<span class="count">${c.todo}</span>` : ''}`;
  }
  function open(filter, id) {
    S.open = true; S.msg = ''; if (filter) S.filter = filter; build();
    if (id) { if (!S.list.includes(id)) { S.filter = 'todo'; build(); if (!S.list.includes(id)) { S.filter = 'files'; build(); } } const k = S.list.indexOf(id); if (k >= 0) S.i = k; }
    S.file = 0; document.getElementById('rshQR').style.display = 'flex'; paint();
    if (bots().loadAllComments) bots().loadAllComments().then(paint).catch(() => {});
  }
  function close() { S.open = false; document.getElementById('rshQR').style.display = 'none'; paintButton(); }
  const go = d => { S.i = Math.max(0, Math.min(S.list.length - 1, S.i + d)); S.file = 0; S.msg = ''; paint(); };
  async function act(fn) { if (S.busy) return; S.busy = true; try { await fn(); } catch (e) { S.msg = 'That did not go through: ' + ((e && e.message) || 'unknown problem') + '.'; } S.busy = false; paint(); }

  function start() {
    if (!app() || !app().review || document.getElementById('rshQR')) return;
    const host = document.createElement('div'); host.id = 'rshQR'; document.body.appendChild(host);
    const top = document.getElementById('openCommandPalette') || document.getElementById('topPitch');   // the Review button sits before Search in the header
    if (top) { const b = document.createElement('button'); b.type = 'button'; b.id = 'rshQRBtn'; b.className = 'btn smallbtn'; b.style.background = '#047857'; b.addEventListener('click', () => open('todo')); top.parentNode.insertBefore(b, top); }
    host.addEventListener('click', e => {
      const t = e.target;
      if (t === host || t.closest('[data-qr-close]')) return close();
      const f = t.closest('[data-qr-filter]'); if (f) { S.filter = f.dataset.qrFilter; S.i = 0; S.list = []; S.msg = ''; return paint(); }
      if (t.closest('[data-qr-prev]')) return go(-1);
      if (t.closest('[data-qr-next]')) return go(1);
      const th = t.closest('[data-qr-file]'); if (th) { S.file = Number(th.dataset.qrFile); return paint(); }
      const id = S.list[S.i]; if (!id) return;
      const note = (host.querySelector('[data-qr-note]') || {}).value || '';
      if (t.closest('[data-qr-comment]')) return act(async () => { if (!note.trim()) { S.msg = 'Write the comment first.'; return; } await bots().postComment(id, note.trim(), false); await bots().loadAllComments(); S.notes[id] = ''; S.msg = 'Comment added.'; });
      if (t.closest('[data-qr-changes]')) return act(async () => { if (!note.trim()) { S.msg = 'Write what needs to change in the box below, then press Request changes.'; return; } const r = app().review.changes(id, note.trim()); if (!r.ok) { S.msg = r.msg; return; } try { await bots().postComment(id, note.trim(), true); } catch (_) {} S.notes[id] = ''; S.msg = ''; build(); });
      if (t.closest('[data-qr-approve]')) return act(async () => { const r = app().review.approve(id, note.trim()); if (!r.ok) { S.msg = r.msg; return; } if (note.trim()) { try { await bots().postComment(id, note.trim(), false); } catch (_) {} S.notes[id] = ''; } const title = (posts().find(x => x.id === id) || {}).title; build(); S.msg = `Approved “${title}”. It now waits for Anthony’s final approval.`; });
      if (t.closest('[data-qr-sign]')) return act(async () => { await sign().sign(id); const i = await sign().info(id); S.msg = i.signed ? 'Final approval signed. Tempo schedules it on the next run.' : (i.note || 'The signature did not go through.'); build(); });
    });
    host.addEventListener('input', e => { if (e.target.matches && e.target.matches('[data-qr-note]')) { const id = S.list[S.i]; if (id) S.notes[id] = e.target.value; } });
    host.addEventListener('change', e => {
      const id = S.list[S.i]; if (!id) return;
      const k = e.target.dataset && e.target.dataset.qrCheck;
      if (k) { const ck = { ...app().review.checks(id), [k]: e.target.checked }; const r = app().review.saveChecks(id, ck); S.msg = r.ok ? '' : r.msg; return paint(); }
      if (e.target.matches('[data-qr-platform]')) { S.platformOk[id] = e.target.checked; return paint(); }
    });
    document.addEventListener('keydown', e => {
      if (!S.open) return; if (/^(TEXTAREA|INPUT|SELECT)$/.test((e.target && e.target.tagName) || '')) { if (e.key === 'Escape') e.target.blur(); return; }
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
    });
    const rv = document.getElementById('view-approvals');
    if (rv && !document.getElementById('rshQRBanner')) { const b = document.createElement('div'); b.id = 'rshQRBanner'; b.className = 'card'; b.style.cssText = 'margin-bottom:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border:1px solid #a7f3d0;background:#ecfdf5';
      b.innerHTML = '<div><strong>Review everything in one place</strong><div class="small" style="margin-top:2px">Quick review shows each campaign’s photo or video, the post as it goes out, one checklist and the approve button, one campaign after another.</div></div><button type="button" class="btn" style="background:#047857">✓ Open Quick review</button>';
      b.querySelector('button').addEventListener('click', () => open('todo')); rv.insertBefore(b, rv.firstChild); }
    paintButton(); setInterval(() => { if (!S.open) paintButton(); }, 5000);
  }
  window.RSH_REVIEW = { start, open, close, stepOf, counts };
  const boot = () => { if (window.RSH_APP && window.RSH_APP.review) start(); else setTimeout(boot, 400); };
  boot();
})();
