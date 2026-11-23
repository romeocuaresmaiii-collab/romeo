/* RSH Sports Marketing OS — a shorter Home (artifact edition only).
 *
 * Home had grown to several screens of scrolling. This keeps what is acted on daily in view —
 * quick actions, the live summary, and the campaigns that need a next step — and moves the rest
 * behind clearly labelled "show" controls. Nothing is removed; every card is still on the page.
 */
(function () {
  'use strict';
  const app = () => window.RSH_APP;
  const css = document.createElement('style');
  css.textContent = `
  #rshQuick{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
  #rshQuick button{border:1px solid #e5e5ea;background:#fff;color:#1d1d1f;border-radius:12px;padding:10px 16px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  #rshQuick button.primary{background:#0071e3;border-color:#0071e3;color:#fff}
  #rshQuick button:hover{border-color:#b9d4f5}
  #rshQuick button:focus-visible{outline:2px solid #0071e3;outline-offset:2px}
  #rshQuick .count{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:#fff3e0;color:#b45309;font-size:11px}
  #rshHomeMore{margin-top:16px;border:1px solid #e5e5ea;border-radius:16px;background:#fff}
  #rshHomeMore>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:15px 18px;font-size:13.5px;color:#1d1d1f}
  #rshHomeMore>summary::-webkit-details-marker{display:none}
  #rshHomeMore[open]>summary{border-bottom:1px solid #ececf0}
  #rshHomeMore>.body{padding:16px}
  #pipelineItems.rsh-short>*:nth-child(n+6){display:none}
  #rshPipeMore{margin-top:10px}`;
  document.head.appendChild(css);

  function quick() {
    const bar = document.getElementById('rshQuick'); if (!bar || !app()) return;
    const posts = app().data().posts || [];
    const mine = posts.filter(p => p.status === 'Review' && !(p.approvalMeta && p.approvalMeta.pmReviewedAt)).length;
    const drafts = posts.filter(p => p.status === 'Draft').length;
    bar.innerHTML = `<button type="button" class="primary" data-quick="studio">＋ Create a post</button>
      <button type="button" data-quick="approvals">Reviews${mine ? `<span class="count">${mine} waiting</span>` : ''}</button>
      <button type="button" data-quick="calendar">Calendar${drafts ? `<span class="count">${drafts} draft${drafts === 1 ? '' : 's'}</span>` : ''}</button>
      <button type="button" data-quick="weekly">Insights</button>
      <button type="button" data-quick="executive">Executive Brief</button>`;
  }
  function pipeline() {
    const list = document.getElementById('pipelineItems'); if (!list) return;
    let btn = document.getElementById('rshPipeMore'); const n = list.children.length;
    if (n <= 5) { list.classList.remove('rsh-short'); if (btn) btn.remove(); return; }
    if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.id = 'rshPipeMore'; btn.className = 'btn ghost smallbtn'; btn.dataset.open = ''; list.parentNode.insertBefore(btn, list.nextSibling); list.classList.add('rsh-short');
      btn.addEventListener('click', () => { btn.dataset.open = btn.dataset.open ? '' : '1'; pipeline(); }); }
    list.classList.toggle('rsh-short', !btn.dataset.open);
    btn.textContent = btn.dataset.open ? 'Show fewer' : `Show all ${n} campaigns`;
  }

  function start() {
    const home = document.getElementById('view-overview'); if (!home || !app() || document.getElementById('rshQuick')) return;
    // 1. quick actions replace the two introductory cards
    const bar = document.createElement('div'); bar.id = 'rshQuick'; bar.setAttribute('aria-label', 'Quick actions'); home.insertBefore(bar, home.firstChild);
    bar.addEventListener('click', e => { const b = e.target.closest('[data-quick]'); if (b) app().navigate(b.dataset.quick); });
    const hero = home.querySelector(':scope > .card.hero'), cta = home.querySelector(':scope > .smart-home-cta');
    // 2. order: quick actions, live summary, campaigns needing a next step, campaign results, then everything else
    const live = document.getElementById('rshLive'), pipe = document.getElementById('productionPipeline'), camp = document.getElementById('rshCampaigns');
    if (live && pipe) home.insertBefore(pipe, live.nextSibling);
    if (camp && pipe) home.insertBefore(camp, pipe.nextSibling);
    if (pipe) pipe.style.marginBottom = '16px';
    // 3. the rest goes behind one control
    const more = document.createElement('details'); more.id = 'rshHomeMore';
    more.innerHTML = '<summary><span><strong>More on Home</strong><span class="small"> · getting started, today at a glance, priorities and the extended dashboard</span></span><span class="nav-caret">⌄</span></summary><div class="body"></div>';
    const keep = new Set([bar, live, pipe, camp, more].filter(Boolean)), body = more.querySelector('.body');
    const rest = [...home.children].filter(el => !keep.has(el));
    home.appendChild(more); for (const el of rest) body.appendChild(el);
    if (hero) hero.style.marginBottom = '16px'; if (cta) cta.style.marginBottom = '16px';
    // 4. keep the short pipeline list and the counts current
    const list = document.getElementById('pipelineItems'); if (list) new MutationObserver(pipeline).observe(list, { childList: true });
    document.querySelectorAll('.nav button[data-view="overview"]').forEach(b => b.addEventListener('click', () => setTimeout(quick, 0)));
    if (window.RSH_LIVE && window.RSH_LIVE.onData) window.RSH_LIVE.onData(quick);
    quick(); pipeline();
  }
  window.RSH_HOME = { start };
})();
