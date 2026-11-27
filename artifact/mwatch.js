/* Metricool watch: compares what is really in Metricool with what the app sent and Anthony approved.
 *  - Publishing: any network whose post is past its time by 15+ minutes and not published (or failed) is flagged.
 *  - Approval match: a post the app sent whose text or first comment was changed inside Metricool afterwards; a post the
 *    app sent that is no longer in Metricool; upcoming posts in Metricool that did not come from the app (no approval on record).
 *  - Results: a campaign whose post went out is linked to that published post automatically (exact match by the post's
 *    public link from Metricool), so the by-sport report fills itself.
 * Reads Metricool's schedule from RSH_LIVE (refreshed every 15 minutes while the app is open). */
(function () {
  'use strict';
  const live = () => window.RSH_LIVE, bots = () => window.RSH_BOTS, app = () => window.RSH_APP;
  const LATE_MIN = 15, NAME = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', threads: 'Threads', bluesky: 'Bluesky', linkedin: 'LinkedIn', twitter: 'X' };
  // 'YYYY-MM-DDTHH:MM' in US Eastern time → ms
  function etMs(dt) {
    for (const off of ['-05:00', '-04:00']) {
      const t = Date.parse(dt + ':00' + off); if (isNaN(t)) return NaN;
      const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t));
      if (Number(h) === Number(dt.slice(11, 13))) return t;
    }
    return Date.parse(dt + ':00-05:00');
  }
  const norm = u => String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  function check() {
    const L = live(), sch = L && L.scheduled && L.scheduled(); if (!sch) return null;
    const now = Date.now(), out = { failed: [], late: [], onTime: 0, due: 0, edited: [], missing: [], outside: [], linked: [] };
    const B = bots(), items = B && B.sentItems ? B.sentItems() : [], byKey = {};
    for (const it of items) byKey[`${it.date}T${it.time}|${it.channel}`] = it;
    const seen = new Set(), today = new Date(); today.setHours(0, 0, 0, 0);
    for (const p of sch) {
      const t = etMs(p[0]), st = Array.isArray(p[6]) ? p[6] : [];
      if (!p[4] && now - t > LATE_MIN * 60000) for (const [net, s] of st) {
        out.due++;
        if (s === 'PUBLISHED') out.onTime++;
        else if (/ERROR|FAIL|REJECT|CANCEL/.test(s)) out.failed.push({ title: p[2], net, at: p[0], status: s });
        else out.late.push({ title: p[2], net, at: p[0], status: s || 'not published' });
      }
      for (const net of String(p[1]).split(',').filter(Boolean)) {
        const key = p[0] + '|' + net, it = byKey[key];
        if (!it) { if (!p[4] && t > now && st.length) out.outside.push({ title: p[2], net, at: p[0] }); continue; }
        seen.add(key);
        if (it.sent.textSig && p[7] && (p[7] !== it.sent.textSig || (it.sent.commentSig && p[8] && p[8] !== it.sent.commentSig)))
          out.edited.push({ title: it.title || p[2], net, at: p[0], postId: it.postId, what: p[7] !== it.sent.textSig ? 'text' : 'first comment' });
        const pub = st.find(x => x[0] === net && x[2]);
        if (pub) out.linked.push({ postId: it.postId, url: pub[2], net });
      }
    }
    const from = new Date(today); from.setDate(from.getDate() - 3); const until = new Date(today); until.setDate(until.getDate() + 14);
    const fetched = L.fetchedAt && L.fetchedAt();
    for (const [key, it] of Object.entries(byKey)) {
      const d = new Date(it.date + 'T12:00:00');
      if (seen.has(key) || it.sent.status === 'queued' || d < from || d > until || (fetched && Date.parse(it.sent.at) > Date.parse(fetched))) continue;
      out.missing.push({ title: it.title || it.postId, net: it.channel, at: `${it.date}T${it.time}` });
    }
    return out;
  }
  // Link campaigns to their published posts by the exact public link, once Metricool's results include that post.
  function autoLink(res) {
    const A = app(), C = window.RSH_CAMPAIGNS, L = live(); if (!A || !C || !C.link || !res || !res.linked.length) return 0;
    const rows = (L.rows && L.rows()) || [], posts = A.data().posts || []; let n = 0;
    for (const x of res.linked) {
      const p = posts.find(q => q.id === x.postId); if (!p || p.published) continue;
      const r = rows.find(r => r[2] && norm(r[2]) === norm(x.url)); if (!r) continue;
      if (C.link(p.id, r[2], true)) n++;
    }
    return n;
  }
  const told = new Set();
  function run() {
    const res = check(); if (!res) return;
    autoLink(res);
    const bad = res.failed.concat(res.late).filter(x => !told.has(x.at + x.net));
    if (bad.length && app() && app().notice) { bad.forEach(x => told.add(x.at + x.net)); app().notice(`${bad.length} post${bad.length === 1 ? '' : 's'} did not go out on time in Metricool. Open ⋯ More → System check.`); }
  }
  const label = x => `${x.title} (${NAME[x.net] || x.net}, ${new Date(etMs(x.at)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})`;
  function start() { const L = live(); if (!L || !L.onData) return setTimeout(start, 1000); L.onData(run); setTimeout(run, 3000); }
  window.RSH_MWATCH = { check, autoLink, run, label, etMs };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
