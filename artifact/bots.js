/* RSH Sports Marketing OS — 24/7 Bots (artifact edition only; its own screen, changes nothing else).
 *
 * Step-by-step build of an automation that turns planned campaigns into ready-to-post items:
 *   1. Caption Bot    adapts each campaign's own wording for every channel it should go to
 *   2. Scheduler Bot  gives each post a time on the campaign's planned day, avoiding clashes
 *   3. Manager Bot    checks every post before it could go anywhere
 *   4. Posting Bot    NOT switched on: would hand posts to Metricool as drafts for review
 *   5. Daily run      NOT switched on: would run the bots on their own every day
 * The bots only READ campaigns. Their output is kept in a separate plan (database document
 * bots/plan); no campaign, approval, calendar entry or Metricool post is created or changed.
 * Captions are rearranged from the campaign's existing hook, caption, call to action and hashtags;
 * the bots add no new claims.
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  const app = () => window.RSH_APP;
  const CHANNELS = [['instagram', 'Instagram', 2200], ['facebook', 'Facebook', 5000], ['tiktok', 'TikTok', 2200], ['youtube', 'YouTube', 5000], ['pinterest', 'Pinterest', 500], ['threads', 'Threads', 500], ['bluesky', 'Bluesky', 300]];
  const NAME = Object.fromEntries(CHANNELS.map(c => [c[0], c[1]])), LIMIT = Object.fromEntries(CHANNELS.map(c => [c[0], c[2]]));
  const DEFAULTS = { channels: ['instagram', 'facebook', 'tiktok'], times: ['12:00', '18:00'], labels: { '12:00': 'lunch break', '18:00': 'after practice' }, days: 14 };
  let db = null, settings = { ...DEFAULTS }, plan = null, busy = false, note = '', log = [], openItem = null;
  let phase = null, wake = '', assetSig = null, queued = '', drop = { msg: '', busy: false };
  const slotName = t => (settings.labels && settings.labels[t]) ? `${clock(t)} · ${settings.labels[t]}` : clock(t);      // which bot is at work right now; why the team started; attachments seen so far

  const css = document.createElement('style');
  css.textContent = `
  #rshBots .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:16px}
  #rshBots .st{border:1px solid #e5e5ea;border-radius:12px;padding:10px 12px;background:#fff;font-size:12.5px;line-height:1.4;min-width:0}
  #rshBots .st b{display:block;font-size:13px}
  #rshBots .st .tag2{display:inline-block;margin-top:5px;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px}
  #rshBots .st.on .tag2{background:#eaf7ee;color:#1a7f37}#rshBots .st.off .tag2{background:#f0f0f3;color:#6e6e73}
  #rshBots .office{margin-top:16px;border-radius:18px;padding:18px 16px 14px;background:linear-gradient(180deg,#eef4fb 0%,#f7f9fc 58%,#e9edf3 58%,#e3e8ef 100%);border:1px solid #dfe6ee;position:relative;overflow:hidden}
  #rshBots .office-top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
  #rshBots .office-top .sign{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#51607a}
  #rshBots .desks{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
  #rshBots .assetrow{padding:11px 14px;border-bottom:1px solid #ececf0;background:#fff;font-size:12.5px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
  #rshBots .assetrow .need{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin:3px 4px 0 0}
  #rshBots .need.have{background:#eaf7ee;color:#1a7f37}#rshBots .need.miss{background:#fdecea;color:#b42318}#rshBots .need.opt{background:#f0f0f3;color:#515154}
  @media(max-width:1100px){#rshBots .desks{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}}
  #rshBots .desk{background:#fff;border:1px solid #dfe6ee;border-radius:16px;padding:12px 12px 10px;text-align:center;min-width:0;position:relative;cursor:default;transition:box-shadow .2s,transform .2s}
  #rshBots .desk.working{box-shadow:0 0 0 2px #0071e3,0 10px 24px rgba(0,113,227,.18);transform:translateY(-2px)}
  #rshBots .desk.asleep{background:#f4f5f8}
  #rshBots .holo{height:22px;display:flex;justify-content:center;align-items:center}
  #rshBots .holo span{font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:999px;background:#e6f0fd;color:#0058b0;border:1px solid #c5dbf7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  #rshBots .bot{width:74px;height:74px;margin:2px auto 0;display:block}
  #rshBots .desk.idle .bot{animation:rshBob 3.6s ease-in-out infinite}
  #rshBots .desk.working .bot{animation:rshType .42s ease-in-out infinite}
  #rshBots .desk.asleep .bot{opacity:.62}
  #rshBots .zz{position:absolute;top:30px;right:22%;font-size:13px;font-weight:800;color:#8a94a6;animation:rshZz 2.4s ease-in-out infinite}
  #rshBots .desk h4{margin:6px 0 0;font-size:14px;color:#1d1d1f}
  #rshBots .desk .role{font-size:11px;color:#6e6e73;font-weight:600}
  #rshBots .mood{display:inline-block;margin-top:7px;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 9px;border-radius:999px}
  #rshBots .mood.good{background:#eaf7ee;color:#1a7f37}#rshBots .mood.bad{background:#fff3e0;color:#b45309}#rshBots .mood.busy{background:#e6f0fd;color:#0058b0}#rshBots .mood.off{background:#eceef2;color:#6e6e73}#rshBots .mood.plain{background:#f0f0f3;color:#515154}
  #rshBots .say{margin-top:8px;font-size:12px;line-height:1.4;color:#1d1d1f;background:#f7f9fc;border:1px solid #e5eaf1;border-radius:12px;padding:8px 9px;text-align:left;min-height:52px}
  #rshBots .desk.asleep .say{color:#6e6e73}
  @keyframes rshBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes rshType{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-2px) rotate(1.5deg)}}
  @keyframes rshZz{0%{opacity:0;transform:translate(0,4px)}40%{opacity:1}100%{opacity:0;transform:translate(8px,-12px)}}
  @media (prefers-reduced-motion:reduce){#rshBots .bot,#rshBots .zz{animation:none!important}#rshBots .desk{transition:none}}
  #rshBots .setup{display:flex;flex-wrap:wrap;gap:16px;margin-top:16px;align-items:flex-end}
  #rshBots .setup label.h{display:block;font-size:11px;font-weight:700;color:#515154;margin-bottom:4px}
  #rshBots .setup input[type=text],#rshBots .setup select{font:inherit;font-size:12.5px;padding:7px 9px;border:1px solid #d2d2d7;border-radius:9px;background:#fff;color:#1d1d1f}
  #rshBots .chs{display:flex;flex-wrap:wrap;gap:6px}
  #rshBots .chs label{display:inline-flex;gap:5px;align-items:center;border:1px solid #e5e5ea;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:600;background:#fff;cursor:pointer}
  #rshBots .log{margin-top:14px;border:1px solid #e5e5ea;border-radius:14px;background:#fbfbfd;padding:12px 14px;font-size:12.5px;line-height:1.5}
  #rshBots .log-h{display:flex;gap:8px;align-items:baseline;margin-bottom:4px}
  #rshBots .log-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #eef0f4}
  #rshBots .log-av{flex:none;width:34px;height:34px}
  #rshBots .log-av .bot{width:34px;height:34px;margin:0;animation:none!important;opacity:1!important}
  #rshBots .dropz{border:2px dashed #b9c8dc;border-radius:14px;background:#fff;padding:12px 14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:12px;transition:border-color .15s,background .15s}
  #rshBots .dropz.over{border-color:#0071e3;background:#eef5ff}
  #rshBots .dropz select{font:inherit;font-size:12.5px;padding:7px 9px;border:1px solid #d2d2d7;border-radius:9px;background:#fff;color:#1d1d1f;max-width:260px}
  #rshBots .dropz .t{flex:1;min-width:200px;font-size:13px;line-height:1.4}
  #rshBots .flowlab{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#51607a;margin:0 0 8px}
  #rshBots .flowlab i{flex:1;height:0;border-top:2px dashed #b9c8dc}
  #rshBots .desk.flow::after{content:"→";position:absolute;right:-11px;top:74px;width:20px;height:20px;line-height:19px;border-radius:50%;background:#fff;border:1px solid #cfd9e6;color:#51607a;font-size:12px;font-weight:800;z-index:2;text-align:center}
  @media(max-width:1100px){#rshBots .desk.flow::after{display:none}}
  #rshBots .day{margin-top:18px;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#515154}
  #rshBots .camp{border:1px solid #e5e5ea;border-radius:14px;margin-top:8px;background:#fff;overflow:hidden}
  #rshBots .camp>header{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;padding:11px 14px;background:#fbfbfd;border-bottom:1px solid #ececf0}
  #rshBots .camp>header strong{font-size:14px}
  #rshBots .item{display:grid;grid-template-columns:110px 96px minmax(0,1fr) auto;gap:12px;align-items:start;padding:11px 14px;border-top:1px solid #f0f0f3;font-size:12.5px}
  #rshBots .item:first-of-type{border-top:0}
  @media(max-width:820px){#rshBots .item{grid-template-columns:minmax(0,1fr)}}
  #rshBots .item input[type=time]{font:inherit;font-size:12.5px;padding:5px 6px;border:1px solid #d2d2d7;border-radius:8px;width:96px;background:#fff;color:#1d1d1f}
  #rshBots .cap{white-space:pre-wrap;line-height:1.5;color:#1d1d1f;word-break:break-word}
  #rshBots .cap.short{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  #rshBots textarea{width:100%;box-sizing:border-box;font:inherit;font-size:12.5px;line-height:1.5;padding:8px;border:1px solid #d2d2d7;border-radius:9px;background:#fff;color:#1d1d1f}
  #rshBots .chk{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin:4px 4px 0 0}
  #rshBots .chk.ok{background:#eaf7ee;color:#1a7f37}#rshBots .chk.stop{background:#fdecea;color:#b42318}#rshBots .chk.warn{background:#fff3e0;color:#b45309}
  #rshBots .empty{margin-top:14px;padding:22px;border:1px dashed #c7c7cc;border-radius:14px;color:#515154;font-size:13px;text-align:center;line-height:1.5}`;
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sentence = s => { const t = String(s || '').trim(); if (!t) return ''; return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; };
  const cut = (s, n) => { s = String(s || '').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 40)).replace(/[\s,;:.]+$/, '') + '…'; };
  const tagsOf = (p, n) => (String(p.hashtags || '').match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, n).join(' ');
  const firstSentences = (s, n) => (String(s || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [String(s || '')]).slice(0, n).join(' ').trim();
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const clock = t => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };

  /* ---------- 0. Asset Bot ----------
   * Works out which files each campaign still needs and writes a ready-to-paste prompt for an AI
   * image or video tool. It does not generate the image or video itself: a person makes the file
   * in the tool, checks it, and drops it into the office. The campaign's locked wording about
   * sport-correct gear and no third-party logos travels with every prompt.
   */
  function assetNeeds(p) {
    const files = [p.creativeAsset].concat(Array.isArray(p.creativeAssets) ? p.creativeAssets : []).filter(Boolean).filter((a, i, all) => all.findIndex(x => x.id === a.id) === i);
    const vids = files.filter(a => /^video\//.test(a.mime || '')).length, imgs = files.length - vids, type = String(p.postType || '').toLowerCase(), ratio = p.aspectRatio || '4:5', needs = [];
    if (/reel|video/.test(type)) needs.push({ label: 'a vertical 9:16 video, 8–20 seconds', state: vids ? 'have' : 'miss' });
    else if (/carousel/.test(type)) needs.push({ label: `3 to 5 matching ${ratio} photos`, state: imgs >= 3 ? 'have' : 'miss', detail: imgs ? `${imgs} so far` : '' });
    else if (/story/.test(type)) needs.push({ label: 'one vertical 9:16 photo or short video', state: files.length ? 'have' : 'miss' });
    else needs.push({ label: `one ${ratio} photo`, state: imgs ? 'have' : 'miss' });
    const chans = targets(p);
    if (!vids && chans.some(c => c === 'tiktok' || c === 'youtube')) needs.push({ label: 'optional: a vertical video so it can also go to ' + chans.filter(c => c === 'tiktok' || c === 'youtube').map(c => NAME[c]).join(' and '), state: 'opt' });
    if (chans.includes('pinterest') && ratio !== '2:3') needs.push({ label: 'optional: a 2:3 version for Pinterest', state: 'opt' });
    return { needs, missing: needs.some(n => n.state === 'miss'), files: files.length };
  }
  const RULES = 'Realistic, natural light. Sport-correct gear and setting. No third-party logos, brand marks or wordmarks on shoes, socks, apparel, bags or equipment. No real, identifiable people. Suitable for parents, coaches and athletes.';
  function imagePrompt(p) {
    const type = String(p.postType || '').toLowerCase(), base = String(p.visualPrompt || p.visualConcept || '').trim();
    return [base || `A premium, photorealistic ${p.sport || 'sports'} photo for ${p.platform || 'social media'}: ${sentence(p.hook)}`,
      /carousel/.test(type) ? 'Make this a matching set of 3 to 5 images with the same athlete, setting and light: 1) a cover with clear space for the headline, 2 to 4) supporting moments, last) a calm closing frame.' : '',
      `Aspect ratio ${p.aspectRatio || '4:5'}. Leave clean space for text; do not put any text in the image.`, base ? '' : RULES].filter(Boolean).join('\n\n');
  }
  function videoBrief(p) {
    return [`Create a 10 to 15 second vertical 9:16 video for ${p.platform || 'social media'} about ${p.sport || 'the sport'}.`,
      p.visualConcept ? `Scene: ${String(p.visualConcept).trim()}` : '',
      `Shots: 1) Opening, first 2 seconds: the moment that matches the hook “${sentence(p.hook)}”. 2) Middle: the main action, one clear movement, steady framing. 3) Ending, last 2 seconds: hold on a clean frame with room for the call to action.`,
      'No text or captions in the footage; text is added in editing. No music with lyrics.', RULES].filter(Boolean).join('\n\n');
  }

  /* ---------- 1. Caption Bot ---------- */
  function bodyOf(p) {
    let b = String(p.captionBody || p.caption || '').trim();
    for (const part of [p.cta, p.hashtags]) if (part && b.endsWith(String(part).trim())) b = b.slice(0, -String(part).trim().length).trim();
    return b.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim();
  }
  function captionFor(p, ch) {
    const body = bodyOf(p), cta = String(p.cta || '').trim(), hook = sentence(p.hook), join = parts => parts.filter(Boolean).join('\n\n');
    if (ch === 'instagram') return join([body, cta, tagsOf(p, 8)]);
    if (ch === 'facebook') return join([body, cta, tagsOf(p, 2)]);
    if (ch === 'tiktok') return cut(join([hook ? hook.replace(/[.?!]*$/, m => m || '.') : firstSentences(body, 1), cta, tagsOf(p, 5)]), 600);
    if (ch === 'youtube') return join([cut(hook || p.title, 90), firstSentences(body, 3), cta, tagsOf(p, 3)]);
    if (ch === 'pinterest') return join([cut(String(p.title || '').replace(/^pinterest:\s*/i, ''), 100), cut(firstSentences(body, 3), 380), `https://www.rshsports.com/?utm_source=pinterest&utm_medium=organic_social&utm_campaign=${slug(p.title)}`]);
    if (ch === 'threads') return cut(join([firstSentences(body, 2), cta]), 480);
    if (ch === 'bluesky') return cut([firstSentences(body, 1), cta].filter(Boolean).join(' '), 290);
    return join([body, cta]);
  }

  /* ---------- 2. Scheduler Bot ---------- */
  function metricoolBusy() {       // "date|HH:MM|channel" already scheduled in Metricool
    const set = new Set(), sch = (window.RSH_LIVE && window.RSH_LIVE.scheduled()) || [];
    for (const s of sch) for (const ch of String(s[1]).split(',')) set.add(`${s[0].slice(0, 10)}|${s[0].slice(11, 16)}|${ch}`);
    return set;
  }
  function schedule(items) {
    const busyM = metricoolBusy(), used = new Set(), slots = settings.times.slice().sort();
    for (const it of items) {
      if (it.edited && it.time) { used.add(`${it.date}|${it.time}|${it.channel}`); continue; }
      it.time = slots.find(t => !used.has(`${it.date}|${t}|${it.channel}`) && !busyM.has(`${it.date}|${t}|${it.channel}`)) || slots[slots.length - 1] || '18:00';
      used.add(`${it.date}|${it.time}|${it.channel}`);
    }
  }

  /* ---------- 3. Manager Bot ---------- */
  function check(items, posts) {
    const busyM = metricoolBusy(), now = new Date(), seen = {};
    for (const it of items) { const k = `${it.date}|${it.time}|${it.channel}`; seen[k] = (seen[k] || 0) + 1; }
    for (const it of items) {
      const p = posts.find(x => x.id === it.postId), out = []; if (!p) { it.checks = [['stop', 'Campaign no longer exists']]; it.ready = false; continue; }
      const t = app().track(p);
      if (t.stage !== 'ready') out.push(['stop', t.stage === 'brief' ? 'Brief not finished' : t.stage === 'media' ? (t.assets ? 'Visual checks not done' : 'No media attached') : t.stage === 'manager' ? 'Waiting for manager review' : 'Waiting for Anthony’s approval']); else out.push(['ok', 'Approved']);
      if (new Date(`${it.date}T${it.time}:00`) < now) out.push(['stop', 'Time is in the past']);
      if (seen[`${it.date}|${it.time}|${it.channel}`] > 1) out.push(['stop', 'Two posts at the same time on this channel']);
      if (busyM.has(`${it.date}|${it.time}|${it.channel}`)) out.push(['stop', 'Metricool already has a post at this time']);
      if (it.caption.length > LIMIT[it.channel]) out.push(['stop', `Caption is ${it.caption.length} characters; ${NAME[it.channel]} allows ${LIMIT[it.channel]}`]);
      if (!it.caption.trim()) out.push(['stop', 'No caption']);
      const video = /reel|video|story/i.test(p.postType || '');
      if ((it.channel === 'tiktok' || it.channel === 'youtube') && !video) out.push(['warn', `${NAME[it.channel]} needs a video; this campaign is a ${p.postType || 'photo'}`]);
      if (/rshsports\.com/i.test(it.caption) && !/[?&]utm_/i.test(it.caption)) out.push(['warn', 'Store link has no tracking']);
      if (it.edited) out.push(['warn', 'Edited by hand']);
      it.checks = out; it.ready = !out.some(c => c[0] === 'stop');
    }
  }

  /* ---------- run ---------- */
  function targets(p) {            // the campaign's own channel first, then the extra channels chosen in setup
    const own = String(p.platform || '').toLowerCase().replace(/[^a-z]/g, ''), list = NAME[own] ? [own] : [];
    for (const c of settings.channels) if (!list.includes(c)) list.push(c);
    return list;
  }
  function runAll() {
    const posts = (app().data().posts || []).filter(p => p.date), from = iso(new Date()), end = new Date(); end.setDate(end.getDate() + settings.days); const to = iso(end);
    const inRange = posts.filter(p => p.date >= from && p.date <= to).sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
    const old = new Map(((plan && plan.items) || []).map(i => [i.postId + '|' + i.channel, i])), items = [];
    for (const p of inRange) for (const ch of targets(p)) {
      const prev = old.get(p.id + '|' + ch);
      items.push(prev && prev.edited ? { ...prev, date: p.date } : { postId: p.id, channel: ch, date: p.date, time: '', caption: captionFor(p, ch), edited: false });
    }
    schedule(items); check(items, posts);
    const ready = items.filter(i => i.ready).length;
    const days = [...new Set(items.map(i => i.date))].map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }));
    const sample = items[0] ? `“${cut(items[0].caption.replace(/\s+/g, ' '), 110)}”` : '';
    const stops = {}; for (const i of items) for (const c of i.checks) if (c[0] === 'stop') stops[c[1]] = (stops[c[1]] || 0) + 1;
    const top = Object.keys(stops).sort((a, b) => stops[b] - stops[a])[0];
    const needing = inRange.filter(q => assetNeeds(q).missing);
    log = [['pixel', !inRange.length ? 'No campaigns in the window.' : needing.length ? `${needing.length} of ${inRange.length} campaigns need files. Next up: “${cut(needing[0].title, 40)}” needs ${assetNeeds(needing[0]).needs.filter(n => n.state === 'miss').map(n => n.label).join(' and ')}. Briefs and prompts are in the plan.` : `All ${inRange.length} campaigns have their files.`], ['quill', items.length ? `${items.length} captions for ${inRange.length} campaign${inRange.length === 1 ? '' : 's'}. First one: ${sample}` : 'No campaigns in the window, so nothing to write.'],
      ['tempo', items.length ? `${items.length} posts timed across ${days.length} day${days.length === 1 ? '' : 's'} (${[...new Set(days)].join(', ')}), using ${settings.times.map(slotName).join(' and ')} US Eastern. No clashes.` : 'Nothing to schedule.'],
      ['ref', !items.length ? 'Nothing to check.' : ready === items.length ? `All ${items.length} checks passed. Ready for Courier.` : `${ready} ready, ${items.length - ready} held back.${top ? ` Most common reason: ${top.charAt(0).toLowerCase() + top.slice(1)} (${stops[top]}).` : ''}`],
      ['courier', ready ? `Not switched on, so nothing was sent. ${ready} post${ready === 1 ? ' is' : 's are'} ready: use Copy to paste into Metricool.` : 'Not switched on, and nothing is ready yet, so nothing was sent to Metricool.']];
    plan = { generatedAt: new Date().toISOString(), from, to, items };
    return save();
  }
  async function save() {
    if (!db) { note = 'This plan is not saved: storage is unavailable in this view.'; return; }
    try { await db.doc('bots/plan').set({ json: JSON.stringify(plan).slice(0, 240000), updatedAt: new Date().toISOString() }); await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); note = ''; }
    catch (e) { note = 'The plan could not be saved' + (e && e.code ? ' [' + e.code + ']' : '') + '. It stays on screen until you leave.'; }
  }

  /* ---------- the team ----------
   * Five bots with their own desk. What each one "feels" and says is worked out from real numbers
   * (posts written, days uncovered, posts held back), so a glance at the office is a status report.
   */
  const TEAM = [['pixel', 'Pixel', 'Asset Bot', '#db2777'], ['quill', 'Quill', 'Caption Bot', '#0071e3'], ['tempo', 'Tempo', 'Scheduler Bot', '#7c3aed'], ['ref', 'Ref', 'Manager Bot', '#d9480f'], ['courier', 'Courier', 'Posting Bot', '#0f9d7a'], ['owl', 'Night Owl', 'Daily run', '#64748b']];
  function botSvg(color, face) {
    const eyes = face === 'asleep' ? '<path d="M24 34h9M41 34h9" stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round" fill="none"/>'
      : face === 'working' ? '<rect x="23" y="31" width="10" height="5" rx="2.5" fill="#1d1d1f"/><rect x="41" y="31" width="10" height="5" rx="2.5" fill="#1d1d1f"/>'
      : '<circle cx="28.5" cy="34" r="4" fill="#1d1d1f"/><circle cx="45.5" cy="34" r="4" fill="#1d1d1f"/><circle cx="29.8" cy="32.6" r="1.3" fill="#fff"/><circle cx="46.8" cy="32.6" r="1.3" fill="#fff"/>';
    const brows = face === 'worried' ? '<path d="M23 27l9-3M51 27l-9-3" stroke="#1d1d1f" stroke-width="2.2" stroke-linecap="round" fill="none"/>' : face === 'strict' ? '<path d="M23 24l9 3M51 24l-9 3" stroke="#1d1d1f" stroke-width="2.2" stroke-linecap="round" fill="none"/>' : '';
    const mouth = face === 'happy' ? '<path d="M30 43q7 6 14 0" stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round" fill="none"/>' : face === 'worried' ? '<path d="M31 46q6-5 12 0" stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round" fill="none"/>' : face === 'asleep' ? '<circle cx="37" cy="44.5" r="2.4" fill="#1d1d1f"/>' : '<path d="M31 44h12" stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round" fill="none"/>';
    return `<svg class="bot" viewBox="0 0 74 74" aria-hidden="true"><line x1="37" y1="6" x2="37" y2="15" stroke="${color}" stroke-width="3" stroke-linecap="round"/><circle cx="37" cy="5.5" r="3.6" fill="${face === 'working' ? '#ffd43b' : color}"/><rect x="13" y="15" width="48" height="38" rx="13" fill="${color}"/><rect x="18" y="21" width="38" height="27" rx="9" fill="#fff"/>${brows}${eyes}${mouth}<rect x="21" y="56" width="32" height="13" rx="6" fill="${color}" opacity=".85"/><rect x="7" y="28" width="5" height="13" rx="2.5" fill="${color}"/><rect x="62" y="28" width="5" height="13" rx="2.5" fill="${color}"/></svg>`;
  }
  function team() {
    const items = (plan && plan.items) || [], ready = items.filter(i => i.ready).length, held = items.length - ready, camps = new Set(items.map(i => i.postId)).size, edited = items.filter(i => i.edited).length;
    const noMedia = new Set(items.filter(i => (i.checks || []).some(c => c[1] === 'No media attached')).map(i => i.postId)).size;
    const waiting = new Set(items.filter(i => (i.checks || []).some(c => /Waiting for/.test(c[1]))).map(i => i.postId)).size;
    let cov = null; try { cov = window.RSH_CALENDAR && window.RSH_CALENDAR.coverage(); } catch (_) {}
    const out = {};
    out.quill = !plan ? ['plain', 'Eager', 'happy', 'Give me your planned campaigns and I’ll write a version for every channel.']
      : !items.length ? ['plain', 'Bored', 'neutral', 'Nothing is planned in my window, so I have nothing to write.']
      : edited ? ['plain', 'Taking notes', 'neutral', `You rewrote ${edited} of my ${items.length} captions. I kept your versions.`]
      : ['good', 'Proud', 'happy', `I wrote ${items.length} captions for ${camps} campaign${camps === 1 ? '' : 's'}.`];
    out.tempo = !plan ? ['plain', 'Waiting', 'neutral', 'I’ll pick the times once there are captions.']
      : cov && cov.empty.length ? ['bad', 'Worried', 'worried', `Every post has a time, but ${cov.empty.length} of the next 14 days have nothing scheduled in Metricool.`]
      : ['good', 'Calm', 'happy', items.length ? 'Every post has a time and nothing clashes.' : 'The calendar is quiet.'];
    out.ref = !plan ? ['plain', 'Watching', 'neutral', 'Nothing gets past me without both approvals.']
      : !items.length ? ['plain', 'Watching', 'neutral', 'Nothing to check yet.']
      : !held ? ['good', 'Satisfied', 'happy', `All ${items.length} posts passed. Good work, team.`]
      : ['bad', ready ? 'Strict' : 'Frustrated', 'strict', `I’m holding back ${held} of ${items.length} posts.` + (noMedia ? ` ${noMedia} campaign${noMedia === 1 ? ' has' : 's have'} no media.` : '') + (waiting ? ` ${waiting} still need${waiting === 1 ? 's' : ''} a review or approval.` : '')];
    out.courier = ['off', 'Asleep', 'asleep', `Not switched on. ${ready ? `${ready} post${ready === 1 ? ' is' : 's are'} ready when you want me to take them to Metricool for review.` : 'Wake me when posts are ready to go to Metricool for review.'}`];
    const all = (app().data().posts || []).filter(q => q.date && (!plan || (q.date >= plan.from && q.date <= plan.to))), missing = all.filter(q => assetNeeds(q).missing).length;
    out.pixel = !all.length ? ['plain', 'Idle', 'neutral', 'No campaigns to prepare assets for.']
      : missing ? ['bad', 'Busy', 'worried', `${missing} of ${all.length} campaign${all.length === 1 ? '' : 's'} still need${missing === 1 ? 's' : ''} files. I wrote a brief and a ready-to-paste prompt for each.`]
      : ['good', 'Happy', 'happy', `Every campaign has the files it needs.`];
    out.owl = ['off', 'Asleep', 'asleep', 'Not switched on. I would run the whole team every morning.'];
    const task = { pixel: 'Writing asset briefs…', quill: 'Writing captions…', tempo: 'Picking times…', ref: 'Checking every post…' };
    if (phase && out[phase]) out[phase] = ['busy', 'Working', 'working', task[phase]];
    return out;
  }
  function office() {
    const t = team();
    const posts = (app().data().posts || []).filter(p => p.date).sort((a, b) => a.date.localeCompare(b.date)), need = posts.filter(p => app().track(p).stage === 'media' || app().track(p).stage === 'brief');
    const pick = need.length ? need : posts;
    return `<div class="office" aria-label="The bot team"><div class="office-top"><span class="sign">The office</span><span class="small" data-bot-wake>${wake ? esc(wake) : 'Drop a file below, or attach one in Create, and the team starts by itself.'}</span></div>
      <div class="dropz" data-bot-drop><div class="t"><strong>Start here: drop a photo or video</strong><br><span class="small" data-bot-dropmsg>${drop.msg ? esc(drop.msg) : 'Drop it on this box, paste it, or choose a file. It is attached to the campaign you pick, exactly as in Create.'}</span></div>
        <select aria-label="Campaign to attach the file to" data-bot-dropcamp>${pick.length ? pick.map(p => `<option value="${esc(p.id)}">${esc(p.date.slice(5))} · ${esc(cut(p.title, 38))}</option>`).join('') : '<option value="">No campaigns yet</option>'}</select>
        <button type="button" class="btn ghost smallbtn" data-bot-choose ${drop.busy || !pick.length ? 'disabled' : ''}>${drop.busy ? 'Attaching…' : 'Choose file'}</button><input type="file" data-bot-file accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" multiple hidden></div>
      <div class="flowlab"><span>Campaigns and files</span><i></i><span>asset briefs</span><i></i><span>captions</span><i></i><span>times</span><i></i><span>checks</span><i></i><span>Metricool</span></div>
      <div class="desks">${TEAM.map(([id, name, role, color], n) => { const [tone, mood, face, line] = t[id]; const state = face === 'asleep' ? 'asleep' : face === 'working' ? 'working' : 'idle';
        return `<div class="desk ${state}${n < 4 ? ' flow' : ''}" data-bot="${id}"><div class="holo">${state === 'working' ? `<span>${esc(line)}</span>` : ''}</div>${state === 'asleep' ? '<span class="zz" aria-hidden="true">z z</span>' : ''}${botSvg(color, face)}<h4>${esc(name)}</h4><div class="role">${esc(role)}</div><span class="mood ${tone}">${esc(mood)}</span><div class="say">${state === 'working' ? 'On it.' : esc(line)}</div></div>`; }).join('')}</div></div>`;
  }
  // Attach dropped files through the app's own attach step in Create, so every rule there still applies.
  async function attach(files, postId) {
    const sel = document.getElementById('visualPostSelect'), input = document.getElementById('visualFile'), btn = document.getElementById('visualUpload'), msg = document.getElementById('visualUploadMsg');
    if (!sel || !input || !btn || !files.length || !postId || drop.busy) return;
    if (![...sel.options].some(o => o.value === postId)) { drop.msg = 'That campaign cannot take files right now.'; return render(); }
    drop.busy = true; drop.msg = `Attaching ${files.length} file${files.length === 1 ? '' : 's'}…`; render();
    try {
      sel.value = postId; sel.dispatchEvent(new Event('change', { bubbles: true }));
      const dt = new DataTransfer(); for (const f of files) dt.items.add(f); input.disabled = false; input.files = dt.files;
      const before = signature(); btn.disabled = false; btn.click();
      for (let i = 0; i < 600; i++) { await pause(250); if (!btn.disabled && !/^Uploading/.test(msg.textContent || '')) break; }
      const ok = signature() !== before;
      drop.msg = ok ? `Attached to “${cut(((app().data().posts || []).find(p => p.id === postId) || {}).title || 'the campaign', 40)}”. The visual checks for it are done in Create.` : (msg.textContent || 'The file could not be attached.');
    } catch (_) { drop.msg = 'The file could not be attached.'; }
    drop.busy = false; render();
  }
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function showWork() {          // purely visual: the plan is already prepared and saved
    const quick = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const b of ['pixel', 'quill', 'tempo', 'ref']) { phase = b; render(); await pause(quick ? 60 : 850); }
    phase = null;
  }
  // The team starts on its own when a new file is attached to any campaign.
  const signature = () => (app().data().posts || []).map(p => [p.creativeAsset].concat(Array.isArray(p.creativeAssets) ? p.creativeAssets : []).filter(Boolean).map(a => a.id).sort().join(',')).join('|');
  async function onCampaignsChanged() {
    const now = signature(); if (assetSig === null) { assetSig = now; return; }
    if (now === assetSig) { if (plan && !busy && !phase) render(); return; }
    const before = new Set(assetSig.split(/[|,]/)), added = now.split(/[|,]/).filter(x => x && !before.has(x)); assetSig = now;
    if (!added.length) { if (!busy) render(); return; }
    const p = (app().data().posts || []).find(q => [q.creativeAsset].concat(q.creativeAssets || []).some(a => a && added.includes(a.id)));
    const why = `New file on “${p ? p.title : 'a campaign'}”. The team got to work.`;
    if (busy) { queued = why; return; }           // a file arrived mid-run: go again as soon as this run ends
    await work(why);
  }

  async function work(why) {
    busy = true; wake = why; log = []; render();
    await runAll(); const lines = log; log = []; await showWork(); log = lines; busy = false; render();
    if (queued) { const next = queued; queued = ''; await work(next); }
  }

  /* ---------- rendering ---------- */
  function render() {
    const host = document.getElementById('rshBots'); if (!host || !app()) return;
    const posts = app().data().posts || [], items = (plan && plan.items) || [];
    if (items.length) check(items, posts);             // statuses always reflect the campaigns as they are now
    const ready = items.filter(i => i.ready).length, ran = !!plan;
    const step = (n, name, what, on, label) => `<div class="st ${on ? 'on' : 'off'}"><b>${n}. ${esc(name)}</b>${esc(what)}<br><span class="tag2">${esc(label)}</span></div>`;
    let list = '';
    if (!ran) list = `<div class="empty"><strong>The bots have not run yet.</strong><br>Press “Run everything”. They read your planned campaigns for the next ${settings.days} days and prepare a caption and a time for each channel. Nothing in your campaigns, calendar or Metricool is changed.</div>`;
    else if (!items.length) list = `<div class="empty">No campaigns are planned in the next ${settings.days} days, so there is nothing to prepare.</div>`;
    else {
      let lastDay = '', lastPost = '';
      for (const it of items) {
        const p = posts.find(x => x.id === it.postId); if (!p) continue;
        if (it.date !== lastDay) { if (lastPost) list += '</div>'; lastPost = ''; lastDay = it.date; list += `<div class="day">${esc(new Date(it.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</div>`; }
        if (it.postId !== lastPost) { if (lastPost) list += '</div>'; lastPost = it.postId; const mine = items.filter(x => x.postId === it.postId); const an = assetNeeds(p); list += `<div class="camp"><header><strong>${esc(p.title)}</strong><span class="small">${mine.filter(x => x.ready).length} of ${mine.length} channel posts ready</span></header><div class="assetrow"><div><strong>Files needed</strong> <span class="small">· ${an.files} attached</span><div>${an.needs.map(n => `<span class="need ${n.state}">${n.state === 'have' ? '✓ ' : ''}${esc(n.label)}${n.detail ? ' (' + esc(n.detail) + ')' : ''}</span>`).join('')}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn ghost smallbtn" data-bot-prompt="image" data-bot-post="${esc(p.id)}">Copy image prompt</button><button type="button" class="btn ghost smallbtn" data-bot-prompt="video" data-bot-post="${esc(p.id)}">Copy video brief</button></div></div>`; }
        const key = it.postId + '|' + it.channel, open = openItem === key;
        list += `<div class="item" data-bot-item="${esc(key)}"><div><strong>${esc(NAME[it.channel])}</strong><div class="small">${it.caption.length} characters</div></div>
          <div><input type="time" value="${esc(it.time)}" aria-label="Time for ${esc(NAME[it.channel])} post of ${esc(p.title)}" data-bot-time="${esc(key)}">${settings.labels && settings.labels[it.time] ? `<div class="small" style="margin-top:3px">${esc(settings.labels[it.time])}</div>` : ''}</div>
          <div>${open ? `<textarea rows="7" data-bot-cap="${esc(key)}" aria-label="Caption for ${esc(NAME[it.channel])}">${esc(it.caption)}</textarea>` : `<div class="cap short">${esc(it.caption)}</div>`}<div>${it.checks.map(c => `<span class="chk ${c[0]}">${c[0] === 'ok' ? '✓ ' : ''}${esc(c[1])}</span>`).join('')}</div></div>
          <div style="display:flex;flex-direction:column;gap:6px">${open ? `<button type="button" class="btn smallbtn" data-bot-savecap="${esc(key)}">Save</button><button type="button" class="btn ghost smallbtn" data-bot-close>Cancel</button>` : `<button type="button" class="btn ghost smallbtn" data-bot-edit="${esc(key)}">Edit</button><button type="button" class="btn ghost smallbtn" data-bot-copy="${esc(key)}">Copy</button>`}</div></div>`;
      }
      if (lastPost) list += '</div>';
    }
    host.innerHTML = `
      <div class="card">
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start">
          <div><div class="eyebrow">24/7 BOTS · STEP-BY-STEP SETUP</div><h2 style="margin-top:6px">Turn planned campaigns into ready-to-post items</h2>
          <p style="margin-top:6px">The bots read your campaigns and prepare a caption and a time for every channel. They change nothing in your campaigns, calendar or Metricool.</p></div>
          <button type="button" class="btn" data-bot-run ${busy ? 'disabled' : ''}>${busy ? 'Running…' : '▶ Run everything'}</button>
        </div>
        ${office()}
        <div class="setup">
          <div><label class="h">Also post each campaign to</label><div class="chs">${CHANNELS.map(c => `<label><input type="checkbox" data-bot-ch="${c[0]}" ${settings.channels.includes(c[0]) ? 'checked' : ''}> ${esc(c[1])}</label>`).join('')}</div><div class="small" style="margin-top:4px">A campaign always goes to its own channel as well.</div></div>
          <div><label class="h" for="rshBotTimes">Posting times, US Eastern</label><input type="text" id="rshBotTimes" value="${esc(settings.times.map(t => t + (settings.labels && settings.labels[t] ? ' ' + settings.labels[t] : '')).join(', '))}" size="38" placeholder="12:00 lunch break, 18:00 after practice"><div class="small" style="margin-top:4px">24-hour time, then an optional name. Separate slots with commas.</div></div>
          <div><label class="h" for="rshBotDays">Look ahead</label><select id="rshBotDays">${[7, 14, 21, 30].map(n => `<option value="${n}" ${settings.days === n ? 'selected' : ''}>${n} days</option>`).join('')}</select></div>
        </div>
        ${note ? `<div class="hint" role="status" style="margin-top:12px">${esc(note)}</div>` : ''}
        ${log.length ? `<div class="log" role="status"><div class="log-h"><strong>Bot log</strong><span class="small">latest run${plan ? ' · ' + esc(new Date(plan.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) : ''}</span></div>${log.map(l => { const m = TEAM.find(t => t[0] === l[0]) || TEAM[0]; return `<div class="log-row"><span class="log-av">${botSvg(m[3], l[0] === 'courier' ? 'asleep' : 'happy')}</span><div><strong>${esc(m[1])}</strong> <span class="small">${esc(m[2])}</span><div>${esc(l[1])}</div></div></div>`; }).join('')}</div>` : ''}
      </div>
      <div class="card" style="margin-top:16px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:baseline"><h2 style="font-size:18px">The plan</h2><span class="small">${ran ? `${ready} of ${items.length} posts ready · prepared ${esc(new Date(plan.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}` : 'Not prepared yet'}</span></div>
        ${ran && items.length ? '<p class="small" style="margin-top:6px">A post is ready only when its campaign has both approvals and every check passes. Until the Posting Bot is switched on, use Copy to paste a ready post into Metricool yourself.</p>' : ''}
        ${list}
      </div>`;
  }

  function find(key) { return ((plan && plan.items) || []).find(i => i.postId + '|' + i.channel === key); }
  async function onClick(e) {
    if (e.target.closest('[data-bot-choose]')) { const f = document.querySelector('#rshBots [data-bot-file]'); if (f) f.click(); return; }
    if (e.target.closest('[data-bot-run]')) { if (busy) return; return work('You pressed Run everything.'); }
    const ed = e.target.closest('[data-bot-edit]'); if (ed) { openItem = ed.dataset.botEdit; return render(); }
    if (e.target.closest('[data-bot-close]')) { openItem = null; return render(); }
    const sv = e.target.closest('[data-bot-savecap]');
    if (sv) { const it = find(sv.dataset.botSavecap), ta = document.querySelector(`#rshBots [data-bot-cap="${CSS.escape(sv.dataset.botSavecap)}"]`); if (it && ta) { it.caption = ta.value; it.edited = true; } openItem = null; await save(); return render(); }
    const pr = e.target.closest('[data-bot-prompt]');
    if (pr) { const q = (app().data().posts || []).find(x => x.id === pr.dataset.botPost); if (!q) return; const text = pr.dataset.botPrompt === 'video' ? videoBrief(q) : imagePrompt(q), old = pr.textContent, done = ok => { pr.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { pr.textContent = old; }, 1600); }; try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); } return; }
    const cp = e.target.closest('[data-bot-copy]');
    if (cp) { const it = find(cp.dataset.botCopy); if (!it) return; const text = `${NAME[it.channel]} · ${it.date} ${clock(it.time)} US Eastern\n\n${it.caption}`, done = ok => { cp.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { cp.textContent = 'Copy'; }, 1600); }; try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); } }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches('[data-bot-file]')) { const files = [...t.files], camp = document.querySelector('#rshBots [data-bot-dropcamp]'); t.value = ''; return attach(files, camp && camp.value); }
    if (t.matches('[data-bot-dropcamp]')) return;
    if (t.dataset.botCh) { settings.channels = [...document.querySelectorAll('#rshBots [data-bot-ch]:checked')].map(x => x.dataset.botCh); note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotTimes') { const labels = {}, ts = []; for (const part of t.value.split(',')) { const m = part.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)\s*(.*)$/); if (!m) continue; const k = m[1].padStart(2, '0') + ':' + m[2]; if (!ts.includes(k)) ts.push(k); if (m[3].trim()) labels[k] = m[3].trim().slice(0, 30); } if (!ts.length) { note = 'Enter at least one time like 18:00.'; return render(); } settings.times = ts; settings.labels = labels; note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotDays') { settings.days = Number(t.value) || 14; note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.dataset.botTime) { const it = find(t.dataset.botTime); if (it && /^\d\d:\d\d$/.test(t.value)) { it.time = t.value; it.edited = true; await save(); render(); } }
  }

  async function start() {
    const view = document.getElementById('view-bots'); if (!view || !app() || !app().track || document.getElementById('rshBots')) return;
    const host = document.createElement('div'); host.id = 'rshBots'; view.appendChild(host);
    host.addEventListener('click', onClick); host.addEventListener('change', onChange);
    const zone = e => e.target.closest && e.target.closest('[data-bot-drop]'), files = dt => [...((dt && dt.files) || [])].filter(f => /^(image\/(png|jpeg|webp)|video\/(mp4|webm))$/.test(f.type));
    host.addEventListener('dragover', e => { const z = zone(e); if (z) { e.preventDefault(); z.classList.add('over'); } });
    host.addEventListener('dragleave', e => { const z = zone(e); if (z) z.classList.remove('over'); });
    host.addEventListener('drop', e => { const z = zone(e); if (!z) return; e.preventDefault(); z.classList.remove('over'); const fs = files(e.dataTransfer), camp = z.querySelector('[data-bot-dropcamp]'); if (!fs.length) { drop.msg = 'Use a PNG, JPEG or WebP photo, or an MP4 or WebM video.'; return render(); } attach(fs, camp && camp.value); });
    document.addEventListener('paste', e => { if (!view.classList.contains('active') || (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return; const fs = files(e.clipboardData); if (!fs.length) return; e.preventDefault(); const camp = host.querySelector('[data-bot-dropcamp]'); attach(fs, camp && camp.value); });
    document.querySelectorAll('[data-view="bots"]').forEach(b => b.addEventListener('click', () => setTimeout(render, 0)));
    render();
    assetSig = signature();
    window.addEventListener('rsh:saved', () => { onCampaignsChanged(); });   // fires after every saved change to the campaigns
    db = await use('db');
    if (db) {
      try { const s = await db.doc('bots/settings').get(); if (s.exists) settings = { ...DEFAULTS, ...JSON.parse(s.data().json) }; } catch (_) {}
      try { const p = await db.doc('bots/plan').get(); if (p.exists) plan = JSON.parse(p.data().json); } catch (_) {}
    }
    render();
  }
  window.RSH_BOTS = { start, captionFor, assetNeeds, imagePrompt, videoBrief };
})();
