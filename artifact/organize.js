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

/* Long pages fold into their sections (Nov 27, 2026): on the heavy "More tools" pages every section heading becomes a
 * toggle; the first section stays open, the rest show only their title until opened. Nothing is removed, a section
 * that holds what you are looking for opens itself (search, a link, a focused field), and each person's open/closed
 * choice is remembered on this device. */
(function () {
  'use strict';
  const VIEWS = ['view-experiments', 'view-executive', 'view-market', 'view-competitors', 'view-weekly', 'view-revenue', 'view-strategy', 'view-aiworkbench'];
  const OPEN = /^(Experiments & learning log|Saved campaign results|Decisions Anthony can make)$/;   // the records people come back to stay open
  const KEY = 'rsh_fold_v1'; let mem = {}; try { mem = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) {} };
  const css = document.createElement('style');
  css.textContent = `.rsh-fold-head{cursor:pointer;user-select:none;position:relative;padding-right:120px!important}
  .rsh-fold-head .rsh-fold-btn{position:absolute;right:0;top:50%;transform:translateY(-50%)}
  .rsh-fold-head:hover h2{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}
  [data-rsh-folded="1"]{display:none!important}
  .rsh-fold-bar{display:flex;gap:8px;justify-content:flex-end;margin:6px 0 4px}`;
  document.head.appendChild(css);
  function bodyOf(head) { const out = []; let n = head.nextElementSibling; while (n && !n.classList.contains('sectiontitle') && !n.classList.contains('rsh-fold-bar')) { out.push(n); n = n.nextElementSibling; } return out; }
  function setOpen(head, open, remember) {
    head.dataset.rshOpen = open ? '1' : '0';
    for (const el of bodyOf(head)) { if (el.hidden && !el.dataset.rshFolded) continue; if (open) delete el.dataset.rshFolded; else el.dataset.rshFolded = '1'; }
    const b = head.querySelector('.rsh-fold-btn'); if (b) { b.textContent = open ? '▾ Hide' : '▸ Show'; b.setAttribute('aria-expanded', String(open)); }
    if (remember) { mem[head.dataset.rshFoldKey] = open ? 1 : 0; save(); }
  }
  function fold(view) {
    const heads = [...view.querySelectorAll('.sectiontitle')].filter(h => !h.hidden && !h.dataset.rshMoved && h.closest('.section') === view);
    if (heads.length < 2) return;
    heads.forEach((h, i) => {
      if (h.dataset.rshFoldKey) return;
      const title = (h.querySelector('h2') || h).textContent.trim().slice(0, 60); h.dataset.rshFoldKey = view.id + '|' + title;
      h.classList.add('rsh-fold-head');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost smallbtn rsh-fold-btn'; h.appendChild(b);
      h.addEventListener('click', e => { if (e.target.closest('a,input,select,textarea') || (e.target.closest('button') && e.target.closest('button') !== b)) return; setOpen(h, h.dataset.rshOpen !== '1', true); });
      const saved = mem[h.dataset.rshFoldKey]; setOpen(h, saved == null ? (i === 0 || OPEN.test(title)) : !!saved, false);
    });
    if (!view.querySelector('.rsh-fold-bar')) {
      const bar = document.createElement('div'); bar.className = 'rsh-fold-bar';
      bar.innerHTML = '<button type="button" class="btn ghost smallbtn" data-fold-all="1">▾ Open all sections</button><button type="button" class="btn ghost smallbtn" data-fold-all="0">▸ Close all</button>';
      bar.addEventListener('click', e => { const t = e.target.closest('[data-fold-all]'); if (!t) return; for (const h of view.querySelectorAll('.rsh-fold-head')) setOpen(h, t.dataset.foldAll === '1', true); });
      heads[0].parentNode.insertBefore(bar, heads[0]);
    }
  }
  // Anything that lands inside a folded section (a search result, a link, keyboard focus) opens that section.
  function reveal(el) { if (!el || !el.closest) return; const f = el.closest('[data-rsh-folded]'); if (!f) return; let h = f.previousElementSibling; while (h && !h.classList.contains('rsh-fold-head')) h = h.previousElementSibling; if (h) setOpen(h, true, true); }
  document.addEventListener('focusin', e => reveal(e.target), true);
  const run = () => { for (const id of VIEWS) { const v = document.getElementById(id); if (v) fold(v); } };
  run(); document.addEventListener('DOMContentLoaded', run); setTimeout(run, 1600); setTimeout(run, 4000);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-view]')) setTimeout(run, 50); });
  window.RSH_FOLD = { run, reveal, setOpen };
})();
