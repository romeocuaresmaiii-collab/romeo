/* RSH Sports Marketing OS — updated scorecard and path to 10/10 (artifact edition only).
 *
 * Replaces the 18 November self-assessment on the Market Audit screen with the current one.
 * Scores are the team's own judgement on a 1–10 scale, not an external rating. "What 10/10 takes"
 * comes from a benchmark of leading social media tools checked on 23 November 2026; ratings updated 26 November 2026.
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // [capability, score on Nov 18, score now, what changed (or why not), what 10/10 takes, next step]
  const ROWS = [
    ['Sports-specific strategy', 7, 8, 'Nov 26: a researched Season Playbook (2026–27 rule changes, state and NCAA dates, what competitors post and miss), with ready ideas that become draft campaigns citing their sources.',
      'Every post tagged with sport, season phase and audience; results reported by those tags; order deadlines on the calendar six weeks ahead.',
      'Report results by sport and season phase, and keep the Playbook updated each month.'],
    ['Calendar + planning', 6, 7, 'The app reads what is really scheduled in Metricool, and Tempo places approved posts on calendar days at the times your own results favour.',
      'One calendar that always matches Metricool, with at least 14 days scheduled at all times.',
      'Warn on the Calendar when fewer than 14 days are scheduled.'],
    ['Approvals + assignments', 5, 8, 'Anthony’s final approval is now signed from his own sign-in. Everyone on the team can add files and comments to a campaign, and a “changes needed” comment starts a revised video automatically.',
      'Nothing publishes without an approver and time recorded by that person; edits after approval are logged.',
      'Log every edit made after approval and send the campaign back for review.'],
    ['Reporting + analytics', 5, 7, 'Live per-post results, followers and a plain-language brief replace the dated snapshot.',
      'A monthly report produced in under five minutes with no manual copying, every number traceable to Metricool or the store.',
      'Add a one-page monthly report.'],
    ['Competitor intelligence', 3, 4, 'Competitor posting gaps were researched on Nov 26 and are in the Playbook; the update is still by hand.',
      'A monthly digest of five to eight similar-sized rivals’ top three posts, and one tested idea a month that came from it.',
      'Build the monthly rival digest from public posts.'],
    ['AI recommendations', 2, 4, 'Quill writes SEO from the hashtags that did best on each channel, and Tempo picks times from your own results, each with the reason shown.',
      'Every recommendation cites the posts behind it, and at least half of the ones adopted beat the account’s median post.',
      'Track whether the adopted advice beat the median post.'],
    ['Integrations + publishing', 1, 6, 'Approved posts are scheduled into Metricool from the app, video edits come back attached, and the Channels tab tracks each account’s route to direct posting without Metricool.',
      'Results refresh on their own, 99% of scheduled posts publish on time, and failures are flagged within 15 minutes.',
      'Connect Bluesky directly first (no review needed), then YouTube, Pinterest, Meta and TikTok as their reviews pass.'],
    ['Security + reliability', 4, 6, 'The code is in a GitHub repository with 114 automated tests, and no keys or passwords are stored in the page. No restore test has been done yet.',
      'Two-step sign-in on every connected account, no secrets in the workspace, and a restore from backup tested each quarter.',
      'Make the repository private and run a restore test from the backup.'],
    ['Content experimentation', 5, 5, 'No change. Tests can be defined, but results are entered by hand.',
      'Two logged one-variable tests a month, each with a hypothesis, a metric and a result; winners go into a written playbook.',
      'Fill experiment results from the live post data.'],
    ['Sales attribution', 3, 3, 'No change. Tracked links can be built, but most Pinterest pins still point to the homepage without tracking.',
      'Every outbound link tagged; monthly revenue by channel and post matches the store within 5%.',
      'Tag every link, use one discount code per channel, and connect store orders.'],
  ];
  const STEPS = [
    ['Reply to every comment and message', 'Not on the scorecard yet', 'The new posts ask real questions; answering in the first hour is what turns comments into followers.'],
    ['Tag every link and connect store orders', 'Sales attribution', 'This is what lets you tell Anthony which posts sell. Start with the Pinterest pins.'],
    ['Connect the first account directly', 'Integrations', 'Bluesky needs no platform review. Then YouTube and Pinterest, then Meta and TikTok.'],
    ['Make the repository private and test a restore', 'Security', 'Restore the backup into a copy once, and keep the code out of public view.'],
    ['Run two small tests a month from live data', 'Experimentation, AI recommendations', 'One variable at a time: hook or format. Record the result automatically.'],
    ['Monthly rival digest', 'Competitor intelligence', 'Five to eight brands of similar size, their top three posts each month.'],
  ];
  const SKIP = 'Not worth chasing at this size: enterprise security certificates and single sign-on, social listening subscriptions, multi-touch attribution tools, and best-time-to-post tuning (too few posts and followers for the numbers to mean anything).';

  const css = document.createElement('style');
  css.textContent = `
  #rshScore .score-head{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;margin-top:12px}
  #rshScore .score-big{font-size:46px;font-weight:800;letter-spacing:-.03em;color:#1d1d1f;line-height:1;font-variant-numeric:tabular-nums}
  #rshScore .score-track{height:10px;border-radius:5px;background:#ececf0;position:relative;margin-top:12px;max-width:520px}
  #rshScore .score-track span{position:absolute;left:0;top:0;bottom:0;border-radius:5px}
  #rshScore .scroll{overflow-x:auto;margin-top:16px}
  #rshScore table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:860px}
  #rshScore th{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;text-align:left;padding:8px;font-weight:700;border-bottom:1px solid #e5e5ea}
  #rshScore td{padding:10px 8px;border-top:1px solid #f0f0f3;vertical-align:top;color:#1d1d1f;line-height:1.45}
  #rshScore td.num{font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap}
  #rshScore .up{color:#1a7f37}#rshScore .same{color:#6e6e73}
  #rshScore .mini{height:5px;border-radius:3px;background:#ececf0;margin-top:6px;width:70px;position:relative}
  #rshScore .mini span{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#0071e3}
  #rshScore .steps{display:grid;gap:8px;margin-top:12px}
  #rshScore .step{display:flex;gap:12px;align-items:flex-start;border:1px solid #e5e5ea;border-radius:12px;padding:11px 14px;background:#fff;font-size:13px;line-height:1.45}
  #rshScore .step .n{flex:none;width:24px;height:24px;border-radius:50%;background:#1d1d1f;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
  #rshScore .foot{margin-top:14px;font-size:11.5px;color:#6e6e73;line-height:1.5}`;
  document.head.appendChild(css);

  function start() {
    const view = document.getElementById('view-market'); if (!view || document.getElementById('rshScore')) return;
    // The 18 November assessment describes a local prototype; hide it rather than show two conflicting scores.
    const hero = view.querySelector(':scope > .card.hero'); const tiles = hero && hero.nextElementSibling;
    const title = [...view.querySelectorAll(':scope > .sectiontitle')].find(t => /Where our app stands right now/.test(t.textContent)); const table = title && title.nextElementSibling;
    for (const el of [hero, tiles, title, table]) if (el) el.hidden = true;

    const avg = k => ROWS.reduce((a, r) => a + r[k], 0) / ROWS.length, before = avg(1), now = avg(2);
    const fmt = n => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''), one = n => (Math.round(n * 10 + 1e-9) / 10).toFixed(1);
    const card = document.createElement('div'); card.className = 'card'; card.id = 'rshScore'; card.style.marginBottom = '16px';
    card.innerHTML = `
      <div class="eyebrow">APP SCORECARD · UPDATED NOVEMBER 23, 2026</div>
      <h2 style="margin-top:6px">Where the app stands, and what 10/10 takes</h2>
      <div class="score-head">
        <div><div class="score-big">${one(now)} <span class="small">/ 10</span></div><div class="small" style="margin-top:6px">Average of the ten ratings below</div></div>
        <div style="flex:1;min-width:240px"><div class="small"><strong class="up">+${(Number(one(now)) - Number(one(before))).toFixed(1)}</strong> since November 18, when the same ten ratings averaged ${one(before)}. The 4.8 shown before was a headline estimate, not that average.</div>
        <div class="score-track"><span style="width:${now * 10}%;background:#0071e3"></span><span style="width:${before * 10}%;background:#9cc4f2"></span></div></div>
      </div>
      <p style="margin-top:12px">These are our own ratings, scored strictly: a capability only moves when something measurable changed. The gains come from live Metricool data, signed approvals, team review, scheduling from the app and the researched Season Playbook. Reaching 10 depends mostly on four things still open: proving sales, direct posting without Metricool, learning from tests, and a tested restore.</p>
      <div class="scroll"><table>
        <thead><tr><th>Capability</th><th>Nov 18</th><th>Now</th><th>What changed</th><th>What 10/10 takes</th><th>Next step</th></tr></thead>
        <tbody>${ROWS.map(r => `<tr><td><strong>${esc(r[0])}</strong></td><td class="num same">${fmt(r[1])}</td><td class="num ${r[2] > r[1] ? 'up' : ''}">${fmt(r[2])}${r[2] > r[1] ? ' ▲' : ''}<div class="mini"><span style="width:${r[2] * 10}%"></span></div></td><td>${esc(r[3])}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td></tr>`).join('')}</tbody>
      </table></div>
      <h3 style="margin:20px 0 0;font-size:15px">The order to do it in</h3>
      <div class="small" style="margin-top:4px">Ranked by what matters most for a brand of this size, not by what the biggest tools offer.</div>
      <div class="steps">${STEPS.map((s, i) => `<div class="step"><span class="n">${i + 1}</span><span><strong>${esc(s[0])}</strong> <span class="small">· ${/^Not /.test(s[1]) ? 'not on the scorecard yet' : 'raises ' + esc(s[1])}</span><br>${esc(s[2])}</span></div>`).join('')}</div>
      <div class="hint" style="margin-top:14px">${esc(SKIP)}</div>
      <div class="foot">Benchmark: public feature pages of Metricool, Sprout Social, Hootsuite, Buffer, Planable, Socialinsider, Rival IQ, Agorapulse and Shopify, checked November 23, 2026 through search summaries rather than a hands-on trial; plan limits were not checked. No general social media tool was found that offers sport season calendars or parent, coach and athlete segments.</div>`;
    view.insertBefore(card, view.firstChild);
  }
  window.RSH_SCORE = { start, rows: ROWS };
})();
