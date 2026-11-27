/* RSH Sports Marketing OS — experiment results from published posts (artifact edition only).
 *
 * On Growth Experiments, lets a person pick the published post for side A and side B of a test and
 * fills the result fields with the figures Metricool reports for those two posts. Supported for
 * tests measured in views or engagement; follower and outbound-click tests still need manual
 * figures because Metricool does not report those per post here. Nothing is estimated, and the
 * app's own wording about small samples and "directional only" results stays in place.
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = () => window.RSH_APP, rows = () => (window.RSH_LIVE && window.RSH_LIVE.rows()) || [];
  const dayLabel = k => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const netOf = t => String(t.platform || '').toUpperCase().replace(/[^A-Z]/g, '');
  const SUPPORTED = { views: 'views', engagement: 'engagement' };

  const css = document.createElement('style');
  css.textContent = `
  .gx-live{border:1px solid #dbe7fb;background:#f5f8ff;border-radius:12px;padding:12px 14px;margin:12px 0}
  .gx-live h5{margin:0 0 4px;font-size:13px;color:#1d1d1f}
  .gx-live .pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}
  @media(max-width:700px){.gx-live .pair{grid-template-columns:minmax(0,1fr)}}
  .gx-live label{display:block;font-size:11px;font-weight:700;color:#515154;margin-bottom:4px}
  .gx-live select{width:100%;font:inherit;font-size:12px;padding:7px 8px;border:1px solid #d2d2d7;border-radius:8px;background:#fff;color:#1d1d1f}
  .gx-live a{color:#0066cc;font-weight:700;text-decoration:none}`;
  document.head.appendChild(css);

  function figures(t, r) {              // [numerator, denominator] for the test's metric from one post
    if (t.kpi === 'views') return [r[4], 1];
    return [r[5] || 0, r[4]];           // engagement: interactions per impression
  }
  function apply(id, urlA, urlB) {
    const t = (app().data().growthTests || []).find(x => x.id === id), a = rows().find(r => r[2] === urlA), b = rows().find(r => r[2] === urlB);
    if (!t || !a || !b) return;
    if (urlA === urlB) { app().notice('Choose two different posts.'); return; }
    const fa = figures(t, a), fb = figures(t, b), today = new Date().toISOString().slice(0, 10);
    t.aNumerator = fa[0]; t.aDenominator = fa[1]; t.bNumerator = fb[0]; t.bDenominator = fb[1];
    t.aPost = { link: a[2], date: a[1], text: a[3] }; t.bPost = { link: b[2], date: b[1], text: b[3] };
    t.source = `Metricool figures read ${today}. A: ${a[2]} (${dayLabel(a[1])}). B: ${b[2]} (${dayLabel(b[1])}).` + (t.kpi === 'engagement' ? ' Interactions per impression; Metricool reports impressions, not reach, for these posts.' : '') + ' One post per side.';
    app().save(); app().notice('Results filled from the two published posts. Add what you learned, then save.');
  }
  /* December tests, planned on real calendar campaigns (both from the competitor digest). Added once; the team can edit
   * or delete them like any test. Each side names its campaign, so the result fills itself once both posts are out. */
  const PLANNED = [
    { id: 'gx-2026-12-named-colorway', title: 'Named colorway vs explainer carousel', platform: 'Instagram', kpi: 'engagement', owner: 'Project Manager',
      a: 'Explainer carousel: “Reversible Singlet, Explained” (Dec 10)', b: 'Named-colorway carousel: “Name This Colorway” (Dec 1)', aCampaign: 'decenqg310pyexl', bCampaign: 'decvconwpnqym1x',
      hypothesis: 'A carousel that invites people to name a colorway earns more interactions per impression than a plain explainer of the same product. One variable: the angle (naming vs explaining); same product, format and slot type.', fromRivalIdea: 'Named colorway reveal vs plain product post', month: '2026-12' },
    { id: 'gx-2026-12-girls-fit', title: 'Girls’ fit post vs general singlet post', platform: 'Bluesky', kpi: 'engagement', owner: 'Project Manager',
      a: 'General singlet post: “Bluesky: Reversible Singlets” (Dec 2)', b: 'Girls’ fit post: “Bluesky: Fitted Uniforms for Girls” (Dec 1)', aCampaign: 'decg41n56elueq1', bCampaign: 'deccy8kw7m39a4y',
      hypothesis: 'A post about properly fitted uniforms for female wrestlers (the NFHS 2026–27 point of emphasis) earns more interactions per impression than a general singlet post. One variable: the topic; same platform, format and 9 AM slot.', fromRivalIdea: 'Girls’ fit post vs general singlet post', month: '2026-12' }];
  function plan() {
    const A = app(); if (!A) return; const d = A.data(); d.growthTests = d.growthTests || []; d.plannedTests = d.plannedTests || [];
    let changed = false;
    for (const t of PLANNED) { if (d.plannedTests.includes(t.id)) continue; d.plannedTests.push(t.id); changed = true;
      if (!d.growthTests.some(x => x.id === t.id) && (d.posts || []).some(p => p.id === t.aCampaign) && (d.posts || []).some(p => p.id === t.bCampaign))
        d.growthTests.push({ ...t, aNumerator: 0, aDenominator: 0, bNumerator: 0, bDenominator: 0, source: '', learning: '', createdAt: new Date().toISOString() }); }
    if (changed) A.save();
  }
  // A test whose sides name campaigns fills itself from those campaigns' published posts (linked automatically from Metricool).
  function fillFromCampaigns() {
    const A = app(); if (!A) return false; let changed = false;
    for (const t of A.data().growthTests || []) {
      if (!t.aCampaign || !t.bCampaign || !SUPPORTED[t.kpi] || (t.aPost && t.bPost)) continue;
      const pa = (A.data().posts || []).find(p => p.id === t.aCampaign), pb = (A.data().posts || []).find(p => p.id === t.bCampaign);
      const la = pa && pa.published && pa.published.link, lb = pb && pb.published && pb.published.link; if (!la || !lb) continue;
      const a = rows().find(r => r[2] === la), b = rows().find(r => r[2] === lb); if (!a || !b || a[4] == null || b[4] == null) continue;
      const fa = figures(t, a), fb = figures(t, b), today = new Date().toISOString().slice(0, 10);
      t.aNumerator = fa[0]; t.aDenominator = fa[1]; t.bNumerator = fb[0]; t.bDenominator = fb[1];
      t.aPost = { link: a[2], date: a[1], text: a[3] }; t.bPost = { link: b[2], date: b[1], text: b[3] };
      t.source = `Filled automatically ${today} from the two campaigns’ published posts (Metricool). A: ${a[2]}. B: ${b[2]}.` + (t.kpi === 'engagement' ? ' Interactions per impression.' : '') + ' One post per side, so directional only.';
      changed = true;
    }
    if (changed) A.save(); return changed;
  }
  // Keep filled results current when fresh figures arrive (only if they changed).
  function sync() {
    if (!app()) return; fillFromCampaigns(); let changed = false;
    for (const t of (app().data().growthTests || [])) {
      if (!t.aPost || !t.bPost || !SUPPORTED[t.kpi]) continue;
      const a = rows().find(r => r[2] === t.aPost.link), b = rows().find(r => r[2] === t.bPost.link); if (!a || !b || a[4] == null || b[4] == null) continue;
      const fa = figures(t, a), fb = figures(t, b);
      if (t.aNumerator !== fa[0] || t.aDenominator !== fa[1] || t.bNumerator !== fb[0] || t.bDenominator !== fb[1]) { t.aNumerator = fa[0]; t.aDenominator = fa[1]; t.bNumerator = fb[0]; t.bDenominator = fb[1]; changed = true; }
    }
    if (changed) app().save();
  }

  function decorate() {
    const list = document.getElementById('gxList'); if (!list || !app()) return;
    const tests = app().data().growthTests || [];
    list.querySelectorAll('article[data-experiment]').forEach(card => {
      if (card.querySelector('.gx-live')) return;
      const t = tests.find(x => x.id === card.dataset.experiment); if (!t) return;
      const box = document.createElement('div'); box.className = 'gx-live';
      if (!SUPPORTED[t.kpi]) {
        box.innerHTML = `<h5>Results from published posts</h5><div class="small">This test is measured in ${t.kpi === 'follows' ? 'new followers' : 'outbound clicks'}, which Metricool does not report per post here. Enter the figures by hand below.</div>`;
      } else {
        const cand = rows().filter(r => r[0] === netOf(t) && r[2] && r[4] != null).sort((x, y) => y[1] - x[1]).slice(0, 60);
        const opts = sel => `<option value="">Choose a published ${esc(t.platform)} post…</option>` + cand.map(r => `<option value="${esc(r[2])}"${sel && sel.link === r[2] ? ' selected' : ''}>${esc(dayLabel(r[1]))} · ${esc((r[3] || r[6]).slice(0, 44))} · ${Math.round(r[4]).toLocaleString('en-US')} impr.</option>`).join('');
        box.innerHTML = cand.length ? `<h5>Fill results from published posts</h5>
          <div class="small">Pick the post that used each version. The app reads ${t.kpi === 'views' ? 'its views' : 'its interactions and impressions'} from Metricool. Compare posts from the same week and format, or the difference means little.</div>
          <div class="pair"><div><label for="gxLiveA${esc(t.id)}">A · the post that used version A</label><select id="gxLiveA${esc(t.id)}" data-gx-live="a">${opts(t.aPost)}</select></div>
          <div><label for="gxLiveB${esc(t.id)}">B · the post that used version B</label><select id="gxLiveB${esc(t.id)}" data-gx-live="b">${opts(t.bPost)}</select></div></div>
          <button type="button" class="btn ghost smallbtn" data-gx-live-apply="${esc(t.id)}" style="margin-top:10px">Use these posts’ figures</button>`
          : `<h5>Fill results from published posts</h5><div class="small">No published ${esc(t.platform)} posts with figures are loaded yet.</div>`;
      }
      const anchor = card.querySelector('.sample'); card.insertBefore(box, anchor || null);
    });
  }

  /* ---------- tested playbook: what the tests showed, kept in one place and given to Sage and Quill ---------- */
  const rateOf = (t, k) => { const n = Number(t[k + 'Numerator']), d = Number(t[k + 'Denominator']); return d > 0 && isFinite(n) ? n / d : null; };
  function lessons() {
    const out = [];
    for (const t of (app() && app().data().growthTests) || []) {
      const a = rateOf(t, 'a'), b = rateOf(t, 'b'); if (a === null || b === null || (!a && !b)) continue;
      const m = Math.abs(b - a) / Math.max(Math.min(a, b), 1e-7); if (m < 0.1) { out.push({ t, tie: true, text: `${t.title}: no clear winner (${t.platform}, under 10% apart).` }); continue; }
      const win = b > a ? 'b' : 'a', lose = win === 'a' ? 'b' : 'a';
      out.push({ t, win, text: `${t.title} (${t.platform}, ${t.kpi === 'views' ? 'views' : 'interactions per impression'}): “${String(t[win] || 'version ' + win.toUpperCase()).slice(0, 120)}” beat “${String(t[lose] || 'version ' + lose.toUpperCase()).slice(0, 120)}” by ${Math.round(m * 100)}%.${t.learning ? ' Learned: ' + String(t.learning).slice(0, 200) : ''}${t.aPost ? ' One post per side, so directional only.' : ''}` });
    }
    return out;
  }
  function plannedThisMonth() { const k = new Date().toISOString().slice(0, 7); return ((app() && app().data().growthTests) || []).filter(t => t.month === k || String(t.createdAt || '').slice(0, 7) === k).length; }
  function month() { const k = new Date().toISOString().slice(0, 7); return ((app() && app().data().growthTests) || []).filter(t => rateOf(t, 'a') !== null && rateOf(t, 'b') !== null && String(t.aPost ? t.aPost.date : t.createdAt || '').replace(/-/g, '').slice(0, 6) === k.replace('-', '')).length; }
  function book() {
    const list = document.getElementById('gxList'); if (!list) return;
    let box = document.getElementById('gxBook'); if (!box) { box = document.createElement('div'); box.id = 'gxBook'; box.className = 'gx-live'; list.parentNode.insertBefore(box, list); }
    const L = lessons(), n = month();
    box.innerHTML = `<h5>Tested playbook · ${n} of 2 tests with results this month · ${plannedThisMonth()} planned</h5>${L.length ? `<ul class="small" style="margin:4px 0 0 18px;padding:0">${L.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul><div class="small" style="margin-top:6px">Sage and Quill read these when they write scripts and hashtags.</div>` : '<div class="small">No test has results yet. Run one test on a hook and one on a format this month; pick the two published posts on each test to fill the result.</div>'}`;
  }

  function start() {
    const list = document.getElementById('gxList'); if (!list || !app() || list.dataset.gxLive) return; list.dataset.gxLive = '1';
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-gx-live-apply]'); if (!b) return;
      const card = b.closest('article'), a = card.querySelector('[data-gx-live="a"]').value, bb = card.querySelector('[data-gx-live="b"]').value;
      if (!a || !bb) { app().notice('Choose a post for A and for B first.'); return; }
      apply(b.dataset.gxLiveApply, a, bb);
    });
    plan(); fillFromCampaigns();
    new MutationObserver(() => decorate()).observe(list, { childList: true });
    if (window.RSH_LIVE && window.RSH_LIVE.onData) window.RSH_LIVE.onData(() => { sync(); list.querySelectorAll('article .gx-live').forEach(x => x.remove()); decorate(); book(); });
    decorate(); book();
    new MutationObserver(() => book()).observe(list, { childList: true });
  }
  window.RSH_EXPERIMENTS = { start, lessons, month, plan, fillFromCampaigns, planned: () => PLANNED.map(t => t.id) };
})();
