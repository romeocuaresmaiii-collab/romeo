/* System check: one screen that says whether every part the app depends on is working, and what to do when it is
 * not. Opened from the header's ⋯ menu ("System check"). Reads only; changes nothing. */
(function () {
  const app = () => window.RSH_APP, bots = () => window.RSH_BOTS, esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = document.createElement('style');
  css.textContent = `#rshHealth{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9998;display:none;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
  #rshHealth .box{background:var(--card,#fff);border-radius:18px;max-width:760px;width:100%;padding:22px 24px;box-shadow:0 24px 70px rgba(0,0,0,.3)}
  #rshHealth .row{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:12px 0;border-top:1px solid #e5e7eb}
  #rshHealth .ic{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff}
  #rshHealth .ok .ic{background:#16a34a}#rshHealth .warn .ic{background:#d97706}#rshHealth .bad .ic{background:#dc2626}
  #rshHealth .nm{font-weight:700}#rshHealth .dt{color:#475569;font-size:13px;margin-top:2px}#rshHealth .fx{font-size:13px;margin-top:4px;color:#0f172a}
  #rshHealth .sum{display:flex;gap:8px;margin:10px 0 6px;flex-wrap:wrap}#rshHealth .sum span{padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9}`;
  document.head.appendChild(css);
  const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - Date.parse(t)) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  const list = (a, n = 3) => a.slice(0, n).map(x => '“' + x + '”').join(', ') + (a.length > n ? ` and ${a.length - n} more` : '');

  async function checks() {
    const out = [], H = bots() && bots().health ? bots().health() : null;
    let db = null; try { db = window.claude ? await Promise.race([window.claude.use('db'), new Promise(r => setTimeout(() => r(null), 4000))]) : null; } catch (_) {}
    out.push(db ? ['ok', 'Saving', 'Campaigns, files, scripts and approvals save to the app’s shared storage.', ''] : ['bad', 'Saving', 'This view cannot reach the app’s storage, so changes here are not shared.', 'Open the app from your Claude artifacts while signed in.']);
    const L = window.RSH_LIVE, f = L && L.fetchedAt && L.fetchedAt();
    out.push(!f ? ['bad', 'Metricool results', 'No results have been loaded from Metricool yet.', 'On Home, press “Refresh from Metricool”, and allow the Metricool connector if asked.']
      : (Date.now() - Date.parse(f)) > 36 * 3600e3 ? ['warn', 'Metricool results', `Last loaded ${ago(f)}.`, 'On Home, press “Refresh from Metricool”.'] : ['ok', 'Metricool results', `Last loaded ${ago(f)}.`, '']);
    const sch = L && L.scheduled && L.scheduled();
    if (!sch) out.push(['warn', 'Next 14 days in Metricool', 'The Metricool schedule has not been loaded yet.', 'On Home, press “Refresh from Metricool”.']);
    else {
      const d0 = new Date(), key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const have = new Set(sch.filter(p => !p[4] && p[1] && p[1] !== 'pinterest').map(p => String(p[0]).slice(0, 10)));
      const gaps = []; for (let i = 0; i < 14; i++) { const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i); if (!have.has(key(d))) gaps.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })); }
      const loaded = L.fetchedAt && L.fetchedAt();
      out.push(!gaps.length ? ['ok', 'Next 14 days in Metricool', 'Every day of the next 14 has at least one scheduled post besides Pinterest.', '']
        : [gaps.length > 7 ? 'bad' : 'warn', 'Next 14 days in Metricool', `${14 - gaps.length} of the next 14 days have a scheduled post besides Pinterest (schedule loaded ${ago(loaded)}). Empty: ${gaps.slice(0, 6).join(', ')}${gaps.length > 6 ? ` and ${gaps.length - 6} more` : ''}.`, 'Plan campaigns for the empty days, get them approved, and send them to Metricool. Refresh from Metricool afterwards.']);
    }
    let drill = null; try { if (db) { const sn = await Promise.race([db.doc('health/restoreDrill').get(), new Promise(r => setTimeout(() => r(null), 4000))]); drill = sn && sn.exists ? sn.data() : null; } } catch (_) {}
    out.push(!drill ? ['warn', 'Backup restore drill', 'No restore drill is on record.', 'Ask Claude to run the restore drill (it restores the live workspace into an empty copy and compares every campaign).']
      : (Date.now() - Date.parse(drill.at)) > 35 * 864e5 ? ['warn', 'Backup restore drill', `Last passed ${ago(drill.at)} (${drill.campaigns} campaigns). Run one a month.`, 'Ask Claude to run the restore drill again.']
      : drill.ok ? ['ok', 'Backup restore drill', `Passed ${ago(drill.at)}: all ${drill.campaigns} campaigns came back unchanged from a downloaded backup.`, ''] : ['bad', 'Backup restore drill', `Failed ${ago(drill.at)}: ${drill.note || 'the restored copy did not match'}.`, 'Tell Claude in the chat.']);
    const rv = L && L.rivals && L.rivals();
    out.push(rv && rv.length ? ['ok', 'Competitors', `${rv.length} competitor account${rv.length === 1 ? '' : 's'} tracked from Metricool (Insights → live results).`, '']
      : ['warn', 'Competitors', 'No competitors are set up in Metricool, so the app cannot compare RSH with rivals.', 'In Metricool, open Competitors and add 5–8 similar-sized team-apparel accounts on Instagram and Facebook. The next “Refresh from Metricool” brings them in.']);
    if (!H) { out.push(['bad', '24/7 Bots', 'The bots did not load in this view.', 'Reload the page.']); return out; }
    out.push(!H.planAt ? ['warn', 'Bots’ plan', 'The bots have not prepared a plan yet.', 'Open 24/7 Bots and press “Run everything”.'] : (Date.now() - Date.parse(H.planAt)) > 26 * 3600e3 ? ['warn', 'Bots’ plan', `Last prepared ${ago(H.planAt)}.`, 'Open 24/7 Bots and press “Run everything” (or keep the app open on one computer with 24/7 on).'] : ['ok', 'Bots’ plan', `Prepared ${ago(H.planAt)}.`, '']);
    const w = H.week; out.push(!w.total ? ['warn', 'Next 7 days', 'No posts are planned for the next 7 days.', 'Create campaigns for the coming week.'] : w.sent < w.total ? ['warn', 'Next 7 days', `${w.total} channel posts planned: ${w.ready} ready, ${w.sent} already in Metricool.`, 'Open the Checklist to see what each held-back post still needs.'] : ['ok', 'Next 7 days', `All ${w.total} planned channel posts are in Metricool.`, '']);
    out.push(H.needMedia.length ? ['warn', 'Media for the next 7 days', `${H.needMedia.length} campaign${H.needMedia.length === 1 ? ' has' : 's have'} no photo or video yet: ${list(H.needMedia)}.`, 'Attach the files, or add them to the campaign’s 📁 Assets so the editor can make them.'] : ['ok', 'Media for the next 7 days', 'Every campaign in the next 7 days has its media.', '']);
    const errs = Object.entries(H.link.errors);
    out.push(H.link.route ? ['ok', 'Link to the video editor', `Working from this device (${H.link.route === 'fire_trigger' ? 'instant check' : 'message'}, ${ago(H.link.at)}).`, '']
      : errs.length ? ['warn', 'Link to the video editor', `The direct link failed from this device (${errs.map(([k, v]) => k + ': ' + v).join('; ')}). Jobs still reach the editor with its hourly check.`, 'Allow the “Claude Code Remote” connector for this app when asked. If it keeps failing, send this line to Claude.']
      : ['ok', 'Link to the video editor', 'Not needed yet on this device. Jobs also reach the editor with its hourly check.', '']);
    out.push(!H.queued ? ['ok', 'Video edit queue', 'No edit job is waiting.', ''] : H.waitingVO.length ? ['warn', 'Video edit queue', `${H.queued} job${H.queued === 1 ? '' : 's'} waiting; ${list(H.waitingVO)} still need${H.waitingVO.length === 1 ? 's' : ''} its voiceover.`, 'Record Part 2/5 of Sage’s pack in ElevenLabs and add the audio to the campaign’s 📁 Assets.'] : H.oldestMin > 90 ? ['warn', 'Video edit queue', `${H.queued} job${H.queued === 1 ? '' : 's'} waiting, the oldest for ${Math.round(H.oldestMin / 60)} h.`, 'The editor checks every hour; if it is longer than that, tell Claude in the chat.'] : ['ok', 'Video edit queue', `${H.queued} job${H.queued === 1 ? '' : 's'} with the editor.`, '']);
    out.push(H.factsProblem.length ? ['bad', 'Fact checks', `A fact needs fixing or could not be confirmed in ${list(H.factsProblem)}.`, 'Open the campaign: the Checklist shows what to change. It is checked again after the change.'] : H.factsPending ? ['warn', 'Fact checks', `${H.factsPending} campaign${H.factsPending === 1 ? ' is' : 's are'} being researched.`, 'Nothing to do: the editor researches within the hour.'] : ['ok', 'Fact checks', 'Every planned campaign has its facts checked.', '']);
    out.push(H.noPack.length ? ['warn', 'Scripts (Sage)', `${H.noPack.length} campaign${H.noPack.length === 1 ? ' has' : 's have'} no production pack yet: ${list(H.noPack)}.`, 'Keep the app open a moment: Sage writes three per run. Allow “Asking Claude” for this app if asked.'] : ['ok', 'Scripts (Sage)', 'Every planned campaign has its production pack.', '']);
    out.push(H.kit ? ['ok', 'Did You Know kit', 'Loaded: every DYK pack follows it.', ''] : ['warn', 'Did You Know kit', 'Not loaded in this view yet (it loads when Sage writes a DYK pack).', '']);
    const S = window.RSH_SIGNOFF; let ed = []; try { ed = S && S.edits ? (await S.edits()).filter(e => Date.now() - Date.parse(e.at) < 14 * 864e5) : []; } catch (_) {}
    const mc = ed.filter(e => (e.inMetricool || []).length);
    out.push(!ed.length ? ['ok', 'Edits after approval', 'No signed campaign was changed after its approval in the last 14 days.', ''] : [mc.length ? 'bad' : 'warn', 'Edits after approval', `${ed.length} signed campaign${ed.length === 1 ? ' was' : 's were'} changed after approval and sent back for review: ${list(ed.map(e => e.title + ' (' + (e.changed || []).join(', ') + ')'))}.`, mc.length ? `The old version of ${list(mc.map(e => e.title))} is still scheduled in Metricool: update or remove it there, then review and sign the new version.` : 'Review and sign the new version (✓ Review at the top).']);
    const R = window.RSH_REVIEW && window.RSH_REVIEW.counts ? window.RSH_REVIEW.counts() : null;
    if (R) out.push(R.todo ? ['warn', 'Reviews', `${R.mine} to check and approve, ${R.anthony} waiting for Anthony’s final approval.`, 'Press ✓ Review at the top to go through them one by one.'] : ['ok', 'Reviews', 'Nothing is waiting for review.', '']);
    return out;
  }
  async function open() {
    let host = document.getElementById('rshHealth');
    if (!host) { host = document.createElement('div'); host.id = 'rshHealth'; document.body.appendChild(host); host.addEventListener('click', e => { if (e.target === host || e.target.closest('[data-h-close]')) host.style.display = 'none'; if (e.target.closest('[data-h-again]')) open(); }); }
    host.style.display = 'flex'; host.innerHTML = '<div class="box"><h2>System check</h2><p class="small">Checking…</p></div>';
    const rows = await checks(), n = k => rows.filter(r => r[0] === k).length;
    host.innerHTML = `<div class="box" role="dialog" aria-label="System check"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2 style="margin:0">System check</h2><p class="small" style="margin:4px 0 0">Everything the app depends on, checked now. Nothing here changes anything.</p></div><div style="display:flex;gap:6px"><button type="button" class="btn ghost smallbtn" data-h-again>↻ Check again</button><button type="button" class="btn ghost smallbtn" data-h-close>✕ Close</button></div></div>
      <div class="sum"><span style="color:#16a34a">✓ ${n('ok')} working</span><span style="color:#d97706">⚠ ${n('warn')} need attention</span><span style="color:#dc2626">✕ ${n('bad')} not working</span></div>
      ${rows.map(([st, nm, dt, fx]) => `<div class="row ${st}" data-h-row="${esc(nm)}"><div class="ic">${st === 'ok' ? '✓' : st === 'warn' ? '!' : '✕'}</div><div><div class="nm">${esc(nm)}</div><div class="dt">${esc(dt)}</div>${fx ? `<div class="fx"><strong>What to do:</strong> ${esc(fx)}</div>` : ''}</div></div>`).join('')}</div>`;
  }
  // The header's status button opens the System check (the old status popup only showed a version and an error count).
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#rshHealthButton'); if (!b) return; e.preventDefault(); e.stopImmediatePropagation(); const m = b.closest('details'); if (m) m.open = false; open(); }, true);
  window.RSH_HEALTH = { open, checks };
})();
