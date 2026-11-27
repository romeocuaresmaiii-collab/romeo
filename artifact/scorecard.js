/* RSH Sports Marketing OS — updated scorecard and path to 10/10 (artifact edition only).
 *
 * Replaces the 18 November self-assessment on the Market Audit screen with the current one.
 * Scores are the team's own judgement on a 1–10 scale, not an external rating. "What 10/10 takes"
 * comes from a benchmark of leading social media tools checked on 23 November 2026; ratings updated 27 November 2026.
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // [capability, score on Nov 18, score now, what changed (or why not), what 10/10 takes, next step]
  const ROWS = [
    ['Sports-specific strategy', 7, 9, 'Season Playbook, fact checks and results by sport. Nov 27: published posts link to their campaigns on their own, and the calendar shows tournament dates with an order reminder six weeks before each.',
      'Every post tagged with sport, season phase and audience; results reported by those tags; order deadlines on the calendar six weeks ahead.',
      'Confirm RSH’s real production time so the order reminders can be used in posts.'],
    ['Calendar + planning', 6, 8, 'Nov 27: the System check counts the next 14 days in Metricool and names every empty day. Right now only a few of those days have a post besides Pinterest.',
      'One calendar that always matches Metricool, with at least 14 days scheduled at all times.',
      'Fill the empty days the System check lists, and keep 14 days scheduled.'],
    ['Approvals + assignments', 5, 9, 'Anthony signs from his own sign-in; changes after signing are logged and sent back. Nov 27: the app compares Metricool with what it sent and flags edits made inside Metricool and posts added there directly.',
      'Nothing publishes without an approver and time recorded by that person; edits after approval are logged.',
      'Agree as a team that every post goes through the app; posts added straight into Metricool are flagged, but not blocked.'],
    ['Reporting + analytics', 5, 9, 'Nov 27: a one-page monthly report builds itself (channels, top posts, sport split, rivals, advice check, next steps), and the numbers refresh every hour while the app is open.',
      'A monthly report produced in under five minutes with no manual copying, every number traceable to Metricool or the store.',
      'Add store sales once orders are connected.'],
    ['Competitor intelligence', 3, 7, 'Competitors live in the app: 7 similar-sized brands, a monthly digest of their standout posts researched by Claude, ideas that become A/B tests. Nov 27: two December tests come straight from the digest (named colorway, girls’ fit) and are on the calendar. Post-level numbers are not public, so the digest describes rather than measures.',
      'A monthly digest of five to eight similar-sized rivals’ top three posts, and one tested idea a month that came from it.',
      'Let the two December tests run, keep the winner, and repeat with January’s digest.'],
    ['AI recommendations', 2, 8, 'Every Tempo and Quill recommendation names the posts behind it. Nov 27: checked on our own results without peeking (learned Oct 31–Nov 12, tested Nov 13–26): 26 of 46 posts at Tempo’s advised hour (57%) and 7 of 14 with Quill’s hashtags (50%) beat their channel’s median. The check re-runs on every refresh and in the monthly report.',
      'Every recommendation cites the posts behind it, and at least half of the ones adopted beat the account’s median post.',
      'Keep it at 50% or better for a second month; drop any advice that falls below.'],
    ['Integrations + publishing', 1, 8, 'Approved posts go to Metricool from the app, video edits come back attached. Nov 27: a publishing check runs every hour even with the app closed (6 of 6 posts on time in the last 24 hours), the app checks every 15 minutes while open, results refresh on their own day and night, and RSH’s own Bluesky gateway is built and tested.',
      'Results refresh on their own, 99% of scheduled posts publish on time, and failures are flagged within 15 minutes.',
      'Set up the Bluesky gateway (15 minutes) so the first channel posts without Metricool.'],
    ['Security + reliability', 4, 7, 'No keys in the page; 148 automated tests. Nov 27: a restore drill put the live workspace backup into an empty copy and all 27 campaigns came back unchanged. The code repository is still public.',
      'Two-step sign-in on every connected account, no secrets in the workspace, and a restore from backup tested each quarter.',
      'Make the repository private and turn on two-step sign-in on every account.'],
    ['Content experimentation', 5, 8, 'Nov 27: two one-variable December tests are logged with a hypothesis and a metric, on real campaigns (named colorway vs explainer on Instagram; girls’ fit vs general on Bluesky). Each fills its own result once both posts are out, and winners go into the tested playbook that Sage and Quill follow.',
      'Two logged one-variable tests a month, each with a hypothesis, a metric and a result; winners go into a written playbook.',
      'Approve and publish the four test posts; read the results in mid-December.'],
    ['Sales attribution', 3, 6, 'Every store link is tagged by channel and campaign. Nov 27: Revenue → Sales from social reads Shopify’s orders export (credited by one discount code per channel) and its marketing report (credited by the link tags), with no store connection needed; only monthly totals are saved. No sales imported yet.',
      'Every outbound link tagged; monthly revenue by channel and post matches the store within 5%.',
      'Create one discount code per channel in Shopify, enter them in the app, and import the November orders export.'],
  ];
  const STEPS = [
    ['Reply to every comment and message', 'Not on the scorecard yet', 'The new posts ask real questions; answering in the first hour is what turns comments into followers.'],
    ['Connect store orders', 'Sales attribution', 'Links are tagged now; orders are what let you tell Anthony which posts sell.'],
    ['Connect the first account directly', 'Integrations', 'Bluesky needs no platform review. Then YouTube and Pinterest, then Meta and TikTok.'],
    ['Make the repository private', 'Security', 'The restore drill passed on Nov 27; keep the code out of public view and turn on two-step sign-in.'],
    ['Run two small tests a month from live data', 'Experimentation, AI recommendations', 'One variable at a time: hook or format. Record the result automatically.'],
    ['Test one competitor idea a month', 'Competitor intelligence', 'Seven similar-size brands are tracked in Competitors; press “Make it an A/B test” on one idea each month.'],
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
      <div class="eyebrow">APP SCORECARD · UPDATED NOVEMBER 26, 2026</div>
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
