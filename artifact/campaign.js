/* One campaign, one page. Everything a campaign needs, in the order it is done, with the action next to each step:
 *   1 Brief · 2 Facts · 3 Script (Sage's pack) · 4 Files (attached files + the asset box) · 5 Video editor
 *   6 Checks & approval · 7 Posts per platform · 8 Comments
 * Opened from the Checklist (click a campaign's title), Reviews, the Calendar and Home, or RSH_CAMPAIGN.open(id).
 * It reuses the app's own actions (no second copy of any rule). */
(function () {
  'use strict';
  const app = () => window.RSH_APP, B = () => window.RSH_BOTS || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = t => t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const dayTxt = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'no date';
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB';
  let openId = null, msg = '', packOpen = false; const names = {};

  const css = document.createElement('style');
  css.textContent = `#rshCamp{position:fixed;inset:0;z-index:9990;background:rgba(15,23,42,.45);display:none;justify-content:center;align-items:flex-start;overflow:auto;padding:24px 12px}
  #rshCamp .sheet{background:var(--card,#fff);color:var(--ink,#1d1d1f);width:min(980px,100%);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:22px 24px 28px}
  #rshCamp h2{font-size:22px;margin:4px 0 2px}#rshCamp .eyebrow{font-size:11px;letter-spacing:.08em;color:#64748b;font-weight:800}
  #rshCamp .strip{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 6px}#rshCamp .strip span{font-size:11.5px;font-weight:700;border-radius:999px;padding:4px 10px;background:#f1f5f9;color:#475569}
  #rshCamp .strip span.ok{background:#dcfce7;color:#166534}#rshCamp .strip span.now{background:#fef3c7;color:#92400e}#rshCamp .strip span.bad{background:#fee2e2;color:#991b1b}
  #rshCamp .next{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:10px 14px;margin-top:8px}
  #rshCamp section{border-top:1px solid #eef2f7;margin-top:16px;padding-top:14px}#rshCamp section>header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  #rshCamp section h3{font-size:15px;margin:0}#rshCamp .n{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#0f172a;color:#fff;font-size:12px;margin-right:8px}
  #rshCamp .pill{font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 9px;background:#f1f5f9;color:#475569}#rshCamp .pill.ok{background:#dcfce7;color:#166534}#rshCamp .pill.now{background:#fef3c7;color:#92400e}#rshCamp .pill.bad{background:#fee2e2;color:#991b1b}
  #rshCamp .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:8px}#rshCamp .fld{border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px}#rshCamp .fld b{display:block;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
  #rshCamp .fld div,#rshCamp .fld summary{white-space:pre-wrap;font-size:13px}#rshCamp .fld summary{cursor:pointer;list-style:none}#rshCamp .fld summary::-webkit-details-marker{display:none}#rshCamp .fld details[open] summary{display:none}#rshCamp .grid2{align-items:start}#rshCamp .files{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:8px}
  #rshCamp .file{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:11.5px}#rshCamp .file img,#rshCamp .file video{width:100%;height:170px;object-fit:cover;background:#0b0d12;display:block}#rshCamp .file div{padding:6px 8px;word-break:break-word}
  #rshCamp table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}#rshCamp td,#rshCamp th{padding:6px 8px;border-bottom:1px solid #eef2f7;text-align:left}#rshCamp th{font-size:11px;color:#64748b;text-transform:uppercase}
  #rshCamp textarea{width:100%;box-sizing:border-box;font:12.5px/1.45 system-ui;border:1px solid #d2d2d7;border-radius:10px;padding:8px}#rshCamp .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
  #rshCamp .cmt{border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin-top:6px;font-size:13px}#rshCamp .cmt.change{border-left:4px solid #d9480f}#rshCamp .msg{font-size:12.5px;color:#0f5132;margin-top:8px;min-height:1em}
  #rshCamp .part{border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin-top:6px}#rshCamp .part pre{white-space:pre-wrap;font:12px/1.45 ui-monospace,Menlo,monospace;max-height:220px;overflow:auto;margin:6px 0 0}
  [data-track-row] .title{cursor:pointer}[data-track-row] .title:hover{text-decoration:underline}
  .rsh-camp-link{cursor:pointer;text-decoration:underline;text-decoration-color:rgba(100,116,139,.35);text-underline-offset:3px}`;
  document.head.appendChild(css);

  const post = id => ((app() && app().data().posts) || []).find(p => p.id === id);
  const files = p => [p.creativeAsset].concat(p.creativeAssets || []).filter(Boolean).filter((a, i, all) => all.findIndex(x => x.id === a.id) === i);
  const src = a => (window.RSH_HOST && window.RSH_HOST.mediaUrl ? window.RSH_HOST.mediaUrl(a) : '/_blob/' + a.id);
  const PARTS = [[1, 'Key facts'], [2, 'Image prompts'], [3, 'Motion prompts'], [4, 'Editor prompt'], [5, 'Voiceover'], [6, 'Caption'], [7, 'Checks']];

  function pill(s, t) { return `<span class="pill ${s}">${esc(t)}</span>`; }
  function render() {
    const host = document.getElementById('rshCamp'), p = openId && post(openId); if (!host || !p) return;
    const b = B(), t = app().track(p), fs = b.factState ? b.factState(p.id) : null, sage = b.sageState ? b.sageState(p.id) : '', pack = b.scripts ? (b.scripts()[p.id] || null) : null;
    const job = b.jobFor ? b.jobFor(p.id) : null, box = b.rawFor ? (b.rawFor(p.id) || { files: [] }) : { files: [] }, items = b.planItems ? b.planItems(p.id) : [], cmts = b.commentsFor ? b.commentsFor(p.id) : [];
    const att = files(p), vo = b.voState ? b.voState(p.id) : '', m = p.approvalMeta || {};
    const D = window.RSH_TRACKER && window.RSH_TRACKER.describe ? window.RSH_TRACKER.describe(p) : { next: t.advice, button: 'Open' };
    const st = {
      brief: t.brief ? 'ok' : 'now', facts: !fs ? '' : fs.ok ? 'ok' : /corrected|failed/.test(fs.s) ? 'bad' : 'now', script: sage === 'done' ? 'ok' : 'now',
      files: att.length ? (t.media ? 'ok' : 'bad') : (box.files || []).length ? 'now' : 'now',
      editor: !job ? '' : job.status === 'attached' || job.status === 'done' ? 'ok' : job.status === 'failed' ? 'bad' : 'now',
      checks: t.qa ? 'ok' : att.length ? 'now' : '', approval: t.stage === 'ready' ? 'ok' : m.pmReviewedAt ? 'now' : '',
      posts: items.length && items.every(i => i.sent && /scheduled|draft|posted/.test(i.sent.status)) ? 'ok' : items.some(i => i.sent) ? 'now' : ''
    };
    const strip = [['brief', 'Brief'], ['facts', 'Facts'], ['script', 'Script'], ['files', 'Files'], ['editor', 'Editor'], ['checks', 'Checks'], ['approval', 'Approved'], ['posts', 'Scheduled']].map(([k, l]) => `<span class="${st[k]}">${st[k] === 'ok' ? '✓ ' : ''}${l}</span>`).join('');
    const F = (l, v) => { v = String(v || '').trim(); const long = v.length > 260; return `<div class="fld"><b>${esc(l)}</b>${!v ? '<div><span class="small">not written</span></div>' : long ? `<details><summary><span>${esc(v.slice(0, 220).replace(/\s+\S*$/, ''))}… </span><span class="small" style="color:#2563eb;font-weight:700">Show all</span></summary><div>${esc(v)}</div></details>` : `<div>${esc(v)}</div>`}</div>`; };
    const jobTxt = !job ? (att.length ? 'No edit job: the files were attached directly.' : (box.files || []).length ? 'Files are in the asset box. Send them to the editor.' : 'Add footage, photos or a voiceover to the asset box; the editor starts as soon as they are sent.')
      : job.status === 'queued' ? `Waiting for the editor (sent ${when(job.queuedAt)}).` : job.status === 'sent' ? `With the editor since ${when(job.sentAt || job.queuedAt)}.` : job.status === 'failed' ? `Stopped: ${job.reason || 'no reason given'}` : `Delivered ${when(job.readyAt || job.finishedAt)}${job.revision > 1 ? ` · revision ${job.revision}` : ''}.${job.note ? ' ' + job.note : ''}`;
    host.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Campaign ${esc(p.title)}">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div class="eyebrow">CAMPAIGN</div><h2>${esc(p.title)}</h2>
        <div class="small">${esc(p.platform || '')} ${esc(p.postType || '')} · ${esc(dayTxt(p.date))} · ${esc(p.sport || '')} · ${esc(p.status || 'Draft')}</div></div>
        <button type="button" class="btn ghost smallbtn" data-c-close aria-label="Close">Close ✕</button></div>
      <div class="strip">${strip}</div>
      <div class="next"><span><strong>Next:</strong> ${esc(D.next || t.advice || '')}</span><button type="button" class="btn smallbtn" data-c-next>${esc(D.button || 'Open')} →</button></div>
      <div class="msg" role="status">${esc(msg)}</div>

      <section><header><h3><span class="n">1</span>Brief</h3><span>${pill(st.brief, t.brief ? 'Done' : 'To finish')} <button type="button" class="btn ghost smallbtn" data-c-edit>Edit brief</button></span></header>
        <div class="grid2">${F('Hook', p.hook)}${F('On-image text', p.onImageText)}${F('Caption', p.captionBody || p.caption)}${F('Video / visual brief', p.video || p.visualConcept)}${F('Hashtags', p.hashtags)}${F('Source', p.source)}</div></section>

      <section><header><h3><span class="n">2</span>Facts</h3>${fs ? pill(st.facts, fs.label) : ''}</header>
        ${(() => { const f = b.factDocs ? b.factDocs()[p.id] : null; return f && (f.claims || []).length ? `<table><tbody>${f.claims.map(c => `<tr><td>${esc(c.text)}</td><td class="small">${c.rule ? esc(c.rule) + ' · ' : ''}${/^https:/.test(c.url || '') ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">source</a>` : esc(c.source || '')}</td></tr>`).join('')}</tbody></table>${f.summary ? `<p class="small">${esc(f.summary)}</p>` : ''}` : `<p class="small">${f && f.status === 'no-claims' ? 'No factual claims: a question, opinion or motivational line.' : 'The fact check appears here when it is done.'}</p>`; })()}</section>

      <section><header><h3><span class="n">3</span>Script · Sage’s production pack</h3>${pill(st.script, sage === 'done' ? 'Written' + (pack && pack.edited ? ' · edited by the team' : '') : sage === 'writing' ? 'Sage is writing it' : fs && !fs.ok ? 'After the facts pass' : 'Sage writes it on the next run')}</header>
        ${pack ? `${PARTS.map(([n, l]) => { const x = b.packPart ? b.packPart(pack.text, n) : ''; return x ? `<details class="part"><summary><strong>Part ${n} · ${esc(l)}</strong> <button type="button" class="btn ghost smallbtn" data-c-copy="${n}" style="margin-left:8px">Copy</button></summary><pre>${esc(x)}</pre></details>` : ''; }).join('')}
          <details class="part" ${packOpen ? 'open' : ''} data-c-packwrap><summary><strong>Edit the whole pack</strong></summary><textarea rows="14" data-c-pack>${esc(pack.text)}</textarea><div class="acts"><button type="button" class="btn smallbtn" data-c-packsave>Save pack</button></div></details>` : '<p class="small">No pack yet.</p>'}
        ${vo === 'missing' ? '<p class="small"><strong>🎙 Voiceover needed:</strong> record Part 5 in ElevenLabs and add the audio file to the asset box below.</p>' : ''}</section>

      <section><header><h3><span class="n">4</span>Files</h3>${pill(st.files, att.length ? `${att.length} attached${t.media ? '' : ' · wrong format'}` : 'Nothing attached yet')}</header>
        ${att.length ? `<div class="files">${att.map(a => `<div class="file">${/^video\//.test(a.mime || '') ? `<video src="${esc(src(a))}" controls preload="metadata" playsinline></video>` : `<img src="${esc(src(a))}" alt="${esc(a.name || 'file')}" loading="lazy">`}<div><strong>${esc(a.name || 'file')}</strong><br>${a.width ? `${a.width}×${a.height} · ` : ''}${kb(a.bytes)}</div></div>`).join('')}</div>` : ''}
        <p class="small" style="margin-top:8px"><strong>Asset box</strong> (raw footage, photos, voiceover and script for the editor): ${(box.files || []).length} file${(box.files || []).length === 1 ? '' : 's'}${(box.files || []).length ? ': ' + esc(box.files.slice(0, 6).map(f => f.name).join(', ')) + (box.files.length > 6 ? '…' : '') : ''}.</p>
        <div class="acts"><button type="button" class="btn ghost smallbtn" data-c-raw>📁 Open the asset box (add or remove files)</button><button type="button" class="btn ghost smallbtn" data-c-attach>Attach a finished file</button></div></section>

      <section><header><h3><span class="n">5</span>Video editor</h3>${st.editor ? pill(st.editor, job.status === 'failed' ? 'Waiting for files' : job.status === 'sent' ? 'Editing now' : job.status === 'queued' ? 'Queued' : 'Delivered') : ''}</header>
        <p class="small">${esc(jobTxt)}</p>
        <div class="acts">${(box.files || []).length && !(job && /queued|sent/.test(job.status)) ? `<button type="button" class="btn smallbtn" data-c-send>${job && /attached|done/.test(job.status) ? 'Send again for a new edit' : 'Send the asset box to the editor'}</button>` : ''}${job && /attached|done/.test(job.status) && att.length ? '<button type="button" class="btn ghost smallbtn" data-c-watch>Watch the delivered file</button>' : ''}</div>
        ${/reel|video|short|story/i.test(String(p.postType || '')) ? `<label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" data-c-trend ${p.trendingSound ? 'checked' : ''}> Add a trending sound by hand when posting on Instagram/TikTok (the editor also delivers a copy with no music)</label>` : ''}
        <p class="small" style="margin-top:4px">Music and sound effects come from the 🎵 Sounds library at the top of the app${window.RSH_SOUNDS && !window.RSH_SOUNDS.list().some(t => t.kind === 'music') ? ' — <strong>it is empty: add tracks before sending jobs</strong>' : ''}.</p></section>

      <section><header><h3><span class="n">6</span>Checks & approval</h3>${pill(st.approval || st.checks, t.stage === 'ready' ? 'Approved by Anthony' : m.pmReviewedAt ? 'Manager approved · waiting for Anthony' : t.qa ? 'Checks done · ready for manager' : att.length ? 'Visual checks to do' : 'After the files')}</header>
        <p class="small">${m.pmReviewedAt ? `Manager review ${when(m.pmReviewedAt)}${m.reviewer ? ' by ' + esc(m.reviewer) : ''}. ` : ''}${m.anthonyConfirmedAt ? `Anthony approved ${when(m.anthonyConfirmedAt)}. ` : ''}${m.notes ? 'Notes: ' + esc(m.notes) : ''}</p>
        <div class="acts"><button type="button" class="btn ghost smallbtn" data-c-review>✓ Open in Review</button></div></section>

      <section><header><h3><span class="n">7</span>Posts</h3>${st.posts ? pill(st.posts, st.posts === 'ok' ? 'All scheduled' : 'Partly scheduled') : pill('', 'Not scheduled yet')}</header>
        ${items.length ? `<table><thead><tr><th>Platform</th><th>Day & time (ET)</th><th>Status</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc((b.NAME || {})[i.channel] || i.channel)}</td><td>${esc(dayTxt(i.date))}${i.time ? ' · ' + esc(i.time) : ''}</td><td>${!i.sent ? (i.ready ? 'Ready to send' : 'Waiting for approval') : i.sent.status === 'posted' ? 'Posted' + (i.sent.url ? ` · <a href="${esc(i.sent.url)}" target="_blank" rel="noopener noreferrer">view</a>` : '') : i.sent.via === 'direct' ? 'Will post directly' : i.sent.status === 'scheduled' ? 'Scheduled in Metricool' : i.sent.status === 'draft' ? 'Draft in Metricool' : i.sent.status === 'queued' ? 'Waiting to be sent' : 'Not accepted: ' + esc(i.sent.reason || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="small">The bots place this campaign on its platform slot once the plan runs.</p>'}
        <div class="acts"><button type="button" class="btn ghost smallbtn" data-c-cal>📅 Open the Calendar</button></div></section>

      <section><header><h3><span class="n">8</span>Comments</h3>${pill('', cmts.length + ' comment' + (cmts.length === 1 ? '' : 's'))}</header>
        ${cmts.map(c => `<div class="cmt ${c.change ? 'change' : ''}"><div class="small">${esc(names[c.by] || 'Teammate')} · ${esc(when(c.at))}${c.change ? ' · <strong>changes needed</strong>' : ''}</div>${esc(c.text)}</div>`).join('') || '<p class="small">No comments yet.</p>'}
        <textarea rows="3" data-c-text placeholder="Feedback for the team or the editor…" aria-label="Comment" style="margin-top:8px"></textarea>
        <div class="acts"><button type="button" class="btn smallbtn" data-c-post>Post comment</button><label class="small" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-c-change> Changes needed: send the video or image back to the editor</label></div></section>
    </div>`;
  }

  async function open(id) {
    if (!post(id)) return false; openId = id; msg = ''; packOpen = false;
    let host = document.getElementById('rshCamp');
    if (!host) {
      host = document.createElement('div'); host.id = 'rshCamp'; document.body.appendChild(host);
      host.addEventListener('click', onClick);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && host.style.display === 'flex' && !document.getElementById('rshRaw')?.offsetParent) close(); });
    }
    host.style.display = 'flex'; render();
    const b = B(); try { await Promise.all([b.loadRaw ? b.loadRaw(id) : null, b.loadAllComments ? b.loadAllComments() : null, b.refreshFacts ? b.refreshFacts() : null]); } catch (_) {}
    try { const ids = (b.commentsFor ? b.commentsFor(id) : []).map(c => c.by).filter(Boolean); if (ids.length && b.whoIs) Object.assign(names, await b.whoIs(ids)); } catch (_) {}
    render(); return true;
  }
  function close() { const h = document.getElementById('rshCamp'); if (h) h.style.display = 'none'; openId = null; }
  async function onClick(e) {
    const p = openId && post(openId), b = B(); if (!p) return;
    if (e.target.id === 'rshCamp' || e.target.closest('[data-c-close]')) return close();
    if (e.target.closest('[data-c-next]')) { const id = openId; close(); return app().openNext(id); }
    if (e.target.closest('[data-c-edit]')) { const id = openId; close(); if (window.RSH_TRACKER && window.RSH_TRACKER.openDetail) return window.RSH_TRACKER.openDetail(id, true); return app().openNext(id); }
    if (e.target.closest('[data-c-raw]')) { if (b.openRaw) { await b.openRaw(openId); const h = document.getElementById('rshRaw'); if (h) { const iv = setInterval(() => { if (h.style.display === 'none') { clearInterval(iv); if (openId) { b.loadRaw && b.loadRaw(openId).then(render); } } }, 400); } } return; }
    if (e.target.closest('[data-c-attach]')) { const id = openId; close(); return app().openNext(id); }
    if (e.target.closest('[data-c-review]')) { const id = openId; close(); if (window.RSH_REVIEW && window.RSH_REVIEW.open) return window.RSH_REVIEW.open('all', id); return app().openReview(id); }
    if (e.target.closest('[data-c-watch]')) { const id = openId, j = b.jobFor && b.jobFor(id); close(); return b.watch ? b.watch(id) : app().openReview(id, j && j.assetId); }
    if (e.target.closest('[data-c-cal]')) { close(); return app().navigate('calendar'); }
    if (e.target.matches && e.target.matches('[data-c-trend]')) { const q = (window.RSH_APP.data().posts || []).find(x => x.id === openId); if (q) { q.trendingSound = !!e.target.checked; window.RSH_APP.save(); msg = q.trendingSound ? 'Marked: add a trending sound by hand when posting. The editor will also deliver a no-music copy.' : 'Trending-sound note removed.'; } return render(); }
    if (e.target.closest('[data-c-send]')) { try { await b.sendRaw(openId); msg = 'Sent to the editor. The finished file comes back to this campaign.'; } catch (err) { msg = (err && err.message) || String(err); } return render(); }
    const cp = e.target.closest('[data-c-copy]'); if (cp) { e.preventDefault(); const pk = b.scripts()[openId]; const x = b.packPart(pk.text, Number(cp.dataset.cCopy)); try { await navigator.clipboard.writeText(x); cp.textContent = 'Copied'; } catch (_) { cp.textContent = 'Copy failed'; } return; }
    if (e.target.closest('[data-c-packsave]')) { const ta = document.querySelector('#rshCamp [data-c-pack]'); try { await b.saveScript(openId, ta.value); msg = 'Pack saved. Your edits are kept and sent with the next edit job.'; packOpen = true; } catch (err) { msg = 'Could not save: ' + err.message; } return render(); }
    if (e.target.closest('[data-c-post]')) {
      const ta = document.querySelector('#rshCamp [data-c-text]'), ch = document.querySelector('#rshCamp [data-c-change]');
      try { await b.postComment(openId, ta && ta.value, ch && ch.checked); msg = ch && ch.checked ? 'Comment saved and sent to the editor as a revision.' : 'Comment saved.'; } catch (err) { msg = (err && err.message) || String(err); }
      return render();
    }
  }
  // Every campaign title in the Checklist, Reviews, Calendar and Home opens this page (Ctrl/Cmd-click keeps the old behaviour).
  document.addEventListener('click', e => {
    if (e.ctrlKey || e.metaKey) return;
    const el = e.target.closest('[data-campaign-open]'); if (el) { e.preventDefault(); e.stopPropagation(); open(el.dataset.campaignOpen); return; }
    const row = e.target.closest('[data-track-row] .title'); if (row) { e.preventDefault(); e.stopPropagation(); open(row.closest('[data-track-row]').dataset.trackRow); }
  }, true);
  window.RSH_CAMPAIGN = { open, close, render, isOpen: () => !!openId };
})();
