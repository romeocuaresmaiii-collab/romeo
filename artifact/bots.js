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
  const DEFAULTS = { autoEdit: true, channels: ['instagram', 'facebook', 'tiktok'], times: ['12:00', '18:00'], labels: { '12:00': 'lunch break', '18:00': 'after practice' }, days: 14 };
  let db = null, settings = { ...DEFAULTS }, plan = null, busy = false, note = '', log = [], openItem = null;
  let phase = null, wake = '', assetSig = null, queued = '', drop = { msg: '', busy: false };
  let tab = 'office', filter = 'all';
  let jobs = {}, editorState = 'unknown', dispatching = false;      // edit jobs by campaign id; whether the editor can be reached from this view                 // which section of the screen is showing; which campaigns the plan lists
  const openCamps = new Set();
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
  #rshBots .desks{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
  @media(max-width:1250px){#rshBots .desks{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}
  #rshBots .assetrow{padding:11px 14px;border-bottom:1px solid #ececf0;background:#fff;font-size:12.5px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
  #rshBots .assetrow .need{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin:3px 4px 0 0}
  #rshBots .need.have{background:#eaf7ee;color:#1a7f37}#rshBots .need.miss{background:#fdecea;color:#b42318}#rshBots .need.opt{background:#f0f0f3;color:#515154}
  @media(max-width:1100px){#rshBots .desks{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}}
  #rshBots .desk{background:#fff;border:1px solid #dfe6ee;border-radius:16px;padding:12px 12px 10px;text-align:center;min-width:0;position:relative;cursor:default;transition:box-shadow .2s,transform .2s}
  #rshBots .desk.working{box-shadow:0 0 0 2px #0071e3,0 10px 24px rgba(0,113,227,.18);transform:translateY(-2px)}
  #rshBots .desk.asleep{background:#f4f5f8}
  #rshBots .holo{height:22px;display:flex;justify-content:center;align-items:center}
  #rshBots .holo span{font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:999px;background:#e6f0fd;color:#0058b0;border:1px solid #c5dbf7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  #rshBots .bot{width:74px;height:74px;margin:2px auto 0;display:block;position:relative}
  #rshBots .bot i{position:absolute;display:block;font-style:normal}
  #rshBots .bot .ant{left:35.5px;top:6px;width:3px;height:10px;background:var(--c);border-radius:2px}
  #rshBots .bot .ant::before{content:"";position:absolute;left:-2.1px;top:-4px;width:7.2px;height:7.2px;border-radius:50%;background:var(--c)}
  #rshBots .bot.f-working .ant::before{background:#ffd43b}
  #rshBots .bot .ear{top:28px;width:5px;height:13px;border-radius:2.5px;background:var(--c)}
  #rshBots .bot .ear.l{left:7px}#rshBots .bot .ear.r{left:62px}
  #rshBots .bot .head{left:13px;top:15px;width:48px;height:38px;border-radius:13px;background:var(--c)}
  #rshBots .bot .head::before{content:"";position:absolute;left:5px;top:6px;width:38px;height:27px;border-radius:9px;background:#fff}
  #rshBots .bot .torso{left:21px;top:56px;width:32px;height:13px;border-radius:6px;background:var(--c);opacity:.85}
  #rshBots .bot .eye{top:15px;width:8px;height:8px;border-radius:50%;background:#1d1d1f}
  #rshBots .bot .eye.l{left:11.5px}#rshBots .bot .eye.r{left:28.5px}
  #rshBots .bot .eye::after{content:"";position:absolute;left:4.3px;top:1.2px;width:2.6px;height:2.6px;border-radius:50%;background:#fff}
  #rshBots .bot.f-working .eye{top:16px;width:10px;height:5px;border-radius:2.5px}
  #rshBots .bot.f-working .eye.l{left:10px}#rshBots .bot.f-working .eye.r{left:28px}
  #rshBots .bot.f-working .eye::after,#rshBots .bot.f-asleep .eye::after{display:none}
  #rshBots .bot.f-asleep .eye{top:18px;width:9px;height:2.4px;border-radius:2px}
  #rshBots .bot.f-asleep .eye.l{left:11px}#rshBots .bot.f-asleep .eye.r{left:28px}
  #rshBots .bot .mouth{left:18px;top:28px;width:12px;height:2.4px;border-radius:2px;background:#1d1d1f}
  #rshBots .bot.f-happy .mouth{left:17px;top:26px;width:14px;height:6px;background:transparent;border:2.4px solid #1d1d1f;border-top:0;border-radius:0 0 9px 9px;box-sizing:border-box}
  #rshBots .bot.f-worried .mouth{left:18px;top:28px;width:12px;height:5px;background:transparent;border:2.4px solid #1d1d1f;border-bottom:0;border-radius:8px 8px 0 0;box-sizing:border-box}
  #rshBots .bot.f-asleep .mouth{left:21.6px;top:27px;width:4.8px;height:4.8px;border-radius:50%}
  #rshBots .bot .brow{display:none;top:10px;width:9px;height:2.2px;border-radius:2px;background:#1d1d1f}
  #rshBots .bot.f-worried .brow,#rshBots .bot.f-strict .brow{display:block}
  #rshBots .bot .brow.l{left:10.5px}#rshBots .bot .brow.r{left:28.5px}
  #rshBots .bot.f-worried .brow.l{transform:rotate(-18deg)}#rshBots .bot.f-worried .brow.r{transform:rotate(18deg)}
  #rshBots .bot.f-strict .brow.l{transform:rotate(18deg)}#rshBots .bot.f-strict .brow.r{transform:rotate(-18deg)}
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
  #rshBots .log-av{overflow:hidden}
  #rshBots .log-av .bot{margin:0;animation:none!important;opacity:1!important;transform:scale(.46);transform-origin:0 0}
  #rshBots .newvid{display:grid;gap:8px;margin-bottom:12px}
  #rshBots .nv{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;background:#eaf7ee;border:1px solid #b7e1c0;border-radius:12px;padding:10px 14px;font-size:13px;color:#14532d}
  #rshBots .dropz{border:2px dashed #b9c8dc;border-radius:14px;background:#fff;padding:12px 14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:12px;transition:border-color .15s,background .15s}
  #rshBots .dropz.over{border-color:#0071e3;background:#eef5ff}
  #rshBots .dropz select{font:inherit;font-size:12.5px;padding:7px 9px;border:1px solid #d2d2d7;border-radius:9px;background:#fff;color:#1d1d1f;max-width:260px}
  #rshBots .dropz .t{flex:1;min-width:200px;font-size:13px;line-height:1.4}
  #rshBots .flowlab{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#51607a;margin:0 0 8px}
  #rshBots .flowlab i{flex:1;height:0;border-top:2px dashed #b9c8dc}
  #rshBots .desk.flow::after{content:"→";position:absolute;right:-11px;top:74px;width:20px;height:20px;line-height:19px;border-radius:50%;background:#fff;border:1px solid #cfd9e6;color:#51607a;font-size:12px;font-weight:800;z-index:2;text-align:center}
  @media(max-width:1100px){#rshBots .desk.flow::after{display:none}}
  #rshBots .tabs{display:inline-flex;gap:4px;padding:4px;margin-top:16px;background:#ececf0;border-radius:12px;max-width:100%;overflow-x:auto}
  #rshBots .tabs button{border:0;background:transparent;color:#515154;font:inherit;font-size:13px;font-weight:700;padding:8px 16px;border-radius:9px;cursor:pointer;white-space:nowrap}
  #rshBots .tabs button.on{background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  #rshBots .tabs button:focus-visible{outline:2px solid #0071e3;outline-offset:1px}
  #rshBots .tcount{font-size:11px;font-weight:700;color:#6e6e73;margin-left:4px}
  #rshBots .planbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-top:12px}
  #rshBots .filters{display:flex;flex-wrap:wrap;gap:6px}
  #rshBots .filters button{border:1px solid #e5e5ea;background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;color:#1d1d1f;cursor:pointer}
  #rshBots .filters button.on{background:#1d1d1f;border-color:#1d1d1f;color:#fff}
  #rshBots details.camp>summary{list-style:none;cursor:pointer;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;padding:12px 14px;background:#fbfbfd}
  #rshBots details.camp>summary::-webkit-details-marker{display:none}
  #rshBots details.camp[open]>summary{border-bottom:1px solid #ececf0}
  #rshBots details.camp[open]>summary .nav-caret{transform:rotate(180deg)}
  #rshBots details.camp>summary strong{font-size:14px}
  #rshBots .sumr{display:inline-flex;gap:10px;align-items:center}
  #rshBots .sumr .chk{margin:0}
  #rshBots .offnote{margin-top:18px;padding:12px 14px;border:1px dashed #c7c7cc;border-radius:12px;font-size:13px}
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
  // The team's own Kit Animator artifact: records a 4-second 1080×1920 clip of a team kit turning, for the mid-roll of a video.
  const KIT_SPORTS = ['soccer', 'basketball', 'volleyball', 'baseball', 'softball', 'football', 'flag football', 'lacrosse', 'ice hockey', 'field hockey', 'wrestling', 'mma', 'esports'];
  const kitSport = p => { const sp = String(p.sport || '').toLowerCase(); return KIT_SPORTS.find(k => sp.includes(k.split(' ')[0])) || ''; };
  // The team's video editor: a Claude Code session named "RSH SPORTS" that edits videos from a pasted script and prompt.
  function editJob(p) {
    const type = String(p.postType || '').toLowerCase(), secs = /story/.test(type) ? '10 to 15' : '15 to 20';
    return [`EDIT JOB — ${p.title}`,
      `Campaign for ${p.platform || 'social media'}, planned ${p.date || 'no date yet'}. Sport: ${p.sport || 'not set'}. Audience: ${p.audience || 'not set'}. Goal: ${p.goal || 'not set'}.`,
      `Make one vertical 9:16 video, 1080×1920, ${secs} seconds, MP4 (H.264), under 30 MB.`,
      `SCRIPT\nHook (first 2 seconds, on screen): ${sentence(p.hook)}\n${p.onImageText ? 'On-screen text: ' + sentence(p.onImageText) + '\n' : ''}Closing line: ${String(p.cta || '').trim() || 'Follow RSH Sports'}`,
      p.visualConcept ? `VISUAL DIRECTION\n${String(p.visualConcept).trim()}` : '',
      `RULES\n${RULES} RSH branding only in the corner watermark and the end card.`,
      `DELIVER\nThe finished MP4 named ${slug(p.title) || 'campaign'}.mp4, plus a one-line note of anything you could not do.`].filter(Boolean).join('\n\n');
  }
  const RULES = 'Realistic, natural light. Sport-correct gear and setting. No third-party logos, brand marks or wordmarks on shoes, socks, apparel, bags or equipment. No real, identifiable people. Suitable for parents, coaches and athletes.';
  function imagePrompt(p) {
    const type = String(p.postType || '').toLowerCase(), base = String(p.visualPrompt || p.visualConcept || '').trim();
    return [base || `A premium, photorealistic ${p.sport || 'sports'} photo for ${p.platform || 'social media'}: ${sentence(p.hook)}`,
      /carousel/.test(type) ? 'Make this a matching set of 3 to 5 images with the same athlete, setting and light: 1) a cover with clear space for the headline, 2 to 4) supporting moments, last) a calm closing frame.' : '',
      `Aspect ratio ${p.aspectRatio || '4:5'}. Leave clean space for text; do not put any text in the image.`, base ? '' : RULES, app().logoRule ? 'RSH logo rule: ' + app().logoRule() : '', app().negativePrompt ? 'Negative prompt: ' + app().negativePrompt() : ''].filter(Boolean).join('\n\n');
  }
  function videoBrief(p) {
    return [`Create a 10 to 15 second vertical 9:16 video for ${p.platform || 'social media'} about ${p.sport || 'the sport'}.`,
      p.visualConcept ? `Scene: ${String(p.visualConcept).trim()}` : '',
      `Shots: 1) Opening, first 2 seconds: the moment that matches the hook “${sentence(p.hook)}”. 2) Middle: the main action, one clear movement, steady framing. 3) Ending, last 2 seconds: hold on a clean frame with room for the call to action.`,
      'No text or captions in the footage; text is added in editing. No music with lyrics.', RULES, app().logoRule ? 'RSH logo rule: ' + app().logoRule() : '', app().negativePrompt ? 'Avoid: ' + app().negativePrompt() : ''].filter(Boolean).join('\n\n');
  }

  /* ---------- Reel: automatic hand-off to the video editor ----------
   * When a campaign needs a video and has none, Reel writes an edit job, sends it to the team's
   * "RSH SPORTS" Claude Code session, and attaches the finished video when that session reports
   * back. Nobody copies or pastes. The job travels through the viewer's own Claude connection
   * (asked for once); the finished file returns through the artifact's file store and a small
   * record in collection `editJobs`. One job per campaign, at most three new jobs per run.
   */
  const EDITOR_SESSION = 'session_01EomsW2MJWVwshJ5YMhGGBP', APP_URL = 'https://claude.ai/artifact/YR8cQvQaSPNMVNxngvihpz', REMOTE = 'Claude Code Remote';
  const needsVideo = p => { const n = assetNeeds(p).needs[0]; return /reel|video/i.test(p.postType || '') && n && n.state === 'miss'; };
  const RETURN_STEPS = id => `WHEN THE VIDEO IS FINISHED, return it to the app so nobody has to move it by hand:\n1. If the MP4 is 19 MB or smaller, upload it to the artifact ${APP_URL} as one asset (Artifact tool: action publish, url set to that artifact, asset true, file_path the MP4) and note the 32-character asset id. If it is larger, split it into 16 MB pieces (split -b 16m), upload each piece the same way with content type video/mp4, and note each piece's asset id with its start and end byte offsets.\n2. Record it with the ArtifactData tool on the same artifact: read collection "editJobs", document "${id}" (action get) to learn its version, then action update with if_version and data {"status":"done","assetId":"<the asset id, or the first piece's id>","parts":[{"id":"<piece id>","start":0,"end":16777216}, ...] (only when split),"mime":"video/mp4","bytes":<file size>,"name":"<file name>.mp4","finishedAt":"<current time, ISO 8601>"}.\nIf you cannot finish, update that document with {"status":"failed","reason":"<one sentence>"} instead.\nDo not change anything else in that artifact, and do not publish or schedule anything.`;
  function handoff(p, j) {
    if (j && j.source === 'zip') {
      let files = []; try { files = JSON.parse(j.manifest || '[]'); } catch (_) {}
      const list = files.map((f, n) => `${n + 1}. ${f.name} (${f.mime}, ${Math.round(f.bytes / 1024)} KB${f.encoding === 'base64' ? ', stored base64-encoded: decode after joining' : ''}) asset${f.parts.length > 1 ? 's in order' : ''}: ${f.parts.map(x => x.id).join(' + ')}`).join('\n');
      return `[RSH Sports Marketing OS: automatic edit job from a zip. Sent by the app on behalf of the team.]\n\nEDIT JOB — ${p.title}\nCampaign for ${p.platform || 'social media'}, planned ${p.date || 'no date yet'}. Sport: ${p.sport || 'not set'}.\n\nThe team uploaded a zip, "${j.zipName}", with every file for this video. Edit the full video exactly as the script says, using these files.\n\nGET THE FILES: for each asset id below, use the Artifact tool with action read, url ${APP_URL}, and path set to the asset id; it saves the file locally. Where a file has several asset ids, fetch them in order and join them (cat). Where it says base64, decode after joining (base64 -d).\n${list}\n\nSCRIPT${j.scriptName ? ' (' + j.scriptName + ')' : ''}:\n${j.script || 'No script file was found in the zip. Follow the campaign: hook "' + sentence(p.hook) + '".'}${j.scriptCut ? '\n[The script is longer than shown; the full file is in the list above.]' : ''}\n\nOUTPUT unless the script says otherwise: one vertical 9:16 video, 1080×1920, MP4 (H.264). RULES: ${RULES} RSH branding only in the corner watermark and the end card.\n\n${RETURN_STEPS(p.id)}`;
    }
    return `[RSH Sports Marketing OS: automatic edit job. Sent by the app on behalf of the team.]\n\n${editJob(p).replace('under 30 MB', 'under 19 MB if possible')}\n\n${RETURN_STEPS(p.id)}`;
  }
  function queueEdits(campaigns) {
    if (!settings.autoEdit || !db) return; let added = 0;
    for (const p of campaigns) { if (added >= 3) break; if (jobs[p.id] || !needsVideo(p)) continue; jobs[p.id] = { postId: p.id, title: String(p.title || '').slice(0, 120), status: 'queued', queuedAt: new Date().toISOString() }; added++; db.doc('editJobs/' + p.id).set(jobs[p.id]).catch(() => {}); }
    if (added) dispatch();
  }
  async function dispatch() {
    if (dispatching || !db || editorState === 'unavailable') return; dispatching = true;   // a page that was refused once does not keep retrying
    try {
      const queued = Object.values(jobs).filter(j => j.status === 'queued'); if (!queued.length) return;
      const mcp = await use('mcp'); if (!mcp) { editorState = 'unavailable'; return; }
      for (const j of queued) {
        const p = (app().data().posts || []).find(x => x.id === j.postId); if (!p) continue;
        try { await mcp.callTool(REMOTE, 'send_message', { session_id: EDITOR_SESSION, message: handoff(p, j) }); editorState = 'ok'; j.status = 'sent'; j.sentAt = new Date().toISOString(); await db.doc('editJobs/' + j.postId).set(j); }
        catch (e) { editorState = 'unavailable'; j.lastError = String((e && e.code) || 'send_failed'); try { await db.doc('editJobs/' + j.postId).set(j); } catch (_) {} break; }
      }
    } finally { dispatching = false; render(); }
  }
  // Pick up what the editor sent back and attach it to its campaign.
  async function collect() {
    if (!db) return; let changed = false;
    try { const q = await db.collection('editJobs').get(); const next = {}; for (const s of q.docs) { const d = s.data(); if (d && d.postId) next[d.postId] = { ...d }; } jobs = next; } catch (_) { return; }
    for (const j of Object.values(jobs)) {
      if (j.status !== 'done' || !j.assetId) continue;
      const prev = j.attachedAssetId && j.attachedAssetId !== j.assetId ? j.attachedAssetId : undefined;   // a revision replaces the cut attached before
      const ok = app().attachAsset(j.postId, { id: j.assetId, mime: j.mime || 'video/mp4', bytes: j.bytes, name: j.name, parts: Array.isArray(j.parts) && j.parts.length > 1 ? j.parts : undefined, replaces: prev });
      if (ok) { j.attachedAssetId = j.assetId; if (prev) j.revision = (Number(j.revision) || 1) + 1; }
      j.status = ok ? 'attached' : 'failed'; if (ok) { j.readyAt = new Date().toISOString(); j.reviewed = false; } if (!ok) j.reason = 'The returned file could not be attached (wrong type, or the campaign already has 10 files).'; j.attachedAt = new Date().toISOString(); changed = true;
      try { await db.doc('editJobs/' + j.postId).set(j); } catch (_) {}
    }
    if (Object.values(jobs).some(j => j.status === 'queued')) dispatch();
    render(); notify();
  }

  const freshVideos = () => Object.values(jobs).filter(j => j.status === 'attached' && !j.reviewed).sort((a, b) => String(b.readyAt).localeCompare(String(a.readyAt)));
  async function watch(postId) {
    const j = jobs[postId]; if (!j) return;
    app().openReview(postId, j.assetId);
    if (!j.reviewed) { j.reviewed = true; j.reviewedAt = new Date().toISOString(); try { await db.doc('editJobs/' + postId).set(j); } catch (_) {} }
    render(); notify();
  }
  const listeners = []; const notify = () => { for (const f of listeners) { try { f(); } catch (_) {} } };

  /* ---------- Zip jobs: one zip with the script and every file for a video ---------- */
  const isZip = f => /\.zip$/i.test(f.name || '') || /zip/.test(f.type || '');
  let zipLib = null;
  function loadZipLib() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (zipLib) return zipLib;
    zipLib = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; sc.onload = () => window.JSZip ? res(window.JSZip) : rej(new Error('zip reader missing')); sc.onerror = () => { zipLib = null; rej(new Error('The zip reader could not be loaded.')); }; document.head.appendChild(sc); });
    return zipLib;
  }
  const NATIVE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', srt: 'text/plain', vtt: 'text/plain' };
  const OTHER = { mov: 'video/quicktime', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', heic: 'image/heic', psd: 'image/vnd.adobe.photoshop', ai: 'application/postscript', ttf: 'font/ttf', otf: 'font/otf', zip: 'application/zip' };
  const ZIP_MAX = 400e6, CHUNK = 16 * 1024 * 1024;
  function b64(bytes) { let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(out); }
  async function storeFile(assets, name, bytes) {
    const ext = (name.split('.').pop() || '').toLowerCase(), native = NATIVE[ext], parts = [];
    let data, type, encoding;
    if (native && !(native.startsWith('text/') && /[\x00]/.test(new TextDecoder().decode(bytes.subarray(0, 512))))) { data = bytes; type = native === 'image/gif' ? 'image/gif' : native; encoding = 'raw'; }
    else { data = new TextEncoder().encode(b64(bytes)); type = 'text/plain'; encoding = 'base64'; }
    for (let start = 0; start < data.length || start === 0; start += CHUNK) {
      const end = Math.min(data.length, start + CHUNK);
      const r = await assets.upload(new Blob([data.subarray(start, end)], { type }), { type });
      parts.push({ id: r.id, start, end }); if (end >= data.length) break;
    }
    return { name, mime: native || OTHER[ext] || 'application/octet-stream', bytes: bytes.length, encoding, parts };
  }
  async function zipJob(file, postId) {
    const p = (app().data().posts || []).find(x => x.id === postId);
    if (!p) { drop.msg = 'Pick the campaign this video is for, then drop the zip again.'; return render(); }
    if (file.size > ZIP_MAX) { drop.msg = `The zip is ${Math.round(file.size / 1e6)} MB; the limit here is 400 MB. Split it into two jobs or shorten the footage.`; return render(); }
    const assets = await use('assets'); if (!assets) { drop.msg = 'Storing files is not available in this view. Open the app from the owner account.'; return render(); }
    drop.busy = true; drop.msg = 'Opening the zip…'; render();
    try {
      const JSZip = await loadZipLib(), zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name));
      if (!entries.length) throw new Error('The zip is empty.');
      if (entries.length > 80) throw new Error(`The zip holds ${entries.length} files; the limit is 80.`);
      const textual = entries.filter(e => /\.(txt|md)$/i.test(e.name)), scriptEntry = textual.find(e => /script/i.test(e.name.split('/').pop())) || textual[0];
      let script = '', scriptCut = false;
      if (scriptEntry) { script = (await scriptEntry.async('string')).replace(/\r\n/g, '\n').trim(); if (script.length > 30000) { script = script.slice(0, 30000); scriptCut = true; } }
      const manifest = []; let done = 0, total = 0;
      for (const e of entries) {
        drop.msg = `Storing ${++done} of ${entries.length}: ${e.name.split('/').pop()}…`; render();
        const bytes = await e.async('uint8array'); total += bytes.length;
        if (total > ZIP_MAX) throw new Error('The unpacked files are larger than 400 MB.');
        manifest.push(await storeFile(assets, e.name, bytes));
      }
      const job = { postId: p.id, title: String(p.title || '').slice(0, 120), status: 'queued', queuedAt: new Date().toISOString(), source: 'zip', zipName: String(file.name || 'files.zip').slice(0, 120), files: manifest.length, manifest: JSON.stringify(manifest), script, scriptCut, scriptName: scriptEntry ? scriptEntry.name : '' };
      jobs[p.id] = job;
      if (db) await db.doc('editJobs/' + p.id).set(job);
      const skipped = !scriptEntry ? ' No .txt or .md script was found, so Reel will follow the campaign brief.' : '';
      drop.msg = `Stored ${manifest.length} file${manifest.length === 1 ? '' : 's'} from “${job.zipName}”. Reel is sending the job to the RSH SPORTS editor.` + skipped;
      wake = `Zip for “${cut(p.title, 40)}” received. Reel took the job.`;
    } catch (e) { drop.msg = 'The zip could not be used: ' + ((e && e.message) || 'unknown problem') + ((e && e.code) ? ' [' + e.code + ']' : ''); }
    drop.busy = false; render(); dispatch();
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
    queueEdits(inRange);
    const jl = Object.values(jobs), jq = jl.filter(j => j.status === 'queued' || j.status === 'sent').length;
    log = [['reel', !settings.autoEdit ? 'Automatic editing is off.' : jq ? `${jq} edit job${jq === 1 ? '' : 's'} with the RSH SPORTS editor${jl.filter(j => j.status === 'attached').length ? `, ${jl.filter(j => j.status === 'attached').length} finished and attached` : ''}.` : 'No video is waiting to be edited.'], ['pixel', !inRange.length ? 'No campaigns in the window.' : needing.length ? `${needing.length} of ${inRange.length} campaigns need files. Next up: “${cut(needing[0].title, 40)}” needs ${assetNeeds(needing[0]).needs.filter(n => n.state === 'miss').map(n => n.label).join(' and ')}. Briefs and prompts are in the plan.` : `All ${inRange.length} campaigns have their files.`], ['quill', items.length ? `${items.length} captions for ${inRange.length} campaign${inRange.length === 1 ? '' : 's'}. First one: ${sample}` : 'No campaigns in the window, so nothing to write.'],
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
  const TEAM = [['pixel', 'Pixel', 'Asset Bot', '#db2777'], ['reel', 'Reel', 'Video Editor', '#b45309'], ['quill', 'Quill', 'Caption Bot', '#0071e3'], ['tempo', 'Tempo', 'Scheduler Bot', '#7c3aed'], ['ref', 'Ref', 'Manager Bot', '#d9480f'], ['courier', 'Courier', 'Posting Bot', '#0f9d7a'], ['owl', 'Night Owl', 'Daily run', '#64748b']];
  // Bot faces are drawn with plain page elements and CSS (no SVG): Claude's sharing review only
  // accepts JPEG, PNG, GIF or WebP images, and a version containing SVG cannot be opened by invited people.
  function botSvg(color, face) {
    return `<span class="bot f-${face}" style="--c:${color}" aria-hidden="true"><i class="ant"></i><i class="ear l"></i><i class="ear r"></i><i class="head"><i class="brow l"></i><i class="brow r"></i><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></i><i class="torso"></i></span>`;
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
    const js = Object.values(jobs), active = js.filter(j => j.status === 'sent').length, jWait = js.filter(j => j.status === 'queued').length, done = js.filter(j => j.status === 'attached').length, failed = js.filter(j => j.status === 'failed').length;
    out.reel = !settings.autoEdit ? ['off', 'Paused', 'asleep', 'Automatic editing is turned off in Setup.']
      : jWait ? ['plain', 'Waiting', 'neutral', `${jWait} job${jWait === 1 ? ' is' : 's are'} packed and waiting to be picked up for the RSH SPORTS editor. This page can’t message the editor itself; a Claude session passes the job on.`]
      : failed ? ['bad', 'Stuck', 'worried', `${failed} edit${failed === 1 ? '' : 's'} came back with a problem. ${active ? active + ' still in the editor.' : ''}`]
      : active || jWait ? ['busy', 'Editing', 'working', `${active + jWait} video${active + jWait === 1 ? '' : 's'} with the RSH SPORTS editor. I attach each one when it comes back.`]
      : done ? ['good', 'Proud', 'happy', `${done} edited video${done === 1 ? '' : 's'} came back and ${done === 1 ? 'is' : 'are'} attached.`]
      : ['plain', 'Ready', 'neutral', 'When a campaign needs a video, I send the job to the RSH SPORTS editor and attach what comes back.'];
    out.pixel = !all.length ? ['plain', 'Idle', 'neutral', 'No campaigns to prepare assets for.']
      : missing ? ['bad', 'Busy', 'worried', `${missing} of ${all.length} campaign${all.length === 1 ? '' : 's'} still need${missing === 1 ? 's' : ''} files. I wrote a brief and a ready-to-paste prompt for each.`]
      : ['good', 'Happy', 'happy', `Every campaign has the files it needs.`];
    out.owl = ['off', 'Asleep', 'asleep', 'Not switched on. I would run the whole team every morning.'];
    const task = { pixel: 'Writing asset briefs…', reel: 'Sending edit jobs…', quill: 'Writing captions…', tempo: 'Picking times…', ref: 'Checking every post…' };
    if (phase && out[phase]) out[phase] = ['busy', 'Working', 'working', task[phase]];
    return out;
  }
  function office() {
    const t = team();
    const posts = (app().data().posts || []).filter(p => p.date).sort((a, b) => a.date.localeCompare(b.date)), need = posts.filter(p => app().track(p).stage === 'media' || app().track(p).stage === 'brief');
    const pick = need.length ? need : posts;
    return `<div class="office" aria-label="The bot team"><div class="office-top"><span class="sign">The office</span><span class="small" data-bot-wake>${wake ? esc(wake) : 'Drop a file below, or attach one in Create, and the team starts by itself.'}</span></div>
      ${freshVideos().length ? `<div class="newvid" role="status">${freshVideos().map(j => `<div class="nv"><span><strong>▶ ${j.revision > 1 ? 'Revised video (revision ' + j.revision + ')' : 'New video'} ready to review:</strong> ${esc(j.title)}<span class="small"> · came back ${esc(new Date(j.readyAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} and is attached to the campaign</span></span><button type="button" class="btn smallbtn" data-bot-watch="${esc(j.postId)}">Watch and review</button></div>`).join('')}</div>` : ''}
      <div class="dropz" data-bot-drop><div class="t"><strong>Start here: drop a photo, a video, or a zip for a full video</strong><br><span class="small" data-bot-dropmsg>${drop.msg ? esc(drop.msg) : 'Pick the campaign, then drop a file here or choose one. A photo or video is attached as in Create. A .zip with the script and all the clips, photos and music goes to Reel, who has the RSH SPORTS editor make the full video and attaches it here.'}</span></div>
        <select aria-label="Campaign to attach the file to" data-bot-dropcamp>${pick.length ? pick.map(p => `<option value="${esc(p.id)}">${esc(p.date.slice(5))} · ${esc(cut(p.title, 38))}</option>`).join('') : '<option value="">No campaigns yet</option>'}</select>
        <button type="button" class="btn ghost smallbtn" data-bot-choose ${drop.busy || !pick.length ? 'disabled' : ''}>${drop.busy ? 'Working…' : 'Choose file'}</button><input type="file" data-bot-file accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.zip,application/zip" multiple hidden></div>
      <div class="flowlab"><span>Campaigns and files</span><i></i><span>asset briefs</span><i></i><span>video edits</span><i></i><span>captions</span><i></i><span>times</span><i></i><span>checks</span><i></i><span>Metricool</span></div>
      <div class="desks">${TEAM.map(([id, name, role, color], n) => { const [tone, mood, face, line] = t[id]; const state = face === 'asleep' ? 'asleep' : face === 'working' ? 'working' : 'idle';
        return `<div class="desk ${state}${n < 5 ? ' flow' : ''}" data-bot="${id}"><div class="holo">${state === 'working' ? `<span>${esc(line)}</span>` : ''}</div>${state === 'asleep' ? '<span class="zz" aria-hidden="true">z z</span>' : ''}${botSvg(color, face)}<h4>${esc(name)}</h4><div class="role">${esc(role)}</div><span class="mood ${tone}">${esc(mood)}</span><div class="say">${state === 'working' ? 'On it.' : esc(line)}</div></div>`; }).join('')}</div></div>`;
  }
  // Attach dropped files through the app's own attach step in Create, so every rule there still applies.
  async function attach(files, postId) {
    const z = files.find(isZip); if (z) return zipJob(z, postId);
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
    for (const b of ['pixel', 'reel', 'quill', 'tempo', 'ref']) { phase = b; render(); await pause(quick ? 60 : 850); }
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
    // ---- Plan: one collapsible block per campaign, grouped by day ----
    const byPost = new Map(); for (const it of items) { if (!byPost.has(it.postId)) byPost.set(it.postId, []); byPost.get(it.postId).push(it); }
    const camps = [...byPost.keys()].map(id => { const p = posts.find(x => x.id === id); if (!p) return null; const mine = byPost.get(id), an = assetNeeds(p), ok = mine.filter(x => x.ready).length; return { p, mine, an, ok, state: an.missing ? 'files' : ok === mine.length ? 'ready' : 'held' }; }).filter(Boolean);
    const count = k => camps.filter(c => c.state === k).length;
    if (filter !== 'all' && !count(filter)) filter = 'all';
    const shown = camps.filter(c => filter === 'all' || c.state === filter);
    let list = '';
    if (!ran) list = `<div class="empty"><strong>The bots have not run yet.</strong><br>Press “Run everything”. They read your planned campaigns for the next ${settings.days} days and prepare a caption and a time for each channel. Nothing in your campaigns, calendar or Metricool is changed.</div>`;
    else if (!items.length) list = `<div class="empty">No campaigns are planned in the next ${settings.days} days, so there is nothing to prepare.</div>`;
    else {
      let lastDay = '';
      for (const c of shown) {
        const p = c.p, an = c.an;
        if (p.date !== lastDay) { lastDay = p.date; list += `<div class="day">${esc(new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</div>`; }
        const badge = c.state === 'files' ? '<span class="chk stop">Needs files</span>' : c.state === 'ready' ? '<span class="chk ok">✓ Ready</span>' : '<span class="chk warn">Held back</span>';
        list += `<details class="camp" data-bot-camp="${esc(p.id)}" ${openCamps.has(p.id) ? 'open' : ''}><summary><span><strong>${esc(p.title)}</strong><span class="small"> · ${esc(p.platform || '')} · ${c.mine.length} channel post${c.mine.length === 1 ? '' : 's'}</span></span><span class="sumr">${badge}<span class="small">${c.ok} of ${c.mine.length} ready</span><span class="nav-caret">⌄</span></span></summary>` + `<div class="assetrow"><div><strong>Files needed</strong> <span class="small">· ${an.files} attached</span><div>${an.needs.map(n => `<span class="need ${n.state}">${n.state === 'have' ? '✓ ' : ''}${esc(n.label)}${n.detail ? ' (' + esc(n.detail) + ')' : ''}</span>`).join('')}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn ghost smallbtn" data-bot-brief="${esc(p.id)}">Copy full brief for AI</button><button type="button" class="btn ghost smallbtn" data-bot-prompt="image" data-bot-post="${esc(p.id)}">Copy image prompt</button><button type="button" class="btn ghost smallbtn" data-bot-prompt="video" data-bot-post="${esc(p.id)}">Copy video brief</button>${jobs[p.id] ? '' : `<button type="button" class="btn smallbtn" data-bot-askvideo="${esc(p.id)}">Have Reel make a video</button>`}<button type="button" class="btn ghost smallbtn" data-bot-editor="${esc(p.id)}">Copy edit job</button></div>${(() => { const j = jobs[p.id]; return j ? `<div class="small" style="flex-basis:100%"><strong>Video editor${j.source === 'zip' ? ` (from “${esc(j.zipName)}”, ${j.files} files)` : ''}:</strong> ${j.status === 'queued' ? 'job waiting to be sent to RSH SPORTS.' : j.status === 'sent' ? 'job sent to RSH SPORTS ' + esc(new Date(j.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '. The video is attached here when it comes back.' : j.status === 'attached' ? `edited video${j.revision > 1 ? ' (revision ' + j.revision + ')' : ''} came back and is attached. <button type="button" class="btn smallbtn" data-bot-watch="${esc(p.id)}" style="padding:3px 10px;margin-left:4px">Watch and review</button>` : j.status === 'failed' ? 'the edit did not finish. ' + esc(j.reason || '') : 'video received, attaching…'}</div>` : needsVideo(p) && settings.autoEdit ? '<div class="small" style="flex-basis:100%"><strong>Video editor:</strong> this campaign needs a video; Reel sends the job on the next run.</div>' : ''; })()}${kitSport(p) ? `<div class="small" style="flex-basis:100%">Kit clip: open your RSH Kit Animator artifact, choose <strong>${esc(kitSport(p).replace(/^./, c => c.toUpperCase()))}</strong>, set the team and colours, record the 4-second clip, then drop the saved MP4 on the Office tab with this campaign selected.</div>` : ''}</div>`;
        for (const it of c.mine) {
          const key = it.postId + '|' + it.channel, open = openItem === key;
          list += `<div class="item" data-bot-item="${esc(key)}"><div><strong>${esc(NAME[it.channel])}</strong><div class="small">${it.caption.length} characters</div></div>
          <div><input type="time" value="${esc(it.time)}" aria-label="Time for ${esc(NAME[it.channel])} post of ${esc(p.title)}" data-bot-time="${esc(key)}">${settings.labels && settings.labels[it.time] ? `<div class="small" style="margin-top:3px">${esc(settings.labels[it.time])}</div>` : ''}</div>
          <div>${open ? `<textarea rows="7" data-bot-cap="${esc(key)}" aria-label="Caption for ${esc(NAME[it.channel])}">${esc(it.caption)}</textarea>` : `<div class="cap short">${esc(it.caption)}</div>`}<div>${it.checks.map(c => `<span class="chk ${c[0]}">${c[0] === 'ok' ? '✓ ' : ''}${esc(c[1])}</span>`).join('')}</div></div>
          <div style="display:flex;flex-direction:column;gap:6px">${open ? `<button type="button" class="btn smallbtn" data-bot-savecap="${esc(key)}">Save</button><button type="button" class="btn ghost smallbtn" data-bot-close>Cancel</button>` : `<button type="button" class="btn ghost smallbtn" data-bot-edit="${esc(key)}">Edit</button><button type="button" class="btn ghost smallbtn" data-bot-copy="${esc(key)}">Copy</button>`}</div></div>`;
        }
        list += '</details>';
      }
    }
    const tabBtn = (id, label) => `<button type="button" role="tab" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-bot-tab="${id}">${label}</button>`;
    host.innerHTML = `
      <div class="card">
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start">
          <div><div class="eyebrow">24/7 BOTS</div><h2 style="margin-top:6px">Turn planned campaigns into ready-to-post items</h2>
          <p style="margin-top:6px">The bots read your campaigns and prepare a caption and a time for every channel. They change nothing in your campaigns, calendar or Metricool.</p></div>
          <button type="button" class="btn" data-bot-run ${busy ? 'disabled' : ''}>${busy ? 'Running…' : '▶ Run everything'}</button>
        </div>
        <div class="tabs" role="tablist">${tabBtn('office', 'Office')}${tabBtn('plan', `Plan${ran && items.length ? ` <span class="tcount">${ready} of ${items.length} ready</span>` : ''}`)}${tabBtn('setup', 'Setup')}</div>
        ${note ? `<div class="hint" role="status" style="margin-top:12px">${esc(note)}</div>` : ''}
      </div>
      <div data-bot-panel="office" ${tab === 'office' ? '' : 'hidden'}>
        <div class="card" style="margin-top:16px">
        ${office()}
        ${log.length ? `<div class="log" role="status"><div class="log-h"><strong>Bot log</strong><span class="small">latest run${plan ? ' · ' + esc(new Date(plan.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) : ''}</span></div>${log.map(l => { const m = TEAM.find(t => t[0] === l[0]) || TEAM[0]; return `<div class="log-row"><span class="log-av">${botSvg(m[3], l[0] === 'courier' ? 'asleep' : 'happy')}</span><div><strong>${esc(m[1])}</strong> <span class="small">${esc(m[2])}</span><div>${esc(l[1])}</div></div></div>`; }).join('')}</div>` : ''}
        </div>
      </div>
      <div data-bot-panel="plan" ${tab === 'plan' ? '' : 'hidden'}>
        <div class="card" style="margin-top:16px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:baseline"><h2 style="font-size:18px">The plan</h2><span class="small">${ran ? `${ready} of ${items.length} posts ready · prepared ${esc(new Date(plan.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}` : 'Not prepared yet'}</span></div>
        ${ran && items.length ? `<p class="small" style="margin-top:6px">Open a campaign to see its files, prompts and the post prepared for each channel. A post is ready only when its campaign has both approvals and every check passes.</p>
        <div class="planbar"><div class="filters"><button type="button" data-bot-filter="all" class="${filter === 'all' ? 'on' : ''}">All ${camps.length}</button>${count('files') ? `<button type="button" data-bot-filter="files" class="${filter === 'files' ? 'on' : ''}">Needs files ${count('files')}</button>` : ''}${count('held') ? `<button type="button" data-bot-filter="held" class="${filter === 'held' ? 'on' : ''}">Held back ${count('held')}</button>` : ''}${count('ready') ? `<button type="button" data-bot-filter="ready" class="${filter === 'ready' ? 'on' : ''}">Ready ${count('ready')}</button>` : ''}</div>
        <button type="button" class="btn ghost smallbtn" data-bot-expand>${shown.length && shown.every(c => openCamps.has(c.p.id)) ? 'Collapse all' : 'Expand all'}</button></div>` : ''}
        ${list}
        </div>
      </div>
      <div data-bot-panel="setup" ${tab === 'setup' ? '' : 'hidden'}>
        <div class="card" style="margin-top:16px">
        <h2 style="font-size:18px">Setup</h2><p class="small" style="margin-top:6px">Changes apply the next time the bots run.</p>
        <div class="setup">
          <div><label class="h">Also post each campaign to</label><div class="chs">${CHANNELS.map(c => `<label><input type="checkbox" data-bot-ch="${c[0]}" ${settings.channels.includes(c[0]) ? 'checked' : ''}> ${esc(c[1])}</label>`).join('')}</div><div class="small" style="margin-top:4px">A campaign always goes to its own channel as well.</div></div>
          <div><label class="h" for="rshBotTimes">Posting times, US Eastern</label><input type="text" id="rshBotTimes" value="${esc(settings.times.map(t => t + (settings.labels && settings.labels[t] ? ' ' + settings.labels[t] : '')).join(', '))}" size="38" placeholder="12:00 lunch break, 18:00 after practice"><div class="small" style="margin-top:4px">24-hour time, then an optional name. Separate slots with commas.</div></div>
          <div><label class="h" for="rshBotDays">Look ahead</label><select id="rshBotDays">${[7, 14, 21, 30].map(n => `<option value="${n}" ${settings.days === n ? 'selected' : ''}>${n} days</option>`).join('')}</select></div>
        </div>
        <div style="margin-top:16px"><label style="display:inline-flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" id="rshBotAutoEdit" ${settings.autoEdit ? 'checked' : ''} style="margin-top:2px"><span><strong>Send video jobs to the RSH SPORTS editor automatically</strong><br><span class="small">When a Reel or video campaign has no video, Reel sends the edit job to your RSH SPORTS session and attaches the finished MP4. At most three new jobs per run. This uses your Claude usage in that session.</span></span></label></div>
        <div class="offnote"><strong>Not switched on yet</strong><div class="small" style="margin-top:4px">Courier (sending ready posts to Metricool as drafts for review) and Night Owl (running the team every day by itself). Each needs your explicit go-ahead.</div></div>
        </div>
      </div>`;
  }

  function find(key) { return ((plan && plan.items) || []).find(i => i.postId + '|' + i.channel === key); }
  async function onClick(e) {
    const tb = e.target.closest('[data-bot-tab]'); if (tb) { tab = tb.dataset.botTab; return render(); }
    const fl = e.target.closest('[data-bot-filter]'); if (fl) { filter = fl.dataset.botFilter; return render(); }
    if (e.target.closest('[data-bot-expand]')) { const ids = [...document.querySelectorAll('#rshBots details.camp')].map(d => d.dataset.botCamp), all = ids.length && ids.every(i => openCamps.has(i)); for (const i of ids) { if (all) openCamps.delete(i); else openCamps.add(i); } return render(); }
    if (e.target.closest('[data-bot-choose]')) { const f = document.querySelector('#rshBots [data-bot-file]'); if (f) f.click(); return; }
    if (e.target.closest('[data-bot-run]')) { if (busy) return; return work('You pressed Run everything.'); }
    const ed = e.target.closest('[data-bot-edit]'); if (ed) { openItem = ed.dataset.botEdit; return render(); }
    if (e.target.closest('[data-bot-close]')) { openItem = null; return render(); }
    const sv = e.target.closest('[data-bot-savecap]');
    if (sv) { const it = find(sv.dataset.botSavecap), ta = document.querySelector(`#rshBots [data-bot-cap="${CSS.escape(sv.dataset.botSavecap)}"]`); if (it && ta) { it.caption = ta.value; it.edited = true; } openItem = null; await save(); return render(); }
    const wv = e.target.closest('[data-bot-watch]'); if (wv) return watch(wv.dataset.botWatch);
    const av = e.target.closest('[data-bot-askvideo]');
    if (av) { const q = (app().data().posts || []).find(x => x.id === av.dataset.botAskvideo); if (q && db && !jobs[q.id]) { jobs[q.id] = { postId: q.id, title: String(q.title || '').slice(0, 120), status: 'queued', queuedAt: new Date().toISOString(), asked: true }; try { await db.doc('editJobs/' + q.id).set(jobs[q.id]); } catch (_) {} render(); dispatch(); } return; }
    const edl = e.target.closest('[data-bot-editor]');
    if (edl) { const q = (app().data().posts || []).find(x => x.id === edl.dataset.botEditor); if (q) { try { navigator.clipboard.writeText(editJob(q)).then(() => { edl.textContent = 'Copied'; setTimeout(() => { edl.textContent = 'Copy edit job'; }, 1800); }, () => { edl.textContent = 'Copy failed'; }); } catch (_) {} } return; }
    const fb = e.target.closest('[data-bot-brief]');
    if (fb) { const text = app().aiBrief ? app().aiBrief(fb.dataset.botBrief) : '', done = ok => { fb.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { fb.textContent = 'Copy full brief for AI'; }, 1600); }; try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); } return; }
    const pr = e.target.closest('[data-bot-prompt]');
    if (pr) { const q = (app().data().posts || []).find(x => x.id === pr.dataset.botPost); if (!q) return; const text = pr.dataset.botPrompt === 'video' ? videoBrief(q) : imagePrompt(q), old = pr.textContent, done = ok => { pr.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { pr.textContent = old; }, 1600); }; try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); } return; }
    const cp = e.target.closest('[data-bot-copy]');
    if (cp) { const it = find(cp.dataset.botCopy); if (!it) return; const text = `${NAME[it.channel]} · ${it.date} ${clock(it.time)} US Eastern\n\n${it.caption}`, done = ok => { cp.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { cp.textContent = 'Copy'; }, 1600); }; try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); } }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches('[data-bot-file]')) { const files = [...t.files], camp = document.querySelector('#rshBots [data-bot-dropcamp]'); t.value = ''; return attach(files, camp && camp.value); }
    if (t.matches('[data-bot-dropcamp]')) return;
    if (t.id === 'rshBotAutoEdit') { settings.autoEdit = t.checked; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.dataset.botCh) { settings.channels = [...document.querySelectorAll('#rshBots [data-bot-ch]:checked')].map(x => x.dataset.botCh); note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotTimes') { const labels = {}, ts = []; for (const part of t.value.split(',')) { const m = part.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)\s*(.*)$/); if (!m) continue; const k = m[1].padStart(2, '0') + ':' + m[2]; if (!ts.includes(k)) ts.push(k); if (m[3].trim()) labels[k] = m[3].trim().slice(0, 30); } if (!ts.length) { note = 'Enter at least one time like 18:00.'; return render(); } settings.times = ts; settings.labels = labels; note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotDays') { settings.days = Number(t.value) || 14; note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.dataset.botTime) { const it = find(t.dataset.botTime); if (it && /^\d\d:\d\d$/.test(t.value)) { it.time = t.value; it.edited = true; await save(); render(); } }
  }

  async function start() {
    const view = document.getElementById('view-bots'); if (!view || !app() || !app().track || document.getElementById('rshBots')) return;
    const host = document.createElement('div'); host.id = 'rshBots'; view.appendChild(host);
    host.addEventListener('click', onClick); host.addEventListener('change', onChange);
    host.addEventListener('toggle', e => { const d = e.target; if (d && d.matches && d.matches('details.camp')) { if (d.open) openCamps.add(d.dataset.botCamp); else openCamps.delete(d.dataset.botCamp); } }, true);
    const zone = e => e.target.closest && e.target.closest('[data-bot-drop]'), files = dt => [...((dt && dt.files) || [])].filter(f => /^(image\/(png|jpeg|webp)|video\/(mp4|webm))$/.test(f.type) || isZip(f));
    host.addEventListener('dragover', e => { const z = zone(e); if (z) { e.preventDefault(); z.classList.add('over'); } });
    host.addEventListener('dragleave', e => { const z = zone(e); if (z) z.classList.remove('over'); });
    host.addEventListener('drop', e => { const z = zone(e); if (!z) return; e.preventDefault(); z.classList.remove('over'); const fs = files(e.dataTransfer), camp = z.querySelector('[data-bot-dropcamp]'); if (!fs.length) { drop.msg = 'Use a PNG, JPEG or WebP photo, an MP4 or WebM video, or a .zip with the script and files for a video.'; return render(); } attach(fs, camp && camp.value); });
    document.addEventListener('paste', e => { if (!view.classList.contains('active') || (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return; const fs = files(e.clipboardData); if (!fs.length) return; e.preventDefault(); const camp = host.querySelector('[data-bot-dropcamp]'); attach(fs, camp && camp.value); });
    document.querySelectorAll('[data-view="bots"]').forEach(b => b.addEventListener('click', () => setTimeout(render, 0)));
    render();
    assetSig = signature();
    window.addEventListener('rsh:saved', () => { onCampaignsChanged(); });
    setInterval(() => { if (document.visibilityState === 'visible' && Object.values(jobs).some(j => j.status === 'sent' || j.status === 'queued' || j.status === 'done')) collect(); }, 60000);   // check for finished videos while the screen is open
    document.querySelectorAll('[data-view="bots"]').forEach(b => b.addEventListener('click', () => collect()));   // fires after every saved change to the campaigns
    db = await use('db');
    if (db) {
      try { const s = await db.doc('bots/settings').get(); if (s.exists) settings = { ...DEFAULTS, ...JSON.parse(s.data().json) }; } catch (_) {}
      try { const p = await db.doc('bots/plan').get(); if (p.exists) plan = JSON.parse(p.data().json); } catch (_) {}
      await collect();
    }
    render();
  }
  window.RSH_BOTS = { freshVideos, watch, onChange: f => listeners.push(f), handoff, collect, start, captionFor, assetNeeds, imagePrompt, videoBrief, editJob };
})();
