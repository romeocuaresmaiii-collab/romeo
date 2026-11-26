/* RSH Sports Marketing OS — organize (artifact edition, Nov 26, 2026).
 * One home per feature: where a section repeats something that lives elsewhere (or only worked in the local Mac
 * edition), it is hidden here and replaced by a one-line pointer. Nothing is deleted; the base app is unchanged. */
(function () {
  'use strict';
  const MOVES = [
    ['view-market', 'Working upgrade: campaign-link builder', 'The campaign link builder lives in Revenue & ROI.', 'revenue'],
    ['view-weekly', 'Report Inbox · refresh without reinstalling', 'Numbers now come straight from Metricool: see the live results on Home.', 'overview'],
    ['view-metricool', 'Refresh with another Metricool snapshot', 'Numbers now come straight from Metricool: see the live results on Home.', 'overview']
  ];
  function hideSection(viewId, title, text, target) {
    const view = document.getElementById(viewId); if (!view) return false;
    const h = [...view.querySelectorAll('.sectiontitle h2')].find(x => x.textContent.trim() === title); if (!h) return false;
    const head = h.closest('.sectiontitle'); if (!head || head.dataset.rshMoved) return true;
    head.dataset.rshMoved = '1';
    let n = head.nextElementSibling; head.hidden = true;
    while (n && !n.classList.contains('sectiontitle')) { const next = n.nextElementSibling; n.hidden = true; n = next; }
    const p = document.createElement('p'); p.className = 'small rsh-moved'; p.style.cssText = 'margin:14px 0;color:#6e6e73';
    p.append(text + ' ');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost smallbtn'; b.textContent = 'Open'; b.addEventListener('click', () => { const nav = document.querySelector(`.nav button[data-view="${target}"]`); if (nav) nav.click(); });
    p.append(b); head.parentNode.insertBefore(p, head);
    return true;
  }
  function run() { for (const m of MOVES) hideSection(...m); }
  run();
  document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 1500);
  window.RSH_ORGANIZE = { MOVES, run };
})();
