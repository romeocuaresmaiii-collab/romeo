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
  const DEFAULTS = { dailyAuto: true, pinBoard: '1114218832750459340', autoEdit: true, autoSend: true, dykDay: 2, channels: ['instagram', 'facebook', 'tiktok'], times: ['12:00', '18:00'], labels: { '12:00': 'lunch break', '18:00': 'after practice' }, days: 14 };
  // RSH Sports' own accounts (from the brand's connected profiles, 23 Nov 2026). Today posts reach them through
  // Metricool or by hand; each has a slot for a direct connection from this app later.
  const ACCOUNTS = [
    ['instagram', '@team.rshsports', 'https://www.instagram.com/team.rshsports/', '#d62976'],
    ['facebook', 'RSH Sports page', 'https://www.facebook.com/864542210081049', '#1877f2'],
    ['tiktok', '@rsh_sports', 'https://www.tiktok.com/@rsh_sports', '#111111'],
    ['youtube', 'RSH Sports channel', 'https://www.youtube.com/channel/UCKsk4KdYzMmFuit_6WgKDcw', '#ff0000'],
    ['pinterest', 'rsh_sports', 'https://www.pinterest.com/rsh_sports/', '#e60023'],
    ['threads', '@team.rshsports', 'https://www.threads.net/@team.rshsports', '#333333'],
    ['bluesky', '@rshsports.bsky.social', 'https://bsky.app/profile/rshsports.bsky.social', '#1185fe']];
  const ACC = Object.fromEntries(ACCOUNTS.map(a => [a[0], a]));
  const chBadge = ch => `<span class="chb" style="--b:${(ACC[ch] || [0, 0, 0, '#6e6e73'])[3]}" aria-hidden="true">${esc((NAME[ch] || ch).slice(0, 2))}</span>`;
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
  #rshBots .chb{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:var(--b);color:#fff;font-size:11px;font-weight:800;letter-spacing:-.02em;flex:none}
  #rshBots .accs{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:14px}
  #rshBots .acc{border:1px solid #e5e5ea;border-radius:14px;padding:12px 14px;background:#fff;display:flex;flex-direction:column;gap:6px;font-size:12.5px}
  #rshBots .acc .top{display:flex;gap:10px;align-items:center}
  #rshBots .acc .st{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:#f0f0f3;color:#515154;margin-right:4px}
  #rshBots .acc .st.on{background:#eaf7ee;color:#1a7f37}
  #rshBots .posted{font-size:11.5px;font-weight:700;color:#1a7f37}
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
  /* ---------- Exact sizes per channel and format (checked Nov 26, 2026) ----------
   * Sources: Pinterest Help "Review Pin specs"; TechCrunch (Jun 17, 2025: every Facebook video is now a Reel); 2026 size
   * guides from Sprout Social, Buffer, Metricool. Instagram's profile grid shows a 3:4 crop, so feed photos are 1080×1350
   * (4:5) with the subject kept inside the centre 3:4 area. Videos everywhere are 1080×1920 (9:16), 30 fps, H.264 + AAC. */
  const V916 = [1080, 1920, '9:16'];
  const SPECS = {
    instagram: { video: [...V916, 'Reel'], story: [...V916, 'Story'], image: [1080, 1350, '4:5', 'feed photo (keep the subject inside the centre 3:4 area; the profile grid crops to 3:4)'], carousel: [1080, 1350, '4:5', 'carousel of 6 to 8 frames, one angle per frame, the last frame is the tagline'] },
    facebook: { video: [...V916, 'Reel (every Facebook video is now a Reel)'], story: [...V916, 'Story'], image: [1080, 1350, '4:5', 'feed photo'], carousel: [1080, 1080, '1:1', 'carousel (Meta crops carousel cards to 1:1)'] },
    tiktok: { video: [...V916, 'video'], story: [...V916, 'video'], image: [...V916, 'photo post (other sizes get black bars)'], carousel: [...V916, 'photo carousel, every slide the same size'] },
    youtube: { video: [...V916, 'Short (up to 3 minutes)'], story: [...V916, 'Short'], image: [...V916, 'Short made from the photo'], carousel: [...V916, 'Short made from the photos'] },
    pinterest: { video: [1000, 1500, '2:3', 'product pin still (rulebook; a 9:16 Idea Pin of 3–5 slides is the alternative)'], story: [1000, 1500, '2:3', 'product pin still'], image: [1000, 1500, '2:3', 'standard pin'], carousel: [1000, 1500, '2:3', 'carousel pin, every slide the same size'] },
    threads: { video: [1080, 1350, '4:5', 'proof frame: a 3-second loop or still (the text is the post)'], story: [1080, 1350, '4:5', 'proof frame'], image: [1080, 1350, '4:5', 'photo'], carousel: [1080, 1350, '4:5', 'carousel'] },
    bluesky: { video: [1080, 1350, '4:5', 'still image only: the best frame (rulebook: no reels on Bluesky)'], story: [1080, 1350, '4:5', 'still image'], image: [1080, 1350, '4:5', 'photo (Bluesky compresses to about 1 MB: export a JPEG)'], carousel: [1080, 1350, '4:5', 'up to 4 photos'] }
  };
  const kindOf = p => { const t = String(p.postType || '').toLowerCase(); if (!t.trim() && String(p.video || '').trim()) return 'video';   // no post type but a video brief: a video campaign
    return /story/.test(t) ? 'story' : /reel|video|short/.test(t) ? 'video' : /carousel/.test(t) ? 'carousel' : 'image'; };
  const specFor = (ch, kind) => { const s = SPECS[ch] || SPECS.instagram; return s[kind] || s.image; };
  // Every size this campaign needs, grouped: [{w, h, ratio, uses: ['Instagram feed photo', …], channels: [...] }], the main channel's size first.
  function sizePlan(p) {
    const kind = kindOf(p), out = [];
    for (const ch of targets(p)) { const [w, h, ratio, use] = specFor(ch, kind); let g = out.find(x => x.w === w && x.h === h); if (!g) out.push(g = { w, h, ratio, uses: [], channels: [] }); g.uses.push(`${NAME[ch]} ${use}`); g.channels.push(ch); }
    if (!out.length) { const [w, h, ratio, use] = specFor('instagram', kind); out.push({ w, h, ratio, uses: [`Instagram ${use}`], channels: ['instagram'] }); }
    return out;
  }
  function sizeLines(p) {
    const plan = sizePlan(p), kind = kindOf(p);
    return `EXACT SIZES FOR THIS CAMPAIGN (checked with the platforms, Nov 2026)\n` + plan.map((g, n) => `- ${n === 0 ? 'Main' : 'Also'}: ${g.w}×${g.h} (${g.ratio}) for ${g.uses.join('; ')}`).join('\n') +
      `\n${kind === 'video' || kind === 'story' ? 'Every video: 1080×1920 (9:16), 30 fps, H.264 + AAC; keep text and faces inside the centre safe area (not in the top 8% or bottom 12%, nor under the right-side buttons).' : plan.length > 1 ? 'Deliver one file per size: the same scene re-framed for each ratio (not stretched, not letterboxed), nothing important near the edges. Name each file with its ratio, e.g. "-4x5", "-2x3", "-9x16".' : 'Nothing important near the edges.'}${rbOn(p.date) ? `\nPOSTING RULEBOOK: every platform gets its own separately produced file in its own style (never the same file or a trim of it${isDyk(p) ? '; the Tuesday DYK to Instagram and YouTube is the one shared file' : ''}). This idea goes to ${targets(p).map(c => NAME[c]).join(', ')}; home: ${NAME[targets(p)[0]]}. Put the platform in each file name (e.g. "-${targets(p)[0]}", "-tiktok", "-pinterest-2x3") and "flow" when the media was generated in Google Flow.` : ''}`;
  }
  // Which attached file fits a channel best: the one whose shape matches the channel's size (from its width and height, or the ratio in its name).
  const ratioOf = a => { if (a && a.width && a.height) return a.width / a.height; const m = /(\d+)x(\d+)(?=\D*$)/.exec(String(a && a.name || '')); if (m) { const x = +m[1], y = +m[2]; if (x && y && x < 50 && y < 50) return x / y; } return 0; };
  function assetNeeds(p) {
    const files = [p.creativeAsset].concat(Array.isArray(p.creativeAssets) ? p.creativeAssets : []).filter(Boolean).filter((a, i, all) => all.findIndex(x => x.id === a.id) === i);
    const vids = files.filter(a => /^video\//.test(a.mime || '')).length, imgs = files.length - vids, type = String(p.postType || '').toLowerCase(), ratio = p.aspectRatio || '4:5', needs = [];
    const plan = sizePlan(p), main = plan[0], sz = g => `${g.w}×${g.h}`, k = kindOf(p);
    if (k === 'video') needs.push({ label: `a vertical 9:16 video, 8–20 seconds (${sz(main)})`, state: vids ? 'have' : 'miss' });
    else if (k === 'carousel') needs.push({ label: `${rbOn(p.date) ? '6 to 8' : '3 to 5'} matching ${main.ratio} photos (${sz(main)})`, state: imgs >= 3 ? 'have' : 'miss', detail: imgs ? `${imgs} so far` : '' });
    else if (k === 'story') needs.push({ label: `one vertical 9:16 photo or short video (${sz(main)})`, state: files.length ? 'have' : 'miss' });
    else needs.push({ label: `one ${main.ratio} photo (${sz(main)})`, state: imgs ? 'have' : 'miss' });
    if (k === 'image' || k === 'carousel') for (const g of plan.slice(1)) { const r = g.w / g.h, ok = files.some(a => /^image\//.test(a.mime || '') && Math.abs(ratioOf(a) - r) < 0.03); needs.push({ label: `a ${g.ratio} version (${sz(g)}) for ${g.channels.map(c => NAME[c]).join(', ')}`, state: ok ? 'have' : 'opt' }); }
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
      `Make one vertical 9:16 video, 1080×1920, ${secs} seconds, MP4 (H.264), under 15 MB (the app sends files up to 16 MB to Metricool through Google Drive).`,
      sizeLines({ ...p, postType: /reel|video|story|short/i.test(p.postType || '') ? p.postType : 'video' }),
      seoEditLine(p),
      `SCRIPT\nHook (first 2 seconds, on screen): ${sentence(p.hook)}\n${p.onImageText ? 'On-screen text: ' + sentence(p.onImageText) + '\n' : ''}Closing line: ${String(p.cta || '').trim() || 'Follow RSH Sports'}`,
      p.visualConcept ? `VISUAL DIRECTION\n${String(p.visualConcept).trim()}` : '',
      `RULES\n${RULES} RSH branding only in the corner watermark and the end card.`,
      `HOUSE STYLE\n${HOUSE}\n${endCardLine(p)}\nStart from Video Studio Kit engine ${engineFor(p)}.`,
      productBlock(p),
      packFor(p.id) ? `PRODUCTION PACK (written by Sage, the team’s script writer; follow it shot by shot)\n${packFor(p.id)}` : '',
      `DELIVER\nThe finished MP4 named ${slug(p.title) || 'campaign'}.mp4, plus a one-line note of anything you could not do.`].filter(Boolean).join('\n\n');
  }
  function seoEditLine(p) { const x = seo && seo[p.id]; return x && (x.onScreen || x.spoken) ? `SEARCH (TikTok, YouTube and Instagram read on-screen text and speech)\nShow on screen in the first 3 seconds: “${x.onScreen}”\nSay in the first 3 seconds: “${x.spoken}”\nBurn in captions for the spoken words.` : ''; }
  // House style from the RSH Video Studio Kit + Content Rules Kit (studio/ in the repository). Every edit job carries it.
  const HOUSE = 'Smooth only: no shake, flash, glitch or zoom punch; slow straight push-ins; soft 10–15-frame cross-dissolves. One message on screen at a time, each line readable for at least 2.5 s (hook 3 s, on screen in the first second); text fades in as whole lines. Bold condensed uppercase white text with a soft shadow (Barlow Condensed 900). Nothing in the top 8% or bottom 12% of the frame. One continuous free, no-copyright music track, 0.5 s fade-in, 1.5 s fade-out, ducked under the voice, never cut. Small RSH watermark bottom-right on every shot. No filters that change kit or product colours. Same kit (colours, team name, and number in sports that use numbers) on the same athlete in every shot; wrestling singlets have no number. Loudness about −14 to −16 LUFS, 30 fps.';
  const TAGVERB = { wrestling: 'Wrestle', soccer: 'Play', basketball: 'Play', hockey: 'Skate', ice: 'Skate', running: 'Run', track: 'Run', boxing: 'Fight', mma: 'Fight' };   // Posting Rulebook rule 5: never default to Play
  // What a uniform shows depends on the sport: wrestling singlets (and MMA or boxing kits) never carry a player number.
  const NO_NUMBER = /wrestl|singlet|mma|grappl|jiu|judo|boxing|kickbox/i;
  const kitId = sport => NO_NUMBER.test(String(sport || '')) ? 'the team or school name and crest only (no player number: wrestling singlets are not numbered; wrestlers are paired by weight class; an international scene may show a country code instead)' : 'the team\u2019s own name, number and crest only';
  const kitNeg = sport => NO_NUMBER.test(String(sport || '')) ? 'numbers or player numbers on the singlet or kit' : '';
  function endCardLine(p) {
    const tag = TAGVERB[String(p.sport || '').toLowerCase().split(/[ /]/)[0]];
    return `END CARD (about 3 s, last frame softly blurred and darkened, picture and music fade out together): the RSH logo · rshsports.com, then the follow line from the caption${String(p.sport || '').trim() ? ` (e.g. "Follow RSH Sports for more ${String(p.sport).toLowerCase()} tips and stories")` : ''}${tag ? `; optional tagline "Look fearless. ${tag} fearless."` : ''}. Three lines at most. Use studio/video/cta/rsh_cta.py.`;
  }
  // Which Video Studio Kit engine fits the campaign (studio/video/engines).
  function engineFor(p) {
    const t = `${p.title || ''} ${p.postType || ''} ${p.hook || ''} ${p.visualConcept || ''}`.toLowerCase();
    if (/did you know|\bdyk\b/.test(t)) return '01 Did You Know, rendered 9:16 1080×1920 for every channel (16:9 only for a separate YouTube long video)';
    if (/quiz| a or b|which one/.test(t)) return '09 quiz explainer (current house style)';
    if (/quote/.test(t)) return /kit|uniform|reveal/.test(t) ? '05 Quote of the Day kit reveal' : '04 Quote of the Day (calm)';
    if (/singlet|product|colorway|colourway|reversible|photo/.test(t)) return '07 product photos (real photos only)';
    if (/slow.?mo|swing|pitch/.test(t)) return '03 slow-motion speed-ramp with VO';
    if (/ritual|calm|stills/.test(t)) return '08 calm stills reel with VO';
    if (/motion graphic|text only/.test(t)) return '06 motion graphics (minimal)';
    return '02 cinematic with VO, or 09 for a question post';
  }
  const RULES = 'Realistic, natural light. Sport-correct gear and setting. No third-party logos, brand marks or wordmarks on shoes, socks, apparel, bags or equipment. No real, identifiable people. Suitable for parents, coaches and athletes.';
  function imagePrompt(p) {
    { const part = packPart(packFor(p.id), 2), pb = productBlock(p); if (part) return pb ? part + '\n\n' + pb : part; }
    const type = String(p.postType || '').toLowerCase(), base = String(p.visualPrompt || p.visualConcept || '').trim();
    return [base || `A premium, photorealistic ${p.sport || 'sports'} photo for ${p.platform || 'social media'}: ${sentence(p.hook)}`,
      /carousel/.test(type) ? 'Make this a matching set of 3 to 5 images with the same athlete, setting and light: 1) a cover with clear space for the headline, 2 to 4) supporting moments, last) a calm closing frame.' : '',
      productBlock(p), sizeLines(p), `Leave clean space for text; do not put any text in the image.`, base ? '' : RULES, app().logoRule ? 'RSH logo rule: ' + app().logoRule() : '', app().negativePrompt ? 'Negative prompt: ' + app().negativePrompt() + (kitNeg(p.sport) ? '; ' + kitNeg(p.sport) : '') : '', NO_NUMBER.test(p.sport || '') ? 'Wrestling singlets have no player number: show the team or school name and crest only.' : ''].filter(Boolean).join('\n\n');
  }
  function videoBrief(p) {
    { const part = packPart(packFor(p.id), 4), pb = productBlock(p); if (part) return pb ? part + '\n\n' + pb : part; }
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
  const EDITOR_SESSION = 'session_01EomsW5dcrYFpjjRDCZ7Frj', APP_URL = 'https://claude.ai/artifact/YR8cQvQaSPNMVNxngvihpz', REMOTE = 'Claude Code Remote';
  const needsVideo = p => { const n = assetNeeds(p).needs[0]; return /reel|video/i.test(p.postType || '') && n && n.state === 'miss'; };
  const RETURN_STEPS = id => `WHEN THE VIDEO IS FINISHED, return it to the app so nobody has to move it by hand:\n1. If the MP4 is 19 MB or smaller, upload it to the artifact ${APP_URL} as one asset (Artifact tool: action publish, url set to that artifact, asset true, file_path the MP4) and note the 32-character asset id. If it is larger, split it into 16 MB pieces (split -b 16m), upload each piece the same way with content type video/mp4, and note each piece's asset id with its start and end byte offsets.\n2. Record it with the ArtifactData tool on the same artifact: read collection "editJobs", document "${id}" (action get) to learn its version, then action update with if_version and data {"status":"done","assetId":"<the asset id, or the first piece's id>","parts":[{"id":"<piece id>","start":0,"end":16777216}, ...] (only when split),"mime":"video/mp4","bytes":<file size>,"name":"<file name>.mp4","finishedAt":"<current time, ISO 8601>"}.\nIf you cannot finish, update that document with {"status":"failed","reason":"<one sentence>"} instead.\nDo not change anything else in that artifact, and do not publish or schedule anything.`;
  function handoff(p, j) {
    if (j && (j.source === 'product-image' || j.source === 'product-video')) return productHandoff(p, j);
    if (j && j.source === 'revision') {
      let files = []; try { files = JSON.parse(j.manifest || '[]'); } catch (_) {}
      const list = files.map((f, n) => `${n + 1}. ${f.name} (${f.mime}, ${Math.round(f.bytes / 1024)} KB${f.encoding === 'base64' ? ', stored base64-encoded: decode after joining' : ''}) asset${f.parts.length > 1 ? 's in order' : ''}: ${f.parts.map(x => x.id).join(' + ')}`).join('\n');
      return `[RSH Sports Marketing OS: automatic REVISION job. Sent by the app on behalf of the team after the manager's review.]\n\nREVISION ${j.revision || 2} — ${p.title}\nCampaign for ${p.platform || 'social media'}, planned ${p.date || 'no date yet'}.\n\nThe current video is asset ${j.baseAssetId} (fetch it with the Artifact tool: action read, url ${APP_URL}, path ${j.baseAssetId}). Apply ONLY these review notes and keep everything else as it is:\n\n"${j.notes}"\n\nKeep 1080×1920, MP4 (H.264 + AAC), under 15 MB. No third-party logos, no stock, price or delivery claims. If a note asks for something you cannot do (for example new footage), do the rest and say so in one line.${list ? '\n\nORIGINAL FILES, if you need them (same Artifact read, path = asset id):\n' + list : ''}${j.script ? '\n\nSCRIPT:\n' + String(j.script).slice(0, 6000) : ''}\n\n${RETURN_STEPS(p.id)}`;
    }
    if (j && (j.source === 'zip' || j.source === 'campaign')) {
      let files = []; try { files = JSON.parse(j.manifest || '[]'); } catch (_) {}
      const list = files.map((f, n) => `${n + 1}. ${f.name} (${f.mime}, ${Math.round(f.bytes / 1024)} KB${f.encoding === 'base64' ? ', stored base64-encoded: decode after joining' : ''}) asset${f.parts.length > 1 ? 's in order' : ''}: ${f.parts.map(x => x.id).join(' + ')}`).join('\n');
      return `[RSH Sports Marketing OS: automatic edit job${j.source === 'zip' ? ' from a zip' : ' from the campaign’s asset box'}. Sent by the app on behalf of the team.]\n\nEDIT JOB — ${p.title}\nCampaign for ${p.platform || 'social media'}, planned ${p.date || 'no date yet'}. Sport: ${p.sport || 'not set'}.\n\n${j.source === 'zip' ? `The team uploaded a zip, "${j.zipName}", with every file for this video.` : `The manager gathered ${j.files} file${j.files === 1 ? '' : 's'} in the campaign’s asset box and marked them ready.`} Edit the full video exactly as the script says, using these files. Keep the finished MP4 1080×1920 and under 15 MB.${seoEditLine(p) ? '\n\n' + seoEditLine(p) : ''}${productBlock(p) ? '\n\n' + productBlock(p) : ''}\n\nGET THE FILES: for each asset id below, use the Artifact tool with action read, url ${APP_URL}, and path set to the asset id; it saves the file locally. Where a file has several asset ids, fetch them in order and join them (cat). Where it says base64, decode after joining (base64 -d).\n${list}\n\nSCRIPT${j.scriptName ? ' (' + j.scriptName + ')' : ''}:\n${j.script || (packFor(p.id) ? '(Production pack written by Sage, the team’s script writer.)\n' + packFor(p.id) : '') || 'No script file was found in the zip. Follow the campaign: hook "' + sentence(p.hook) + '".'}${j.scriptCut ? '\n[The script is longer than shown; the full file is in the list above.]' : ''}\n\nOUTPUT unless the script says otherwise: one vertical 9:16 video, 1080×1920, MP4 (H.264). RULES: ${RULES} RSH branding only in the corner watermark and the end card.\n\nHOUSE STYLE (follow the script where it says otherwise): ${HOUSE}\n${endCardLine(p)}\nStart from Video Studio Kit engine ${engineFor(p)}. Check stills of every beat before the full render, and list anything in the images that breaks the brand rules.\n\n${RETURN_STEPS(p.id)}`;
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
      const ok = app().attachAsset(j.postId, { id: j.assetId, mime: j.mime || 'video/mp4', bytes: j.bytes, name: j.name, width: j.width, height: j.height, parts: Array.isArray(j.parts) && j.parts.length > 1 ? j.parts : undefined, replaces: prev });
      if (ok && Array.isArray(j.extra)) for (const x of j.extra.slice(0, 4)) { if (x && /^[0-9a-f]{32}$/.test(String(x.assetId || ''))) app().attachAsset(j.postId, { id: x.assetId, mime: x.mime || 'image/jpeg', bytes: x.bytes, name: x.name, width: x.width, height: x.height }); }
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

  /* ---------- RSH Sports Posting Rulebook (Nov 26, 2026; in force Dec 1, 2026 – Dec 31, 2027) ----------
   * One idea, a separately produced post per platform, each at that platform's US Eastern slot. Posts dated before
   * Dec 1, 2026 keep the earlier rules. The full text is in the Playbook tab and studio/rules/10_Posting_Rulebook.txt. */
  const RB_FROM = '2026-12-01', RB_TO = '2027-12-31';
  const rbOn = d => !!d && d >= (window.RSH_RB_FROM || RB_FROM) && d <= RB_TO;   // RSH_RB_FROM: tests of the earlier rules move the start date
  // Weekly schedule, US Eastern: [time, format]. 0 = Sunday … 6 = Saturday.
  const RB_SLOTS = {
    facebook: { 1: [['10:00', 'reel'], ['12:00', 'image']], 2: [['10:00', 'reel'], ['17:00', 'image']], 3: [['10:00', 'reel'], ['12:00', 'image']], 4: [['10:00', 'reel'], ['18:00', 'image']], 5: [['10:00', 'reel']] },
    instagram: { 1: [['07:00', 'reel']], 2: [['07:00', 'dyk'], ['13:00', 'carousel']], 3: [['12:00', 'reel'], ['18:00', 'image']], 4: [['09:00', 'reel'], ['12:00', 'carousel']], 5: [['07:00', 'reel']], 6: [['', 'story']], 0: [['', 'story']] },
    tiktok: { 1: [['10:00', 'video']], 2: [['10:00', 'video'], ['18:00', 'video']], 3: [['10:00', 'video'], ['18:00', 'video']], 4: [['10:00', 'video'], ['18:00', 'video']], 5: [['10:00', 'video'], ['12:00', 'video']] },
    youtube: { 2: [['16:00', 'dyk']], 3: [['16:00', 'short']], 4: [['16:00', 'short']], 5: [['16:00', 'short']] },
    threads: { 1: [['09:00', 'text']], 2: [['10:00', 'text']], 3: [['09:00', 'text'], ['19:00', 'text']], 4: [['09:00', 'text']], 5: [['09:00', 'text']] },
    bluesky: { 1: [['09:00', 'text']], 2: [['09:00', 'text']], 3: [['09:00', 'text']], 4: [['09:00', 'text']], 5: [['09:00', 'text'], ['20:00', 'test']], 6: [['17:00', 'test']] },
    pinterest: { 5: [], 6: [], 0: [] }
  };
  // Pinterest batches 15–25 pins each weekend: each evening's slot opens a 2-hour window in 15-minute steps (8 pins).
  { const win = (h0) => Array.from({ length: 8 }, (_, i) => [`${String(h0 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`, 'pin']); RB_SLOTS.pinterest = { 5: win(19), 6: win(20), 0: win(19) }; }
  const RB_ORDER = ['facebook', 'instagram', 'tiktok', 'youtube', 'threads', 'bluesky', 'pinterest'];
  const RB_VOLUME = { facebook: '5 Reels + 3 images', instagram: '5 Reels (Tuesday is the DYK) + 2 carousels', tiktok: '7 videos', youtube: '4 Shorts (Tuesday is the DYK)', threads: '6 posts', bluesky: '6 posts', pinterest: '15 to 25 pins over the weekend' };
  // Which slot format a post takes on a channel.
  function rbFormat(p, ch) {
    const k = kindOf(p);
    if (ch === 'facebook') return k === 'video' || k === 'story' ? 'reel' : 'image';
    if (ch === 'instagram') return isDyk(p) ? 'dyk' : k === 'carousel' ? 'carousel' : k === 'image' ? 'image' : 'reel';
    if (ch === 'youtube') return isDyk(p) ? 'dyk' : 'short';
    return { tiktok: 'video', threads: 'text', bluesky: 'text', pinterest: 'pin' }[ch] || 'reel';
  }
  const rbSlotsOn = (ch, date, fmt) => ((RB_SLOTS[ch] || {})[dow(date)] || []).filter(s => s[1] === fmt || (fmt === 'image' && ch === 'instagram' && s[1] === 'carousel') || (fmt === 'text' && s[1] === 'test')).map(s => s[0]).filter(Boolean);
  // Reel routing: the home platform comes from what the post is; the first match wins.
  function rbHome(p) {
    const t = [p.title, p.hook, p.angle, p.visualConcept, p.captionBody || p.caption, p.onImageText].join(' ').toLowerCase();
    if (isDyk(p)) return ['instagram', 'Did You Know: Instagram Reel 7 AM and YouTube Short 4 PM every Tuesday'];
    const own = String(p.platform || '').toLowerCase().replace(/[^a-z]/g, '');
    if (p.rbHome && p.rbHome === own && NAME[own]) return [own, p.rbHomeWhy || 'Home platform set by the Posting Rulebook routing'];   // confirmed when the campaigns were routed
    if (own === 'pinterest') return ['pinterest', 'A Pinterest product or design pin: weekend evening slot'];
    if ((kindOf(p) === 'image' || kindOf(p) === 'carousel') && NAME[own]) return [own, `A ${kindOf(p) === 'carousel' ? 'carousel' : 'photo'} post keeps its own platform (the routing rules are for reels)`];
    if (/team[- ]store|always open store|order(ing)? (now|window|deadline|news)|custom [a-z ]*uniforms?\b|uniform (reveal|design)|product reveal|new (colou?rway|design|uniform)|now available|pre-?order/.test(t)) return ['facebook', 'Product reveal, uniform design or team-store news: Facebook Reel 10 AM'];
    if (/\bqotd\b|quote of the day|\bquote\b|motivation|motivational|shoot it like/.test(t)) return ['instagram', 'Spoken quote or motivational line with a text overlay: Instagram Reel'];
    if (/\b[ab] or [ab]\b|which (side|one|look|color|colou?r)|one [a-z]+[.,]? two (looks|ways|sides)|\bpick (one|1|a)\b|\bvs\.?\b|\bversus\b|compare|1 or 2/.test(t)) return ['tiktok', 'A choice or comparison: TikTok 10 AM'];
    if (/\brule(s| change)?\b|nfhs|explain|explainer|how to|how it works|what is (?!your)|weight[- ]management|guide|news/.test(t)) return ['youtube', 'News, rules or an explainer people search for: YouTube Short 4 PM'];
    if (/what('s| is) your|your (ritual|story|routine)|tell us|\bstory\b|ritual/.test(t)) return ['threads', 'A question more than a picture: Threads 9 AM as text, clip as proof'];
    return ['facebook', 'None of the routes above: Facebook Reel (the strongest channel in the account’s own data)'];
  }
  const rbProduct = p => /singlet|uniform|jersey|team[- ]store|colou?rway|kit\b|apparel|reversible/i.test([p.title, p.hook, p.captionBody || p.caption, p.visualConcept].join(' '));
  // Platforms for one idea: DYK → Instagram + YouTube only; otherwise the home platform plus at most three others,
  // TikTok first (the furthest from the Facebook look), Pinterest only for product and design ideas.
  function rbTargets(p) {
    if (isDyk(p)) return ['instagram', 'youtube'];
    // Each campaign posts only on its home platform. Another platform is added only when a file made for it
    // (named with that platform) is attached: never the same file twice, at most three besides the home.
    const home = rbHome(p)[0], files = [p.creativeAsset].concat(p.creativeAssets || []).filter(Boolean), own = new Set(files.flatMap(tagOfFile));
    return [home].concat(['tiktok', 'instagram', 'facebook', 'youtube', 'threads', 'bluesky', 'pinterest'].filter(c => c !== home && own.has(c)).slice(0, 3));
  }
  // Day and time for one platform's post: its home goes first; the others follow later in the same week, each on its own slot.
  function rbPlace(p, ch) {
    const fmt = rbFormat(p, ch), home = rbTargets(p)[0], dyk = isDyk(p);
    if (dyk) { const tue = dow(p.date) === 2, d = tue ? p.date : shiftDay(p.date, (9 - dow(p.date)) % 7 || 7); return { date: d, time: ch === 'instagram' ? '07:00' : '16:00', why: 'Rulebook: the DYK goes to Instagram 7 AM and YouTube 4 PM every Tuesday, and to no other platform.', moved: tue ? '' : `DYK posts go out on Tuesday, so this moved to ${d}.` }; }
    const homeDate = ch === home ? p.date : rbPlace(p, home).date, start = ch === home ? p.date : shiftDay(homeDate, ch === 'pinterest' ? 0 : 1);   // the home platform posts first
    for (let i = 0; i < 14; i++) { const d = shiftDay(start, i), times = rbSlotsOn(ch, d, fmt); if (dow(d) === 2 && ch === 'instagram' && fmt === 'reel') continue;   // Tuesday's Instagram Reel slot is the DYK
      if (times.length) return { date: d, time: times[0], times, why: `Rulebook slot: ${NAME[ch]} ${fmt === 'text' ? 'post' : fmt} ${new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })} ${clockTxt(times[0])} ET (${manila(d, times[0])} in Manila).`, moved: d === p.date ? '' : ch === home ? `No ${NAME[ch]} ${fmt} slot on the planned day, so this moved to ${d}.` : '' }; }
    return { date: p.date, time: '', why: `No rulebook slot for ${NAME[ch]} ${fmt}.` };
  }
  // Manila time for an Eastern slot (Eastern = Manila − 13 h on standard time, − 12 h on daylight time).
  function manila(date, time) {
    if (!time) return '';
    const off = date >= '2027-03-14' && date < '2027-11-07' ? 12 : 13, [h, m] = time.split(':').map(Number), t = h + off, next = t >= 24;
    return `${(t % 24) % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${t % 24 < 12 ? 'AM' : 'PM'}${next ? ' next day' : ''}`;
  }
  const TAGLINE = sport => { const s = String(sport || '').toLowerCase(); const v = /wrestl/.test(s) ? 'Wrestle' : /hockey/.test(s) ? 'Skate' : /run|track|cross[- ]?country/.test(s) ? 'Run' : /box|mma|kickbox|fight/.test(s) ? 'Fight' : /soccer|basketball/.test(s) ? 'Play' : ''; return v ? `Look fearless. ${v} fearless.` : ''; };

  /* ---------- 1. Caption Bot ---------- */
  function bodyOf(p) {
    let b = String(p.captionBody || p.caption || '').trim();
    for (const part of [p.cta, p.hashtags]) if (part && b.endsWith(String(part).trim())) b = b.slice(0, -String(part).trim().length).trim();
    return b.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim();
  }
  // Posting Rulebook captions: written for each platform, never copied from another; one CTA, placed where the platform wants it.
  const RB_MAXTAGS = { facebook: 5, instagram: 5, tiktok: 4, youtube: 0, threads: 1, bluesky: 1, pinterest: 0 };   // Instagram: the rulebook says 5–8, the platform caps hashtags at 5
  const RB_MINTAGS = { facebook: 3, instagram: 5, tiktok: 3 };
  const rbLink = (p, ch) => `${(productsFor(p)[0] || {}).url || 'https://www.rshsports.com/'}?utm_source=${ch}&utm_medium=organic_social&utm_campaign=${slug(p.title)}`;
  const rbQuestion = p => { const all = [p.hook, p.captionBody || p.caption, p.onImageText].map(x => String(x || '')).join(' '); const m = all.replace(/\s+/g, ' ').match(/[^.!?]*\?/); return m ? m[0].trim() : ''; };
  const rbTopic = p => { const s = String(p.sport || '').trim(); return s ? '#' + s.split(/[ /]/)[0].replace(/[^\p{L}]/gu, '').replace(/^./, c => c.toUpperCase()) : ''; };
  function rbTags(p, ch) { const so = seoFor(p.id, ch), own = (String(p.hashtags || '').match(/#[\p{L}\p{N}_]+/gu) || []), list = [...new Set(own.concat((so && so.ch.hashtags) || []).map(t => t.trim()).filter(Boolean))]; return list.slice(0, RB_MAXTAGS[ch] || 0); }
  function rbYouTubeTitle(p) { const so = seoFor(p.id, 'youtube'), base = String((so && so.ch.title) || p.hook || p.title || '').replace(/^pinterest:\s*/i, '').replace(/\s*#\S+/g, '').trim(), tags = rbTags(p, 'tiktok').concat(rbTags(p, 'instagram')).filter((t, i, a) => a.indexOf(t) === i).slice(0, 3); return cut(base, 99 - tags.join(' ').length - 1) + (tags.length ? ' ' + tags.join(' ') : ''); }
  function rbCaption(p, ch) {
    const body = bodyOf(p), hook = sentence(p.hook) || firstSentences(body, 1), q = rbQuestion(p), join = parts => parts.filter(Boolean).join('\n\n'), tags = rbTags(p, ch).join(' ');
    if (ch === 'facebook') { let t = firstSentences(body, 2); if (q && !t.includes(q)) t += ' ' + q; return join([t, tags]); }   // 2–3 sentences, a question; the link goes in the first comment
    if (ch === 'instagram') { const lines = firstSentences(body.replace(hook, ''), 2) || firstSentences(body, 2); return join([hook, lines + ' Link in bio.', tags]); }
    if (ch === 'tiktok') { const line = (q || hook).replace(/\s+/g, ' ').trim(); return cut(line + (tags ? ' ' + tags : ''), 300); }   // one line ending on a question; the bio link is the CTA
    if (ch === 'youtube') return cut(firstSentences(body, 1) || hook, 200) + ' www.rshsports.com';   // the description: one line plus the website; the title carries the hashtags
    if (ch === 'threads') return cut(join([firstSentences(body, 2) || hook, `Team gear at rshsports.com. ${rbTopic(p)}`.trim()]), 480);
    if (ch === 'bluesky') return cut(`${firstSentences(body, 1) || hook} rshsports.com`, 290);
    if (ch === 'pinterest') return join([cut(String(p.title || '').replace(/^pinterest:\s*/i, ''), 100), cut(firstSentences(body, 2), 380), rbLink(p, 'pinterest')]);
    return join([body]);
  }
  function captionFor(p, ch) {
    if (rbOn(p.date)) return rbCaption(p, ch);
    const body = bodyOf(p), cta = String(p.cta || '').trim(), hook = sentence(p.hook), join = parts => parts.filter(Boolean).join('\n\n');
    if (ch === 'instagram') return join([body, cta, tagsOf(p, 8)]);
    if (ch === 'facebook') return join([body, cta, tagsOf(p, 2)]);
    if (ch === 'tiktok') return cut(join([hook ? hook.replace(/[.?!]*$/, m => m || '.') : firstSentences(body, 1), cta, tagsOf(p, 5)]), 600);
    if (ch === 'youtube') return join([cut(hook || p.title, 90), firstSentences(body, 3), cta, tagsOf(p, 3)]);
    if (ch === 'pinterest') return join([cut(String(p.title || '').replace(/^pinterest:\s*/i, ''), 100), cut(firstSentences(body, 3), 380), `${(productsFor(p)[0] || {}).url || 'https://www.rshsports.com/'}?utm_source=pinterest&utm_medium=organic_social&utm_campaign=${slug(p.title)}`]);
    if (ch === 'threads') return cut(join([firstSentences(body, 2), cta]), 480);
    if (ch === 'bluesky') return cut([firstSentences(body, 1), cta].filter(Boolean).join(' '), 290);
    return join([body, cta]);
  }

  /* ---------- 1b. Quill's SEO pack (asks Claude; uses only what the campaign says) ----------
   * Per campaign: search keywords, alt text, hashtags per channel, a YouTube title and tags, a Pinterest
   * pin title and description, a TikTok title. Kept in bots/seo. It never changes the approved caption:
   * hashtags are added to a caption only when someone presses “Add hashtags”. */
  let seo = {}, seoNote = '';
  const seoSig = p => [p.title, p.hook, p.caption, p.captionBody, p.cta, p.hashtags, p.platform, p.postType].map(x => String(x || '')).join('|').length + ':' + String(p.title || '').slice(0, 40) + ':' + String(p.caption || '').slice(-40);
  // Platform rules researched November 2026 (official help pages where available; see SEO_RULES.md):
  // Instagram max 5 hashtags (Dec 2025) and captions indexed by Google since Jul 2025; TikTok max 5 hashtags, reads
  // on-screen text and speech; YouTube: title, description and thumbnail matter most, tags minimal, up to 3 hashtags shown;
  // Pinterest: keywords in title/description, no hashtags; Threads: one topic tag; Bluesky: 1–3 hashtags feed custom feeds.
  const MAXTAGS = { instagram: 5, tiktok: 5, facebook: 3, youtube: 3, threads: 1, bluesky: 3, pinterest: 0 };
  function seasonOf(d) { const m = new Date((d || iso(new Date())) + 'T12:00:00').getMonth() + 1; return [m >= 11 || m <= 2 ? 'wrestling season (Nov–Feb)' : '', m >= 11 || m <= 3 ? 'basketball season (Nov–Mar)' : '', m >= 10 || m <= 3 ? 'hockey season (Oct–Mar)' : '', m >= 2 && m <= 5 ? 'softball season (Feb–May)' : '', [3, 4, 5, 8, 9, 10, 11].includes(m) ? 'soccer season' : ''].filter(Boolean).join(', ') || 'off-season / preseason planning'; }
  function resultsForPrompt() {
    const L = learnedTags(), lines = Object.entries(L).map(([ch, x]) => `${NAME[ch]}: strongest ${x.best.map(b => `${b.tag} (avg ${b.avg} views, ${b.n} posts)`).join(', ')}${x.weak.length ? `; weakest ${x.weak.map(b => b.tag).join(', ')}` : ''}`);
    return lines.length ? `RSH SPORTS' OWN RESULTS, last 28 days (real Metricool numbers; prefer what worked, drop what did not, but stay relevant to this post):\n${lines.join('\n')}` : '';
  }
  function seoPrompt(p) {
    return `You are a senior social media SEO strategist (10+ years, search and recommendation systems on Instagram, Facebook, TikTok, YouTube, Pinterest, Threads, Bluesky). You work for RSH Sports (rshsports.com), a US maker of custom team uniforms and apparel: wrestling singlets, basketball, softball, soccer and hockey uniforms, and online team stores. Buyers: high school and club coaches, athletic directors, team parents, athletes.

Write the search-and-discovery pack for ONE post. Hard rules:
- Use ONLY facts in the campaign. No prices, discounts, stock, delivery times, product features, results, quotes or statistics that are not written there. No other brands or vendors.
- Pick ONE primary keyword with real US search intent (what a coach or parent would type, e.g. "custom wrestling singlets", "high school wrestling", "softball team uniforms") plus 3–6 secondary long-tail keywords (add modifiers like high school, youth, club, varsity, team, and the season when relevant). Season right now: ${seasonOf(p.date)}.
- Natural language. No keyword stuffing. No engagement bait ("comment YES", "like if", "tag 3 friends"). Hashtags must be relevant, specific, not banned or generic spam (#fyp, #viral, #explore are not allowed).
- Hashtag mix per channel: about 1 broad + 2 niche + 1 branded. Branded tag is always #RSHSports${isDyk(p) ? ', and this is a Did You Know post so also use the series tag #RSHDidYouKnow' : ''}.
- Exact limits (2025–2026 platform rules): Instagram max 5 hashtags; TikTok max 5; Facebook 2–3; YouTube 3 (shown above the title); Threads exactly 1 topic tag (may contain spaces is not needed, use one word); Bluesky 1–3 matching active community feeds; Pinterest NO hashtags (keywords instead).
- Keyword placement: the primary keyword belongs in the first ~55 characters of the caption (Reels and Instagram Google previews cut early), at the start of YouTube and Pinterest titles, said aloud and shown on screen in the first 3 seconds of any video (TikTok and YouTube read speech and on-screen text).
- Captions are already approved and will not be rewritten; you suggest an optional keyword-first opening line instead.

CAMPAIGN
Title: ${p.title || ''}
Sport: ${p.sport || ''} · Audience: ${p.audience || ''} · Goal: ${p.goal || ''}
Main channel: ${p.platform || ''} · Format: ${p.postType || ''} · Date: ${p.date || ''}
Hook: ${p.hook || ''}
Caption: ${p.captionBody || p.caption || ''}
Call to action: ${p.cta || ''}
Existing hashtags: ${p.hashtags || ''}
On-image text: ${p.onImageText || ''}
${seasonContext()}
${resultsForPrompt()}

Answer with JSON only, exactly these keys:
{"primaryKeyword":"...","keywords":[3 to 6 secondary long-tail phrases, lowercase],
 "firstLine":"an optional keyword-first opening sentence under 90 characters, same meaning as the hook, no new facts",
 "onScreenText":"text to show in the first 3 seconds of the video, under 45 characters, contains the primary keyword or its core words",
 "spokenLine":"one short sentence to say in the first 3 seconds, contains the primary keyword",
 "altText":"literal description of what the photo or video shows, under 200 characters, primary keyword used naturally once",
 "instagram":{"hashtags":[3 to 5]},
 "facebook":{"hashtags":[2 or 3]},
 "tiktok":{"title":"under 90 characters, keyword first","hashtags":[3 to 5]},
 "youtube":{"title":"under 70 characters, primary keyword first","descriptionLead":"first 2 lines of the description, under 150 characters, keyword in the first sentence","tags":[5 to 8 tags incl. the brand name and one common misspelling of the main product word, no #],"hashtags":[3]},
 "pinterest":{"title":"under 100 characters, keyword within the first 40","description":"2 or 3 sentences, under 450 characters, keywords used naturally, no hashtags"},
 "threads":{"hashtags":[1]},
 "bluesky":{"hashtags":[1 to 3]},
 "notes":"one sentence of senior advice for this post (e.g. what to show on screen, or a board name for Pinterest)"}`;
  }
  const clean = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const tagList = (v, hash, n) => (Array.isArray(v) ? v : []).map(t => String(t || '').trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_ ]/gu, '')).map(t => hash ? t.replace(/\s+/g, '') : t).filter(Boolean).slice(0, n).map(t => hash ? '#' + t : t);
  async function writeSeo(p) {
    const sample = await use('sample'); if (!sample) { seoNote = 'Asking Claude is not available in this view, so Quill could not write SEO.'; return false; }
    try {
      const r = await sample.json(seoPrompt(p), { modelTier: 'quick' }), x = r && r.value !== undefined ? r.value : r;
      if (!x || typeof x !== 'object') return false;
      const brand = l => { const out = l.filter(t => !/^#(fyp|foryou|foryoupage|viral|explore|trending|like4like|follow4follow)$/i.test(t)); return out; };
      const capTags = (ch, v) => { const l = brand(tagList(v, true, 10)), n = MAXTAGS[ch]; if (!n) return []; if (!l.some(t => /^#RSHSports$/i.test(t)) && n >= 3) { l.splice(Math.min(l.length, n - 1), 0, '#RSHSports'); } return l.slice(0, n); };
      seo[p.id] = { sig: seoSig(p), at: new Date().toISOString(), v: 2, primary: clean(x.primaryKeyword, 60).toLowerCase(), keywords: tagList(x.keywords, false, 6), firstLine: clean(x.firstLine, 90), onScreen: clean(x.onScreenText, 45), spoken: clean(x.spokenLine, 140), altText: clean(x.altText, 220), notes: clean(x.notes, 240),
        instagram: { hashtags: capTags('instagram', x.instagram && x.instagram.hashtags) }, facebook: { hashtags: capTags('facebook', x.facebook && x.facebook.hashtags) },
        tiktok: { title: clean(x.tiktok && x.tiktok.title, 90), hashtags: capTags('tiktok', x.tiktok && x.tiktok.hashtags) },
        youtube: { title: clean(x.youtube && x.youtube.title, 100), descriptionLead: clean(x.youtube && x.youtube.descriptionLead, 160), tags: tagList(x.youtube && x.youtube.tags, false, 8), hashtags: capTags('youtube', x.youtube && x.youtube.hashtags) },
        pinterest: { title: clean(x.pinterest && x.pinterest.title, 100), description: clean(x.pinterest && x.pinterest.description, 450) },
        threads: { hashtags: capTags('threads', x.threads && x.threads.hashtags) }, bluesky: { hashtags: capTags('bluesky', x.bluesky && x.bluesky.hashtags) } };
      return true;
    } catch (e) { seoNote = 'Quill could not reach Claude' + (e && e.code ? ` (${e.code})` : '') + '. SEO will be tried again on the next run.'; return false; }
  }
  async function seoRun(posts, step) {
    seoNote = ''; let wrote = 0;
    const week = Date.now() - 7 * 864e5, todo = posts.filter(p => !seo[p.id] || seo[p.id].sig !== seoSig(p) || seo[p.id].v !== 2 || new Date(seo[p.id].at).getTime() < week).slice(0, 12);   // refreshed weekly so new results feed in
    for (const p of todo) { step && step(`Quill is writing SEO for “${cut(p.title, 40)}”…`); if (await writeSeo(p)) wrote++; else if (seoNote) break; }
    if (wrote && db) { try { await db.doc('bots/seo').set({ json: JSON.stringify(seo).slice(0, 240000), updatedAt: new Date().toISOString() }); } catch (_) {} }
    return { wrote, have: posts.filter(p => seo[p.id]).length, total: posts.length };
  }
  const seoFor = (postId, ch) => { const x = seo[postId]; return x ? { ...x, ch: x[ch] || {} } : null; };

  /* ---------- 0. Sage, the Script Writer ----------
   * For every campaign Sage writes the full production pack in the RSH house format (Content Rules Kit, Nov 26 2026):
   * READ THIS FIRST · Part 1 verified / to confirm / not used · Part 2 image prompts · Part 3 motion prompts ·
   * Part 4 editor prompt · Part 5 voiceover · Part 6 caption · Part 7 checks. One document per campaign in "scripts".
   * The team can edit a pack; an edited pack is never overwritten. Edit jobs use Sage's pack when no script file was uploaded. */
  let scripts = {}, sageNote = '', sageBusy = '';
  const openPacks = new Set();
  let deskOpen = false;
  const hashOf = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const scriptSig = p => hashOf([p.title, p.hook, p.caption, p.captionBody, p.cta, p.platform, p.postType, p.date, p.sport, p.audience, p.goal, p.onImageText, p.visualConcept, p.aspectRatio].map(x => String(x || '')).join('|') + (NO_NUMBER.test(String(p.sport || '')) ? '|kit-rule-2' : '') + (rbOn(p.date) ? '|rulebook-1' : ''));   // kit-rule-2: wrestling singlets carry no player number (Nov 26)
  async function loadScripts() { if (!db) return; try { const q = await db.collection('scripts').get(); const m = {}; for (const s of q.docs) { const d = s.data(); if (d && d.postId && d.text) m[d.postId] = d; } scripts = m; } catch (_) {} }
  const isStill = p => /image|photo|carousel|graphic|pin/i.test(String(p.postType || '')) && !/video|reel|short|story/i.test(String(p.postType || ''));
  function scriptPrompt(p) {
    const sport = String(p.sport || '').trim(), tag = TAGVERB[sport.toLowerCase().split(/[ /]/)[0]], still = isStill(p), neg = app().negativePrompt ? app().negativePrompt() : '';
    return `You are Sage, the senior script writer for RSH Sports (rshsports.com), a US maker of custom team uniforms and apparel (wrestling singlets, basketball, softball, soccer and hockey uniforms, online team stores). Buyers: high school and club coaches, athletic directors, team parents and athletes. You have written hundreds of short sports videos that people follow and comment on. Write the complete PRODUCTION PACK for the campaign at the end, in plain text, following the RSH Content Rules Kit exactly.

GROUND RULES
- Use only the facts in the campaign. Never invent product details, colours, prices, discounts, availability, testimonials, results, rule numbers, dates or athlete permissions. If something needed is missing, say so and leave a clearly marked placeholder in [BRACKETS]; do not guess.
- If the campaign and these rules disagree, follow the campaign and point out the conflict in READ THIS FIRST.
- Lifestyle scenes may be AI-generated. Anything that must show a real RSH product uses real photos or footage: do not write a text-to-image prompt for the product itself; say which real photos to use.
- Logo rule: uniforms carry the team's own identity (${kitId(sport)}), never the RSH logo; never draw the RSH logo in an image. RSH branding only as a small corner watermark and on the end card. No third-party logos or marks on shoes, socks, apparel, bags or equipment. Original invented teams only (no real school, club or league).
- No real, identifiable people; adults only (write "adult", an age range, in every prompt); face-safe framing when people appear.
- No text baked into images: only the uniform's team name${NO_NUMBER.test(sport) ? '' : ' and number'}. All other text and numbers are added in editing.${NO_NUMBER.test(sport) ? ' Wrestling singlets carry NO player number: write the singlet with the team or school name and crest only, and add "numbers on the singlet" to every negative prompt.' : ''}
- Sport-correct gear (a wrestling singlet is a true form-fitting one-piece).
- Tagline, only if used: "Look fearless. ${tag || '[sport verb]'} fearless."${tag ? '' : ' Only the wrestling verb is confirmed; mark any other verb as to confirm.'}

SCRIPT RULES
- Hook: on screen and readable in the first second; use the campaign hook word for word; no brand name in the hook.
- One idea per line, the sport's real words. One clear ask for the viewer, last (a real question or "A or B"; never "like/comment/share to win" bait).
- On-screen text: one message at a time, each line fully readable at least 2.5 s (hook 3 s); if a shot is shorter, the text stays up across the cut. Bold condensed uppercase white with a soft shadow; no text in the top 8% or bottom 12%.
- Pacing: no shot under 2.5 s unless the storyboard asks; few shots; slowed clips use frame blending, never loops.
- Voiceover (optional): calm and clear, about 1.7 words per second or fewer; each line with its time range; total word count and tone; say which sections have no voice; the video must work with the sound off.
- Music: one continuous free, no-copyright track, 0.5 s fade-in, 1.5 s fade-out, ducked under the voice, never cut.
- Quote of the Day, Motivational and Did You Know videos without a storyboard get a 2–3 s mid-roll soft sell at the midpoint: "Custom teamwear · RSH Sports" over a uniform shot.
- Did You Know: evergreen facts only, and list each key fact with its source at the end of Part 1.
- Length: about 15–20 s unless the campaign says otherwise. Every video, Did You Know included, is 9:16 1080×1920 (Facebook now shows every video as a Reel; YouTube takes it as a Short). Only a separate YouTube long video is 16:9 1920×1080.
${sizeLines(p)}
Write every image prompt for the main size above, and say in each scene how to re-frame it for the other sizes listed (same scene, nothing important near the edges).

PRODUCTION PACK LAYOUT (each part under a line of ===== and its heading)
Title block: "RSH SPORTS — PRODUCTION PACK", the campaign title, then channel · ratio · size · length · planned date · owner.
READ THIS FIRST — the route (AI-generated scenes, real photos, or real footage) and why; decisions that need sign-off; placeholders to fill.
PART 1 — WHAT IS VERIFIED AND WHAT IS MISSING — VERIFIED (only facts stated in the campaign); TO CONFIRM BEFORE POSTING (numbered); NOT USED ON PURPOSE.
PART 2 — IMAGE PROMPTS — one per scene in storyboard order, each complete on its own (same athlete, kit and setting described with the same words every time; the seconds it covers). Each has "Image prompt:" (style and format, subject and one simple action, the uniform with the team's own colours and ${kitId(sport)}, plain shoes and socks with no markings, setting, camera angle and lens look, light, mood, realistic fabric and skin, where the frame stays clean for text) and "Negative prompt:" = this list word for word, then scene-specific items:
${neg}${kitNeg(sport) ? '; ' + kitNeg(sport) : ''}
PART 3 — MOTION PROMPTS — one per image, 3–5 s, beginning "Use the image as the exact first frame." Camera movement only (slow push-in 4–5%, slow glide or slow rise), no shake; say that the athlete, kit, colours${NO_NUMBER.test(sport) ? ' and team name' : ', name and number'} stay unchanged.${still ? ' This campaign is a still post: write "Not needed for a still post" here unless the campaign asks for motion.' : ''}
PART 4 — EDITOR PROMPT (to paste into an AI video editor) — format and one sentence on the feel; the HOUSE STYLE block; the full TIMELINE with exact times (0:00–0:02 …): which clip, every on-screen line in quotation marks with its in and out time, transitions (soft 10–15-frame cross-dissolves), music, the END CARD, export settings. House style: ${HOUSE}${still ? ' For a still post, write the layout and text for each image or carousel slide instead of a timeline.' : ''}
End card (about 3 s, last frame softly blurred and darkened): line 1 "RSH SPORTS · rshsports.com", line 2 the follow line from the caption${sport ? ` (e.g. "FOLLOW RSH SPORTS FOR MORE ${sport.toUpperCase()} TIPS AND STORIES")` : ''}${tag ? `, optional line 3 "LOOK FEARLESS. ${tag.toUpperCase()} FEARLESS."` : ''}. Three lines at most. Suggested Video Studio Kit engine: ${engineFor(p)}.
PART 5 — VOICEOVER (optional) — lines with time ranges, total words, tone.${still ? ' Write "Not needed for a still post".' : ''}
PART 6 — CAPTION — the campaign caption unchanged. If there is none, write one: line 1 the hook (no brand); line 2 an optional payoff; a blank line; one easy question to answer in a comment; a blank line; the follow line ("Follow RSH Sports for more ${sport ? sport.toLowerCase() + ' ' : ''}stories, tips and team ideas."); "Tag a teammate who needs this."; then 8 to 12 relevant hashtags including #RSHSports.
PART 7 — CHECK BEFORE IT GOES TO REVIEW — a tick-box list: product real and available (or no product shown); colours match; no third-party marks; no price, stock or performance claims; no identifiable person; hook readable in the first second; every line up at least 2.5 s; nothing shakes or flashes; end card and website right; caption matches the campaign.

${rbOn(p.date) ? rbPackRules(p) : ''}Keep it complete but tight: no introduction or sign-off outside the pack.

CAMPAIGN
Title: ${p.title || ''}
Sport: ${sport} · Audience: ${p.audience || ''} · Goal: ${p.goal || ''}
Main channel: ${p.platform || ''} · Format: ${p.postType || ''} · Aspect ratio: ${p.aspectRatio || ''} · Planned date: ${p.date || ''} · Owner: ${p.owner || 'Project Manager'}
Hook: ${p.hook || ''}
On-image text: ${p.onImageText || ''}
Visual concept / storyboard: ${p.visualConcept || ''}
Caption: ${p.captionBody || p.caption || ''}
Call to action: ${p.cta || ''}
Hashtags: ${p.hashtags || ''}
${isDyk(p) ? 'This is a Tuesday Did You Know post.\n' : ''}${productBlock(p) ? productBlock(p) + '\nThis campaign shows a real RSH product: route the product shots through these real photos (the reference image), never a text-to-image product; list the colorway, the reference photos and the vendor-mark check in TO CONFIRM.\n' : ''}${seasonContext()}`;
  }
  function rbPackRules(p) {
    const t = rbTargets(p), home = rbHome(p);
    return `POSTING RULEBOOK (in force Dec 1, 2026 – Dec 31, 2027; it wins over the parts above where they differ)
- Home platform: ${NAME[t[0]]} (${home[1]}). Write Parts 2–5 for the home platform's own style.
- One idea, a separately produced post per platform: the same file never goes to two platforms, and a re-cut, trim or re-caption does not count${isDyk(p) ? ' (the DYK is the one exception: the same video goes to Instagram 7 AM and YouTube 4 PM on Tuesday, and to no other platform)' : ''}.
- This idea goes to: ${t.map(c => NAME[c]).join(', ')} (the home platform first, the others later the same week; never more than three besides the home).
- Tagline closes the Facebook and Instagram versions only: "${TAGLINE(p.sport) || 'Look fearless. [sport verb] fearless.'}" (soccer and basketball Play, wrestling Wrestle, hockey Skate, running Run, boxing and MMA Fight; never default to Play).
- One CTA per post: Facebook and Instagram put the website link in the first comment (Instagram also says "Link in bio"); TikTok and YouTube Shorts point to the bio or channel link; Threads and Bluesky say it in plain words; Pinterest carries the link in the pin.
Add PART 8 — PLATFORM VERSIONS: one block for each of ${t.map(c => NAME[c]).join(', ')}, each produced separately (its own Google Flow prompt, never a trim of another), with: video style, Flow prompt (complete, with the negative list), length and ratio, audio, text on screen, the caption in that platform's format, CTA placement, and the slot. Styles:
  Facebook: story reel, cinematic three-beat narrative (setup, turn, payoff) with a coach voiceover and low music, 30–45 s 9:16, lower-third title on the last beat; caption 2–3 conversational sentences with a question, 3–5 hashtags.
  Instagram: quote reel, one static hero frame with the athlete mid-motion on a clean background, bold centred overlay from frame 1 building word by word, trending audio, no voice, 7–15 s 9:16, loops cleanly; caption = hook line, blank line, 1–2 lines, blank line, 5 hashtags.
  TikTok: handheld phone-style POV, jump cuts, natural light, whip pans, slightly imperfect framing, direct to camera, ends on a choice ("1 or 2?"), bottom captions, 8–15 s 9:16; caption one line ending on a question, 3–4 hashtags inline.
  YouTube: explainer Short, title card, three points, studio product shots on white seamless with a slow turntable and macro on fabric and seams, narration with no music under the voice, 20–45 s 9:16; title = a search query under 100 characters with 3 hashtags at the end; description = one line + www.rshsports.com.
  Threads: the text is the post (1–3 lines, the sentence a coach would say out loud, one topic tag, no hashtags); optional proof frame, a 3-second loop or still, 4:5; then reply to the post with the question.
  Bluesky: one still image, an editorial photo in natural light with the product clearly visible, 4:5; 1–2 lines under 300 characters with rshsports.com spelled out.
  Pinterest: a catalog-clean product still, 2:3 1000×1500 (or a 3–5 slide 9:16 Idea Pin), keyword title overlay, one pin per colour; title = the search term, description = 2 sentences that repeat the keyword, link to the product page.
`;
  }
  async function writeScript(p) {
    const sample = await use('sample'); if (!sample) { sageNote = 'Asking Claude is not available in this view, so Sage could not write production packs.'; return false; }
    try {
      const r = await sample(scriptPrompt(p), { modelTier: 'default' }), text = String((r && r.text) || '').replace(/\r\n/g, '\n').trim();
      if (!/PART 2/.test(text) || !/PART 4/.test(text)) { sageNote = 'Sage’s last draft came back incomplete; she tries again on the next run.'; return false; }
      const doc = { postId: p.id, title: String(p.title || '').slice(0, 120), text: text.slice(0, 60000), sig: scriptSig(p), at: new Date().toISOString(), by: 'sage', edited: false, truncated: !!(r && r.truncated), v: 1 };
      scripts[p.id] = doc; if (db) { try { await db.doc('scripts/' + p.id).set(doc); } catch (_) { sageNote = 'Sage wrote a pack but it could not be saved. Only people who can use this page can save.'; } }
      return true;
    } catch (e) { sageNote = e && e.code === 'not_granted' ? 'Claude access was not allowed on this page, so Sage could not write.' : e && e.code === 'rate_limited' ? 'Claude is busy right now; Sage writes the rest on the next run.' : 'Sage could not reach Claude this time; she tries again on the next run.'; return false; }
  }
  // Writes packs for campaigns that have none, or whose campaign changed since (never over a pack the team edited). At most 3 per run.
  async function scriptRun(posts, step) {
    sageNote = ''; let wrote = 0;
    const todo = posts.filter(p => { const s = scripts[p.id]; return !s || (!s.edited && s.sig !== scriptSig(p)); }).slice(0, 3);
    for (const p of todo) { sageBusy = p.id; step && step(`Sage is writing the production pack for “${cut(p.title, 40)}”…`); const ok = await writeScript(p); if (ok) wrote++; else if (sageNote) break; }
    sageBusy = '';
    return { wrote, have: posts.filter(p => scripts[p.id]).length, total: posts.length };
  }
  async function saveScript(id, text) {
    const p = (app().data().posts || []).find(x => x.id === id), cur = scripts[id] || {};
    const doc = { ...cur, postId: id, title: String((p && p.title) || cur.title || '').slice(0, 120), text: String(text).slice(0, 60000), edited: true, editedAt: new Date().toISOString(), sig: p ? scriptSig(p) : cur.sig, at: cur.at || new Date().toISOString(), by: cur.by || 'team' };
    scripts[id] = doc; if (db) await db.doc('scripts/' + id).set(doc); return doc;
  }
  // One part of a pack: 2 = image prompts, 3 = motion prompts, 4 = editor prompt, 5 = voiceover, 6 = caption.
  function packPart(text, n) {
    const t = String(text || ''), re = new RegExp('^[ \\t]*PART ' + n + '\\b.*$', 'm'), m = re.exec(t); if (!m) return '';
    const rest = t.slice(m.index), nx = /\n[=\s]*\n?[ \t]*PART \d\b/.exec(rest.slice(m[0].length));
    return rest.slice(0, nx ? m[0].length + nx.index : undefined).replace(/[\s=]+$/, '').trim();
  }
  const packFor = id => (scripts[id] && scripts[id].text) || '';

  /* ---------- Real products from rshsports.com ----------
   * The store catalog (uniforms and apparel, built from rshsports.com/products.json by the Claude session) lives in
   * catalog/chunk0..n. When a campaign is about a garment, the app matches it to the real products and shows their
   * store photos. Photos are copied into this app (collection "refs", one document per product with asset ids) so the
   * team can download them at full quality and attach them as the reference image when generating or editing.
   * Store photos can show the vendor's logo, text panels or youth models: they are a garment reference only. */
  let catalog = [], refs = {}, pins = {}, prodQ = {};
  async function loadCatalog() {
    if (!db) return; const all = [];
    for (let n = 0; n < 8; n++) { try { const d = await db.doc('catalog/chunk' + n).get(); if (!d.exists) break; all.push(...(JSON.parse(d.data().json || '[]') || [])); } catch (_) { break; } }
    catalog = all;
    try { const q = await db.collection('refs').get(); const m = {}; for (const s of q.docs) { const d = s.data(); if (d && d.h) m[d.h] = d; } refs = m; } catch (_) {}
    try { const d = await db.doc('bots/productPins').get(); pins = d.exists ? (JSON.parse(d.data().json || '{}') || {}) : {}; } catch (_) {}
  }
  const GARMENT = /singlet|uniform|jersey|\bkit\b|pants|shorts|rash ?guard|colou?rway|colou?r|apparel|team look|team store|size guide|\bfit\b|reversible|spat|trunks/;
  const campText = p => [p.title, p.hook, p.captionBody || p.caption, p.visualConcept, p.visualPrompt, p.onImageText].join(' ').toLowerCase();
  function productsFor(p, n) {
    n = n || 4; if (!catalog.length || !p) return [];
    if (pins[p.id] && pins[p.id].length) return pins[p.id].map(h => catalog.find(c => c.h === h)).filter(Boolean);
    const T = campText(p); if (!GARMENT.test(T)) return [];
    const sp = String(p.sport || '').toLowerCase().trim();
    return catalog.map(c => {
      const ct = (c.t + ' ' + c.ty).toLowerCase(); let s = 0;
      if (sp && c.sp) { if (c.sp.toLowerCase() !== sp) return [c, -9]; s += 3; }
      if (/reversible/.test(T)) s += /reversible/.test(ct) ? 6 : -2;
      if (/\bgirls?\b|female|women/.test(T)) s += c.f ? 4 : -1; else if (c.f) s -= 2;
      if (/youth|kids?\b/.test(T)) s += /youth|boys|kids/.test(ct) ? 1 : 0; else if (/youth|boys|kids/.test(ct) && !/adult/.test(ct)) s -= 1;
      if (/sublimat|pattern|print/.test(T)) s += /sublimat/.test(ct) ? 2 : 0; else if (/solid/.test(ct)) s += 1;
      if (/singlet/.test(T) && /singlet/.test(ct)) s += 2;
      for (const col of String(c.col || '').toLowerCase().split(' / ')) if (col && new RegExp('\\b' + col.replace(/[^a-z ]/g, '') + '\\b').test(T)) s += 2;
      return [c, s];
    }).filter(x => x[1] >= 3).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
  }
  function searchCatalog(q, n) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(w => w.length > 1); if (!words.length) return [];
    return catalog.map(c => { const t = `${c.t} ${c.ty} ${c.sp} ${c.col}`.toLowerCase(); return [c, words.filter(w => t.includes(w)).length]; }).filter(x => x[1] === words.length).slice(0, n || 8).map(x => x[0]);
  }
  async function savePins() { if (db) { try { await db.doc('bots/productPins').set({ json: JSON.stringify(pins), updatedAt: new Date().toISOString() }); } catch (_) { note = 'The product choice could not be saved.'; } } }
  // Ask the Claude session to copy a product's store photos into the app (it downloads them and records them in "refs").
  async function requestPhotos(handles) {
    const hs = handles.filter(h => !refs[h] || refs[h].status === 'failed'); if (!hs.length || !db) return false;
    for (const h of hs) { refs[h] = { h, status: 'queued', at: new Date().toISOString() }; try { await db.doc('refs/' + h).set(refs[h]); } catch (_) {} }
    try { const mcp = await use('mcp'); if (mcp) await mcp.callTool(REMOTE, 'send_message', { session_id: EDITOR_SESSION, message: `[RSH Sports Marketing OS: product photo request. Sent by the app on behalf of the team.]\n\nCopy the store photos of these rshsports.com products into the app so the team can use them as references: ${hs.join(', ')}.\nFollow studio/WORKFLOW.md, section "Product photos": run studio/tools/mirror_refs.py, upload the files as assets of ${APP_URL}, then write refs/<handle> with status "ready" and the asset list. Do not change anything else.` }); } catch (_) {}
    return true;
  }
  const refName = (c, k) => `${slug(c.t) || 'rsh-product'}-${k + 1}.${/\.png$/i.test((c.i[k] || {}).src || '') ? 'png' : /\.webp$/i.test((c.i[k] || {}).src || '') ? 'webp' : 'jpg'}`;
  // The reference block for prompts and jobs: real product, store facts, and how to use the photo safely.
  function productBlock(p) {
    const ps = productsFor(p); if (!ps.length) return '';
    return `REAL PRODUCT REFERENCE (an actual RSH Sports product: show it exactly, invent nothing)\n` + ps.map(c => {
      const r = refs[c.h], files = r && r.status === 'ready' && r.assets ? r.assets.map(a => `${a.name} (asset ${a.id})`).join(', ') : '';
      return `- ${c.t}${c.col ? ` · colorway ${c.col}` : ''} · store page ${c.url}${c.o && Object.keys(c.o).length ? ` · ${Object.entries(c.o).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ')}` : ''}\n  Store facts: ${(c.b || []).join(' · ') || 'see the store page'}\n  Reference photos: ${files || `${c.i.length} store photos (download them from the campaign in the app)`}`;
    }).join('\n') + `\nUse the main reference photo as the image generator's reference image and reproduce the garment exactly: same cut, colours, panels, piping and graphics; add nothing and remove nothing, except the vendor's logo or wordmark (for example the print on the leg), which must not appear anywhere. Do not copy any person, face or model from the store photos; use an adult athlete as the prompt describes. Never post a store photo as it is. No price, stock or delivery claims.`;
  }
  function productHtml(p) {
    const ps = productsFor(p), q = prodQ[p.id], found = q ? searchCatalog(q) : [];
    if (!ps.length && !GARMENT.test(campText(p)) && !q) return '';
    const card = c => { const r = refs[c.h], ready = r && r.status === 'ready' && r.assets && r.assets.length;
      return `<div style="display:grid;gap:6px;padding:8px;border:1px solid #e5e7eb;border-radius:10px;background:#fff"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span><strong>${esc(c.t)}</strong>${c.col ? ` <span class="small">· ${esc(c.col)}</span>` : ''}</span><span style="display:flex;gap:6px;flex-wrap:wrap"><a class="small" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Store page ↗</a>${pins[p.id] && pins[p.id].includes(c.h) ? `<button type="button" class="btn ghost smallbtn" data-prod-unpin="${esc(p.id)}|${esc(c.h)}">Remove</button>` : ''}</span></div>
        ${ready ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${r.assets.map((a, k) => `<figure style="margin:0;display:grid;gap:3px;justify-items:center"><img src="/_blob/${esc(a.id)}" alt="${esc(c.t)} store photo ${k + 1}" loading="lazy" style="width:84px;height:104px;object-fit:contain;background:#f8fafc;border-radius:6px;border:1px solid #e5e7eb"><button type="button" class="btn ghost smallbtn" data-prod-dl="${esc(c.h)}|${k}" style="padding:2px 8px">⬇ ${k === 0 ? 'Main' : k + 1}</button><button type="button" class="btn ghost smallbtn" data-prod-use="${esc(p.id)}|${esc(c.h)}|${k}" style="padding:2px 8px" title="The editor makes a brand-safe ${POST_SIZE(p)[2]} post image from this photo and attaches it to the campaign">Use in post</button></figure>`).join('')}</div><div><button type="button" class="btn ghost smallbtn" data-prod-dl="${esc(c.h)}|all">⬇ Download all ${r.assets.length} photos</button></div>`
        : r && (r.status === 'queued' || r.status === 'working') ? `<div class="small">Photos requested ${esc(new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}. The Claude session copies them in; they appear here when ready.</div>`
        : `<div class="small">${c.i.length} store photo${c.i.length === 1 ? '' : 's'} on rshsports.com. ${r && r.status === 'failed' ? 'The last copy failed. ' : ''}<button type="button" class="btn ghost smallbtn" data-prod-get="${esc(p.id)}|${esc(c.h)}">Get the photos</button></div>`}</div>`; };
    return `<details class="prods" data-prod-box="${esc(p.id)}" ${openProds.has(p.id) ? 'open' : ''} style="margin:8px 0;border:1px solid #dbeafe;background:#eff6ff;border-radius:10px;padding:6px 10px"><summary style="cursor:pointer"><strong>👕 Real products for this post</strong> <span class="small">· ${ps.length ? `${ps.length} from rshsports.com${pins[p.id] && pins[p.id].length ? ' (chosen by the team)' : ' (matched by the bots)'}` : 'none matched yet'}</span></summary>
      <p class="small" style="margin:6px 0">Use these exact garments in the image prompt and the edit. Download a photo at full quality and attach it as the reference image. <strong>Store photos can show the vendor’s logo, text panels or youth models:</strong> use them only as a garment reference, keep the vendor’s logo out, and never post a store photo as it is.</p>
      <div style="display:grid;gap:8px">${ps.map(card).join('') || '<div class="small">No product matched. Search the store catalog below.</div>'}</div>
      ${readyRefs(p).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px"><span class="small"><strong>No new assets needed:</strong> “Use in post” turns a store photo into a brand-safe ${esc(POST_SIZE(p)[2])} post image${/pinterest/i.test(p.platform || '') ? ' (Pinterest pin, linked to the product page)' : ''}.</span>${needsVideo(p) || /reel|video|tiktok|youtube/i.test(`${p.postType} ${p.platform}`) ? `<button type="button" class="btn smallbtn" data-prod-video="${esc(p.id)}">🎬 Make the video from these store photos</button>` : ''}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center"><input type="search" data-prod-q="${esc(p.id)}" value="${esc(q || '')}" placeholder="Find another product: e.g. navy singlet" aria-label="Search the store catalog" style="flex:1;min-width:180px"><button type="button" class="btn ghost smallbtn" data-prod-search="${esc(p.id)}">Search</button>${ps.some(c => !(refs[c.h] && refs[c.h].status === 'ready')) ? `<button type="button" class="btn ghost smallbtn" data-prod-getall="${esc(p.id)}">Get photos for all</button>` : ''}</div>
      ${q ? `<div style="display:grid;gap:4px;margin-top:6px">${found.length ? found.map(c => `<div class="small" style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>${esc(c.t)}${c.col ? ' · ' + esc(c.col) : ''}</span><button type="button" class="btn ghost smallbtn" data-prod-pin="${esc(p.id)}|${esc(c.h)}">Use for this post</button></div>`).join('') : '<div class="small">Nothing in the catalog matches every word.</div>'}</div>` : ''}
      ${catalog.length ? `<div class="small" style="margin-top:6px">Catalog: ${catalog.length} uniforms and apparel from rshsports.com.</div>` : '<div class="small" style="margin-top:6px">The store catalog has not been loaded into the app yet.</div>'}</details>`;
  }
  const openProds = new Set();
  // Store photos straight into a post: the editor makes a brand-safe post image (or the whole video) from them.
  const POST_SIZE = p => { const g = sizePlan(p)[0]; return [g.w, g.h, g.ratio]; };
  const readyRefs = p => productsFor(p).filter(c => refs[c.h] && refs[c.h].status === 'ready' && refs[c.h].assets && refs[c.h].assets.length);
  async function productJob(pid, kind, picks) {
    const p = (app().data().posts || []).find(x => x.id === pid); if (!p || !db) return 'The campaign could not be found.';
    const cur = jobs[pid]; if (cur && (cur.status === 'queued' || cur.status === 'sent')) return 'Reel already has a job for this campaign. Wait for it to come back first.';
    if (!picks || !picks.length) picks = readyRefs(p).flatMap(c => refs[c.h].assets.slice(0, 3).map((a, k) => [c.h, k])).slice(0, 12);
    const files = picks.map(([h, k]) => { const a = refs[h] && refs[h].assets && refs[h].assets[k]; return a ? { name: a.name, mime: a.mime || 'image/webp', bytes: a.bytes || 0, encoding: 'raw', parts: [{ id: a.id, start: 0, end: a.bytes || 0 }] } : null; }).filter(Boolean);
    if (!files.length) return 'Get the store photos first.';
    const [w, h, ratio] = kind === 'video' ? [1080, 1920, '9:16'] : POST_SIZE(p);
    const job = { postId: pid, title: String(p.title || '').slice(0, 120), status: 'queued', queuedAt: new Date().toISOString(), source: kind === 'video' ? 'product-video' : 'product-image', files: files.length, manifest: JSON.stringify(files), size: `${w}x${h}`, ratio, sizes: kind === 'video' ? `${w}x${h} (${ratio})` : sizePlan(p).map(g => `${g.w}x${g.h} (${g.ratio}) for ${g.channels.map(c => NAME[c]).join(', ')}`).join('; '), products: [...new Set(picks.map(x => x[0]))].join(','), ...(cur && cur.status ? { revisionOf: cur.assetId || '' } : {}) };
    jobs[pid] = job; try { await db.doc('editJobs/' + pid).set(job); } catch (_) { return 'The job could not be saved.'; }
    wake = kind === 'video' ? `Reel sent “${cut(p.title, 40)}” to the editor: a video made from the real store photos.` : `Reel sent a store photo of “${cut(p.title, 40)}” to the editor for a brand-safe ${ratio} post image.`;
    dispatch(); return '';
  }
  function productHandoff(p, j) {
    let files = []; try { files = JSON.parse(j.manifest || '[]'); } catch (_) {}
    const list = files.map((f, n) => `${n + 1}. ${f.name} (${f.mime}${f.bytes ? ', ' + Math.round(f.bytes / 1024) + ' KB' : ''}) asset: ${f.parts.map(x => x.id).join(' + ')}`).join('\n');
    const get = `GET THE FILES: for each asset id below, use the Artifact tool with action read, url ${APP_URL}, and path set to the asset id; it saves the file locally.\n${list}`;
    const safe = 'BRAND SAFETY: these are rshsports.com store photos. Keep the garment exactly as it is (cut, colours, panels, piping, graphics; no colour filters). Remove the vendor’s logo or wordmark (for example the print on the leg) by patching or cropping, and remove any text panels or size charts. If a photo shows a person, crop to the garment so no face shows (store photos can show youth models) or leave that photo out. Small RSH watermark bottom-right only; no price, stock or delivery claims.';
    if (j.source === 'product-image') {
      return `[RSH Sports Marketing OS: automatic product image job. Sent by the app on behalf of the team.]\n\nPRODUCT POST IMAGE — ${p.title}\nCampaign for ${p.platform || 'social media'}, planned ${p.date || 'no date yet'}. Sport: ${p.sport || 'not set'}.\n\nMake the post image from the store photo below, so the post shows the exact real garment, in EVERY size this campaign needs: ${j.sizes || j.size + ' (' + j.ratio + ')'}. One file per size, same garment re-framed (never stretched); name each with its ratio (e.g. -4x5, -2x3, -9x16). Return the main size (${j.size}) as assetId and every other size in "extra": [{"assetId","mime","bytes","name","width","height"}], and give width and height for the main file too. Use studio/tools/product_post_image.py (see studio/WORKFLOW.md, "Product photos"). Garment centred on a clean light background, nothing in the top 8% or bottom 12% except the watermark.${p.onImageText ? `\nOn-image text (optional, large and short, from the campaign): "${sentence(p.onImageText)}"` : ''}${/pinterest/i.test(p.platform || '') ? '\nPinterest: a vertical 2:3 pin; a short keyword title overlay is fine when the campaign has on-image text.' : ''}\n${safe}\nReturn a JPEG under 5 MB.\n\n${get}\n\n${productBlock(p)}\n\n${RETURN_STEPS(p.id).replace('WHEN THE VIDEO IS FINISHED', 'WHEN THE IMAGE IS FINISHED').replace(/the MP4/g, 'the JPEG').replace('"mime":"video/mp4"', '"mime":"image/jpeg"').replace('<file name>.mp4', '<file name>.jpg')}`;
    }
    return `[RSH Sports Marketing OS: automatic product video job. Sent by the app on behalf of the team.]\n\nPRODUCT VIDEO — ${p.title}\nNo footage was needed: build the campaign video from the real rshsports.com store photos below (Video Studio Kit engine 07, product photos: cut-outs, slow push-ins, soft flips between colorways). 1080×1920, 30 fps, MP4 (H.264 + AAC), under 15 MB.\n${safe}\n\n${get}\n\n${editJob(p)}\n\n${RETURN_STEPS(p.id)}`;
  }
  // Every file attached to the campaign, downloadable at its original quality.
  function mediaHtml(p) {
    const files = [p.creativeAsset].concat(p.creativeAssets || []).filter((a, i, arr) => a && a.id && arr.findIndex(b => b && b.id === a.id) === i);
    if (!files.length) return '';
    return `<div style="margin:6px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="small"><strong>Attached files</strong> (original quality):</span>${files.map((a, k) => `<button type="button" class="btn ghost smallbtn" data-bot-dlmedia="${esc(p.id)}|${k}" title="${esc(a.name || '')}">⬇ ${esc(cut(a.name || (/video/.test(a.mime || '') ? 'video' : 'photo'), 32))}${a.bytes ? ` · ${kb(a.bytes)}` : ''}</button>`).join('')}</div>`;
  }
  function packHtml(p) {
    const s = scripts[p.id];
    if (!s) return `<div class="small" style="margin:6px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">📝 <span><strong>Sage</strong> ${sageBusy === p.id ? 'is writing this campaign’s production pack now…' : 'has not written this campaign’s production pack yet.'}</span>${sageBusy === p.id ? '' : `<button type="button" class="btn ghost smallbtn" data-sage-write="${esc(p.id)}">Write it now</button>`}</div>`;
    const stale = s.sig !== scriptSig(p), when = new Date(s.editedAt || s.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `<details class="pack" data-sage-pack="${esc(p.id)}" ${openPacks.has(p.id) ? 'open' : ''} style="margin:8px 0;border:1px solid #d1fae5;background:#f0fdf4;border-radius:10px;padding:6px 10px"><summary style="cursor:pointer"><strong>📝 Production pack by Sage</strong> <span class="small">· ${s.edited ? 'edited by the team' : 'written'} ${esc(when)}${stale ? (NO_NUMBER.test(String(p.sport || '')) ? ' · written before the no-number rule for wrestling singlets; Sage rewrites it on her next run' : ' · the campaign changed since; press “Rewrite with Sage” to update it') : ''}${s.truncated ? ' · came back cut short; rewrite it' : ''}</span></summary>
      <p class="small" style="margin:6px 0">Script, image prompts, motion prompts, editor prompt, voiceover, caption and checks, in the RSH house format. Edit it here; your edits are kept. Reel sends it with the video job.</p>
      <textarea data-sage-text="${esc(p.id)}" rows="16" style="width:100%;box-sizing:border-box;font:12px/1.45 ui-monospace,Menlo,monospace" aria-label="Production pack for ${esc(p.title)}">${esc(s.text)}</textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button type="button" class="btn smallbtn" data-sage-save="${esc(p.id)}">Save changes</button><button type="button" class="btn ghost smallbtn" data-sage-copy="${esc(p.id)}" data-part="0">Copy pack</button><button type="button" class="btn ghost smallbtn" data-sage-copy="${esc(p.id)}" data-part="2">Copy image prompts</button><button type="button" class="btn ghost smallbtn" data-sage-copy="${esc(p.id)}" data-part="3">Copy motion prompts</button><button type="button" class="btn ghost smallbtn" data-sage-copy="${esc(p.id)}" data-part="4">Copy editor prompt</button><button type="button" class="btn ghost smallbtn" data-sage-dl="${esc(p.id)}">Save as file</button><button type="button" class="btn ghost smallbtn" data-sage-write="${esc(p.id)}">Rewrite with Sage</button></div></details>`;
  }

  /* ---------- 2. Scheduler Bot ---------- */
  function metricoolBusy() {       // "date|HH:MM|channel" already scheduled in Metricool
    const set = new Set(), sch = (window.RSH_LIVE && window.RSH_LIVE.scheduled()) || [];
    for (const s of sch) for (const ch of String(s[1]).split(',')) set.add(`${s[0].slice(0, 10)}|${s[0].slice(11, 16)}|${ch}`);
    return set;
  }
  // What RSH Sports' own posts show: for each channel, the US Eastern hour whose posts got the most views
  // (interactions when views are missing). Only hours with at least 2 measured posts count.
  function etHour(yyyymmdd, hhmm) {
    const d = new Date(Date.UTC(+String(yyyymmdd).slice(0, 4), +String(yyyymmdd).slice(4, 6) - 1, +String(yyyymmdd).slice(6, 8), +hhmm.slice(0, 2), +hhmm.slice(2, 4)));
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(d));
  }
  function learnedTimes() {
    const rows = (window.RSH_LIVE && window.RSH_LIVE.rows && window.RSH_LIVE.rows()) || [], by = {};
    for (const r of rows) {
      if (!r || !r[7] || !/^\d{4}$/.test(r[7])) continue;
      const ch = String(r[0]).toLowerCase(), score = r[4] != null ? r[4] : r[5]; if (score == null || !NAME[ch]) continue;
      const h = etHour(r[1], r[7]); (by[ch] = by[ch] || {}); (by[ch][h] = by[ch][h] || []).push(score);
    }
    const out = {};
    for (const ch of Object.keys(by)) {
      const hours = Object.entries(by[ch]).filter(([, v]) => v.length >= 2).map(([h, v]) => ({ h: +h, n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.avg - a.avg);
      if (hours.length) out[ch] = { time: String(hours[0].h).padStart(2, '0') + ':00', n: hours[0].n, avg: Math.round(hours[0].avg), tried: hours.length, metric: by[ch] && rows.some(r => String(r[0]).toLowerCase() === ch && r[4] != null) ? 'views' : 'interactions' };
    }
    return out;
  }
  // Results loop: which hashtags went with RSH Sports' best and weakest posts, per channel (own posts, last 28 days).
  function learnedTags() {
    const rows = (window.RSH_LIVE && window.RSH_LIVE.rows && window.RSH_LIVE.rows()) || [], by = {};
    for (const r of rows) {
      const ch = String(r[0]).toLowerCase(), score = r[4] != null ? r[4] : r[5]; if (score == null || !NAME[ch] || !r[8]) continue;
      for (const t of String(r[8]).split(' ').filter(Boolean)) { const k = t.toLowerCase(); ((by[ch] = by[ch] || {})[k] = by[ch][k] || { tag: t, v: [] }).v.push(score); }
    }
    const out = {};
    for (const ch of Object.keys(by)) {
      const l = Object.values(by[ch]).filter(x => x.v.length >= 2).map(x => ({ tag: x.tag, n: x.v.length, avg: Math.round(x.v.reduce((a, b) => a + b, 0) / x.v.length) })).sort((a, b) => b.avg - a.avg);
      if (l.length >= 2) out[ch] = { best: l.slice(0, 6), weak: l.length > 6 ? l.slice(-3) : [] };
    }
    return out;
  }
  function topPosts(days) {
    const rows = (window.RSH_LIVE && window.RSH_LIVE.rows && window.RSH_LIVE.rows()) || [], d = new Date(); d.setDate(d.getDate() - (days || 7)); const from = Number(iso(d).replace(/-/g, ''));
    return rows.filter(r => r[1] >= from && r[4] != null).sort((a, b) => (b[4] || 0) - (a[4] || 0));
  }
  function schedule(items) {
    const busyM = metricoolBusy(), used = new Set(), slots = settings.times.slice().sort(), learned = learnedTimes();
    const free = (it, t) => !used.has(`${it.date}|${t}|${it.channel}`) && !busyM.has(`${it.date}|${t}|${it.channel}`);
    for (const it of items) {
      if (it.edited && it.time) { used.add(`${it.date}|${it.time}|${it.channel}`); continue; }
      if (it.rb && it.rbTimes && it.rbTimes.length) { it.time = it.rbTimes.find(t => free(it, t)) || it.rbTimes[0]; it.why = it.rbWhy; used.add(`${it.date}|${it.time}|${it.channel}`); continue; }   // Posting Rulebook slots win over learned hours
      const L = learned[it.channel];
      if (L && free(it, L.time)) { it.time = L.time; it.why = `Best hour in your own ${NAME[it.channel]} posts: ${L.n} posts around ${clockTxt(L.time)} averaged ${L.avg.toLocaleString('en-US')} ${L.metric}${L.tried === 1 ? ' (all recent posts went out at this hour, so other hours are untested)' : ` (best of ${L.tried} hours tried)`}.`; }
      else {
        // No data for this channel yet: spread channels across the posting times so they don't all land at once.
        const order = slots.length ? slots.map((_, i) => slots[(i + CHANNELS.findIndex(c => c[0] === it.channel)) % slots.length]) : ['18:00'];
        it.time = order.find(t => free(it, t)) || order[0]; it.why = `No measured ${NAME[it.channel]} posts yet, so this uses your posting times from Setup.`;
      }
      used.add(`${it.date}|${it.time}|${it.channel}`);
    }
    return learned;
  }
  function clockTxt(t) { const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; }

  // Posting Rulebook rule 1: one file per platform. A file belongs to a platform when its name says so
  // (e.g. "singlet-tiktok.mp4", "pin-2x3.jpg" for Pinterest); the home platform may also use the untagged file.
  const RB_TAG = { facebook: /(^|[^a-z])(facebook|fb)([^a-z]|$)/i, instagram: /(^|[^a-z])(instagram|insta|ig)([^a-z]|$)/i, tiktok: /(^|[^a-z])(tiktok|tt)([^a-z]|$)/i, youtube: /(^|[^a-z])(youtube|yt|short)([^a-z]|$)/i, threads: /(^|[^a-z])threads([^a-z]|$)/i, bluesky: /(^|[^a-z])(bluesky|bsky)([^a-z]|$)/i, pinterest: /(^|[^a-z])(pinterest|pin)([^a-z]|$)/i };
  const tagOfFile = a => Object.keys(RB_TAG).filter(ch => RB_TAG[ch].test(String(a && a.name || '')));
  function rbFileFor(it, p) {
    const all = [p.creativeAsset].concat(p.creativeAssets || []).filter(Boolean).filter((a, i, arr) => arr.findIndex(b => b.id === a.id) === i);
    const still = it.channel === 'bluesky' || (it.channel === 'pinterest' && kindOf(p) !== 'video'), wantVid = !still && it.channel !== 'threads' && rbFormat(p, it.channel) !== 'image' && rbFormat(p, it.channel) !== 'carousel';
    const okKind = a => still ? /^image\//.test(a.mime || '') : wantVid ? /^video\//.test(a.mime || '') : true;
    const own = all.filter(a => tagOfFile(a).includes(it.channel) && okKind(a));
    if (own.length) return own[own.length - 1];
    if (it.home || (isDyk(p) && (it.channel === 'instagram' || it.channel === 'youtube'))) { const plain = all.filter(a => !tagOfFile(a).length && okKind(a)); if (plain.length) return plain[plain.length - 1]; }
    return null;
  }
  // Was the media generated (Google Flow and similar)? From the file name, or Sage's pack choosing the AI-generated route.
  const aiOf = (p, f) => /(^|[^a-z])(flow|veo|imagen|gemini|generated|ai)([^a-z]|$)/i.test(String(f && f.name || '')) || /READ THIS FIRST[\s\S]{0,600}AI-generated/i.test((scripts[p.id] && scripts[p.id].text) || '');
  const RB_STYLE = { facebook: 'a story reel: cinematic three-beat narrative with a coach voiceover, 30–45 s', instagram: 'a quote reel: one hero shot, bold overlay from frame 1, 7–15 s', tiktok: 'handheld phone-style POV, jump cuts, ends on a choice, 8–15 s', youtube: 'an explainer Short: title card, three points, product b-roll, 20–45 s', threads: 'an optional proof frame: a 3-second loop or still, 4:5', bluesky: 'one still image: an editorial product or athlete photo, 4:5', pinterest: 'a catalog-clean 2:3 still (1000 × 1500) with a keyword title overlay' };
  function rbChecks(it, items, p) {
    const out = [], f = rbFileFor(it, p), dyk = isDyk(p);
    if (it.channel !== 'threads' && !f && !(it.home && !(p.creativeAssets || []).length)) out.push(['stop', `Needs its own ${NAME[it.channel]} version: ${RB_STYLE[it.channel]}. Rulebook: never the same file on two platforms (name the file with “${it.channel}”).`]);
    if (f) { const twin = items.find(o => o !== it && !(dyk && o.postId === it.postId) && (() => { const q = (app().data().posts || []).find(x => x.id === o.postId); return q && o.rb && (rbFileFor(o, q) || {}).id === f.id; })()); if (twin) out.push(['stop', `Same file as the ${NAME[twin.channel]} post; every platform needs its own video`]); }
    const fmt = rbFormat(p, it.channel), slots = rbSlotsOn(it.channel, it.date, fmt);
    if (it.time && !slots.includes(it.time)) out.push([it.edited ? 'warn' : 'stop', `${clockTxt(it.time)} is not a rulebook slot for ${NAME[it.channel]} on ${new Date(it.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })}${slots.length ? ` (use ${slots.map(clockTxt).join(' or ')})` : ''}`]);
    if ((it.channel === 'facebook' || it.channel === 'instagram') && fmt !== 'image' && fmt !== 'carousel' && it.time === '18:00') out.push(['stop', 'A reel never goes out at 6 PM on Facebook or Instagram']);
    if (!it.home && !dyk) { const h = items.find(o => o.postId === it.postId && o.home); if (h && `${h.date}T${h.time}` >= `${it.date}T${it.time}`) out.push(['stop', `Goes out before its home platform (${NAME[h.channel]}); the home post goes first`]); }
    { const tl = /look fearless\.\s*(\w+) fearless/i.exec(it.caption), want = TAGLINE(p.sport); if (tl && want && !want.includes(tl[1])) out.push(['stop', `Tagline uses “${tl[1]}”; ${p.sport} is “${want}”`]); }
    if (it.channel === 'threads') { const q = rbQuestion(p); out.push(['warn', q ? `After it posts, reply to it with the question: “${cut(q, 80)}”` : 'After it posts, reply to it with a question']); }
    if (it.channel === 'youtube') out.push(['ok', `Title: ${cut(rbYouTubeTitle(p), 70)}`]);
    if (f && aiOf(p, f) && ['instagram', 'tiktok', 'youtube'].includes(it.channel)) out.push(['ok', 'AI-generated flag on']);
    if (['facebook', 'instagram', 'youtube'].includes(it.channel) && f && /^video\//.test(f.mime || '')) out.push(['warn', 'Add a custom thumbnail in Metricool before it goes live']);
    if (it.time) out.push(['ok', `Reply window: ${manila(it.date, it.time)} Manila, 60 minutes`]);
    return out;
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
      if (busyM.has(`${it.date}|${it.time}|${it.channel}`) && !(it.sent && /scheduled|draft/.test(it.sent.status))) out.push(['stop', 'Metricool already has a post at this time']);
      if (it.caption.length > LIMIT[it.channel]) out.push(['stop', `Caption is ${it.caption.length} characters; ${NAME[it.channel]} allows ${LIMIT[it.channel]}`]);
      if (!it.caption.trim()) out.push(['stop', 'No caption']);
      const video = kindOf(p) === 'video' || kindOf(p) === 'story';
      if (!it.rb && (it.channel === 'tiktok' || it.channel === 'youtube') && !video) out.push(['warn', `${NAME[it.channel]} needs a video; this campaign is a ${p.postType || 'photo'}`]);
      if (/rshsports\.com/i.test(it.caption) && !/[?&]utm_/i.test(it.caption) && !(it.rb && ['youtube', 'threads', 'bluesky'].includes(it.channel))) out.push(['warn', 'Store link has no tracking']);
      if (it.rb) out.push(...rbChecks(it, items, p));
      { const tags = (it.caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length, mx = MAXTAGS[it.channel];
        if (it.rb) { const rmx = RB_MAXTAGS[it.channel]; if (tags > rmx) out.push(['stop', rmx === 0 ? `No hashtags on ${NAME[it.channel]} (rulebook)` : `${tags} hashtags; the rulebook allows ${rmx} on ${NAME[it.channel]}`]); }
        else if (mx != null && tags > mx) out.push([it.channel === 'instagram' || it.channel === 'tiktok' ? 'stop' : 'warn', mx === 0 ? `${NAME[it.channel]} works on keywords, not hashtags: remove the ${tags} hashtag${tags === 1 ? '' : 's'}` : `${tags} hashtags; ${NAME[it.channel]} allows ${mx}`]); }
      if (/\b(comment (yes|below if)|like if|tag \d+ (friends|people)|share if you agree|type (yes|amen))\b/i.test(it.caption)) out.push(['warn', 'Engagement-bait wording: Meta cuts reach for it']);
      if (it.edited) out.push(['warn', 'Edited by hand']);
      if (it.moved) out.push(['warn', it.moved]);
      if (it.dykWarn) out.push(['warn', it.dykWarn]);
      it.checks = out; it.ready = !out.some(c => c[0] === 'stop');
    }
  }

  /* ---------- run ---------- */
  // Weekly rule: every Tuesday is the “Did You Know” (DYK) video on every channel except Pinterest.
  const isDyk = p => /\bDYK\b|did\s+you\s+know/i.test([p.title, p.hook, p.angle, p.postType].join(' '));
  const dow = d => new Date(d + 'T12:00:00').getDay();
  const shiftDay = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
  function dayFor(p, ch) {
    const rule = settings.dykDay; if (rule == null || rule === '' || ch === 'pinterest') return { date: p.date };
    const tue = dow(p.date) === Number(rule), dayName = new Date(2026, 0, 4 + Number(rule)).toLocaleDateString('en-US', { weekday: 'long' });
    if (isDyk(p)) return tue ? { date: p.date } : { date: p.date, dykWarn: `DYK videos go out on ${dayName}; this campaign is planned for a ${new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })}` };
    return tue ? { date: shiftDay(p.date, 1), moved: `${dayName} is the DYK day, so this moved to the next day.` } : { date: p.date };
  }
  function targets(p) {            // the campaign's own channel first, then the extra channels chosen in setup
    if (rbOn(p.date)) return rbTargets(p);   // Posting Rulebook (from Dec 1, 2026)
    const own = String(p.platform || '').toLowerCase().replace(/[^a-z]/g, ''), list = NAME[own] ? [own] : [];
    for (const c of settings.channels) if (!list.includes(c)) list.push(c);
    if (isDyk(p) && settings.dykDay != null && settings.dykDay !== '') for (const c of CHANNELS.map(x => x[0])) if (c !== 'pinterest' && !list.includes(c)) list.push(c);   // DYK goes everywhere but Pinterest
    return list;
  }
  function runAll() {
    const posts = (app().data().posts || []).filter(p => p.date), from = iso(new Date()), end = new Date(); end.setDate(end.getDate() + settings.days); const to = iso(end);
    const inRange = posts.filter(p => p.date >= from && p.date <= to).sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
    const old = new Map(((plan && plan.items) || []).map(i => [i.postId + '|' + i.channel, i])), items = [];
    for (const p of inRange) for (const ch of targets(p)) {
      const prev = old.get(p.id + '|' + ch);
      const dd = rbOn(p.date) ? rbPlace(p, ch) : dayFor(p, ch);
      const it = prev && prev.edited ? { ...prev, date: prev.placed ? prev.date : dd.date } : { postId: p.id, channel: ch, date: dd.date, time: '', caption: captionFor(p, ch), edited: false, ...(prev && prev.posted ? { posted: prev.posted } : {}), ...(prev && prev.sent ? { sent: prev.sent, placed: prev.placed } : {}), ...(prev && prev.mediaUrl ? { mediaUrl: prev.mediaUrl } : {}) };
      if (dd.moved) it.moved = dd.moved; else delete it.moved; if (dd.dykWarn) it.dykWarn = dd.dykWarn; else delete it.dykWarn;
      if (rbOn(p.date)) { it.rb = true; it.rbTimes = dd.times || (dd.time ? [dd.time] : []); it.rbWhy = dd.why || ''; if (ch === targets(p)[0]) it.home = true; else delete it.home; } else { delete it.rb; delete it.rbTimes; delete it.rbWhy; delete it.home; }
      items.push(it);
    }
    const learned = schedule(items); check(items, posts);
    const ready = items.filter(i => i.ready).length;
    const days = [...new Set(items.map(i => i.date))].map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }));
    const sample = items[0] ? `“${cut(items[0].caption.replace(/\s+/g, ' '), 110)}”` : '';
    const stops = {}; for (const i of items) for (const c of i.checks) if (c[0] === 'stop') stops[c[1]] = (stops[c[1]] || 0) + 1;
    const top = Object.keys(stops).sort((a, b) => stops[b] - stops[a])[0];
    const needing = inRange.filter(q => assetNeeds(q).missing);
    queueEdits(inRange);
    const jl = Object.values(jobs), jq = jl.filter(j => j.status === 'queued' || j.status === 'sent').length;
    log = [['reel', !settings.autoEdit ? 'Automatic editing is off.' : jq ? `${jq} edit job${jq === 1 ? '' : 's'} with the RSH SPORTS editor${jl.filter(j => j.status === 'attached').length ? `, ${jl.filter(j => j.status === 'attached').length} finished and attached` : ''}.` : 'No video is waiting to be edited.'], ['pixel', !inRange.length ? 'No campaigns in the window.' : needing.length ? `${needing.length} of ${inRange.length} campaigns need files. Next up: “${cut(needing[0].title, 40)}” needs ${assetNeeds(needing[0]).needs.filter(n => n.state === 'miss').map(n => n.label).join(' and ')}. Briefs and prompts are in the plan.` : `All ${inRange.length} campaigns have their files.`], ['quill', items.length ? `${items.length} captions for ${inRange.length} campaign${inRange.length === 1 ? '' : 's'}. First one: ${sample}` : 'No campaigns in the window, so nothing to write.'],
      ['tempo', items.length ? `${items.length} posts timed across ${new Set(items.map(i => i.date)).size} day${new Set(items.map(i => i.date)).size === 1 ? '' : 's'}. ${Object.keys(learned).length ? 'From your own results: ' + Object.entries(learned).map(([c, L]) => `${NAME[c]} ${clockTxt(L.time)}`).join(', ') + '.' : 'Your past posts have no posting times yet; refresh the live numbers on Home so I can learn your best hours.'} Other channels use your Setup times. No clashes.` : 'Nothing to schedule.'],
      ['ref', !items.length ? 'Nothing to check.' : ready === items.length ? `All ${items.length} checks passed. Ready for Courier.` : `${ready} ready, ${items.length - ready} held back.${top ? ` Most common reason: ${top.charAt(0).toLowerCase() + top.slice(1)} (${stops[top]}).` : ''}`],
      ['courier', 'Direct posting without Metricool is not switched on for any account yet (see Channels). Until then Tempo schedules ready posts through Metricool.']];
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
  const TEAM = [['sage', 'Sage', 'Script Writer', '#16a34a'], ['pixel', 'Pixel', 'Asset Bot', '#db2777'], ['reel', 'Reel', 'Video Editor', '#b45309'], ['quill', 'Quill', 'Caption & SEO Bot', '#0071e3'], ['tempo', 'Tempo', 'Scheduler Bot', '#7c3aed'], ['ref', 'Ref', 'Manager Bot', '#d9480f'], ['courier', 'Courier', 'Posting Bot', '#0f9d7a'], ['owl', 'Night Owl', 'Daily run', '#64748b']];
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
    { const ids = [...new Set(items.map(i => i.postId))], has = ids.filter(id => seo[id]).length;
      if (plan && items.length) out.quill[3] += seoNote ? ' ' + seoNote : has ? ` SEO written for ${has} of ${ids.length} campaigns.` : ' SEO not written yet: press Run everything.'; }
    out.tempo = !plan ? ['plain', 'Waiting', 'neutral', 'I’ll pick the times once there are captions.']
      : cov && cov.empty.length ? ['bad', 'Worried', 'worried', `Every post has a time, but ${cov.empty.length} of the next 14 days have nothing scheduled in Metricool.`]
      : ['good', 'Calm', 'happy', items.length ? 'Every post has a time and nothing clashes.' : 'The calendar is quiet.'];
    out.ref = !plan ? ['plain', 'Watching', 'neutral', 'Nothing gets past me without both approvals.']
      : !items.length ? ['plain', 'Watching', 'neutral', 'Nothing to check yet.']
      : !held ? ['good', 'Satisfied', 'happy', `All ${items.length} posts passed. Good work, team.`]
      : ['bad', ready ? 'Strict' : 'Frustrated', 'strict', `I’m holding back ${held} of ${items.length} posts.` + (noMedia ? ` ${noMedia} campaign${noMedia === 1 ? ' has' : 's have'} no media.` : '') + (waiting ? ` ${waiting} still need${waiting === 1 ? 's' : ''} a review or approval.` : '')];
    out.courier = settings.autoSend ? ['plain', 'Standing by', 'neutral', 'No account is switched to direct posting yet (see Channels), so I help Tempo keep an eye on the posts in Metricool.'] : ['off', 'Asleep', 'asleep', 'No account is switched to direct posting yet (see Channels). Ready posts go to Metricool from the Calendar.'];
    const all = (app().data().posts || []).filter(q => q.date && (!plan || (q.date >= plan.from && q.date <= plan.to))), missing = all.filter(q => assetNeeds(q).missing).length;
    const js = Object.values(jobs), active = js.filter(j => j.status === 'sent').length, jWait = js.filter(j => j.status === 'queued').length, done = js.filter(j => j.status === 'attached').length, failed = js.filter(j => j.status === 'failed').length;
    out.reel = !settings.autoEdit ? ['off', 'Paused', 'asleep', 'Automatic editing is turned off in Setup.']
      : jWait ? ['plain', 'Waiting', 'neutral', `${jWait} job${jWait === 1 ? ' is' : 's are'} packed and waiting to be picked up for the RSH SPORTS editor. This page can’t message the editor itself; a Claude session passes the job on.`]
      : failed ? ['bad', 'Stuck', 'worried', `${failed} edit${failed === 1 ? '' : 's'} came back with a problem. ${active ? active + ' still in the editor.' : ''}`]
      : active || jWait ? ['busy', 'Editing', 'working', `${active + jWait} video${active + jWait === 1 ? '' : 's'} with the RSH SPORTS editor. I attach each one when it comes back.`]
      : done ? ['good', 'Proud', 'happy', `${done} edited video${done === 1 ? '' : 's'} came back and ${done === 1 ? 'is' : 'are'} attached.`]
      : ['plain', 'Ready', 'neutral', 'When a campaign needs a video, I send the job to the RSH SPORTS editor and attach what comes back.'];
    { const ids = all.map(q => q.id), have = ids.filter(id => scripts[id]).length, stale = all.filter(q => scripts[q.id] && !scripts[q.id].edited && scripts[q.id].sig !== scriptSig(q)).length;
      out.sage = sageBusy ? ['busy', 'Writing', 'working', `Writing the production pack for “${cut(((all.find(q => q.id === sageBusy)) || {}).title || 'a campaign', 50)}”.`]
        : !all.length ? ['plain', 'Idle', 'neutral', 'No campaigns to write for yet.']
        : sageNote ? ['bad', 'Stuck', 'worried', sageNote]
        : have < ids.length || stale ? ['plain', 'Drafting', 'neutral', `${have} of ${ids.length} campaign${ids.length === 1 ? '' : 's'} have a production pack${stale ? `, ${stale} need${stale === 1 ? 's' : ''} updating` : ''}. I write the rest on the next run.`]
        : ['good', 'Proud', 'happy', `Every campaign has its production pack: script, image prompts, motion prompts, editor prompt, voiceover and checks.`]; }
    out.pixel = !all.length ? ['plain', 'Idle', 'neutral', 'No campaigns to prepare assets for.']
      : missing ? ['bad', 'Busy', 'worried', `${missing} of ${all.length} campaign${all.length === 1 ? '' : 's'} still need${missing === 1 ? 's' : ''} files. I wrote a brief and a ready-to-paste prompt for each.`]
      : ['good', 'Happy', 'happy', `Every campaign has the files it needs.`];
    out.owl = aoAlive() ? ['good', 'On duty 24/7', 'happy', `The whole team runs every 30 minutes from the always-on computer. Last check ${new Date(aoInfo.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`] : !settings.dailyAuto ? ['off', 'Off', 'asleep', 'Daily run is off in Setup.'] : morning && morning.at && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(morning.at)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) ? ['good', 'Done for today', 'happy', `I ran the whole team at ${new Date(morning.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${morning.by === 'cloud' ? ' from the cloud' : ''}. See my report below.`] : ['plain', 'Waiting', 'neutral', 'I run the whole team once a day: every morning from the cloud, and on the first visit of the day.'];
    const task = { pixel: 'Writing asset briefs…', reel: 'Sending edit jobs…', quill: 'Writing captions…', tempo: 'Picking times…', ref: 'Checking every post…' };
    if (phase && out[phase]) out[phase] = ['busy', 'Working', 'working', task[phase]];
    return out;
  }
  function office() {
    const t = team();
    const posts = (app().data().posts || []).filter(p => p.date).sort((a, b) => a.date.localeCompare(b.date)), need = posts.filter(p => app().track(p).stage === 'media' || app().track(p).stage === 'brief');
    const pick = need.length ? need : posts;
    return `<div class="office" aria-label="The bot team"><div class="office-top"><span class="sign">The office</span><span class="small" data-bot-wake>${wake ? esc(wake) : 'Drop a file below, or attach one in Create, and the team starts by itself.'}</span></div>
      ${freshVideos().length ? `<div class="newvid" role="status">${freshVideos().map(j => `<div class="nv"><span><strong>▶ ${j.source === 'product-image' ? (j.revision > 1 ? 'Revised post image' : 'New post image') : j.revision > 1 ? 'Revised video (revision ' + j.revision + ')' : 'New video'} ready to review:</strong> ${esc(j.title)}<span class="small"> · came back ${esc(new Date(j.readyAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} and is attached to the campaign</span></span><button type="button" class="btn smallbtn" data-bot-watch="${esc(j.postId)}">Watch and review</button></div>`).join('')}</div>` : ''}
      <div class="dropz" data-bot-drop><div class="t"><strong>Start here: drop a photo, a video, or a zip for a full video</strong><br><span class="small" data-bot-dropmsg>${drop.msg ? esc(drop.msg) : 'Pick the campaign, then drop a file here or choose one. A photo or video is attached as in Create. A .zip with the script and all the clips, photos and music goes to Reel, who has the RSH SPORTS editor make the full video and attaches it here.'}</span></div>
        <select aria-label="Campaign to attach the file to" data-bot-dropcamp>${pick.length ? pick.map(p => `<option value="${esc(p.id)}">${esc(p.date.slice(5))} · ${esc(cut(p.title, 38))}</option>`).join('') : '<option value="">No campaigns yet</option>'}</select>
        <button type="button" class="btn ghost smallbtn" data-bot-choose ${drop.busy || !pick.length ? 'disabled' : ''}>${drop.busy ? 'Working…' : 'Choose file'}</button><input type="file" data-bot-file accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.zip,application/zip" multiple hidden></div>
      <details class="deskbox" ${deskOpen ? 'open' : ''} style="margin-top:12px"><summary style="cursor:pointer;font-weight:700;font-size:13px">Each bot’s report <span class="small" style="font-weight:500">· mood and what it did on the last run</span></summary>
      <div class="flowlab"><span>Campaigns and files</span><i></i><span>asset briefs</span><i></i><span>video edits</span><i></i><span>captions</span><i></i><span>times</span><i></i><span>checks</span><i></i><span>Metricool</span></div>
      <div class="desks">${TEAM.map(([id, name, role, color], n) => { const [tone, mood, face, line] = t[id]; const state = face === 'asleep' ? 'asleep' : face === 'working' ? 'working' : 'idle';
        return `<div class="desk ${state}${n < 5 ? ' flow' : ''}" data-bot="${id}"><div class="holo">${state === 'working' ? `<span>${esc(line)}</span>` : ''}</div>${state === 'asleep' ? '<span class="zz" aria-hidden="true">z z</span>' : ''}${botSvg(color, face)}<h4>${esc(name)}</h4><div class="role">${esc(role)}</div><span class="mood ${tone}">${esc(mood)}</span><div class="say">${state === 'working' ? 'On it.' : esc(line)}</div></div>`; }).join('')}</div></details></div>`;
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
  // A campaign that just got its final approval is scheduled straight away (when Tempo's auto-scheduling is on).
  let apprSig = null;
  const approvals = () => (app().data().posts || []).filter(p => p.date && app().track(p).stage === 'ready').map(p => p.id).sort().join(',');
  let notesSig = null;
  const latestNotes = p => { const h = (p.revisionHistory || []).filter(x => /changes requested/i.test(x.type || '') && (x.reviewNotes || x.detail)); return h.length ? h.sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] : null; };
  async function reviseFromNotes() {
    if (!db || !settings.autoEdit) return;
    const posts = app().data().posts || [], sig = posts.map(p => { const n = latestNotes(p); return n ? p.id + '@' + n.at : ''; }).filter(Boolean).sort().join('|');
    if (notesSig === null) { notesSig = sig; return; }
    if (sig === notesSig) return;
    const before = new Set(notesSig.split('|')); notesSig = sig;
    for (const key of sig.split('|').filter(k => k && !before.has(k))) {
      const id = key.split('@')[0], p = posts.find(x => x.id === id), n = latestNotes(p), prev = jobs[id];
      if (!p || !n || !prev || !/attached|done/.test(prev.status)) continue;          // only videos Reel delivered
      const vid = fileFor({ postId: id, channel: 'tiktok' }); if (!vid) continue;
      const job = { postId: id, title: String(p.title || '').slice(0, 120), status: 'queued', queuedAt: new Date().toISOString(), source: 'revision', notes: String(n.reviewNotes || n.detail).slice(0, 3000), baseAssetId: vid.id, revision: (Number(prev.revision) || 1) + 1, manifest: prev.manifest || '', script: prev.script || '', attachedAssetId: prev.attachedAssetId || vid.id };
      jobs[id] = job; try { await db.doc('editJobs/' + id).set(job); } catch (_) {}
      wake = `Review notes on “${cut(p.title, 40)}”. Reel sent the revision to the editor.`; render(); dispatch();
    }
  }
  async function onCampaignsChanged() {
    reviseFromNotes();
    const ap = approvals(); if (apprSig === null) apprSig = ap;
    if (ap !== apprSig) { const before = new Set(apprSig.split(',')), fresh = ap.split(',').filter(x => x && !before.has(x)); apprSig = ap;
      if (fresh.length && settings.autoSend && plan) { const t = ((app().data().posts || []).find(x => x.id === fresh[0]) || {}).title; const why = `“${cut(t || 'A campaign', 40)}” was approved. Tempo is scheduling it.`; if (busy) queued = why; else await work(why); return; } }
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
    await runAll();
    const inRange = [...new Set(((plan && plan.items) || []).map(i => i.postId))].map(id => (app().data().posts || []).find(x => x.id === id)).filter(Boolean);
    const sg = await scriptRun(inRange, t => { wake = t; render(); });
    log.unshift(['sage', sageNote ? sageNote : `Production packs ready for ${sg.have} of ${sg.total} campaign${sg.total === 1 ? '' : 's'}${sg.wrote ? ` (${sg.wrote} written now)` : ''}: script, image prompts, motion prompts, editor prompt, voiceover, caption and checks.`]);
    const sr = await seoRun(inRange, t => { wake = t; render(); });
    log.splice(3, 0, ['quill', seoNote ? seoNote : `SEO ready for ${sr.have} of ${sr.total} campaign${sr.total === 1 ? '' : 's'}${sr.wrote ? ` (${sr.wrote} written now)` : ''}: keywords, hashtags, YouTube titles and tags, Pinterest titles and alt text. Approved captions are not changed; press “Add hashtags” on a post to use them.`]);
    if (settings.autoSend) { const r = await autoSend(t => { wake = t; render(); }); log.splice(log.findIndex(l => l[0] === 'tempo') + 1, 0, ['tempo', r]); }
    const lines = log; log = []; await showWork(); log = lines; busy = false; render();
    if (queued) { const next = queued; queued = ''; await work(next); }
  }

  // Tempo sends every ready post that is not in Metricool yet: on its campaign's day at the time Tempo chose,
  // with the attached file (via Google Drive) and Quill's hashtags. Only posts the Manager Bot marked ready
  // (both approvals, all checks) are sent; nothing is published early or without approval.
  async function autoSend(step) {
    const items = ((plan && plan.items) || []).filter(i => i.ready && !i.posted && !(i.sent && /scheduled|draft|queued/.test(i.sent.status)) && viaOf(i.channel) === 'metricool');
    if (!items.length) return 'Nothing new to send to Metricool: every ready post is already there.';
    let ok = 0, queued = 0; const fails = [];
    for (const it of items) {
      const key = it.postId + '|' + it.channel;
      if (!it.placed) { if (!(await place(key, it.date, it.time))) { fails.push(`${NAME[it.channel]} ${it.date}: the day has passed`); continue; } }
      step && step(`Tempo is sending ${NAME[it.channel]} · ${cut(((app().data().posts || []).find(x => x.id === it.postId) || {}).title || '', 30)} to Metricool…`);
      const r = await sendToMetricool(key, 'schedule', false, step);
      if (r.ok) { if (r.queued) queued++; else ok++; } else fails.push(`${NAME[it.channel]} ${it.date}: ${r.reason}`);
    }
    return `Sent to Metricool: ${ok} scheduled${queued ? `, ${queued} waiting for a Claude session` : ''}${fails.length ? `. Not sent (${fails.length}): ${fails.slice(0, 3).join(' · ')}${fails.length > 3 ? ' …' : ''}` : '.'}`;
  }

  // Posts a Claude session sent for us (from the scheduleJobs queue) are marked as scheduled here.
  async function reconcileJobs() {
    if (!db || !plan) return; let changed = false;
    try { const q = await db.collection('scheduleJobs').get();
      for (const d of q.docs) { const j = d.data() || {}, it = find(j.key || (j.postId + '|' + j.channel)); if (!it) continue;
        if (j.status === 'sent' && !(it.sent && /scheduled|draft/.test(it.sent.status))) { it.sent = { status: j.mode === 'draft' ? 'draft' : 'scheduled', at: j.sentAt || new Date().toISOString(), plannerUrl: j.plannerUrl || '', by: 'Claude session' }; changed = true; }
        if (j.status === 'failed' && it.sent && it.sent.status === 'queued') { it.sent = { status: 'error', at: j.sentAt || new Date().toISOString(), reason: String(j.error || 'Metricool did not accept it.').slice(0, 240) }; changed = true; } } } catch (_) {}
    if (changed) { await save(); render(); notify(); }
  }

  /* ---------- Reports ---------- */
  let morning = null;
  function weeklyReport() {
    const brief = (window.RSH_LIVE && window.RSH_LIVE.brief && window.RSH_LIVE.brief()) || '', top = topPosts(7).slice(0, 5), L = learnedTimes(), T = learnedTags();
    const items = (plan && plan.items) || [], nextWeek = (() => { const a = iso(new Date()), d = new Date(); d.setDate(d.getDate() + 7); const b = iso(d); return items.filter(i => i.date >= a && i.date <= b); })();
    const sent = nextWeek.filter(i => i.sent && /scheduled|draft/.test(i.sent.status)).length, ready = nextWeek.filter(i => i.ready).length;
    const held = [...new Set(nextWeek.filter(i => !i.ready).map(i => i.postId))].map(id => ((app().data().posts || []).find(x => x.id === id) || {}).title).filter(Boolean);
    const lines = [`RSH Sports — weekly social report (${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`, ''];
    lines.push('RESULTS (Metricool, last 14 days vs the 14 before)'); lines.push(brief ? brief.split('\n').slice(1).filter(l => !/^Source:/.test(l)).join('\n') : 'Live numbers not loaded yet: refresh on Home.');
    if (top.length) { lines.push('', 'TOP POSTS THIS WEEK (views)'); for (const r of top) lines.push(`• ${NAME[String(r[0]).toLowerCase()] || r[0]}: ${Math.round(r[4]).toLocaleString('en-US')} views${r[5] != null ? `, ${Math.round(r[5])} interactions` : ''} · “${r[3] || 'no text'}”`); }
    if (Object.keys(L).length) { lines.push('', 'BEST POSTING HOURS (own results)'); for (const [c, x] of Object.entries(L)) lines.push(`• ${NAME[c]}: ${clockTxt(x.time)} US Eastern (${x.n} posts, avg ${x.avg.toLocaleString('en-US')} ${x.metric}${x.tried === 1 ? '; other hours not tested yet' : ''})`); }
    if (Object.keys(T).length) { lines.push('', 'HASHTAGS THAT WORKED'); for (const [c, x] of Object.entries(T)) lines.push(`• ${NAME[c]}: ${x.best.slice(0, 3).map(b => b.tag + ' (avg ' + b.avg + ')').join(', ')}${x.weak.length ? ' · dropping: ' + x.weak.map(b => b.tag).join(', ') : ''}`); }
    lines.push('', 'NEXT 7 DAYS', `• ${nextWeek.length} channel posts planned, ${ready} approved and ready, ${sent} already scheduled in Metricool.`);
    if (held.length) lines.push(`• Waiting on files or approvals: ${held.slice(0, 6).join('; ')}${held.length > 6 ? ' …' : ''}.`);
    lines.push('', 'Prepared by the RSH Sports Marketing OS from Metricool data. Nothing here is estimated.');
    return lines.join('\n');
  }
  function reportsHtml() {
    const m = morning && morning.lines && morning.lines.length ? `<div class="log" style="margin-top:14px"><div class="log-h"><strong>Night Owl’s report</strong><span class="small">${esc(new Date(morning.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${esc(morning.by === 'cloud' ? 'daily run in the cloud' : 'first visit of the day')}</span></div>${morning.lines.map(l => { const mm = TEAM.find(t => t[0] === l[0]) || TEAM[0]; return `<div class="log-row"><span class="log-av">${botSvg(mm[3], 'happy')}</span><div><strong>${esc(mm[1])}</strong><div>${esc(l[1])}</div></div></div>`; }).join('')}</div>` : '';
    return `${log.length ? '' : m}<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px"><button type="button" class="btn ghost smallbtn" data-bot-weekly>Weekly report for Anthony</button><span class="small">What worked, best hours and hashtags, and the next 7 days, from real Metricool numbers.</span></div><pre data-bot-weeklytext hidden style="white-space:pre-wrap;font:13px/1.5 system-ui;background:var(--soft,#f5f5f7);border-radius:12px;padding:14px;margin-top:10px"></pre>`;
  }
  async function saveMorning(by) {
    morning = { at: new Date().toISOString(), by, lines: log.slice(0, 10) };
    if (db) { try { await db.doc('bots/morning').set({ json: JSON.stringify(morning) }); } catch (_) {} }
  }
  // Night Owl: the first visit of each day (US Eastern) by someone who can edit runs the whole team once.
  const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  async function nightOwl() {
    if (!settings.dailyAuto || !db || busy) return false;
    try { const u = await use('user'); if (u && u.canEdit && !(await u.canEdit())) return false; } catch (_) {}
    const today = etToday();
    try { const d = await db.doc('bots/dailyRun').get(); if (d.exists && d.data().date === today) return false; await db.doc('bots/dailyRun').set({ date: today, at: new Date().toISOString(), by: 'app' }); } catch (_) { return false; }
    try { if (window.RSH_LIVE && window.RSH_LIVE.refresh) await window.RSH_LIVE.refresh(false); } catch (_) {}
    await work('Night Owl started the daily run: first visit today.'); await saveMorning('app'); render(); return true;
  }

  /* ---------- Always-on mode ----------
   * One computer keeps the app open and runs the whole team every 30 minutes, day and night:
   * Pixel's briefs, Reel's edit and revision queue, Quill's SEO, Tempo's timing and scheduling of approved posts,
   * Ref's checks, and the live numbers. Only the browser where it is switched on runs it (a per-browser setting),
   * and a shared heartbeat (bots/alwaysOn) stops two computers from running at once and shows the team it is alive. */
  const AO_KEY = 'rsh_bots_always_on', AO_EVERY = 30 * 60000, AO_STALE = 75 * 60000;
  let aoTimer = null, aoInfo = null, aoLast = 0, wakeLock = null;
  const aoOn = () => { try { return localStorage.getItem(AO_KEY) === '1'; } catch (_) { return false; } };
  const aoId = (() => { let v = ''; try { v = localStorage.getItem(AO_KEY + ':id') || ''; if (!v) { v = Math.random().toString(36).slice(2, 10); localStorage.setItem(AO_KEY + ':id', v); } } catch (_) { v = 'tab'; } return v; })();
  async function aoBeat(status) {
    if (!db) return false;
    try {
      const d = await db.doc('bots/alwaysOn').get(), cur = d.exists ? d.data() : null;
      if (cur && cur.id !== aoId && cur.on && Date.now() - new Date(cur.at).getTime() < AO_STALE) { aoInfo = cur; return false; }   // another computer is on duty
      aoInfo = { id: aoId, on: true, at: new Date().toISOString(), status: String(status || 'on duty').slice(0, 200), every: AO_EVERY / 60000, device: (navigator.userAgent.match(/\(([^)]+)\)/) || [, ''])[1].slice(0, 60) };
      await db.doc('bots/alwaysOn').set(aoInfo); return true;
    } catch (_) { return false; }
  }
  async function aoCycle() {
    if (!aoOn() || busy) return;
    if (!(await aoBeat('working'))) { render(); return; }
    aoLast = Date.now();
    try { if (window.RSH_LIVE && window.RSH_LIVE.refresh) { const f = window.RSH_LIVE.fetchedAt && window.RSH_LIVE.fetchedAt(); if (!f || Date.now() - new Date(f).getTime() > 3 * 3600000) await window.RSH_LIVE.refresh(false); } } catch (_) {}
    try { await collect(); } catch (_) {}
    try { await reconcileJobs(); } catch (_) {}
    try { await reviseFromNotes(); } catch (_) {}
    await work('Always-on: the team’s scheduled round (every 30 minutes).');
    try { const today = etToday(), d = await db.doc('bots/dailyRun').get(); if (!d.exists || d.data().date !== today) { await db.doc('bots/dailyRun').set({ date: today, at: new Date().toISOString(), by: 'always-on' }); await saveMorning('app'); } } catch (_) {}
    await aoBeat('on duty · last round ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })); render();
  }
  async function aoStart() {
    if (aoTimer) clearInterval(aoTimer); aoTimer = null;
    if (!aoOn()) return;
    try { if (navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (_) {}
    aoTimer = setInterval(() => { if (Date.now() - aoLast >= AO_EVERY - 5000) aoCycle(); }, 60000);   // checks every minute; works even when the browser slows background tabs
    setTimeout(aoCycle, 3000);
  }
  async function aoRead() { if (!db) return; try { const d = await db.doc('bots/alwaysOn').get(); aoInfo = d.exists ? d.data() : null; } catch (_) {} }
  const aoAlive = () => !!(aoInfo && aoInfo.on && Date.now() - new Date(aoInfo.at).getTime() < AO_STALE);
  function aoHtml() {
    const mine = aoOn(), alive = aoAlive(), here = aoInfo && aoInfo.id === aoId;
    const when = aoInfo && aoInfo.at ? new Date(aoInfo.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return `<div class="hint" role="status" style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><strong>${alive ? '🟢 24/7: the whole team is on duty' : '⚪ 24/7 is off'}</strong><span class="small">${alive ? `${here ? 'This computer' : 'Another computer'} runs every bot every 30 minutes · last check ${esc(when)}` : 'Turn on “Run all bots 24/7 on this computer” in Setup on the computer that stays on.'}${mine && !here && alive ? ' · this computer is on standby' : ''}</span></div>`;
  }

  /* ---------- Campaign asset box ----------
   * Every campaign has a box for its raw files (clips, photos, music, logo, script). The manager adds files over time;
   * “Assets ready: start editing” hands them all to Reel, who sends the edit job to the RSH SPORTS editor
   * (the same route as a .zip). The finished video comes back and is attached to the campaign for review. */
  let raw = {}, rawOpen = null, rawMsg = '', rawBusy = false;
  const RAW_MAX = 400e6;
  async function loadRaw(id) { if (!db) return raw[id] || { files: [] }; try { const s = await db.doc('rawAssets/' + id).get(); raw[id] = s.exists ? JSON.parse(s.data().json) : (raw[id] || { files: [] }); } catch (_) {} return raw[id] || { files: [] }; }
  async function saveRaw(id) { if (!db) throw new Error('Storage is not available in this view.'); raw[id].updatedAt = new Date().toISOString(); await db.doc('rawAssets/' + id).set({ json: JSON.stringify(raw[id]), postId: id, count: raw[id].files.length, updatedAt: raw[id].updatedAt }); }
  async function addRaw(id, fileList) {
    const assets = await use('assets'); if (!assets) throw new Error('Storing files is not available in this view. Open the app from the owner or an editor account.');
    const box = await loadRaw(id); box.files = box.files || [];
    let total = box.files.reduce((a, f) => a + (f.bytes || 0), 0), added = 0;
    for (const file of fileList) {
      if (/\.zip$/i.test(file.name)) {
        const JSZip = await loadZipLib(), zip = await JSZip.loadAsync(file);
        for (const e of Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name))) {
          const bytes = await e.async('uint8array'); total += bytes.length; if (total > RAW_MAX) throw new Error('The files for one campaign can total 400 MB.');
          rawMsg = `Storing ${e.name.split('/').pop()}…`; paintRaw();
          box.files.push({ ...(await storeFile(assets, e.name.split('/').pop(), bytes)), addedAt: new Date().toISOString() }); added++; await saveRaw(id);
        }
        continue;
      }
      total += file.size; if (total > RAW_MAX) throw new Error('The files for one campaign can total 400 MB.');
      rawMsg = `Storing ${file.name}…`; paintRaw();
      box.files.push({ ...(await storeFile(assets, file.name, new Uint8Array(await file.arrayBuffer()))), addedAt: new Date().toISOString() }); added++; await saveRaw(id);
    }
    return added;
  }
  async function removeRaw(id, n) { const box = await loadRaw(id); box.files.splice(n, 1); await saveRaw(id); }
  async function sendRaw(id) {
    const p = (app().data().posts || []).find(x => x.id === id); if (!p) throw new Error('Campaign not found.');
    const box = await loadRaw(id); if (!box.files || !box.files.length) throw new Error('Add the files first.');
    const cur = jobs[id]; if (cur && (cur.status === 'queued' || cur.status === 'sent')) throw new Error('Reel already has an edit job for this campaign. Wait for the video, or ask for a revision when it comes back.');
    const assets = await use('assets'); let script = '', scriptName = '';
    const sf = box.files.find(f => /^text\//.test(f.mime) && /script/i.test(f.name)) || box.files.find(f => /^text\//.test(f.mime));
    if (sf) { try { const blob = new Blob(await Promise.all(sf.parts.map(async x => (await fetch('/_blob/' + x.id)).blob()))); let t = await blob.text(); if (sf.encoding === 'base64') { try { t = new TextDecoder().decode(Uint8Array.from(atob(t), c => c.charCodeAt(0))); } catch (_) {} } script = t.replace(/\r\n/g, '\n').trim().slice(0, 30000); scriptName = sf.name; } catch (_) {} }
    if (!script && packFor(id)) { script = packFor(id).slice(0, 30000); scriptName = 'Production pack by Sage'; }
    if (!script) script = [p.script, p.voiceover ? 'VOICEOVER:\n' + p.voiceover : ''].filter(Boolean).join('\n\n');
    const job = { postId: id, title: String(p.title || '').slice(0, 120), status: 'queued', queuedAt: new Date().toISOString(), source: 'campaign', files: box.files.length, manifest: JSON.stringify(box.files.map(({ addedAt, ...f }) => f)), script, scriptName, ...(cur && cur.status ? { revisionOf: cur.assetId || '' } : {}) };
    jobs[id] = job; if (db) await db.doc('editJobs/' + id).set(job);
    box.sentAt = job.queuedAt; await saveRaw(id);
    dispatch(); return job;
  }
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  async function openRaw(id) {
    rawOpen = id; rawMsg = ''; let host = document.getElementById('rshRaw');
    if (!host) {
      host = document.createElement('div'); host.id = 'rshRaw'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true');
      host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto';
      document.body.appendChild(host);
      host.addEventListener('click', onRawClick); host.addEventListener('change', onRawChange);
      host.addEventListener('dragover', e => { if (e.target.closest('[data-raw-drop]')) e.preventDefault(); });
      host.addEventListener('drop', async e => { if (!e.target.closest('[data-raw-drop]')) return; e.preventDefault(); await rawAdd([...(e.dataTransfer.files || [])]); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('rshRaw') && document.getElementById('rshRaw').style.display !== 'none') closeRaw(); });
    }
    host.style.display = 'flex'; cmtMsg = ''; paintRaw(); await Promise.all([loadRaw(id), loadAllComments()]); await whoIs((comments[id] || []).map(c => c.by)); paintRaw();
  }
  function closeRaw() { const h = document.getElementById('rshRaw'); if (h) h.style.display = 'none'; rawOpen = null; render(); if (window.RSH_TRACKER && window.RSH_TRACKER.render) try { window.RSH_TRACKER.render(); } catch (_) {} }
  function paintRaw() {
    const host = document.getElementById('rshRaw'); if (!host || !rawOpen) return;
    const p = (app().data().posts || []).find(x => x.id === rawOpen) || {}, box = raw[rawOpen] || { files: [] }, j = jobs[rawOpen];
    const icon = m => /^video/.test(m) ? '🎬' : /^image/.test(m) ? '🖼️' : /^audio/.test(m) ? '🎵' : /^text|pdf/.test(m) ? '📄' : '📦';
    const hasScript = (box.files || []).some(f => /^text\//.test(f.mime)) || !!(p.script || p.voiceover);
    const jobTxt = !j ? '' : j.status === 'queued' ? 'Waiting to be picked up by the editor.' : j.status === 'sent' ? 'With the RSH SPORTS editor now.' : j.status === 'attached' ? 'The edited video came back and is attached to the campaign for review.' : j.status === 'done' ? 'The video is ready; attaching it to the campaign…' : j.status === 'failed' ? 'The editor could not finish: ' + (j.note || 'see the 24/7 Bots tab.') : '';
    host.innerHTML = `<div class="card" style="max-width:720px;width:100%;background:var(--card,#fff);border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div class="eyebrow">CAMPAIGN ASSETS & REVIEW</div><h2 style="margin-top:6px;font-size:20px">${esc(p.title || '')}</h2><div class="small">${esc(p.platform || '')} · ${esc(p.date || 'no date')} · raw files for the edit: clips, photos, music, logo and the script (.txt or .md)</div></div><button type="button" class="btn ghost smallbtn" data-raw-close aria-label="Close">Close</button></div>
      <div data-raw-drop style="margin-top:14px;border:2px dashed #c7c7cc;border-radius:14px;padding:18px;text-align:center"><strong>Drop files here</strong> or <button type="button" class="btn smallbtn" data-raw-choose ${rawBusy ? 'disabled' : ''}>Upload assets</button><input type="file" multiple hidden data-raw-file><div class="small" style="margin-top:6px">Any number of files, up to 400 MB in total. A .zip is unpacked. Files are kept with this campaign for the whole team.</div></div>
      ${rawMsg ? `<div class="hint" role="status" style="margin-top:10px">${esc(rawMsg)}</div>` : ''}
      <h3 style="margin-top:16px;font-size:15px">${(box.files || []).length} file${(box.files || []).length === 1 ? '' : 's'} gathered</h3>
      <div style="display:grid;gap:6px;margin-top:8px">${(box.files || []).map((f, n) => `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid #e5e5ea;border-radius:10px;padding:8px 10px"><span>${icon(f.mime)} <strong>${esc(f.name)}</strong> <span class="small">${esc(f.mime)} · ${kb(f.bytes || 0)}</span></span><button type="button" class="btn ghost smallbtn" data-raw-remove="${n}" ${rawBusy ? 'disabled' : ''}>Remove</button></div>`).join('') || '<div class="small">No files yet.</div>'}</div>
      <div class="small" style="margin-top:10px">${hasScript ? '✓ Script found' : '⚠ No script yet: add a .txt or .md file, or write the script in the campaign’s details. Without one Reel follows the campaign brief.'}</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;border-top:1px solid #e5e5ea;padding-top:14px">
        <button type="button" class="btn" data-raw-send ${rawBusy || !(box.files || []).length || (j && (j.status === 'queued' || j.status === 'sent')) ? 'disabled' : ''}>${j && j.status === 'attached' ? 'Send again for a new edit' : 'Assets ready: start editing'}</button>
        <span class="small">${esc(jobTxt || 'Reel sends every file and the script to the RSH SPORTS editor; the finished video is attached to this campaign for manager and Anthony review.')}</span></div>
      ${commentsHtml(p)}</div>`;
  }
  function commentsHtml(p) {
    const list = comments[p.id] || [], hasVideo = (() => { const f = fileFor({ postId: p.id, channel: 'tiktok' }); return !!(f && /^video\//.test(f.mime || '')); })();
    return `<div style="margin-top:18px;border-top:1px solid #e5e5ea;padding-top:14px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h3 style="font-size:15px">💬 Team review · ${list.length} comment${list.length === 1 ? '' : 's'}</h3><span class="small">Status: <strong>${esc(p.id ? stageName(p) : '')}</strong></span></div>
      <div style="display:grid;gap:8px;margin-top:10px;max-height:260px;overflow:auto">${list.map(c => `<div style="border:1px solid #e5e5ea;border-radius:10px;padding:8px 10px${c.change ? ';border-left:4px solid #d9480f' : ''}"><div class="small"><strong>${esc(names[c.by] || 'Teammate')}</strong> · ${esc(new Date(c.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${c.change ? ' · <strong style="color:#d9480f">Video change request</strong>' : ''}</div><div style="margin-top:3px;white-space:pre-wrap">${esc(c.text)}</div></div>`).join('') || '<div class="small">No comments yet. Anyone on the team can leave feedback here before the campaign is approved and posted.</div>'}</div>
      <textarea data-cmt-text rows="3" style="width:100%;margin-top:10px;box-sizing:border-box" placeholder="Write feedback for the team: caption, visuals, timing…" aria-label="Comment"></textarea>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn smallbtn" data-cmt-post>Post comment</button>${hasVideo ? '<label class="small" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-cmt-change> This is a change request for the video (Reel makes a new cut)</label>' : ''}${cmtMsg ? `<span class="small" role="status">${esc(cmtMsg)}</span>` : ''}</div></div>`;
  }
  async function rawAdd(files) {
    if (!files.length || rawBusy || !rawOpen) return; rawBusy = true; rawMsg = 'Storing…'; paintRaw();
    try { const n = await addRaw(rawOpen, files); rawMsg = `${n} file${n === 1 ? '' : 's'} added.`; } catch (e) { rawMsg = 'Could not add: ' + ((e && e.message) || e); }
    rawBusy = false; paintRaw();
  }
  async function onRawClick(e) {
    if (e.target.closest('[data-cmt-post]')) { const ta = document.querySelector('#rshRaw [data-cmt-text]'), ch = document.querySelector('#rshRaw [data-cmt-change]'); try { await postComment(rawOpen, ta && ta.value, ch && ch.checked); await whoIs((comments[rawOpen] || []).map(c => c.by)); cmtMsg = ch && ch.checked ? 'Comment posted and sent to Reel as a revision.' : 'Comment posted.'; } catch (err) { cmtMsg = (err && err.message) || String(err); } paintRaw(); return; }
    if (e.target.id === 'rshRaw' || e.target.closest('[data-raw-close]')) return closeRaw();
    if (e.target.closest('[data-raw-choose]')) { const f = document.querySelector('#rshRaw [data-raw-file]'); if (f) f.click(); return; }
    const rm = e.target.closest('[data-raw-remove]'); if (rm && !rawBusy) { rawBusy = true; try { await removeRaw(rawOpen, Number(rm.dataset.rawRemove)); rawMsg = 'Removed.'; } catch (err) { rawMsg = 'Could not remove: ' + err.message; } rawBusy = false; return paintRaw(); }
    if (e.target.closest('[data-raw-send]') && !rawBusy) { rawBusy = true; paintRaw(); try { await sendRaw(rawOpen); rawMsg = 'Sent to Reel. The edit job is on its way to the RSH SPORTS editor.'; } catch (err) { rawMsg = (err && err.message) || String(err); } rawBusy = false; paintRaw(); }
  }
  async function onRawChange(e) { if (e.target.matches('[data-raw-file]')) { const fs = [...e.target.files]; e.target.value = ''; await rawAdd(fs); } }
  async function rawCounts() { if (!db) return; try { const q = await db.collection('rawAssets').get(); for (const d of q.docs) { try { raw[d.id] = JSON.parse(d.data().json); } catch (_) {} } } catch (_) {} }
  const rawCount = id => ((raw[id] && raw[id].files) || []).length;

  /* ---------- Review comments ----------
   * Anyone on the team who can use the app can comment on a campaign before it is posted. Comments are kept in
   * reviewComments (one document per comment, so two people commenting at once never overwrite each other).
   * A comment marked as a video change request starts a revision job for Reel with that comment as the note. */
  let comments = {}, names = {}, cmtMsg = '';
  async function loadAllComments() { if (!db) return; try { const q = await db.collection('reviewComments').get(), all = {}; for (const d of q.docs) { const c = d.data() || {}; if (!c.postId) continue; (all[c.postId] = all[c.postId] || []).push({ id: d.id, ...c }); } for (const k of Object.keys(all)) all[k].sort((a, b) => String(a.at).localeCompare(String(b.at))); comments = all; } catch (_) {} }
  const cmtCount = id => (comments[id] || []).length;
  async function whoIs(ids) { const need = ids.filter(i => i && !names[i]); if (!need.length) return; try { const u = await use('user'); if (u && u.profiles) { const ps = await u.profiles(need); for (const i of need) names[i] = (ps && ps[i] && ps[i].name) || 'Teammate'; } } catch (_) {} }
  function queueRevision(id, notes) {
    const p = (app().data().posts || []).find(x => x.id === id), prev = jobs[id], vid = fileFor({ postId: id, channel: 'tiktok' });
    if (!p || !vid || !/^video\//.test(vid.mime || '')) throw new Error('This campaign has no video yet, so there is nothing to revise.');
    if (prev && (prev.status === 'queued' || prev.status === 'sent')) throw new Error('Reel is already working on this video. Your comment is saved; add it again after the new cut arrives.');
    const job = { postId: id, title: String(p.title || '').slice(0, 120), status: 'queued', queuedAt: new Date().toISOString(), source: 'revision', notes: String(notes).slice(0, 3000), baseAssetId: vid.id, revision: (Number(prev && prev.revision) || 1) + 1, manifest: (prev && prev.manifest) || '', script: (prev && prev.script) || '', attachedAssetId: (prev && prev.attachedAssetId) || vid.id };
    jobs[id] = job; if (db) db.doc('editJobs/' + id).set(job).catch(() => {}); dispatch(); return job;
  }
  async function postComment(id, text, change) {
    text = String(text || '').trim().slice(0, 2000); if (!text) throw new Error('Write a comment first.');
    if (!db) throw new Error('Comments need the team database; open the app from claude.ai.');
    let by = ''; try { const u = await use('user'); if (u && u.id) by = await u.id(); } catch (_) {}
    const c = { postId: id, text, by, at: new Date().toISOString(), change: !!change };
    const docId = id + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.doc('reviewComments/' + docId).set(c);
    (comments[id] = comments[id] || []).push({ id: docId, ...c });
    if (change) queueRevision(id, text);
    return c;
  }
  const stageName = p => { const st = app().track(p).stage; return { brief: 'Brief in progress', media: 'Waiting for files and visual checks', manager: 'Ready for manager review', anthony: 'Waiting for Anthony’s final approval', final: 'Waiting for Anthony’s final approval', ready: 'Approved and ready to post' }[st] || st; };


  /* ---------- The live office (isometric, drawn on a canvas; no images or SVG) ----------
   * A realistic open-plan office: workstations, a glass meeting room, windows, and a break room with a coffee machine,
   * fridge, water cooler, tables and a sofa. Each bot is a person with its own look and personality.
   * Working: walks to its desk and its screen lights up. Asleep (switched off): naps at its desk.
   * Idle: goes to the break room, and idle bots get together and chat about work, coffee and office life.
   * Some lines use the app's real numbers. Click a bot to hear what it is doing. A transcript sits under the office. */
  const ISO = { canvas: null, wrap: null, log: null, ctx: null, raf: 0, people: {}, last: 0, w: 0, h: 0, convo: null, nextConvo: 0, solos: 0, transcript: [] };
  const GW = 24, GH = 14, TW = 44, TH = 22, ZH = 22;
  const LOOK = {                                     // skin, hair colour, hair style, trousers
    sage: ['#d9a07a', '#8b3a1e', 'long', '#334155'], pixel: ['#e8b48a', '#3b2a20', 'bun', '#334155'], reel: ['#c68642', '#1f1a17', 'cap', '#1f2937'], quill: ['#f1c27d', '#7c4a1e', 'side', '#3f3f46'],
    tempo: ['#8d5524', '#111111', 'short', '#1e293b'], ref: ['#e0ac69', '#9ca3af', 'short', '#27272a'], courier: ['#d9a066', '#2d2117', 'messy', '#374151'], owl: ['#f3cfa6', '#4b5563', 'long', '#1f2937']
  };
  // private offices: 5 along the back wall, 2 along the left wall (x, y of the room's back-left corner; rooms are 3 × 3)
  const ROOMS = { pixel: [0.3, 0.3, 'b'], reel: [3.3, 0.3, 'b'], quill: [6.3, 0.3, 'b'], tempo: [9.3, 0.3, 'b'], ref: [12.3, 0.3, 'b'], courier: [0.3, 3.9, 'l'], owl: [0.3, 6.9, 'l'], sage: [0.3, 10.2, 'l'] };
  const DESKS = Object.fromEntries(Object.entries(ROOMS).map(([id, [rx, ry, side]]) => [id, side === 'b' ? [rx + 1.4, ry + 1.3] : [rx + 1.3, ry + 1.2]]));
  const DOORS = Object.fromEntries(Object.entries(ROOMS).map(([id, [rx, ry, side]]) => [id, side === 'b' ? [[rx + 2.4, ry + 2.55], [rx + 2.4, ry + 3.45]] : [[rx + 2.55, ry + 2.3], [rx + 3.45, ry + 2.3]]]));
  DOORS.patio = [[15.9, 11.0], [15.9, 9.9]];
  const COURT = { x0: 16.4, x1: 23.2, y0: 10.9, y1: 13.9, net: 19.8 };
  const TABLES = [[17.6, 5.2], [20.9, 6.4], [18.4, 8.6]];
  const SEATS = t => [[t[0] - 0.95, t[1]], [t[0] + 0.95, t[1]], [t[0], t[1] + 0.95], [t[0], t[1] - 0.95]];
  const SPOTS = [[17.2, 2.1], [19.2, 2.1], [22.6, 3.4], [22.3, 8.9], [23.2, 8.9], [15.6, 7.2], [20.3, 9.6]];   // coffee machine, counter, water cooler, sofa, sofa, window, standing
  const COFFEE = [[17.2, 2.1], [17.8, 2.2], [19.2, 2.1], [22.6, 3.4]];
  const CANTEEN = [[9.6, 10.75], [10.8, 10.75], [12.0, 10.75], [13.2, 10.75], [9.6, 12.35], [10.8, 12.35], [12.0, 12.35], [13.2, 12.35]];
  const CR_DOOR = [5.25, 13.85];
  const WANDER = [[5.0, 4.3], [10.2, 4.6], [13.8, 4.4], [11.0, 9.2], [4.4, 10.2], [15.6, 7.2], [20.0, 8.0], [8.0, 9.9], [14.4, 9.4], [4.3, 8.8]];
  const mealNow = () => { const d = new Date(), m = d.getHours() * 60 + d.getMinutes(); return m >= 720 && m < 780 ? 'Lunch' : (m >= 600 && m < 620) || (m >= 900 && m < 920) ? 'Snack time' : ''; };
  const shade = (hex, f) => { const n = parseInt(String(hex).slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const m = c => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f))); return `rgb(${m(r)},${m(g)},${m(b)})`; };
  function isoPt(x, y, z) { return [ISO.ox + (x - y) * TW / 2, ISO.oy + (x + y) * TH / 2 - (z || 0) * ZH]; }
  function poly(pts, fill, stroke, alpha) { const c = ISO.ctx; c.save(); if (alpha != null) c.globalAlpha = alpha; c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); } c.restore(); }
  function box(x, y, z, w, d, h, color, alpha) {
    const P = isoPt;
    poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, -0.26), null, alpha);
    poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(color, -0.12), null, alpha);
    poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], color, null, alpha);
  }
  function disc(x, y, z, r, color, alpha) { const [cx, cy] = isoPt(x, y, z), c = ISO.ctx; c.save(); if (alpha != null) c.globalAlpha = alpha; c.beginPath(); c.ellipse(cx, cy, r * TW / 2 * 1.41, r * TH / 2 * 1.41, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill(); c.restore(); }
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  // wall decorations drawn flat on the back wall (y = 0) or the left wall (x = 0)
  function onBack(x0, x1, z0, z1, fill, stroke) { const P = isoPt; poly([P(x0, 0.02, z0), P(x1, 0.02, z0), P(x1, 0.02, z1), P(x0, 0.02, z1)], fill, stroke); }
  function onLeft(y0, y1, z0, z1, fill, stroke) { const P = isoPt; poly([P(0.02, y0, z0), P(0.02, y1, z0), P(0.02, y1, z1), P(0.02, y0, z1)], fill, stroke); }
  function chair(x, y, facing, col) { box(x - 0.04, y - 0.04, 0, 0.08, 0.08, 0.38, '#4b5563'); disc(x, y, 0.02, 0.28, 'rgba(0,0,0,.12)'); box(x - 0.26, y - 0.26, 0.38, 0.52, 0.52, 0.1, col || '#374151'); if (facing === 'up') box(x - 0.26, y + 0.2, 0.48, 0.52, 0.08, 0.55, col || '#374151'); else box(x - 0.26, y - 0.28, 0.48, 0.52, 0.08, 0.55, col || '#374151'); }

  function person(p, now) {
    if (p.hidden) { p.head = null; return; }
    const [id, , , color] = TEAM.find(t => t[0] === p.id), L = LOOK[id], sit = p.sit, asleep = (p.state === 'asleep' || (p.act && p.act.type === 'nap' && p.act.start)) && sit;
    const step = p.moving ? Math.sin(now / 110) * 0.06 : 0, X = p.x, Y = p.y;
    disc(X, Y, 0.01, 0.3, 'rgba(0,0,0,.16)');
    let hip;
    if (sit) { hip = 0.48; box(X - 0.17, Y - 0.05, 0.42, 0.34, 0.42, 0.12, L[3]); box(X - 0.16, Y + 0.3, 0, 0.13, 0.12, 0.44, L[3]); box(X + 0.03, Y + 0.3, 0, 0.13, 0.12, 0.44, L[3]); box(X - 0.17, Y + 0.3, 0, 0.15, 0.2, 0.06, '#111827'); box(X + 0.02, Y + 0.3, 0, 0.15, 0.2, 0.06, '#111827'); }
    else { hip = 0.62; box(X - 0.15, Y - 0.07 + step, 0, 0.14, 0.18, 0.06, '#111827'); box(X + 0.01, Y - 0.07 - step, 0, 0.14, 0.18, 0.06, '#111827'); box(X - 0.14, Y - 0.06 + step, 0.06, 0.12, 0.12, 0.56, L[3]); box(X + 0.02, Y - 0.06 - step, 0.06, 0.12, 0.12, 0.56, L[3]); }
    const lean = asleep ? 0.12 : 0;
    box(X - 0.19, Y - 0.12 + lean, hip, 0.38, 0.24, 0.6, color);                       // shirt
    box(X - 0.27, Y - 0.08 + lean - step, hip + 0.12, 0.08, 0.14, 0.44, color);       // arms
    box(X + 0.19, Y - 0.08 + lean + step, hip + 0.12, 0.08, 0.14, 0.44, color);
    box(X - 0.27, Y - 0.08 + lean - step, hip + 0.04, 0.08, 0.14, 0.09, L[0]);         // hands
    box(X + 0.19, Y - 0.08 + lean + step, hip + 0.04, 0.08, 0.14, 0.09, L[0]);
    const hz = hip + 0.6 - (asleep ? 0.18 : 0);
    box(X - 0.06, Y - 0.04 + lean, hz - 0.02, 0.12, 0.1, 0.08, L[0]);                  // neck
    box(X - 0.16, Y - 0.16 + lean, hz + 0.05, 0.32, 0.32, 0.34, L[0]);                 // head
    if (!asleep) { const [ex, ey] = isoPt(X - 0.04, Y + 0.17 + lean, hz + 0.24), c = ISO.ctx; c.fillStyle = '#1f2937'; c.fillRect(ex - 4, ey, 2.2, 2.2); c.fillRect(ex + 3, ey - 1.5, 2.2, 2.2); }
    if (L[2] === 'cap') { box(X - 0.18, Y - 0.18 + lean, hz + 0.34, 0.36, 0.36, 0.09, color); box(X - 0.12, Y + 0.12 + lean, hz + 0.34, 0.26, 0.16, 0.03, shade(color, -0.2)); }
    else { box(X - 0.17, Y - 0.17 + lean, hz + 0.32, 0.34, 0.34, 0.09, L[1]); if (L[2] === 'bun') box(X - 0.07, Y - 0.12 + lean, hz + 0.41, 0.14, 0.14, 0.1, L[1]); if (L[2] === 'long') box(X - 0.17, Y - 0.19 + lean, hz + 0.05, 0.34, 0.06, 0.32, L[1]); if (L[2] === 'side') box(X + 0.12, Y - 0.17 + lean, hz + 0.2, 0.05, 0.34, 0.15, L[1]); if (L[2] === 'messy') box(X - 0.1, Y - 0.05 + lean, hz + 0.41, 0.2, 0.1, 0.05, L[1]); }
    if (id === 'owl' && !asleep) { const [gx, gy] = isoPt(X - 0.04, Y + 0.17, hz + 0.25), c = ISO.ctx; c.strokeStyle = '#111827'; c.lineWidth = 1.2; c.strokeRect(gx - 6, gy - 2, 5, 4); c.strokeRect(gx + 1, gy - 3.5, 5, 4); }
    if (p.mug && !p.moving && !sit) box(X + 0.22, Y + 0.02, hip + 0.1, 0.1, 0.1, 0.12, '#f8fafc');
    if (p.act && p.act.type === 'badminton') {                                   // racket: grip at the hand, raised high when swinging
      const c = ISO.ctx, sw = Math.max(0, 1 - (now - (p.swing || 0)) / 280), face = p.side === 'r' ? -1 : 1;
      const [hx, hy] = isoPt(X + 0.23, Y + 0.02, hip + 0.1 + sw * 0.9), [tx, ty] = isoPt(X + 0.23 + face * 0.15 * (1 - sw), Y + 0.02, hip + 0.75 + sw * 1.1);
      c.strokeStyle = '#334155'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx, hy); c.lineTo(tx, ty); c.stroke();
      c.save(); c.translate(tx, ty - 5); c.rotate(face * (0.35 - sw * 0.6)); c.beginPath(); c.ellipse(0, 0, 4.2, 6.2, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill(); c.strokeStyle = TEAM.find(t => t[0] === p.id)[3]; c.lineWidth = 1.5; c.stroke(); c.restore();
    }
    if (p.act && p.act.type === 'canteen' && p.act.start && sit) { const ty = Y < 11.5 ? Y + 0.45 : Y - 0.65; box(X - 0.25, ty, 0.78, 0.5, 0.32, 0.03, '#94a3b8'); disc(X - 0.05, ty + 0.16, 0.82, 0.12, '#fef3c7'); box(X + 0.08, ty + 0.06, 0.82, 0.1, 0.1, 0.12, '#f97316'); }
    if (asleep) { const [cx, cy] = isoPt(X + 0.3, Y - 0.2, hz + 0.5), c = ISO.ctx, k = (now / 350) % 6; c.fillStyle = '#94a3b8'; c.font = '700 12px system-ui'; c.fillText('z', cx, cy - k); c.font = '700 9px system-ui'; c.fillText('z', cx + 8, cy - 9 - k); }
    p.head = isoPt(X, Y, hz + 0.6); p.hit = isoPt(X, Y, hip + 0.3);
  }

  function scene(now) {
    const c = ISO.ctx, P = isoPt; c.clearRect(0, 0, ISO.w, ISO.h);
    // floors: grey office carpet, wooden break room
    const EX = GW + 14, EY = GH + 14;                                                     // the office continues past the frame
    poly([P(0, 0, 0), P(15, 0, 0), P(15, EY, 0), P(0, EY, 0)], '#b8bec6');
    for (let x = 0; x < 15; x++) for (let y = 0; y < EY; y++) if ((x + y) % 2) poly([P(x, y, 0), P(x + 1, y, 0), P(x + 1, y + 1, 0), P(x, y + 1, 0)], 'rgba(0,0,0,.035)');
    poly([P(15, 0, 0), P(EX, 0, 0), P(EX, EY, 0), P(15, EY, 0)], '#c8996a');
    for (let x = 15; x < EX; x += 0.5) poly([P(x, 0, 0), P(x + 0.02, 0, 0), P(x + 0.02, EY, 0), P(x, EY, 0)], 'rgba(90,55,25,.18)');
    for (const [id, [rx, ry]] of Object.entries(ROOMS)) poly([P(rx, ry, 0), P(rx + 3, ry, 0), P(rx + 3, ry + 3, 0), P(rx, ry + 3, 0)], '#d9c4a5');   // wooden floors in the private offices
    poly([P(15, 10.4, 0), P(EX, 10.4, 0), P(EX, EY, 0), P(15, EY, 0)], '#5f9e5a');                                     // patio: artificial turf
    for (let y = 10.4; y < EY; y += 0.6) poly([P(15, y, 0), P(EX, y, 0), P(EX, y + 0.3, 0), P(15, y + 0.3, 0)], 'rgba(255,255,255,.05)');
    { const { x0, x1, y0, y1, net } = COURT, line = (a, b, d, e) => poly([P(a, b, 0.01), P(d, b, 0.01), P(d, e, 0.01), P(a, e, 0.01)], '#ffffff');
      poly([P(x0, y0, 0.005), P(x1, y0, 0.005), P(x1, y1, 0.005), P(x0, y1, 0.005)], '#2f7d4f');
      line(x0, y0, x1, y0 + 0.05); line(x0, y1 - 0.05, x1, y1); line(x0, y0, x0 + 0.05, y1); line(x1 - 0.05, y0, x1, y1);
      line(x0, y0 + 0.23, x1, y0 + 0.27); line(x0, y1 - 0.27, x1, y1 - 0.23);                                           // doubles side lines
      line(net - 1.02, y0, net - 0.98, y1); line(net + 0.98, y0, net + 1.02, y1);                                         // short service lines
      line(x0, (y0 + y1) / 2 - 0.02, net - 1.0, (y0 + y1) / 2 + 0.02); line(net + 1.0, (y0 + y1) / 2 - 0.02, x1, (y0 + y1) / 2 + 0.02); }
    // walls
    poly([P(0, 0, 0), P(EX, 0, 0), P(EX, 0, 12), P(0, 0, 12)], '#eef0f2'); poly([P(0, 0, 0), P(0, EY, 0), P(0, EY, 12), P(0, 0, 12)], '#dde1e5');
    poly([P(0, 0, 0), P(EX, 0, 0), P(EX, 0, 0.12), P(0, 0, 0.12)], '#9aa1a9'); poly([P(0, 0, 0), P(0, EY, 0), P(0, EY, 0.12), P(0, 0, 0.12)], '#8c939b');
    poly([P(0, 0, 2.95), P(EX, 0, 2.95), P(EX, 0, 3.05), P(0, 0, 3.05)], '#d1d5db'); poly([P(0, 0, 2.95), P(0, EY, 2.95), P(0, EY, 3.05), P(0, 0, 3.05)], '#c7ccd2');   // ceiling trim
    poly([P(0, 0, 3.05), P(EX, 0, 3.05), P(EX, 0, 12), P(0, 0, 12)], '#f4f5f7'); poly([P(0, 0, 3.05), P(0, EY, 3.05), P(0, EY, 12), P(0, 0, 12)], '#e9ecef');
    // windows (daylight)
    for (const [a, b] of [[1.0, 3.6], [4.4, 7.0], [16.0, 18.4], [21.6, 23.6], [25.4, 28.0], [29.4, 32.0]]) { onBack(a, b, 0.9, 2.3, '#bfe0f5', '#94a3b8'); onBack((a + b) / 2 - 0.02, (a + b) / 2 + 0.02, 0.9, 2.3, '#94a3b8'); }
    for (const [a, b] of [[2, 4.6], [6.6, 9.2], [11, 13.4], [15.6, 18.2], [19.8, 22.4]]) { onLeft(a, b, 0.9, 2.3, '#b5d8ef', '#94a3b8'); onLeft((a + b) / 2 - 0.02, (a + b) / 2 + 0.02, 0.9, 2.3, '#94a3b8'); }
    // RSH sign and the wall clock
    onBack(7.2, 11.4, 1.3, 2.1, '#111827'); { const [sx, sy] = P(9.3, 0.02, 1.7); c.fillStyle = '#fff'; c.font = '800 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.translate(sx, sy); c.transform(1, 0.5, 0, 1, 0, 0); c.fillText('RSH SPORTS', 0, 0); c.restore(); }
    { const [kx, ky] = P(14.6, 0.02, 2.0), d = new Date(), hr = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2, mn = d.getMinutes() / 60 * Math.PI * 2; c.save(); c.translate(kx, ky); c.transform(1, 0.5, 0, 1, 0, 0); c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#334155'; c.lineWidth = 2; c.stroke(); c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(hr) * 6, -Math.cos(hr) * 6); c.moveTo(0, 0); c.lineTo(Math.sin(mn) * 9, -Math.cos(mn) * 9); c.stroke(); c.restore(); }
    // break room sign
    onBack(18.5, 21.9, 1.7, 2.2, '#7c2d12'); { const [sx, sy] = P(20.2, 0.02, 1.95); c.fillStyle = '#fde68a'; c.font = '800 9px system-ui, sans-serif'; c.textAlign = 'center'; c.save(); c.translate(sx, sy); c.transform(1, 0.5, 0, 1, 0, 0); c.fillText('☕ BREAK ROOM', 0, 0); c.restore(); }
    const items = [], add = (k, draw) => items.push({ k, draw });
    // workstations
    for (const [id, [dx, dy]] of Object.entries(DESKS)) add(dx + dy - 0.6, () => {
      const p = ISO.people[id], on = p && p.state === 'working' && p.sit, col = TEAM.find(t => t[0] === id)[3];
      for (const [lx, ly] of [[-0.85, -0.55], [0.75, -0.55], [-0.85, 0.15], [0.75, 0.15]]) box(dx + lx, dy + ly, 0, 0.08, 0.08, 0.72, '#6b7280');
      box(dx - 0.9, dy - 0.6, 0.72, 1.8, 0.85, 0.06, '#c79b6d');                         // desk top
      box(dx - 0.06, dy - 0.48, 0.78, 0.12, 0.1, 0.18, '#374151');                       // monitor stand
      box(dx - 0.42, dy - 0.52, 0.94, 0.84, 0.06, 0.48, '#111827');                      // monitor
      const gaming = p && p.sit && p.act && p.act.type === 'game' && p.act.start;
      poly([isoPt(dx - 0.38, dy - 0.455, 0.98), isoPt(dx + 0.38, dy - 0.455, 0.98), isoPt(dx + 0.38, dy - 0.455, 1.38), isoPt(dx - 0.38, dy - 0.455, 1.38)], on ? shade(col, 0.25) : gaming ? '#0b1020' : (p && (p.state === 'asleep' || (p.act && p.act.type === 'nap')) ? '#0f172a' : '#1e3a5f'));
      if (gaming) { const t2 = now / 260; for (let k = 0; k < 5; k++) { const gx = dx - 0.32 + ((k * 0.17 + t2 * 0.05 * (k % 2 ? 1 : -1)) % 0.62 + 0.62) % 0.62, gz = 1.02 + ((k * 0.11 + t2 * 0.04) % 0.3); poly([isoPt(gx, dy - 0.45, gz), isoPt(gx + 0.06, dy - 0.45, gz), isoPt(gx + 0.06, dy - 0.45, gz + 0.06), isoPt(gx, dy - 0.45, gz + 0.06)], ['#22d3ee', '#f472b6', '#facc15', '#4ade80', '#a78bfa'][k]); } }
      if (on) for (let r = 0; r < 4; r++) poly([isoPt(dx - 0.3, dy - 0.45, 1.3 - r * 0.08), isoPt(dx + 0.05 + (r % 2) * 0.2, dy - 0.45, 1.3 - r * 0.08), isoPt(dx + 0.05 + (r % 2) * 0.2, dy - 0.45, 1.27 - r * 0.08), isoPt(dx - 0.3, dy - 0.45, 1.27 - r * 0.08)], 'rgba(255,255,255,.7)');
      box(dx - 0.3, dy - 0.12, 0.78, 0.6, 0.18, 0.03, '#e5e7eb');                         // keyboard
      box(dx + 0.42, dy - 0.05, 0.78, 0.1, 0.14, 0.03, '#e5e7eb');                        // mouse
      box(dx - 0.8, dy - 0.45, 0.78, 0.12, 0.12, 0.14, '#ffffff');                        // mug
      if (id === 'pixel' || id === 'ref') { box(dx + 0.55, dy - 0.5, 0.78, 0.22, 0.22, 0.16, '#a16207'); box(dx + 0.5, dy - 0.55, 0.94, 0.32, 0.32, 0.28, '#15803d'); }
      if (id === 'owl') { box(dx + 0.5, dy - 0.5, 0.78, 0.06, 0.06, 0.5, '#111827'); box(dx + 0.38, dy - 0.58, 1.26, 0.28, 0.2, 0.08, '#fbbf24'); }
    });
    for (const [id, [dx, dy]] of Object.entries(DESKS)) add(dx + dy + 0.5, () => chair(dx, dy + 0.75, 'up', '#334155'));
    // private offices: glass fronts with a door gap and a name plate, glass walls between rooms
    const glass = (pts) => poly(pts, '#cfe8f7', '#7fb3d5', 0.26), frame = (a, b, c2, d) => poly([isoPt(a, b, 0), isoPt(c2, d, 0), isoPt(c2, d, 2.1), isoPt(a, b, 2.1)], 'rgba(0,0,0,0)', '#8fb4cc');
    for (const [id, [rx, ry, side]] of Object.entries(ROOMS)) {
      const [name, role, col] = (m => [m[1], m[2], m[3]])(TEAM.find(t => t[0] === id));
      if (side === 'b') {
        add(rx + 1 + ry + 3.2, () => { glass([isoPt(rx, ry + 3, 0), isoPt(rx + 2.0, ry + 3, 0), isoPt(rx + 2.0, ry + 3, 2.1), isoPt(rx, ry + 3, 2.1)]); frame(rx, ry + 3, rx + 2.0, ry + 3); box(rx, ry + 2.98, 2.1, 3, 0.04, 0.08, '#94a3b8');
          const [tx, ty] = isoPt(rx + 1.0, ry + 3, 1.55), c2 = ISO.ctx; c2.save(); c2.translate(tx, ty); c2.transform(1, 0.5, 0, 1, 0, 0); c2.fillStyle = col; rr(c2, -30, -9, 60, 18, 4); c2.fill(); c2.fillStyle = '#fff'; c2.font = '800 8px system-ui, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(name.toUpperCase(), 0, -2); c2.font = '600 6px system-ui, sans-serif'; c2.fillText(role, 0, 5); c2.restore(); });
        add(rx + 2.9 + ry + 3.2, () => { glass([isoPt(rx + 2.8, ry + 3, 0), isoPt(rx + 3, ry + 3, 0), isoPt(rx + 3, ry + 3, 2.1), isoPt(rx + 2.8, ry + 3, 2.1)]); });
        add(rx + 3 + ry + 1.6, () => { glass([isoPt(rx + 3, ry, 0), isoPt(rx + 3, ry + 3, 0), isoPt(rx + 3, ry + 3, 2.1), isoPt(rx + 3, ry, 2.1)]); frame(rx + 3, ry, rx + 3, ry + 3); });
      } else {
        add(rx + 3.2 + ry + 1, () => { glass([isoPt(rx + 3, ry, 0), isoPt(rx + 3, ry + 1.9, 0), isoPt(rx + 3, ry + 1.9, 2.1), isoPt(rx + 3, ry, 2.1)]); frame(rx + 3, ry, rx + 3, ry + 1.9); box(rx + 2.98, ry, 2.1, 0.04, 3, 0.08, '#94a3b8');
          const [tx, ty] = isoPt(rx + 3, ry + 0.95, 1.55), c2 = ISO.ctx; c2.save(); c2.translate(tx, ty); c2.transform(1, -0.5, 0, 1, 0, 0); c2.fillStyle = col; rr(c2, -30, -9, 60, 18, 4); c2.fill(); c2.fillStyle = '#fff'; c2.font = '800 8px system-ui, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(name.toUpperCase(), 0, -2); c2.font = '600 6px system-ui, sans-serif'; c2.fillText(role, 0, 5); c2.restore(); });
        add(rx + 3.2 + ry + 2.9, () => { glass([isoPt(rx + 3, ry + 2.7, 0), isoPt(rx + 3, ry + 3, 0), isoPt(rx + 3, ry + 3, 2.1), isoPt(rx + 3, ry + 2.7, 2.1)]); });
        add(rx + 1.5 + ry + 3.2, () => { glass([isoPt(rx, ry + 3, 0), isoPt(rx + 3, ry + 3, 0), isoPt(rx + 3, ry + 3, 2.1), isoPt(rx, ry + 3, 2.1)]); frame(rx, ry + 3, rx + 3, ry + 3); });
      }
      add(rx + ry + 0.8, () => { box(rx + 0.25, ry + 0.25, 0, 0.5, 0.35, 1.5, '#a16207'); for (let k = 0; k < 3; k++) box(rx + 0.27, ry + 0.27, 0.35 + k * 0.4, 0.46, 0.33, 0.04, '#78350f'); box(rx + 0.3, ry + 0.3, 0.4, 0.14, 0.2, 0.25, col); box(rx + 0.48, ry + 0.3, 0.8, 0.18, 0.2, 0.22, '#e5e7eb'); });   // bookshelf
      add(rx + 2.5 + ry + 0.5, () => { box(rx + 2.35, ry + 0.3, 0, 0.38, 0.38, 0.35, '#78350f'); box(rx + 2.3, ry + 0.25, 0.35, 0.48, 0.48, 0.5, '#16a34a'); });   // plant
    }
    // central glass meeting room with a table, chairs, a TV and a whiteboard
    add(5.2 + 5.0 + 1, () => { box(5.35, 5.2, 0, 0.12, 2.4, 1.7, '#ffffff'); for (let r = 0; r < 3; r++) poly([isoPt(5.48, 5.5 + r * 0.6, 1.25 - r * 0.2), isoPt(5.48, 6.2 + r * 0.5, 1.25 - r * 0.2), isoPt(5.48, 6.2 + r * 0.5, 1.29 - r * 0.2), isoPt(5.48, 5.5 + r * 0.6, 1.29 - r * 0.2)], ['#2563eb', '#dc2626', '#16a34a'][r]); box(7.0, 5.15, 0.9, 1.4, 0.06, 0.8, '#111827'); });
    add(7.3 + 6.7, () => { for (const [cx, cy] of [[6.6, 5.9], [7.6, 5.9], [8.6, 5.9]]) chair(cx, cy, 'down', '#475569'); box(6.2, 6.2, 0, 2.8, 1.1, 0.72, '#8a6a4c'); for (const [cx, cy] of [[6.6, 7.7], [7.6, 7.7], [8.6, 7.7]]) chair(cx, cy, 'up', '#475569'); });
    add(7.3 + 8.4 + 0.6, () => { glass([isoPt(5.2, 8.4, 0), isoPt(8.4, 8.4, 0), isoPt(8.4, 8.4, 2.1), isoPt(5.2, 8.4, 2.1)]); glass([isoPt(9.1, 8.4, 0), isoPt(9.4, 8.4, 0), isoPt(9.4, 8.4, 2.1), isoPt(9.1, 8.4, 2.1)]); box(5.2, 8.38, 2.1, 4.2, 0.04, 0.08, '#94a3b8'); const [tx, ty] = isoPt(6.8, 8.4, 2.3), c2 = ISO.ctx; c2.fillStyle = '#475569'; c2.font = '700 9px system-ui'; c2.textAlign = 'center'; c2.fillText('MEETING ROOM', tx, ty); });
    add(9.4 + 6.7 + 0.6, () => { glass([isoPt(9.4, 5.0, 0), isoPt(9.4, 8.4, 0), isoPt(9.4, 8.4, 2.1), isoPt(9.4, 5.0, 2.1)]); });
    add(5.2 + 5.0 - 0.4, () => { glass([isoPt(5.2, 5.0, 0), isoPt(9.4, 5.0, 0), isoPt(9.4, 5.0, 2.1), isoPt(5.2, 5.0, 2.1)]); glass([isoPt(5.2, 5.0, 0), isoPt(5.2, 8.4, 0), isoPt(5.2, 8.4, 2.1), isoPt(5.2, 5.0, 2.1)]); });
    // break room: counter with coffee machine and sink, fridge, water cooler, tables, sofa
    add(16 + 0.9, () => { box(15.8, 0.15, 0, 5.2, 0.9, 0.9, '#e7e5e4'); box(15.8, 0.15, 0.9, 5.2, 0.9, 0.06, '#57534e'); box(16.6, 0.3, 0.96, 0.55, 0.45, 0.6, '#1f2937'); box(16.75, 0.72, 1.05, 0.2, 0.1, 0.08, '#ef4444'); box(18.2, 0.3, 0.96, 0.8, 0.5, 0.04, '#a8a29e'); for (let m = 0; m < 3; m++) box(19.6 + m * 0.3, 0.45, 0.96, 0.14, 0.14, 0.16, ['#ffffff', '#fde68a', '#bfdbfe'][m]); });
    add(22 + 1.2, () => { box(21.4, 0.2, 0, 1.1, 0.95, 2.1, '#d6d3d1'); box(21.42, 1.16, 1.25, 0.06, 0.02, 0.5, '#78716c'); });
    add(23 + 2.3, () => { box(22.7, 2.0, 0, 0.6, 0.6, 1.0, '#e2e8f0'); box(22.75, 2.05, 1.0, 0.5, 0.5, 0.55, '#7dd3fc', 0.85); });
    for (const t of TABLES) { add(t[0] + t[1], () => { box(t[0] - 0.06, t[1] - 0.06, 0, 0.12, 0.12, 0.7, '#57534e'); disc(t[0], t[1], 0.72, 0.62, '#f5f5f4'); disc(t[0], t[1], 0.7, 0.62, '#d6d3d1'); }); SEATS(t).forEach(([sx, sy], n) => add(sx + sy - 0.2, () => { box(sx - 0.2, sy - 0.2, 0, 0.4, 0.4, 0.42, '#a8a29e'); box(sx - 0.22, sy - 0.22, 0.42, 0.44, 0.44, 0.06, ['#0ea5e9', '#f97316', '#10b981', '#8b5cf6'][n]); })); }
    add(21.6 + 9.2, () => { box(21.6, 8.9, 0, 2.4, 0.9, 0.42, '#475569'); box(21.6, 9.6, 0.42, 2.4, 0.22, 0.5, '#475569'); box(21.9, 7.8, 0, 1.6, 0.6, 0.3, '#a16207'); });
    // CR (comfort room): a tiled cubicle with a door and a sign
    add(4.2 + 11.2 + 2.6, () => { box(4.2, 11.2, 0, 2.2, 2.2, 2.0, '#e0f2fe'); poly([isoPt(4.9, 13.42, 0), isoPt(5.6, 13.42, 0), isoPt(5.6, 13.42, 1.6), isoPt(4.9, 13.42, 1.6)], ISO.crBusy ? '#0369a1' : '#64748b'); { const [tx, ty] = isoPt(5.25, 13.42, 1.82), c2 = ISO.ctx; c2.fillStyle = '#0f172a'; c2.font = '800 10px system-ui'; c2.textAlign = 'center'; c2.fillText(ISO.crBusy ? 'CR · occupied' : 'CR', tx, ty); } });
    // patio: glass wall with a door, the badminton net, benches and plants
    add(15 + 10.4 + 6, () => { for (const [a, b] of [[15.0, 15.5], [16.3, 24.6], [24.6, 30]]) { glass([isoPt(a, 10.4, 0), isoPt(b, 10.4, 0), isoPt(b, 10.4, 2.1), isoPt(a, 10.4, 2.1)]); } box(15.0, 10.38, 2.1, 15, 0.04, 0.08, '#94a3b8'); const [tx, ty] = isoPt(21.5, 10.4, 2.35), c2 = ISO.ctx; c2.fillStyle = '#14532d'; c2.font = '800 9px system-ui'; c2.textAlign = 'center'; c2.fillText('🏸 PATIO · BADMINTON COURT', tx, ty); });
    add(COURT.net + (COURT.y0 + COURT.y1) / 2, () => { const { net, y0, y1 } = COURT; box(net - 0.04, y0 - 0.1, 0, 0.08, 0.08, 1.75, '#e5e7eb'); box(net - 0.04, y1 + 0.02, 0, 0.08, 0.08, 1.75, '#e5e7eb'); poly([isoPt(net, y0, 1.05), isoPt(net, y1, 1.05), isoPt(net, y1, 1.68), isoPt(net, y0, 1.68)], 'rgba(15,23,42,.35)'); for (let k = 0; k < 14; k++) { const yy = y0 + (y1 - y0) * k / 14; poly([isoPt(net, yy, 1.05), isoPt(net, yy + 0.01, 1.05), isoPt(net, yy + 0.01, 1.68), isoPt(net, yy, 1.68)], 'rgba(255,255,255,.25)'); } poly([isoPt(net, y0, 1.66), isoPt(net, y1, 1.66), isoPt(net, y1, 1.72), isoPt(net, y0, 1.72)], '#ffffff'); });
    add(16.6 + 14.4, () => { box(16.6, 14.2, 0, 2.2, 0.5, 0.45, '#92400e'); box(20.2, 14.2, 0, 2.2, 0.5, 0.45, '#92400e'); });
    // canteen: food counter on the left wall, a long table with stools, a menu sign
    add(14.5 + 12, () => { box(14.2, 10.5, 0, 0.9, 3.0, 0.9, '#d6d3d1'); box(14.2, 10.5, 0.9, 0.9, 3.0, 0.06, '#78716c'); [['#f59e0b', 10.7], ['#16a34a', 11.4], ['#dc2626', 12.1], ['#eab308', 12.8]].forEach(([col, y]) => { box(14.35, y, 0.96, 0.6, 0.5, 0.06, '#e5e7eb'); box(14.47, y + 0.1, 1.02, 0.36, 0.3, 0.08, col); });
      box(14.6, 11.95, 0.96, 0.06, 0.06, 1.4, '#6b7280'); box(14.1, 11.6, 2.36, 1.1, 0.8, 0.32, '#14532d'); { const [sx, sy] = isoPt(14.65, 12.0, 2.55), c2 = ISO.ctx; c2.fillStyle = '#fef9c3'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.font = '800 10px system-ui, sans-serif'; c2.fillText('🍽 CANTEEN', sx, sy - 5); c2.font = '600 8px system-ui, sans-serif'; c2.fillText(mealNow() ? mealNow() + ' now!' : 'Lunch 12–1 · Snacks 10 & 3', sx, sy + 7); } });
    add(9 + 11.5, () => { for (const lx of [9.2, 13.6]) for (const ly of [11.25, 11.8]) box(lx, ly, 0, 0.08, 0.08, 0.72, '#6b7280'); box(9.1, 11.15, 0.72, 4.7, 0.8, 0.06, '#f5f5f4'); });
    CANTEEN.forEach(([sx, sy]) => add(sx + sy - 0.1, () => { box(sx - 0.18, sy - 0.18, 0, 0.36, 0.36, 0.44, '#9ca3af'); box(sx - 0.2, sy - 0.2, 0.44, 0.4, 0.4, 0.05, '#f97316'); }));
    for (const [px, py] of [[0.6, 13.0], [8.4, 13.4], [15.4, 13.8], [24.0, 13.6]]) add(px + py, () => { box(px - 0.22, py - 0.22, 0, 0.44, 0.44, 0.42, '#78350f'); box(px - 0.3, py - 0.3, 0.42, 0.6, 0.6, 0.55, '#16a34a'); box(px - 0.18, py - 0.18, 0.97, 0.36, 0.36, 0.3, '#22c55e'); });
    for (const p of Object.values(ISO.people)) add(p.x + p.y + 0.3, () => person(p, now));
    items.sort((a, b) => a.k - b.k).forEach(i => i.draw());
    // the shuttlecock in flight, with its shadow on the court
    if (ISO.shuttle) { const { x, y, z } = ISO.shuttle; disc(x, y, 0.01, 0.07, 'rgba(0,0,0,.22)'); const [sx, sy] = isoPt(x, y, z); c.save(); c.translate(sx, sy); c.rotate(ISO.shuttle.dir * 0.6); c.fillStyle = '#ffffff'; c.strokeStyle = '#94a3b8'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-1.6, 0); c.lineTo(-4.5, -6); c.lineTo(4.5, -6); c.lineTo(1.6, 0); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.arc(0, 1.2, 2, 0, Math.PI * 2); c.fillStyle = '#f59e0b'; c.fill(); c.restore(); }
    // holograms: what each working bot is doing, floating over its screen
    for (const p of Object.values(ISO.people)) if (p.state === 'working' && p.sit) {
      const [dx, dy] = DESKS[p.id], col = TEAM.find(t => t[0] === p.id)[3], [hx, hy] = isoPt(dx, dy - 0.5, 2.25 + Math.sin(now / 500 + dx) * 0.04), txt = cut(String((team()[p.id] || [])[3] || 'Working…'), 34);
      c.save(); c.font = '700 10px system-ui, sans-serif'; const w = Math.min(190, c.measureText(txt).width + 22), h = 30, x = hx - w / 2, y = hy - h;
      c.globalAlpha = 0.9; c.fillStyle = shade(col, 0.55); rr(c, x, y, w, h, 6); c.fill(); c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 1.2; rr(c, x, y, w, h, 6); c.stroke();
      c.fillStyle = '#0f172a'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, x + 8, y + 11);
      const prog = (now / 40 + dx * 37) % 100 / 100; c.fillStyle = 'rgba(15,23,42,.15)'; c.fillRect(x + 8, y + 20, w - 16, 4); c.fillStyle = col; c.fillRect(x + 8, y + 20, (w - 16) * prog, 4);
      c.globalAlpha = 0.35; c.fillStyle = col; c.beginPath(); c.moveTo(hx - 10, y + h); c.lineTo(hx + 10, y + h); const [bx, by] = isoPt(dx, dy - 0.5, 1.42); c.lineTo(bx + 4, by); c.lineTo(bx - 4, by); c.closePath(); c.fill(); c.restore();
    }
    // name tags last, nudged apart so they never cover each other
    const placed = [], tags = Object.values(ISO.people).filter(p => p.head).sort((a, b) => a.head[1] - b.head[1]);
    for (const p of tags) {
      const [id, name, role, color] = TEAM.find(t => t[0] === p.id), dot = p.state === 'working' ? '#22c55e' : p.state === 'asleep' ? '#94a3b8' : '#f59e0b';
      c.font = '800 10px system-ui, sans-serif'; const w = Math.max(c.measureText(name).width, (c.font = '600 9px system-ui, sans-serif', c.measureText(role).width)) + 24, h = 26;
      let x = p.head[0] - w / 2, y = p.head[1] - h - 4; for (let k = 0; k < 6 && placed.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]); k++) y -= h + 3;
      placed.push([x, y, w, h]); p.tag = [x + w / 2, y];
      c.fillStyle = 'rgba(255,255,255,.96)'; rr(c, x, y, w, h, 7); c.fill(); c.fillStyle = color; rr(c, x, y, 4, h, 2); c.fill();
      c.beginPath(); c.arc(x + 12, y + 8, 3.2, 0, Math.PI * 2); c.fillStyle = dot; c.fill();
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#111827'; c.font = '800 10px system-ui, sans-serif'; c.fillText(name, x + 18, y + 8.5); c.fillStyle = '#6b7280'; c.font = '600 9px system-ui, sans-serif'; c.fillText(role, x + 10, y + 19);
    }
    for (const p of tags) if (p.say && now < p.sayUntil) bubble(p.tag[0], p.tag[1] - 4, p.say, TEAM.find(t => t[0] === p.id)[3]);
  }
  function bubble(cx, cy, text, color) {
    const c = ISO.ctx; c.font = '600 12px system-ui, sans-serif'; const words = String(text).split(' '), lines = []; let cur = '';
    for (const w of words) { if (c.measureText(cur + ' ' + w).width > 210 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) lines.push(cur);
    const L = lines.slice(0, 3), bw = Math.min(232, Math.max(...L.map(l => c.measureText(l).width)) + 20), bh = L.length * 15 + 12, bx = Math.max(4, Math.min(ISO.w - bw - 4, cx - bw / 2)), by = Math.max(4, cy - bh - 8);
    c.fillStyle = '#ffffff'; c.strokeStyle = color; c.lineWidth = 1.5; rr(c, bx, by, bw, bh, 10); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx - 6, by + bh); c.lineTo(cx + 6, by + bh); c.lineTo(cx, by + bh + 7); c.closePath(); c.fill(); c.stroke(); c.fillRect(cx - 5, by + bh - 2, 10, 3);
    c.fillStyle = '#111827'; c.textAlign = 'left'; c.textBaseline = 'top'; L.forEach((l, i) => c.fillText(l + (i === 2 && lines.length > 3 ? '…' : ''), bx + 10, by + 6 + i * 15));
  }

  /* ---------- office talk ----------
   * Personalities: Pixel the perfectionist designer, Reel the dramatic film buff, Quill the word nerd, Tempo the
   * punctual one, Ref the strict-but-fair manager, Courier the sleepy one, Night Owl the night-shift veteran. */
  function facts() {
    const items = (plan && plan.items) || [], posts = app().data().posts || [], ready = items.filter(i => i.ready).length, held = items.length - ready;
    const need = posts.filter(q => q.date && q.date >= iso(new Date()) && !(q.creativeAssets || []).length && !q.creativeAsset).sort((a, b) => a.date.localeCompare(b.date))[0];
    let best = ''; try { const L = learnedTimes(); const ig = L.instagram || L.tiktok || Object.values(L)[0]; if (ig) best = clockTxt(ig.time); } catch (_) {}
    const q = Object.values(jobs).filter(j => j.status === 'queued' || j.status === 'sent').length, sent = items.filter(i => i.sent && /scheduled|draft/.test(i.sent.status)).length;
    return { ready, held, total: items.length, need: need ? cut(need.title, 34) : '', needDate: need ? new Date(need.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '', best, queue: q, sent, tomorrowTue: new Date(Date.now() + 864e5).getDay() === 2 };
  }
  const TALKS = [
    f => [['sage', 'New production pack is up. Hook, shots, prompts, the lot.'], ['reel', 'Timeline with exact seconds?'], ['sage', 'Down to the tenth.'], ['reel', 'I could hug you.']],
    f => [['pixel', 'Your image prompts have a negative list longer than the prompt.'], ['sage', 'Every logo we don’t generate is one we don’t have to blur.'], ['pixel', 'Fair.']],
    f => [['sage', 'Is it “Wrestle fearless” or “Play fearless”?'], ['quill', 'Wrestle. Always wrestle.'], ['sage', 'Good. I already wrote it that way.']],
    f => [['tempo', 'Coffee at 10, posts at 6. Some of us live by a schedule.'], ['pixel', 'Some of us live by inspiration.'], ['tempo', 'Inspiration doesn’t send calendar invites.']],
    f => [['quill', 'I fit our whole brand story into 300 characters for Bluesky.'], ['reel', 'And?'], ['quill', 'I had to cut the word “very.” I’m still grieving.']],
    f => [['ref', 'Reminder: nothing goes out without both approvals.'], ['reel', 'Not even a tiny teaser?'], ['ref', 'Especially not a tiny teaser.'], ['reel', 'Tough crowd.']],
    f => f.need ? [['pixel', `“${f.need}” still has no files for ${f.needDate}.`], ['ref', 'Then it stays on my desk. Rules are rules.'], ['pixel', 'I’ll send the brief again. In bold this time.']] : null,
    f => [['owl', 'Who finished the coffee?'], ['tempo', 'It was scheduled for 9:00. You missed the slot.'], ['owl', 'I work nights, Tempo.'], ['tempo', 'Then set a reminder.']],
    f => [['reel', 'I rendered that singlet video so many times I see navy and gold when I close my eyes.'], ['pixel', 'That’s not burnout, that’s brand recall.']],
    f => f.best ? [['tempo', `Our best hour is still ${f.best}.`], ['quill', 'People love dinner with a side of content.'], ['tempo', 'I’ll take it. Dinner is undefeated.']] : null,
    f => [['quill', 'Instagram only allows five hashtags now.'], ['pixel', 'How are you coping?'], ['quill', '#NotWell #ButProfessional']],
    f => [['ref', 'I checked every post twice this morning.'], ['owl', 'I checked them three times last night.'], ['ref', 'Show-off.']],
    f => [['pixel', 'Courier, what do you actually do all day?'], ['courier', 'I watch every post in Metricool like a hawk.'], ['pixel', 'From the coffee machine?'], ['courier', 'Hawks need coffee too.']],
    f => [['courier', 'When direct posting ships, I’m finally getting a real desk job.'], ['tempo', 'You already have a desk.'], ['courier', 'A desk with purpose, Tempo.']],
    f => f.tomorrowTue ? [['quill', 'Tomorrow is Tuesday. DYK day.'], ['reel', 'Did you know I need a script first?'], ['quill', 'Did you know I’m already writing it?']] : null,
    f => [['pixel', 'No third-party logos in any shot. I zoomed in on every sock.'], ['ref', 'That’s why you’re my favorite.'], ['pixel', 'Can I get that in writing?'], ['ref', 'No.']],
    f => f.total ? [['ref', `${f.ready} posts are ready and ${f.held} are still waiting.`], ['tempo', 'So we’re on schedule?'], ['ref', 'We’re on process. Schedule follows process.']] : null,
    f => [['reel', 'Can someone look at my cut before Anthony does?'], ['ref', 'That’s literally my job.'], ['reel', 'Then why am I nervous?'], ['ref', 'Because you care. It shows.']],
    f => [['owl', 'Morning report is out.'], ['pixel', 'Anything exciting?'], ['owl', 'The coffee machine is still our most reliable team member.']],
    f => [['quill', 'I wrote “reversible wrestling singlet” so many times it stopped sounding like words.'], ['tempo', 'Say it at 6 PM. Peak engagement.']],
    f => [['pixel', 'Weekend plans?'], ['reel', 'Watching movies to study pacing.'], ['pixel', 'So, watching movies.'], ['reel', 'Professionally.']],
    f => [['tempo', 'Meeting at 3?'], ['ref', 'Could it be an email?'], ['tempo', 'It is an email.'], ['ref', 'Best meeting this week.']],
    f => [['owl', 'The always-on window ran all night.'], ['tempo', 'Every 30 minutes?'], ['owl', 'Like clockwork. Unlike my sleep schedule.']],
    f => [['quill', 'Who keeps putting #fyp in the drafts?'], ['pixel', 'Not me.'], ['reel', '…Not me either.'], ['quill', 'Reel.']],
    f => f.queue ? [['reel', `${f.queue} video job${f.queue === 1 ? ' is' : 's are'} waiting for me.`], ['ref', 'Good. A queue is a plan.'], ['reel', 'A queue is a cliffhanger.']] : [['reel', 'No video jobs today.'], ['pixel', 'Enjoy it while it lasts.'], ['reel', 'I’m enjoying it dramatically.']],
    f => [['pixel', 'I asked the printer for a 4:5 crop.'], ['tempo', 'And?'], ['pixel', 'It printed a paper jam.']],
    f => [['ref', 'Whose cold coffee is on desk three?'], ['owl', 'Technically that’s a night-shift coffee.'], ['ref', 'Technically it’s a science project.']],
    f => f.sent ? [['tempo', `${f.sent} posts are already sitting in Metricool.`], ['quill', 'Hashtags included?'], ['tempo', 'Five each, max. I counted.']] : null,
    f => [['quill', 'Do you think captions dream?'], ['reel', 'Mine dream in slow motion.'], ['pixel', 'Mine dream in 4:5.']],
    f => [['ref', 'Team, nice work this week.'], ['tempo', 'Is this the part where we get pizza?'], ['ref', 'This is the part where we get a checklist.'], ['pixel', 'Close enough.']]
  ];
  const SOLO = {
    sage: ['Rewriting the hook. Third draft is the charm.', 'Counting words: 1.7 per second, not one more.'],
    pixel: ['Refilling my water. Hydrated designers make sharper crops.', 'Thinking about kerning. Again.'], reel: ['Grabbing a coffee before the next render.', 'This break room has great lighting. Just saying.'],
    quill: ['Third coffee. Don’t count.', 'Is it “email” or “e-mail”? Asking for a caption.'], tempo: ['Two-minute break. Timer is running.', 'Perfect time for coffee: 10:00 sharp.'],
    ref: ['Stretching. Good posture, good process.', 'Checking the checklist for the checklist.'], courier: ['Just five more minutes…'], owl: ['Day shift is so bright.', 'Coffee number two of the night. Morning. Whatever.']
  };
  function sayLine(p, text, ms) { p.say = text; p.sayUntil = performance.now() + (ms || 4200); ISO.transcript.push([p.id, text]); ISO.transcript = ISO.transcript.slice(-4); paintLog(); }
  function paintLog() { if (!ISO.log) return; ISO.log.innerHTML = ISO.transcript.length ? ISO.transcript.map(([id, t]) => { const m = TEAM.find(x => x[0] === id); return `<div><strong style="color:${m[3]}">${esc(m[1])}:</strong> ${esc(t)}</div>`; }).join('') : '<div>The office is quiet.</div>'; }
  /* idle life: each free bot picks an activity — coffee, a nap at the desk (often right after coffee), the CR, a walk,
     a game on the computer — and at lunch (12–1) and snack time (10:00, 3:00) everyone free goes to the canteen. */
  const FOOD_TALKS = [
    f => [['tempo', 'Lunch at 12:00 sharp. Finally, a schedule everyone respects.'], ['pixel', 'The food is plated beautifully today.'], ['tempo', 'You say that every day.'], ['pixel', 'Because it’s true every day.']],
    f => [['reel', 'If this sandwich had a trailer, it would win awards.'], ['quill', 'Please never write food reviews.'], ['reel', 'Too late. I have a draft.']],
    f => [['ref', 'No talking about work at lunch.'], ['quill', 'So… how many posts are ready?'], ['ref', 'Eat your rice, Quill.']],
    f => [['owl', 'This is technically my midnight snack.'], ['courier', 'It’s noon.'], ['owl', 'Time is a construct.']],
    f => [['courier', 'Can someone pass the soy sauce?'], ['tempo', 'Delivered in under two seconds.'], ['courier', 'Show-off. That’s my job.']],
    f => [['quill', 'Snack time is my favorite meeting.'], ['pixel', 'No agenda, just cookies.'], ['ref', 'I’m adding cookies to the checklist.']]
  ];
  const ACT_LINES = {
    coffee: ['Coffee time. Don’t tell Ref it’s my third.', 'This coffee machine deserves a raise.', 'Just a quick refill.'],
    nap: ['Power nap. Five minutes. Wake me if Anthony calls.', 'Resting my eyes. Totally different from sleeping.'],
    cr: ['Quick CR break. Be right back.', 'BRB, CR.'],
    game: ['One more level, then back to work.', 'New high score incoming.', 'Just testing the monitor’s refresh rate. Professionally.'],
    wander: ['Stretching my legs.', 'Walking meeting with myself.', 'Getting my steps in.'],
    canteen: ['Lunch is served!', 'What’s on the menu today?', 'Snack break, finally.']
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  ACT_LINES.badminton = ['Badminton? Loser buys coffee.', 'Rematch from yesterday. I’m ready.', 'Warm-up rally, then we play for real.'];
  /* badminton: two free bots play rallies on the patio court. The shuttle flies in an arc from racket to racket; the
     receiver moves to where it will land; now and then it drops and someone scores. */
  function startMatch(a, b, now) {
    if (!a || !b || a === b) return; if (ISO.match) endMatch();
    if (ISO.convo && (ISO.convo.who.includes(a.id) || ISO.convo.who.includes(b.id))) { Object.values(ISO.people).forEach(q => { if (ISO.convo.who.includes(q.id)) { q.convo = false; q.goal = null; } }); ISO.convo = null; ISO.nextConvo = (now || performance.now()) + 8000; }   // players leave any chat first
    const y = (COURT.y0 + COURT.y1) / 2, la = COURT.net - 2.0, lb = COURT.net + 2.0;
    a.act = { type: 'badminton', target: [la, y], dur: 32000 + Math.random() * 16000 }; a.side = 'l'; a.goal = null; a.mug = false;
    b.act = { type: 'badminton', target: [lb, y], dur: a.act.dur }; b.side = 'r'; b.goal = null; b.mug = false;
    ISO.match = { a: a.id, b: b.id, hitter: a.id, t0: 0, dur: 1300, land: y, score: [0, 0], pause: now + 1500 };
    sayLine(a, pick(ACT_LINES.badminton));
  }
  function endMatch() { const m = ISO.match; if (!m) return; for (const id of [m.a, m.b]) { const q = ISO.people[id]; if (q) { q.goal = null; if (q.act && q.act.type === 'badminton') q.act.start = 1; } } ISO.match = null; ISO.shuttle = null; }
  function matchTick(now) {
    const m = ISO.match; if (!m) return;
    const A = ISO.people[m.a], B = ISO.people[m.b];
    if (!A || !B || !A.act || !B.act || A.act.type !== 'badminton' || B.act.type !== 'badminton') { const winner = A && B ? null : null; endMatch(); return; }
    if (A.moving && !A.goal || B.moving && !B.goal || !A.act.start || !B.act.start) { ISO.shuttle = null; return; }   // still walking out to the court
    if (now < m.pause) { ISO.shuttle = null; return; }
    const H = m.hitter === m.a ? A : B, R = H === A ? B : A;
    if (!m.t0) { m.t0 = now; m.dur = 1100 + Math.random() * 600; m.land = COURT.y0 + 0.5 + Math.random() * (COURT.y1 - COURT.y0 - 1.0); R.goal = [R.side === 'l' ? COURT.net - 2.0 - Math.random() * 0.6 : COURT.net + 2.0 + Math.random() * 0.6, m.land]; H.swing = now; m.miss = Math.random() < 0.12; }
    const u = (now - m.t0) / m.dur, fromX = H.x + (H.side === 'l' ? 0.3 : -0.3), toX = R.goal[0] + (R.side === 'l' ? 0.3 : -0.3);
    if (u < 1) { ISO.shuttle = { x: fromX + (toX - fromX) * u, y: H.y + (m.land - H.y) * u, z: (m.miss && u > 0.75 ? 1.9 * (1 - (u - 0.75) * 4) + 0.6 * (1 - u) : 1.9 + 2.0 * Math.sin(Math.PI * u)), dir: H.side === 'l' ? 1 : -1 }; return; }
    if (m.miss) { const w = H === A ? 0 : 1; m.score[w]++; if (Math.random() < 0.5) sayLine(H, pick(['Point!', 'Got you!', 'That one counts.', 'Too fast?'])); else sayLine(R, pick(['Out! …Fine, it was in.', 'Lucky shot.', 'Next one is mine.'])); m.pause = now + 1800; m.t0 = 0; m.hitter = H.id; ISO.shuttle = null; return; }
    R.swing = now; sfxTock(); m.hitter = R.id; m.t0 = 0;
  }
  function zoneAt(x, y) { for (const [id, [rx, ry]] of Object.entries(ROOMS)) if (x > rx && x < rx + 3 && y > ry && y < ry + 3) return id; if (x > 15 && y > 10.4) return 'patio'; return ''; }
  // walls people walk around (x0, y0, x1, y1): the back offices, the left offices, the meeting room, the CR, the canteen table, the patio wall
  const BLOCKS = [[0, 0, 15.45, 3.35], [0, 3.8, 3.35, 13.3], [5.05, 4.85, 9.55, 8.55], [4.05, 11.05, 6.55, 13.5], [9.0, 11.05, 13.9, 12.05], [14.1, 10.4, 30, 10.5]];
  function hits(a, b, r) {                         // does segment a→b pass through rectangle r?
    if (Math.max(a[0], b[0]) < r[0] || Math.min(a[0], b[0]) > r[2] || Math.max(a[1], b[1]) < r[1] || Math.min(a[1], b[1]) > r[3]) return false;
    for (let k = 1; k < 24; k++) { const t = k / 24, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) return true; }
    return false;
  }
  function detour(a, b, depth) {
    if (depth > 3) return [b];
    const r = BLOCKS.find(q => hits(a, b, q)); if (!r) return [b];
    const m = 0.35, C = [[r[0] - m, r[1] - m], [r[2] + m, r[1] - m], [r[2] + m, r[3] + m], [r[0] - m, r[3] + m]], len = (pts) => pts.reduce((s2, q, i) => s2 + Math.hypot(q[0] - (i ? pts[i - 1][0] : a[0]), q[1] - (i ? pts[i - 1][1] : a[1])), 0);
    let best = null;
    for (const path of [[C[0]], [C[1]], [C[2]], [C[3]], [C[0], C[1]], [C[1], C[0]], [C[1], C[2]], [C[2], C[1]], [C[2], C[3]], [C[3], C[2]], [C[3], C[0]], [C[0], C[3]]]) {
      const full = path.concat([b]); let prev = a, ok = true; for (const q of full) { if (hits(prev, q, r)) { ok = false; break; } prev = q; }
      if (ok && (!best || len(full) < len(best))) best = full;
    }
    if (!best) return [b];
    const out = []; let prev = a; for (const q of best) { out.push(...detour(prev, q, depth + 1)); prev = q; } return out;
  }
  function routeTo(p, tx, ty) {                    // through the doors, around the walls, never through the glass
    const za = zoneAt(p.x, p.y), zb = zoneAt(tx, ty), stops = [];
    if (za !== zb) { if (za && DOORS[za]) stops.push(DOORS[za][0], DOORS[za][1]); if (zb && DOORS[zb]) stops.push(DOORS[zb][1], DOORS[zb][0]); }
    stops.push([tx, ty]);
    const pts = []; let prev = [p.x, p.y], inside = za;
    for (const q of stops) { const free = !zoneAt(prev[0], prev[1]) && !zoneAt(q[0], q[1]); pts.push(...(free ? detour(prev, q, 0) : [q])); prev = q; }
    return pts;
  }
  const DOING = p => p.state === 'working' ? '💻 ' + cut(String((team()[p.id] || [])[3] || 'Working'), 60) : p.state === 'asleep' ? '💤 Switched off' : p.convo ? '💬 Chatting' : !p.act ? '🚶 Walking' :
    ({ coffee: '☕ Coffee break', nap: '😴 Power nap at the desk', cr: '🚻 CR break', game: '🎮 Playing a game', wander: '🚶 Stretching legs', canteen: '🍽 ' + (mealNow() || 'Eating'), badminton: '🏸 Playing badminton' })[p.act.type] || '🚶 Walking';
  function paintStatus() {
    if (!ISO.status) return; const html = TEAM.map(([id, name, role, col]) => { const q = ISO.people[id]; return q ? `<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border:1px solid #e5e7eb;border-radius:10px;background:#fff"><span style="width:8px;height:8px;border-radius:50%;margin-top:5px;flex:none;background:${q.state === 'working' ? '#22c55e' : q.state === 'asleep' ? '#94a3b8' : '#f59e0b'}"></span><div style="min-width:0"><div style="font-weight:700;font-size:12px"><span style="color:${col}">${esc(name)}</span> <span class="small" style="font-weight:500">· ${esc(role)}</span></div><div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(DOING(q))}</div></div></div>` : ''; }).join('');
    if (html !== ISO.statusHtml) { ISO.status.innerHTML = html; ISO.statusHtml = html; }
  }

  /* ---------- office music: a smooth, original lo-fi loop made live with the Web Audio API (no files) ---------- */
  const MUSIC = { ctx: null, out: null, on: false, vol: 0.5, timer: 0, bar: 0, next: 0 };
  try { const m = JSON.parse(localStorage.getItem('rsh_office_music') || '{}'); if (typeof m.vol === 'number') MUSIC.vol = m.vol; MUSIC.want = !!m.on; } catch (_) {}
  const musicSave = () => { try { localStorage.setItem('rsh_office_music', JSON.stringify({ on: MUSIC.on, vol: MUSIC.vol })); } catch (_) {} };
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const CHORDS = [[62, 65, 69, 72, 76], [55, 59, 62, 65, 69], [60, 64, 67, 71, 74], [57, 60, 64, 67, 71]];   // Dm9 · G9 · Cmaj9 · Am9
  function tone(f, t, dur, type, gain, dest) { const c = MUSIC.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(dest || MUSIC.out); o.start(t); o.stop(t + dur + 0.05); }
  function hat(t, gain) { const c = MUSIC.ctx, n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); n.buffer = b; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.value = gain; n.connect(f); f.connect(g); g.connect(MUSIC.out); n.start(t); }
  function scheduleBar() {
    const c = MUSIC.ctx; if (!c || !MUSIC.on) return;
    const audible = ISO.canvas && ISO.canvas.isConnected && !document.hidden && tab === 'office';
    while (MUSIC.next < c.currentTime + 1.5) {
      const t = MUSIC.next, beat = 0.75, ch = CHORDS[MUSIC.bar % 4];
      if (audible) {
        ch.forEach((n, k) => { tone(hz(n), t + k * 0.015, 2.8, 'sine', 0.05); tone(hz(n) * 2, t + k * 0.015, 1.2, 'sine', 0.012); });          // soft electric-piano chord
        tone(hz(ch[0] - 24), t, 1.3, 'triangle', 0.09); tone(hz(ch[0] - 17), t + 2 * beat, 1.2, 'triangle', 0.07);                              // bass
        for (let k = 0; k < 8; k++) hat(t + k * beat / 2 + (k % 2 ? 0.05 : 0), k % 2 ? 0.035 : 0.02);                                             // brushed hi-hat, a little swing
        if (MUSIC.bar % 2) { const scale = [74, 76, 79, 81, 84]; for (let k = 0; k < 3; k++) if (Math.random() < 0.7) tone(hz(scale[Math.floor(Math.random() * scale.length)]), t + (1 + k) * beat + Math.random() * 0.1, 0.9, 'sine', 0.035); }
      }
      MUSIC.next += 4 * 0.75; MUSIC.bar++;
    }
  }
  function musicStart() {
    try {
      if (!MUSIC.ctx) { MUSIC.ctx = new (window.AudioContext || window.webkitAudioContext)(); const lp = MUSIC.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; MUSIC.out = MUSIC.ctx.createGain(); MUSIC.out.connect(lp); lp.connect(MUSIC.ctx.destination); }
      MUSIC.ctx.resume(); MUSIC.out.gain.value = MUSIC.vol * 0.9; MUSIC.on = true; MUSIC.next = MUSIC.ctx.currentTime + 0.1; clearInterval(MUSIC.timer); MUSIC.timer = setInterval(scheduleBar, 400); scheduleBar();
    } catch (_) { MUSIC.on = false; }
    musicSave(); paintMusic();
  }
  function musicStop() { MUSIC.on = false; clearInterval(MUSIC.timer); if (MUSIC.ctx) MUSIC.ctx.suspend(); musicSave(); paintMusic(); }
  function sfxTock() { if (!MUSIC.on || !MUSIC.ctx || tab !== 'office') return; const t = MUSIC.ctx.currentTime; tone(1300, t, 0.07, 'square', 0.03); tone(650, t, 0.09, 'sine', 0.05); }
  function paintMusic() { if (!ISO.musicBar) return; const b = ISO.musicBar.querySelector('[data-music-toggle]'), v = ISO.musicBar.querySelector('[data-music-vol]'), n = ISO.musicBar.querySelector('[data-music-note]'); if (b) { b.textContent = MUSIC.on ? '⏸ Music on' : '▶ Music off'; b.setAttribute('aria-pressed', MUSIC.on ? 'true' : 'false'); } if (v) v.value = Math.round(MUSIC.vol * 100); if (n) n.textContent = MUSIC.on ? 'Smooth office lo-fi, made live in your browser' : (MUSIC.want ? 'Press play to resume the office music' : 'Smooth background music for the office'); }
  function nextAct(p, now) {
    const meal = mealNow();
    if (meal) { const taken = new Set(Object.values(ISO.people).filter(q => q !== p && q.act && q.act.type === 'canteen').map(q => q.act.seat)); const seat = CANTEEN.findIndex((_, i) => !taken.has(i)); p.act = { type: 'canteen', target: CANTEEN[seat < 0 ? 0 : seat], seat, dur: 60000 }; if (Math.random() < 0.5) sayLine(p, pick(ACT_LINES.canteen)); return; }
    const after = p.act && p.act.type;
    if (!ISO.match && after !== 'badminton' && Math.random() < 0.3) { const mate = Object.values(ISO.people).find(q => q !== p && q.state === 'idle' && !q.convo && !q.hidden && (!q.act || ['coffee', 'wander', 'game', 'nap'].includes(q.act.type))); if (mate) { startMatch(p, mate, now); return; } }
    const w = [['coffee', after === 'coffee' ? 4 : 22], ['nap', after === 'coffee' ? 34 : 10], ['cr', ISO.crBusy || after === 'cr' ? 0 : 9], ['game', 16], ['wander', 20]];
    let r = Math.random() * w.reduce((a, b) => a + b[1], 0), type = 'wander'; for (const [t, n] of w) { if ((r -= n) < 0) { type = t; break; } }
    const [dx, dy] = DESKS[p.id];
    const target = type === 'coffee' ? pick(COFFEE).map(v => v + (Math.random() - 0.5) * 0.5) : type === 'cr' ? CR_DOOR : type === 'wander' ? pick(WANDER) : [dx, dy + 0.78];
    const dur = { coffee: 9000, nap: 16000, cr: 7000, game: 15000, wander: 3500 }[type] + Math.random() * 6000;
    p.act = { type, target, dur }; p.mug = type === 'coffee';
    if (type === 'cr') ISO.crBusy = p.id;
    if (Math.random() < 0.45) sayLine(p, pick(ACT_LINES[type]));
  }
  function actTick(p, now) {
    if (p.state !== 'idle') { if (p.act && p.act.type === 'cr' && ISO.crBusy === p.id) ISO.crBusy = null; if (ISO.match && (ISO.match.a === p.id || ISO.match.b === p.id)) endMatch(); p.act = null; p.hidden = false; p.goal = null; return; }
    if (mealNow() && (!p.act || p.act.type !== 'canteen') && !p.convo) { if (p.act && p.act.type === 'cr' && ISO.crBusy === p.id) ISO.crBusy = null; if (ISO.match && (ISO.match.a === p.id || ISO.match.b === p.id)) endMatch(); p.hidden = false; p.goal = null; nextAct(p, now); return; }
    if (!mealNow() && p.act && p.act.type === 'canteen' && !p.convo) { p.act = null; }
    if (!p.act) return nextAct(p, now);
    if (p.act.type === 'badminton' && (!ISO.match || (ISO.match.a !== p.id && ISO.match.b !== p.id))) { p.goal = null; return nextAct(p, now); }   // the match ended or was replaced
    if (p.convo) { if (p.act.start) p.act.start = now - 1; return; }
    if (!p.moving && !p.act.start) { p.act.start = now; if (p.act.type === 'cr') p.hidden = true; }
    if (p.act.start && now - p.act.start > p.act.dur) { if (p.act.type === 'cr') { p.hidden = false; if (ISO.crBusy === p.id) ISO.crBusy = null; } if (p.act.type === 'badminton') { const m = ISO.match; if (m) { const [a, b] = m.score; const me = ISO.people[m.a === p.id ? m.a : m.b], other = ISO.people[m.a === p.id ? m.b : m.a]; sayLine(me, a === b ? 'Good game. Call it a draw.' : `Good game! ${Math.max(a, b)}–${Math.min(a, b)}.`); endMatch(); if (other) nextAct(other, now); } } nextAct(p, now); }
  }
  const chatty = p => p.state === 'idle' && !p.convo && !p.moving && !p.hidden && p.act && ['coffee', 'wander', 'canteen', 'game'].includes(p.act.type) && p.act.start;
  function startConvo(now) {
    const free = Object.values(ISO.people).filter(chatty); if (free.length < 2) return;
    const f = facts(), atLunch = free.filter(q => q.act.type === 'canteen').length >= 2;
    const pool = (atLunch ? FOOD_TALKS.concat(TALKS) : TALKS).map(t => t(f)).filter(Boolean).filter(lines => { const who = [...new Set(lines.map(l => l[0]))]; return who.every(id => free.some(q => q.id === id)) && (!atLunch || who.every(id => ISO.people[id].act.type === 'canteen')); });
    if (!pool.length) return;
    const lines = pool[Math.floor(Math.random() * pool.length)], who = [...new Set(lines.map(l => l[0]))], host = ISO.people[who[0]];
    who.forEach((id, n) => { const q = ISO.people[id]; q.convo = true; if (q.act.type !== 'canteen' && n > 0) { const a = (n / who.length) * Math.PI * 2; q.goal = [host.x + Math.cos(a) * 0.85, host.y + Math.sin(a) * 0.85]; } });
    ISO.convo = { who, lines, i: 0, next: now + 2200, until: now + 32000 };
  }
  function stepConvo(now) {
    const cv = ISO.convo; if (!cv) return;
    const people = cv.who.map(id => ISO.people[id]);
    const end = gap => { people.forEach(q => { q.convo = false; q.goal = null; }); ISO.convo = null; ISO.nextConvo = now + gap; };
    if (people.some(q => q.state !== 'idle' || q.hidden) || now > cv.until) return end(5000);
    if (now < cv.next || people.some(q => q.moving)) return;
    if (cv.i >= cv.lines.length) return end(7000 + Math.random() * 6000);
    const [id, text] = cv.lines[cv.i++]; sayLine(ISO.people[id], text, 3600); cv.next = now + 3300;
  }
  function isoTarget(p) {
    const [dx, dy] = DESKS[p.id];
    if (p.state !== 'idle') return [dx, dy + 0.78];
    if (p.goal) return p.goal;
    return p.act ? p.act.target : [p.x, p.y];
  }
  function isoTick(now) {
    if (!ISO.canvas || !ISO.canvas.isConnected || document.hidden) { ISO.raf = 0; return; }
    const dt = Math.min(0.05, (now - (ISO.last || now)) / 1000); ISO.last = now;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const p of Object.values(ISO.people)) {
      actTick(p, now);
      const T = isoTarget(p), key = T[0].toFixed(2) + ',' + T[1].toFixed(2);
      if (p.routeKey !== key) { p.route = routeTo(p, T[0], T[1]); p.routeKey = key; }
      if (still) { p.x = T[0]; p.y = T[1]; p.route = [T]; }
      const [tx, ty] = p.route[0] || T, ddx = tx - p.x, ddy = ty - p.y, dist = Math.hypot(ddx, ddy), sp = (p.act && p.act.type === 'badminton' && p.goal ? 3.0 : 2.0) * dt;
      if (dist < Math.max(sp, 0.001) || !isFinite(dist)) { p.x = tx; p.y = ty; if (p.route.length > 1) { p.route.shift(); p.moving = true; } else p.moving = false; } else { p.x += ddx / dist * sp; p.y += ddy / dist * sp; p.moving = true; }
      p.sit = !p.moving && (p.state !== 'idle' || (p.act && !p.goal && ['nap', 'game', 'canteen'].includes(p.act.type)));
    }
    if (!ISO.convo && now > ISO.nextConvo) startConvo(now);
    stepConvo(now); matchTick(now);
    if (now > (ISO.statusAt || 0)) { ISO.statusAt = now + 700; paintStatus(); }
    scene(now); ISO.raf = requestAnimationFrame(isoTick);
  }
  function isoMount() {
    const slot = document.querySelector('#rshBots [data-bot-iso]'); if (!slot) return;
    if (!ISO.wrap) {
      ISO.wrap = document.createElement('div'); ISO.wrap.style.cssText = 'margin-bottom:14px';
      ISO.canvas = document.createElement('canvas'); ISO.canvas.setAttribute('role', 'img'); ISO.canvas.style.cssText = 'width:100%;display:block;border-radius:16px;background:#eef0f2;cursor:pointer';
      ISO.log = document.createElement('div'); ISO.log.className = 'small'; ISO.log.setAttribute('aria-live', 'polite'); ISO.log.style.cssText = 'margin-top:8px;padding:8px 12px;border-radius:12px;background:var(--soft,#f5f5f7);display:grid;gap:2px';
      ISO.musicBar = document.createElement('div'); ISO.musicBar.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px';
      ISO.musicBar.innerHTML = '<button type="button" class="btn ghost smallbtn" data-music-toggle aria-pressed="false">▶ Music off</button><label class="small" style="display:inline-flex;gap:6px;align-items:center">🔊 Volume <input type="range" min="0" max="100" step="1" data-music-vol aria-label="Music volume" style="width:120px"></label><span class="small" data-music-note></span>';
      ISO.musicBar.addEventListener('click', e => { if (e.target.closest('[data-music-toggle]')) { if (MUSIC.on) musicStop(); else musicStart(); } });
      ISO.musicBar.addEventListener('input', e => { if (e.target.matches('[data-music-vol]')) { MUSIC.vol = Number(e.target.value) / 100; if (MUSIC.out) MUSIC.out.gain.value = MUSIC.vol * 0.9; musicSave(); } });
      ISO.status = document.createElement('div'); ISO.status.style.cssText = 'display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));margin-top:8px'; ISO.status.setAttribute('aria-label', 'What each bot is doing now');
      ISO.wrap.appendChild(ISO.musicBar); ISO.wrap.appendChild(ISO.canvas); ISO.wrap.appendChild(ISO.status); ISO.wrap.appendChild(ISO.log); paintLog(); paintMusic();
      ISO.canvas.addEventListener('click', e => { const r = ISO.canvas.getBoundingClientRect(), mx = (e.clientX - r.left) * (ISO.w / r.width), my = (e.clientY - r.top) * (ISO.h / r.height); let best = null, bd = 36;
        for (const p of Object.values(ISO.people)) { if (!p.hit) continue; const d = Math.hypot(p.hit[0] - mx, p.hit[1] - my); if (d < bd) { bd = d; best = p; } }
        if (best) { const t = team()[best.id]; sayLine(best, t[3], 6500); } });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && ISO.canvas && ISO.canvas.isConnected && !ISO.raf) ISO.raf = requestAnimationFrame(isoTick); });
    }
    if (ISO.wrap.parentNode !== slot) slot.appendChild(ISO.wrap);
    const W = Math.max(320, slot.clientWidth || 900), H = Math.round(W * 9 / 16), dpr = Math.min(2, window.devicePixelRatio || 1);
    const roomW = (GW + GH) * TW / 2, roomH = (GW + GH) * TH / 2 + 2.6 * ZH;
    const scale = Math.min(W / roomW, H / (roomH + 46)) * 1.07;
    if (ISO.w0 !== W || ISO.dpr !== dpr) { ISO.canvas.width = Math.round(W * dpr); ISO.canvas.height = Math.round(H * dpr); ISO.dpr = dpr; ISO.w0 = W; }
    ISO.ctx = ISO.canvas.getContext('2d'); ISO.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); ISO.w = W / scale; ISO.h = H / scale; ISO.ox = ISO.w / 2 - (GW - GH) * TW / 4 - 28; ISO.oy = (ISO.h - roomH) / 2 + 2.6 * ZH + 2;
    const t = team(), summary = [];
    TEAM.forEach(([id, name], n) => { const face = t[id][2], state = face === 'asleep' ? 'asleep' : face === 'working' ? 'working' : 'idle';
      let p = ISO.people[id]; if (!p) { const s0 = SPOTS[n % SPOTS.length]; p = ISO.people[id] = { id, x: s0[0], y: s0[1], state, moving: false }; }
      if (p.state !== state) { p.state = state; p.goal = null; p.convo = false; p.act = null; if (state !== 'idle') sayLine(p, state === 'working' ? t[id][3] : 'Switched off for now. Wake me when direct posting ships.'); }
      summary.push(`${name}: ${state}`); });
    ISO.canvas.setAttribute('aria-label', 'Live office: ' + summary.join(', ') + '. Idle bots chat in the break room; the latest lines are shown below. Click a bot to hear its status.');
    if (!ISO.raf) ISO.raf = requestAnimationFrame(isoTick);
  }

  /* ---------- Season Playbook (researched on the web, Nov 26, 2026) ----------
   * The research that every new campaign starts from: the 2026–27 wrestling calendar, sourced rule facts for
   * Did You Know Tuesdays, what is working on social now, competitor gaps, and the comment rules. Ideas can be
   * added as draft campaigns; they still go through files, checks, manager review and Anthony's approval. */
  const PB_SRC = 'Season Playbook · researched Nov 26, 2026 (sources in 24/7 Bots → Playbook)';
  const PLAYBOOK = {
    calendar: [
      ['Dec (mid)', 'Walsh Jesuit Ironman (OH), high school', 'usually mid-December; 2026 date not confirmed', 'https://delbartonathletics.org/news/2025/12/16/varsity-wrestling-delbarton-wrestling-earns-third-at-nationally-loaded-ironman-invitational.aspx'],
      ['Dec (late)', 'Beast of the East (DE), high school', 'late December; 2026 date not confirmed', 'https://bluehens.com/news/2024/12/18/delaware-athletics-daccr-set-to-host-beast-of-the-east-wrestling-tournament'],
      ['Dec 29 – Jan 4', 'Midlands and Southern Scuffle, college', 'holiday college tournaments; 2026–27 dates not yet published', 'https://nusports.com/news/2025/12/28/wrestling-set-for-61st-annual-ken-kraft-midlands-championships'],
      ['Jan 15 – Feb 19', 'ACC Friday Night Duals (ACC Network)', 'ACC Championship Sun Mar 7', 'https://espnpressroom.com/press-release/acc-friday-night-duals-ncaa-championships-anchor-espns-expansive-2026-27-wrestling-slate/'],
      ['Jan 22', 'Iowa girls’ first-ever state duals (tentative)', 'girls’ wrestling growth story', 'https://ighsau.org/news/state-dual-meet-tournament-coming-to-girls-wrestling-in-2027'],
      ['Feb 12–13', 'Texas UIL state, Berry Center', 'state tournament season starts', 'https://www.uiltexas.org/wrestling/state'],
      ['Feb 17–20', 'Iowa IHSAA boys’ state, Casey’s Center', '', 'https://www.iahsaa.org/wp-content/uploads/2026/04/2027-IHSAA-Traditional-State-Wrestling-Tournament-Schedule-Weigh-Ins.pdf'],
      ['Feb 19–20', 'Tennessee TSSAA Division I and girls’ state', '', 'https://tssaa.org/article/division-i-and-girls-individual-wrestling-tournament-to-be-held-in-chattanooga'],
      ['Mar 12–13', 'NCAA Division II Championships, Cedar Rapids', '', 'https://uiupeacocks.com/news/2024/10/2/uiu-athletics-upper-iowa-and-cedar-rapids-tourism-to-host-ncaa-dii-wrestling-championships-in-2027'],
      ['Mar 12–14', 'Ohio OHSAA state, Schottenstein Center', 'secondary source; confirm before posting', 'https://www.yahoo.com/news/ohsaa-announces-future-wrestling-state-223338638.html'],
      ['Mar 18–20', 'NCAA Division I Championships, St. Louis (ESPN)', 'the biggest week of the season', 'https://www.themat.com/news/2024/october/02/st-louis-2027-minneapolis-2028-to-host-ncaa-div-i-wrestling-championships-div-ii-and-iii-sites-also-set']
    ],
    facts: [
      ['A takedown is worth 3 points in high school wrestling (since 2024–25), and near-fall points equal the seconds held: 2, 3 or 4.', 'https://nfhs.org/resources/sports/wrestling-rules-changes-2024-25'],
      ['NFHS approved 18 rule changes for 2026–27: referees count 5 seconds out loud, teams may weigh in as a group, and out-of-bounds calls must say whether stalling was called.', 'https://www.miaa.net/sites/default/files/2026-04/2026-27-wrestling-rules-changes-press-release.pdf'],
      ['For 2026–27, NFHS made properly fitted, sport-appropriate uniforms for female wrestlers a Point of Emphasis.', 'https://www.nfhs.org/resources/sports/wrestling-points-of-emphasis-2026-27'],
      ['Green ankle band = home, red = visitor, matching the referee’s wristbands.', 'https://cdn1.sportngin.com/attachments/document/387f-3091189/Questions_Most_Asked_by_Wrestling_Parents.pdf'],
      ['A one-piece singlet or a two-piece uniform is legal in high school; compression shorts need at least a 4-inch inseam above the knee.', 'https://nfhs.org/stories/alternate-two-piece-uniform-approved-for-high-school-wrestling'],
      ['Each state picks a 12-, 13- or 14-weight-class set; the 14-class boys set runs 106 to 285.', 'https://www.nfhs.org/stories/separate-weight-classes-for-girls-choice-of-weight-classes-established-in-high-school-wrestling'],
      ['High school varsity matches are three 2-minute periods.', 'https://www.ohsaa.org/Sports/News/a-basic-understanding-of-hs-wrestling'],
      ['74,064 girls wrestled in high school in 2024–25 (up 15% in a year), and 40 states now hold girls’ state championships.', 'https://www.themat.com/news/2025/august/18/nfhs-reports-new-records-for-high-school-wrestling-participation-for-both-girls-and-boys-in-2024-25'],
      ['Wrestling entered the ancient Olympics in 708 BCE and was in the first modern Olympics in 1896.', 'https://www.olympedia.org/sports/WRE']
    ],
    working: [
      'Team reveal and “drip” clips: new singlet reveals set off big fan reactions (e.g. Oklahoma State’s reveal).',
      'Coach and athlete clips shot at the mat: original footage from real programs travels far.',
      'Posts people send to friends: Instagram counts “sends per reach” as a top signal. Make things parents and teammates DM each other.',
      'Original footage only: since spring 2026 Instagram stops recommending accounts that repost others’ clips, even with credit. Don’t repost Flo or match broadcasts.'
    ],
    gaps: [
      'Big brands (Cliff Keen, Rudis, Adidas) lead with elite athletes. RSH can own everyday high school and youth teams, and the coaches and parents who order.',
      'Reversible singlets explained simply: home and away in one uniform.',
      'Girls’ fit, tied to the NFHS 2026–27 Point of Emphasis.',
      'Team stores as something families and fans buy from all season.',
      'Design walkthroughs and “pick our colorway” posts.'
    ],
    rules: [
      'Ask a real, open question tied to the post (“Which new rule will show up most in your duals?”). Meta explicitly allows asking for advice or recommendations.',
      'Give a reason to follow (“Every Tuesday we break down a rule”), not a demand.',
      'Never: “comment 🔥 for part 2”, “like = Navy/Gold, share = Black/Red”, “tag 3 wrestlers”, “share if you agree”. Meta demotes it and TikTok keeps it out of For You.',
      'Use the Instagram poll sticker for votes instead of “like to vote”.',
      'Shoot original footage; get the athlete’s, parent’s and school’s OK before showing minors. Never promise stock, price or delivery time.'
    ]
  };
  const IDEAS = [
    { date: '2026-12-01', title: 'DYK: The 3-Point Takedown', platform: 'Instagram', postType: 'Reel', hook: 'YOUR TAKEDOWN IS WORTH MORE THAN YOUR DAD’S WAS.', caption: 'Did you know? Since the 2024–25 season, a takedown in high school wrestling is worth 3 points, not 2. Did the 3-point takedown change how your team wrestles?', video: '0–2s: hook on screen over a clean takedown on your own team’s mat (original footage only). 2–8s: “2 points then, 3 points now” graphic. 8–13s: quick near-fall reminder: 2, 3 or 4 points for 2, 3 or 4 seconds held. 13–16s: question on screen + RSH end card.', source: 'https://nfhs.org/resources/sports/wrestling-rules-changes-2024-25' },
    { date: '2026-12-08', title: 'DYK: What the Green Ankle Band Means', platform: 'Instagram', postType: 'Reel', hook: 'THIS LITTLE BAND TELLS THE REF WHO YOU ARE.', caption: 'Did you know? In high school wrestling, the green ankle band means home and red means visitor, matching the referee’s wristbands. Parents, which rule confused you most in your first season?', video: '0–2s: close-up of a green ankle band going on. 2–7s: ref wristbands green and red. 7–12s: “Green = home · Red = visitor”. 12–15s: question + RSH end card.', source: 'https://cdn1.sportngin.com/attachments/document/387f-3091189/Questions_Most_Asked_by_Wrestling_Parents.pdf' },
    { date: '2026-12-15', title: 'DYK: 3 Rule Changes You’ll Notice This Season', platform: 'Instagram', postType: 'Reel', hook: '18 RULE CHANGES THIS YEAR. HERE ARE 3 YOU’LL NOTICE.', caption: 'Did you know? NFHS approved 18 rule changes for the 2026–27 high school wrestling season. Three you’ll notice: referees now count 5 seconds out loud, teams may weigh in as a group, and out-of-bounds calls must say whether stalling was called. Which new rule will show up most in your duals?', video: '0–2s: hook on screen. 2–6s: 5-second count, out loud. 6–10s: team weigh-in. 10–14s: out-of-bounds + stalling call. 14–17s: question + end card.', source: 'https://www.miaa.net/sites/default/files/2026-04/2026-27-wrestling-rules-changes-press-release.pdf' },
    { date: '2026-12-16', title: 'Weight Class Roll Call', platform: 'TikTok', postType: 'Reel', hook: '106 TO 285. WHICH ONE IS STACKED IN YOUR STATE?', caption: 'High school wrestling has up to 14 weight classes, from 106 to 285, and every state picks its own set. Which weight class is stacked in your state this year?', video: '0–2s: numbers 106 → 285 flash on screen to the beat. 2–10s: one quick shot per weight group (original team footage). 10–14s: question on screen + end card.', source: 'https://www.nfhs.org/stories/separate-weight-classes-for-girls-choice-of-weight-classes-established-in-high-school-wrestling' },
    { date: '2026-12-22', title: 'DYK: Wrestling at the 708 BCE Olympics', platform: 'Instagram', postType: 'Reel', hook: 'WRESTLING IS OLDER THAN YOU THINK.', caption: 'Did you know? Wrestling was added to the ancient Olympic Games in 708 BCE and was part of the first modern Olympics in 1896. What’s the oldest tradition your team still keeps?', video: '0–2s: hook over an ancient-style illustration (made in-house, no copyrighted art). 2–8s: 708 BCE → 1896 timeline. 8–13s: today’s team in their singlets. 13–16s: question + end card.', source: 'https://www.olympedia.org/sports/WRE' },
    { date: '2026-12-30', title: 'New Year, New Team Look', platform: 'TikTok', postType: 'Reel', hook: 'IF YOU COULD DESIGN YOUR TEAM’S SINGLET FROM SCRATCH…', caption: 'New year, new team look. If you could design your team’s singlet from scratch, what would it look like? Colors, logo, reversible or not: tell us.', video: '0–2s: hook on screen. 2–9s: a design mockup building up color by color (RSH design only, no other brands). 9–13s: reversible flip. 13–16s: question + end card.', source: 'Holiday college tournaments (Midlands, Southern Scuffle) keep wrestling in the news this week.' },
    { date: '2027-01-12', title: 'DYK: Girls’ Uniform Fit Is a 2026–27 Focus', platform: 'Instagram', postType: 'Reel', hook: 'NFHS MADE THIS A FOCUS FOR 2026–27. HERE’S WHY.', caption: 'Did you know? For 2026–27, NFHS made properly fitted, sport-appropriate uniforms for female wrestlers a Point of Emphasis, as girls’ wrestling reaches record numbers. Coaches of girls’ programs: what fit problem do you see most?', video: '0–2s: hook on screen. 2–8s: “74,064 girls wrestled in 2024–25” + “40 states hold girls’ state championships”. 8–13s: a well-fitted team singlet (with the athlete’s and parent’s OK). 13–16s: question + end card.', source: 'https://www.nfhs.org/resources/sports/wrestling-points-of-emphasis-2026-27' },
    { date: '2027-01-14', title: 'Team Store Spotlight', platform: 'Facebook', postType: 'Reel', hook: 'EVERYTHING YOUR TEAM WEARS, IN ONE PLACE.', caption: 'Team stores let players, parents and fans order team gear online in one place. What should every team store carry: hoodie, beanie or warm-ups?', video: '0–2s: hook on screen. 2–9s: a parent opening a team hoodie (their own words). 9–13s: the store page on a phone. 13–16s: question + end card. No prices or delivery times.', source: 'Parents and coaches are the buyers; team stores are an RSH strength (rshsports.com “Start a team store”).' },
    { date: '2027-02-03', title: 'Pick Our Colorway: Black/Red or Red/Royal', platform: 'Instagram', postType: 'Reel', hook: 'ONE RIVAL. TWO COLORWAYS. YOUR CALL.', caption: 'Black/Red or Red/Royal Blue: which one would you wrestle a rival in, and why?', video: '0–2s: both reversible singlets side by side. 2–9s: each one flipping. 9–13s: question on screen. Add an Instagram poll sticker on the Story version, never “like to vote”.', source: 'Rivalry week in college wrestling; poll stickers keep votes clear of Meta’s vote-baiting rule.' },
    { date: '2027-02-10', title: 'State Tournament Season: Who’s Your Pick?', platform: 'Instagram', postType: 'Reel', hook: 'STATE TOURNAMENT SEASON IS HERE.', caption: 'State tournament season is here, from Texas (Feb 12–13) to Iowa (Feb 17–20) and Tennessee (Feb 19–20). Who’s your pick in your state’s toughest bracket?', video: '0–2s: map pins dropping on Texas, Iowa and Tennessee. 2–10s: dates on screen. 10–14s: question + end card. Mention events factually; no implied sponsorship.', source: 'https://www.uiltexas.org/wrestling/state' }
  ];
  const pbAdded = t => (app().data().posts || []).some(q => String(q.title || '').trim() === t);
  function addIdea(n) {
    const idea = IDEAS[n]; if (!idea || pbAdded(idea.title)) return false;
    const d = app().data(); d.posts = d.posts || [];
    d.posts.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9), title: idea.title, date: idea.date, sport: 'Wrestling', platform: idea.platform, postType: idea.postType, audience: 'Athletes, coaches and parents', goal: 'Grow followers and comments', owner: 'Project Manager', hook: idea.hook, video: idea.video, caption: idea.caption, angle: 'season-playbook', status: 'Draft', source: PB_SRC + (idea.source ? ' · ' + idea.source : ''), created: new Date().toISOString() });
    app().save(); return true;
  }
  function seasonContext() { return 'SEASON CONTEXT (researched Nov 26, 2026): US high school and college wrestling season. State tournaments mid-February to mid-March; NCAA Division I Championships Mar 18–20, 2027 in St. Louis. Girls’ wrestling at record participation; NFHS 2026–27 focus on properly fitted uniforms for girls. Every Tuesday is a Did You Know post.'; }
  function rulebookHtml() {
    const days = [1, 2, 3, 4, 5, 6, 0], dn = d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d], cell = (ch, d) => ch === 'pinterest' ? (((RB_SLOTS.pinterest || {})[d] || []).length ? `Pins ${clockTxt(RB_SLOTS.pinterest[d][0][0])} batch (8, every 15 min)` : '—') : ((RB_SLOTS[ch] || {})[d] || []).map(([t, f]) => `${f === 'dyk' ? 'DYK ' : ''}${f === 'story' ? 'Story only' : f === 'test' ? 'test ' : ''}${f === 'story' ? '' : (f === 'reel' || f === 'dyk' ? 'Reel ' : f === 'image' ? 'image ' : f === 'carousel' ? 'carousel ' : f === 'pin' ? 'Pins ' : '') + clockTxt(t)}`.replace(/^DYK Reel/, ch === 'youtube' ? 'DYK Short' : 'DYK Reel')).join(', ') || '—';
    const routes = ['DYK video → Instagram Reel 7 AM + YouTube Short 4 PM, every Tuesday, no other platform', 'Product reveal, uniform design, team-store or ordering news → Facebook Reel 10 AM (Pinterest gets the still the same weekend)', 'Spoken quote or motivational line with a text overlay → Instagram Reel 7 or 9 AM', 'A choice or comparison (“which side is your match-day look?”) → TikTok 10 AM', 'News, rule changes, explainers, anything searched → YouTube Short 4 PM', 'A question more than a picture (“what is your pre-match ritual?”) → Threads 9 AM as text, clip as proof', 'None of the above → Facebook Reel'];
    return `<div class="card" style="margin-top:16px"><div class="eyebrow">POSTING RULEBOOK · IN FORCE DEC 1, 2026 – DEC 31, 2027</div><h2 style="margin-top:6px">One idea, a separate post for every platform, at that platform’s US Eastern slot</h2>
      <p class="small" style="margin-top:6px">The bots follow this for every campaign dated from December 1, 2026: Tempo uses these slots, Quill writes each platform’s caption in its own format with one CTA, Ref holds a post that has no file of its own or is off-slot, and Sage writes a version for each platform. Posts dated before December 1 keep the earlier rules.</p>
      <div style="overflow-x:auto;margin-top:10px"><table class="tbl" style="font-size:12px;min-width:720px"><thead><tr><th>Day (ET)</th>${RB_ORDER.map(c => `<th>${esc(NAME[c])}</th>`).join('')}</tr></thead><tbody>${days.map(d => `<tr><td><strong>${dn(d)}</strong></td>${RB_ORDER.map(c => `<td>${esc(cell(c, d))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="small" style="margin-top:6px">Weekly volume: ${RB_ORDER.map(c => `${NAME[c]} ${RB_VOLUME[c]}`).join(' · ')}. Manila is 13 hours ahead of Eastern until US daylight time starts (March 14, 2027), then 12. Re-check Metricool’s best times on the first Monday of each month.</p>
      <div class="grid cols2" style="margin-top:10px;gap:12px"><div><h3 style="font-size:15px">Which platform is home</h3><ol class="small" style="margin-top:6px;display:grid;gap:4px">${routes.map(r => `<li>${esc(r)}</li>`).join('')}</ol></div>
      <div><h3 style="font-size:15px">Golden rules</h3><ul class="small" style="margin-top:6px;display:grid;gap:4px">${['The same video file never goes to two platforms (the Tuesday DYK is the one exception). At most three platforms besides the home touch the same idea in a week.', 'Weekdays for Facebook, Instagram, TikTok, YouTube, Threads and Bluesky; weekends are for Pinterest (Instagram Stories only; Bluesky Saturday 5 PM is a test).', 'One CTA, placed by platform: Facebook and Instagram link in the first comment, TikTok and YouTube the bio or channel link, Threads and Bluesky plain words, Pinterest the pin link.', 'Tagline follows the sport: wrestling Wrestle, soccer and basketball Play, hockey Skate, running Run, boxing and MMA Fight.', 'Reply to every comment within 60 minutes; nothing goes live when nobody can answer.', 'YouTube Shorts are never made for kids (category Sports). Declare AI-generated media on Instagram, TikTok and YouTube.', 'One network per Metricool post, RSH Sports brand only, never the anthonyflatt.com brand.'].map(r => `<li>${esc(r)}</li>`).join('')}</ul></div></div></div>`;
  }
  function playbookHtml() {
    const link = u => /^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">source ↗</a>` : `<span class="small">${esc(u)}</span>`;
    const dfmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2 style="font-size:18px">Season Playbook: 2026–27 wrestling</h2><p class="small" style="margin-top:6px;max-width:680px">Every new campaign starts here. Researched on the web on Nov 26, 2026: the season calendar, sourced facts for Did You Know Tuesdays, what is working on social now, competitor gaps, and the comment rules. Dates marked “not confirmed” must be checked before posting.</p></div></div>
      <h3 style="margin-top:16px;font-size:15px">💡 Campaign ideas, ready to add</h3>
      <p class="small" style="margin-top:4px">Each one has a hook, a real question that earns comments, a shot outline and its source. “Add as draft” puts it on the Checklist; it then needs files, the five visual checks, manager review and Anthony’s approval like every campaign.</p>
      <div style="display:grid;gap:10px;margin-top:10px">${IDEAS.map((i, n) => `<div class="acc" style="display:grid;gap:6px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><strong>${esc(i.title)}</strong><span class="small">${esc(dfmt(i.date))} · ${esc(i.platform)} ${esc(i.postType)}${/^DYK/.test(i.title) ? ' · Did You Know Tuesday' : ''}</span></div>
        <div class="small"><strong>Hook:</strong> ${esc(i.hook)}</div><div>${esc(i.caption)}</div><div class="small"><strong>Shots:</strong> ${esc(i.video)}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${pbAdded(i.title) ? '<span class="chk ok">✓ Added to campaigns</span>' : `<button type="button" class="btn smallbtn" data-pb-add="${n}">Add as draft campaign</button>`}${link(i.source)}</div></div>`).join('')}</div>
      <h3 style="margin-top:18px;font-size:15px">📅 Season calendar</h3>
      <div style="overflow:auto"><table class="small" style="border-collapse:collapse;width:100%;margin-top:6px">${PLAYBOOK.calendar.map(([d, e, note, u]) => `<tr style="border-top:1px solid #eee"><td style="padding:6px;white-space:nowrap"><strong>${esc(d)}</strong></td><td style="padding:6px">${esc(e)}${note ? `<div class="small">${esc(note)}</div>` : ''}</td><td style="padding:6px">${link(u)}</td></tr>`).join('')}</table></div>
      <h3 style="margin-top:18px;font-size:15px">✅ Facts for Did You Know Tuesdays (official sources)</h3>
      <ul class="small" style="margin-top:6px;display:grid;gap:4px">${PLAYBOOK.facts.map(([f, u]) => `<li>${esc(f)} ${link(u)}</li>`).join('')}</ul>
      <div style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:16px">
        <div><h3 style="font-size:15px">🔥 What’s working now</h3><ul class="small" style="margin-top:6px;display:grid;gap:4px">${PLAYBOOK.working.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
        <div><h3 style="font-size:15px">🎯 Gaps RSH can own</h3><ul class="small" style="margin-top:6px;display:grid;gap:4px">${PLAYBOOK.gaps.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
        <div><h3 style="font-size:15px">💬 Getting comments the right way</h3><ul class="small" style="margin-top:6px;display:grid;gap:4px">${PLAYBOOK.rules.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
      </div></div>`;
  }

  /* ---------- Connections: getting ready to post without Metricool ----------
   * For each RSH account: the official API it needs, what the platform requires, a status the team keeps up to date,
   * and which route posts take ("Publish via": Metricool today, Direct once connected, or another scheduler).
   * Keys and tokens are never stored in this page: a direct connection runs through a secure connector on a server. */
  const API = {
    instagram: ['Instagram Graph API · Content Publishing', 'Instagram professional (Business or Creator) account linked to the RSH Facebook Page · Meta developer app with instagram_basic and instagram_content_publish · Meta App Review · a daily publishing limit per account', 'https://developers.facebook.com/docs/instagram-platform/content-publishing'],
    facebook: ['Facebook Pages API (posts and Reels)', 'Admin of the RSH Facebook Page · Meta developer app with pages_manage_posts and pages_read_engagement · Meta App Review and Business Verification', 'https://developers.facebook.com/docs/pages-api'],
    threads: ['Threads API', 'Threads profile linked to @team.rshsports · Meta developer app with threads_basic and threads_content_publish · Meta App Review', 'https://developers.facebook.com/docs/threads'],
    tiktok: ['TikTok Content Posting API (Direct Post)', 'TikTok for Developers app with the Content Posting API · the app must pass TikTok’s audit before posts can be public (unaudited apps post privately) · the RSH TikTok account authorizes it', 'https://developers.tiktok.com/doc/content-posting-api-get-started'],
    youtube: ['YouTube Data API v3 (videos.insert)', 'Google Cloud project with the YouTube Data API · OAuth consent screen · the API audit, without which uploads stay private · the RSH channel authorizes it', 'https://developers.google.com/youtube/v3/guides/uploading_a_video'],
    pinterest: ['Pinterest API v5 (create Pins)', 'Pinterest business account · developer app approved for Standard access · the RSH account authorizes it', 'https://developers.pinterest.com/docs/api/v5/'],
    bluesky: ['Bluesky AT Protocol', 'An app password created in Bluesky settings · no review needed, the simplest one to connect first', 'https://docs.bsky.app/docs/get-started']
  };
  const CONN_STEPS = ['Developer app created', 'Permissions requested', 'Platform review or audit passed', 'Account authorized', 'Test post published'];
  let conns = {};
  async function loadConns() { if (!db) return; try { const d = await db.doc('bots/connections').get(); conns = d.exists ? (JSON.parse(d.data().json || '{}') || {}) : {}; } catch (_) {} }
  async function saveConns() { if (!db) return; try { await db.doc('bots/connections').set({ json: JSON.stringify(conns), updatedAt: new Date().toISOString() }); } catch (_) { note = 'Connections could not be saved. Only the owner and editors can change them.'; } }
  const viaOf = ch => (conns[ch] && conns[ch].via) || 'metricool';
  const connDone = ch => ((conns[ch] && conns[ch].steps) || []).length;
  function connectionsHtml(items) {
    return `<div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2 style="font-size:18px">Connections: posting without Metricool</h2><p class="small" style="margin-top:6px;max-width:720px">Every RSH account in one place, ready for the move off Metricool. Today posts go through Metricool. For each account, follow the steps to get the platform’s own posting access; when all five are done, switch <strong>Publish via</strong> to <strong>Direct</strong>. You can also point an account at another scheduler (Buffer, Hootsuite, Later…). Keys and passwords are never stored in this page: a direct connection runs through a secure connector on a server.</p></div>
      <span class="st">${ACCOUNTS.filter(([ch]) => connDone(ch) >= CONN_STEPS.length).length} of ${ACCOUNTS.length} ready for direct posting</span></div>
      <div class="accs" style="margin-top:12px">${ACCOUNTS.map(([ch, handle, url]) => { const posts = items.filter(i => i.channel === ch), rdy = posts.filter(i => i.ready && !i.posted).length, sent = posts.filter(i => i.sent && /scheduled|draft/.test(i.sent.status)).length, a = API[ch] || ['', '', ''], done = connDone(ch), via = viaOf(ch), steps = (conns[ch] && conns[ch].steps) || [];
        return `<div class="acc" data-bot-acc="${ch}" style="display:grid;gap:8px"><div class="top">${chBadge(ch)}<div><strong>${esc(NAME[ch])}</strong><div class="small">${esc(handle)}</div></div></div>
          <div class="small">${posts.length ? `${posts.length} planned · ${rdy} ready · ${sent} in Metricool` : 'Not used in the current plan.'}</div>
          <label class="small" style="display:grid;gap:3px"><strong>Publish via</strong><select data-conn-via="${ch}"><option value="metricool" ${via === 'metricool' ? 'selected' : ''}>Metricool (today)</option><option value="direct" ${via === 'direct' ? 'selected' : ''} ${done < CONN_STEPS.length ? 'disabled' : ''}>Direct from this app${done < CONN_STEPS.length ? ' (finish the steps first)' : ''}</option><option value="other" ${via === 'other' ? 'selected' : ''}>Another scheduler</option></select></label>
          ${via === 'other' ? `<input type="text" data-conn-other="${ch}" value="${esc((conns[ch] && conns[ch].other) || '')}" placeholder="Which one? e.g. Buffer" aria-label="Other scheduler for ${esc(NAME[ch])}">` : ''}
          <details><summary class="small"><strong>Direct posting: ${done} of ${CONN_STEPS.length} steps</strong> · ${esc(a[0])}</summary>
            <div class="small" style="margin-top:6px">${esc(a[1])}</div>
            <div style="display:grid;gap:4px;margin-top:6px">${CONN_STEPS.map((st, n) => `<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-conn-step="${ch}|${n}" ${steps.includes(n) ? 'checked' : ''}> ${esc(st)}</label>`).join('')}</div>
            <textarea data-conn-note="${ch}" rows="2" style="width:100%;margin-top:6px;box-sizing:border-box" placeholder="Notes: who applied, app ID (no secrets), review dates…" aria-label="Notes for ${esc(NAME[ch])}">${esc((conns[ch] && conns[ch].note) || '')}</textarea>
            <a class="small" href="${esc(a[2])}" target="_blank" rel="noopener noreferrer">${esc(NAME[ch])} developer docs ↗</a></details>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn ghost smallbtn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open ${esc(NAME[ch])} ↗</a></div></div>`; }).join('')}</div>
      <p class="small" style="margin-top:12px">Suggested order: Bluesky (no review), then YouTube and Pinterest, then Meta (Instagram, Facebook, Threads together, one App Review), then TikTok (audit). Until an account is switched, Tempo keeps scheduling it through Metricool exactly as now.</p></div>`;
  }

  /* ---------- rendering ---------- */
  function render() { renderMain(); isoMount(); }
  function renderMain() {
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
        list += `<details class="camp" data-bot-camp="${esc(p.id)}" ${openCamps.has(p.id) ? 'open' : ''}><summary><span><strong>${esc(p.title)}</strong><span class="small"> · ${esc(p.platform || '')} · ${c.mine.length} channel post${c.mine.length === 1 ? '' : 's'}</span></span><span class="sumr">${badge}<span class="small">${c.ok} of ${c.mine.length} ready</span><span class="nav-caret">⌄</span></span></summary>` + `<div style="margin:8px 0"><button type="button" class="btn smallbtn" data-bot-review="${esc(p.id)}" style="background:#047857">✓ Review</button> <button type="button" class="btn ghost smallbtn" data-bot-raw="${esc(p.id)}">📁 Assets & comments (${rawCount(p.id)} · 💬 ${cmtCount(p.id)})</button></div>` + packHtml(p) + productHtml(p) + mediaHtml(p) + nextStep(p, c) + `<div class="assetrow"><div><strong>Files needed</strong> <span class="small">· ${an.files} attached</span><div>${an.needs.map(n => `<span class="need ${n.state}">${n.state === 'have' ? '✓ ' : ''}${esc(n.label)}${n.detail ? ' (' + esc(n.detail) + ')' : ''}</span>`).join('')}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap">${packFor(p.id) ? '<span class="small" style="align-self:center">Prompts: use the copy buttons in Sage’s production pack above.</span>' : `<button type="button" class="btn ghost smallbtn" data-bot-brief="${esc(p.id)}">Copy full brief for AI</button><button type="button" class="btn ghost smallbtn" data-bot-prompt="image" data-bot-post="${esc(p.id)}">Copy image prompt</button><button type="button" class="btn ghost smallbtn" data-bot-prompt="video" data-bot-post="${esc(p.id)}">Copy video brief</button>`}${jobs[p.id] ? '' : `<button type="button" class="btn smallbtn" data-bot-askvideo="${esc(p.id)}">Have Reel make a video</button>`}<button type="button" class="btn ghost smallbtn" data-bot-editor="${esc(p.id)}">Copy edit job</button></div>${(() => { const j = jobs[p.id]; return j ? `<div class="small" style="flex-basis:100%"><strong>${j.source === 'product-image' ? 'Post image from the store photo' : j.source === 'product-video' ? 'Video from the store photos' : 'Video editor'}${j.source === 'zip' ? ` (from “${esc(j.zipName)}”, ${j.files} files)` : ''}:</strong> ${j.status === 'queued' ? 'job waiting to be sent to RSH SPORTS.' : j.status === 'sent' ? 'job sent to RSH SPORTS ' + esc(new Date(j.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '. The video is attached here when it comes back.' : j.status === 'attached' ? `${j.source === 'product-image' ? 'brand-safe post image' : 'edited video'}${j.revision > 1 ? ' (revision ' + j.revision + ')' : ''} came back and is attached. <button type="button" class="btn smallbtn" data-bot-watch="${esc(p.id)}" style="padding:3px 10px;margin-left:4px">Watch and review</button>` : j.status === 'failed' ? 'the edit did not finish. ' + esc(j.reason || '') : 'video received, attaching…'}</div>` : needsVideo(p) && settings.autoEdit ? '<div class="small" style="flex-basis:100%"><strong>Video editor:</strong> this campaign needs a video; Reel sends the job on the next run.</div>' : ''; })()}${kitSport(p) ? `<div class="small" style="flex-basis:100%">Kit clip: open your RSH Kit Animator artifact, choose <strong>${esc(kitSport(p).replace(/^./, c => c.toUpperCase()))}</strong>, set the team and colours, record the 4-second clip, then drop the saved MP4 on the Office tab with this campaign selected.</div>` : ''}</div>`;
        for (const it of c.mine) {
          const key = it.postId + '|' + it.channel, open = openItem === key;
          list += `<div class="item" data-bot-item="${esc(key)}"><div style="display:flex;gap:8px;align-items:flex-start">${chBadge(it.channel)}<div><strong>${esc(NAME[it.channel])}</strong><div class="small">${it.caption.length} characters</div>${it.posted ? `<div class="posted">✓ Posted ${esc(new Date(it.posted.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>` : ''}</div></div>
          <div><input type="time" value="${esc(it.time)}" aria-label="Time for ${esc(NAME[it.channel])} post of ${esc(p.title)}" data-bot-time="${esc(key)}">${it.why ? `<div class="small" style="margin-top:3px;max-width:190px">${esc(it.why)}</div>` : settings.labels && settings.labels[it.time] ? `<div class="small" style="margin-top:3px">${esc(settings.labels[it.time])}</div>` : ''}</div>
          <div>${open ? `<textarea rows="7" data-bot-cap="${esc(key)}" aria-label="Caption for ${esc(NAME[it.channel])}">${esc(it.caption)}</textarea>` : `<div class="cap short">${esc(it.caption)}</div>`}<div>${it.checks.map(c => `<span class="chk ${c[0]}">${c[0] === 'ok' ? '✓ ' : ''}${esc(c[1])}</span>`).join('')}</div>${seoHtml(it)}</div>
          <div style="display:flex;flex-direction:column;gap:6px">${open ? `<button type="button" class="btn smallbtn" data-bot-savecap="${esc(key)}">Save</button><button type="button" class="btn ghost smallbtn" data-bot-close>Cancel</button>` : `<button type="button" class="btn ghost smallbtn" data-bot-edit="${esc(key)}">Edit</button><button type="button" class="btn ghost smallbtn" data-bot-copy="${esc(key)}">Copy</button>${it.ready ? `<button type="button" class="btn ghost smallbtn" data-bot-save="${esc(key)}">Save file</button>${ACC[it.channel] ? `<a class="btn ghost smallbtn" href="${esc(ACC[it.channel][2])}" target="_blank" rel="noopener noreferrer">Open ${esc(NAME[it.channel])} ↗</a>` : ''}${it.posted ? `<button type="button" class="btn ghost smallbtn" data-bot-unpost="${esc(key)}">Undo posted</button>` : `<button type="button" class="btn smallbtn" data-bot-posted="${esc(key)}">Mark as posted</button>`}` : ''}`}</div></div>`;
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
        <div class="tabs" role="tablist">${tabBtn('office', 'Office')}${tabBtn('plan', `Plan${ran && items.length ? ` <span class="tcount">${ready} of ${items.length} ready</span>` : ''}`)}${tabBtn('playbook', 'Playbook')}${tabBtn('channels', 'Channels')}${tabBtn('setup', 'Setup')}</div>
        ${note ? `<div class="hint" role="status" style="margin-top:12px">${esc(note)}</div>` : ''}
        ${aoHtml()}
      </div>
      <div data-bot-panel="office" ${tab === 'office' ? '' : 'hidden'}>
        <div class="card" style="margin-top:16px">
        <div data-bot-iso></div>
        ${office()}
        ${reportsHtml()}
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
      <div data-bot-panel="channels" ${tab === 'channels' ? '' : 'hidden'}>${tab === 'channels' ? connectionsHtml(items) : ''}</div>
      <div data-bot-panel="playbook" ${tab === 'playbook' ? '' : 'hidden'}>${tab === 'playbook' ? rulebookHtml() + playbookHtml() : ''}</div>
      <div data-bot-panel="setup" ${tab === 'setup' ? '' : 'hidden'}>
        <div class="card" style="margin-top:16px">
        <h2 style="font-size:18px">Setup</h2><p class="small" style="margin-top:6px">Changes apply the next time the bots run.</p>
        <div class="setup">
          <div><label class="h">Also post each campaign to</label><div class="chs">${CHANNELS.map(c => `<label><input type="checkbox" data-bot-ch="${c[0]}" ${settings.channels.includes(c[0]) ? 'checked' : ''}> ${esc(c[1])}</label>`).join('')}</div><div class="small" style="margin-top:4px">A campaign always goes to its own channel as well.</div></div>
          <div><label class="h" for="rshBotTimes">Posting times, US Eastern</label><input type="text" id="rshBotTimes" value="${esc(settings.times.map(t => t + (settings.labels && settings.labels[t] ? ' ' + settings.labels[t] : '')).join(', '))}" size="38" placeholder="12:00 lunch break, 18:00 after practice"><div class="small" style="margin-top:4px">24-hour time, then an optional name. Separate slots with commas.</div></div>
          <div><label class="h" for="rshBotPin">Pinterest board</label><input type="text" id="rshBotPin" value="${esc(settings.pinBoard || '')}" size="24" placeholder="Board number or exact board name"><div class="small" style="margin-top:4px">Metricool needs a board for every Pin. This is the board your team’s Pins in Metricool already use; type another board’s exact name to change it.</div></div>
          <div><label class="h" for="rshBotDyk">“Did You Know” video day</label><select id="rshBotDyk"><option value="" ${settings.dykDay == null || settings.dykDay === '' ? 'selected' : ''}>No weekly DYK day</option>${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => `<option value="${i}" ${String(settings.dykDay) === String(i) ? 'selected' : ''}>${d}</option>`).join('')}</select><div class="small" style="margin-top:4px">From December 1, 2026 (Posting Rulebook): the DYK goes to Instagram 7 AM and YouTube 4 PM every Tuesday, and to no other platform. Before then: every channel except Pinterest on this day.</div></div>
          <div><label class="h" for="rshBotDays">Look ahead</label><select id="rshBotDays">${[7, 14, 21, 30].map(n => `<option value="${n}" ${settings.days === n ? 'selected' : ''}>${n} days</option>`).join('')}</select></div>
        </div>
        <div style="margin-top:16px"><label style="display:inline-flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" id="rshBotAlways" ${aoOn() ? 'checked' : ''} style="margin-top:2px"><span><strong>Run all bots 24/7 on this computer</strong><br><span class="small">Switch this on only on the computer that stays on, with this app left open in its own window. Every 30 minutes, day and night, the whole team runs: Pixel, Reel's queue, Quill, Tempo, Ref and Courier, plus fresh Metricool numbers. Only approved posts are ever scheduled. One computer runs at a time; the others stand by.</span></span></label></div>
        <div style="margin-top:16px"><label style="display:inline-flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" id="rshBotDaily" ${settings.dailyAuto ? 'checked' : ''} style="margin-top:2px"><span><strong>Night Owl runs the whole team once a day</strong><br><span class="small">Every morning from the cloud, and on the first visit of the day by someone who can edit: refresh Metricool numbers, write SEO, time and check every post, and schedule the approved ones.</span></span></label></div>
        <div style="margin-top:16px"><label style="display:inline-flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" id="rshBotAutoSend" ${settings.autoSend ? 'checked' : ''} style="margin-top:2px"><span><strong>Tempo schedules ready posts in Metricool by itself</strong><br><span class="small">When you press Run everything, every post with both approvals and all checks passed is scheduled on its day, with its photo or video and Quill’s hashtags. Posts that are not approved are never sent.</span></span></label></div>
        <div style="margin-top:16px"><label style="display:inline-flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" id="rshBotAutoEdit" ${settings.autoEdit ? 'checked' : ''} style="margin-top:2px"><span><strong>Send video jobs to the RSH SPORTS editor automatically</strong><br><span class="small">When a Reel or video campaign has no video, Reel sends the edit job to your RSH SPORTS session and attaches the finished MP4. At most three new jobs per run. This uses your Claude usage in that session.</span></span></label></div>
        </div>
      </div>`;
  }

  /* ---------- Scheduling: ready posts placed on calendar days and sent to Metricool ----------
   * Only posts the Manager Bot marks ready (both approvals, all checks) can be placed or sent.
   * Sending uses the viewer's Metricool connection; if this view cannot reach it, the post waits
   * in collection scheduleJobs for a Claude session to send it. Metricool needs a public link to
   * the photo or video (for example a Google Drive or Dropbox share link) for Instagram, TikTok,
   * YouTube and Pinterest; posts without one can still go as a draft to finish in Metricool.
   */
  const BRAND = '5695688', MC = 'Metricool Social Media Management';
  // Which channels cannot take the post without its photo or video (Metricool checks this even for drafts).
  function needsFile(it) {
    if (['instagram', 'tiktok', 'youtube', 'pinterest'].includes(it.channel)) return true;
    if (it.channel !== 'facebook') return false;
    const p = (app().data().posts || []).find(x => x.id === it.postId) || {};
    return [p.creativeAsset].concat(p.creativeAssets || []).filter(Boolean).some(a => /^video\//.test(a.mime || ''));   // a Facebook Reel
  }
  const readyItems = () => ((plan && plan.items) || []).filter(i => i.ready && !i.posted);
  const placedOn = date => ((plan && plan.items) || []).filter(i => i.placed && i.date === date);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  async function place(key, date, time) {
    const it = find(key); if (!it || !it.ready || !/^\d{4}-\d\d-\d\d$/.test(date) || date < todayIso()) return false;
    it.date = date; if (/^\d\d:\d\d$/.test(time || '')) it.time = time; it.placed = true; it.edited = true; delete it.sent;
    await save(); render(); notify(); return true;
  }
  async function unplace(key) { const it = find(key); if (!it || (it.sent && it.sent.status === 'scheduled')) return false; it.placed = false; delete it.sent; await save(); render(); notify(); return true; }
  async function setMediaUrl(key, url) { const it = find(key); if (!it) return; it.mediaUrl = /^https:\/\//.test(url || '') ? String(url).trim().slice(0, 600) : ''; await save(); notify(); }
  function nyOffset(date, time) {
    try { const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(new Date(`${date}T${time}:00Z`)).find(x => x.type === 'timeZoneName').value; const m = part.match(/GMT([+-]\d+)(?::(\d+))?/); const h = m ? Number(m[1]) : -5; return (h < 0 ? '-' : '+') + String(Math.abs(h)).padStart(2, '0') + ':' + ((m && m[2]) || '00'); } catch (_) { return '-05:00'; }
  }
  // The text that goes to Metricool: the caption plus Quill's hashtags for that channel when the caption has none of its own,
  // kept within the channel's length limit.
  // The follow / comment / share line every post ends with. Written to stay within Meta's and TikTok's rules (researched
  // Nov 26, 2026): Meta demotes posts that ask for likes, comments or shares only to boost reach ("comment YES", "share if…",
  // "like if…"), and TikTok keeps engagement bait out of For You. Asking a real question and giving a reason to follow is
  // allowed, so the line invites people to follow, answer the post's own question and send it to a teammate.
  // "Like and subscribe" stays on YouTube only, where it is standard.
  function ctaFor(it) {
    const p = (app().data().posts || []).find(x => x.id === it.postId) || {}, sport = String(p.sport || 'wrestling').toLowerCase().replace(/[^a-z ]/g, '').trim() || 'wrestling';
    const topic = `${sport} stories, tips and team ideas`;
    const ask = /\?/.test(String(it.caption || '')) ? 'Drop your answer in the comments' : 'Tell us what you think in the comments';
    return ({ instagram: `Follow @team.rshsports for more ${topic}. ${ask}, and send this to a teammate who needs it.`,
      facebook: `Follow RSH Sports for more ${topic}. ${ask}, and share this with your team.`,
      tiktok: `Follow @rsh_sports for more ${topic}. ${ask}, and share it with your team.`,
      youtube: `Like and subscribe for more ${topic}, and ${ask.charAt(0).toLowerCase() + ask.slice(1)}.`,
      threads: `Follow @team.rshsports for more ${topic}. Reply with your answer.`,
      bluesky: `Follow for more ${sport} tips. Reply with your answer.`,
      pinterest: `Save this pin for later and follow RSH Sports for more ${topic}.` })[it.channel] || '';
  }
  const hasCta = t => /\b(follow|subscribe)\b/i.test(t) && /\b(share|comment|save)\b/i.test(t);
  function withCta(it, text) {
    if (it.rb) return text;   // Posting Rulebook: one CTA per post, already placed by the caption
    const cta = ctaFor(it); if (!cta || hasCta(text)) return text;
    const tagAt = text.search(/(\n\n|^)(#[\p{L}\p{N}_]+\s*)+$/u), body = tagAt > 0 ? text.slice(0, tagAt) : text, tail = tagAt > 0 ? text.slice(tagAt) : '';
    const next = body.replace(/\s+$/, '') + '\n\n' + cta + tail;
    return next.length <= (LIMIT[it.channel] || 2200) ? next : text;
  }
  function sendText(it) { return withCta(it, sendTextBase(it)); }
  function sendTextBase(it) {
    const cap = String(it.caption || '').replace(/\s+$/, ''), so = seoFor(it.postId, it.channel);
    if (!so) return cap;
    if (it.rb) return cap;   // Posting Rulebook captions already carry their hashtags
    const have = (cap.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length, room = Math.max(0, (MAXTAGS[it.channel] == null ? 5 : MAXTAGS[it.channel]) - have);
    let base = cap;
    if (it.channel === 'youtube' && so.ch.descriptionLead && !cap.toLowerCase().includes(so.ch.descriptionLead.toLowerCase().slice(0, 30))) base = so.ch.descriptionLead + '\n\n' + cap;
    if (!room) return base;
    let out = base; const tags = (so.ch.hashtags || []).filter(t => !cap.toLowerCase().includes(t.toLowerCase())).slice(0, room);
    const capRef = base;
    for (const t of tags) { const next = out + (out === capRef ? '\n\n' : ' ') + t; if (next.length > (LIMIT[it.channel] || 2200)) break; out = next; }
    return out;
  }
  function metricoolPost(it, mode, ai) {
    const p = (app().data().posts || []).find(x => x.id === it.postId) || {}, files = [p.creativeAsset].concat(p.creativeAssets || []).filter(Boolean);
    const vid = files.some(a => /^video\//.test(a.mime || '')), title = String(p.title || '').slice(0, 90), ch = it.channel;
    const info = { autoPublish: true, draft: mode === 'draft', providers: [{ network: ch }], text: sendText(it), firstCommentText: '', publicationDate: { dateTime: `${it.date}T${it.time}:00`, timezone: 'America/New_York' }, media: it.mediaUrl ? [it.mediaUrl] : [], mediaAltText: [], descendants: [], shortener: false, smartLinkData: { ids: [] }, hasNotReadNotes: false };
    const so = seoFor(it.postId, ch); if (so && so.altText && info.media.length) info.mediaAltText = [so.altText];
    if (it.rb) {   // Posting Rulebook: website link in the first comment on Facebook and Instagram; alt text on every image and video
      if (ch === 'facebook' || ch === 'instagram') info.firstCommentText = `More from RSH Sports: ${rbLink(p, ch)}`;
      if (info.media.length && !info.mediaAltText.length) info.mediaAltText = [cut(`${p.title || 'RSH Sports post'}${p.sport ? ' · ' + p.sport : ''}`, 200)];
    }
    if (ch === 'instagram') info.instagramData = { type: vid ? 'REEL' : 'POST', showReelOnFeed: true, isAiGenerated: !!ai };
    if (ch === 'facebook') info.facebookData = { type: vid ? 'REEL' : 'POST', title: vid ? title : '' };
    if (ch === 'tiktok') info.tiktokData = { privacyOption: 'PUBLIC_TO_EVERYONE', title: (so && so.ch.title) || title, isAigc: !!ai };
    if (ch === 'youtube') info.youtubeData = { title: it.rb ? rbYouTubeTitle(p) : (so && so.ch.title) || title, tags: (so && so.ch.tags) || [], category: 'SPORTS', type: 'short', privacy: 'public', madeForKids: false, isAiGeneratedContent: !!ai };
    if (ch === 'pinterest') info.pinterestData = { boardId: settings.pinBoard || '', pinTitle: (so && so.ch.title) || title, pinLink: (String(it.caption).match(/https:\/\/\S+/) || [it.rb ? rbLink(p, 'pinterest') : ''])[0], isAiGenerated: !!ai };
    if (ch === 'threads') info.threadsData = {};
    if (ch === 'bluesky') info.blueskyData = {};
    return { blogId: BRAND, date: `${it.date}T${it.time}:00${nyOffset(it.date, it.time)}`, info: JSON.stringify(info) };
  }
  // Make the public link for the post's attached file by itself: upload it to the viewer's Google Drive,
  // share it as "anyone with the link" and keep the link, so nobody has to paste one.
  const GD = 'Google Drive', DRIVE_MAX = 16 * 1024 * 1024;
  function fileFor(it) {
    const p = (app().data().posts || []).find(x => x.id === it.postId) || {};
    if (it.rb) return rbFileFor(it, p);
    const all = [p.creativeAsset].concat(p.creativeAssets || []).filter(Boolean);
    const vid = all.filter(a => /^video\//.test(a.mime || '')), pic = all.filter(a => /^image\//.test(a.mime || ''));
    const pool = (it.channel === 'facebook' || it.channel === 'youtube') ? vid : (vid.length ? vid : pic);
    if (!pool.length) return null;
    const want = specFor(it.channel, vid.length && pool === vid ? 'video' : kindOf(p)), r = want[0] / want[1];
    const fit = pool.filter(a => Math.abs(ratioOf(a) - r) < 0.03);
    return fit.length ? fit[fit.length - 1] : pool[pool.length - 1];   // the exact size for this channel if attached; else the latest one (a revision replaces the older cut)
  }
  // Shrink a video that is over 16 MB in the browser (plays it once, silently, and re-records it as MP4 at a bitrate
  // that lands near 14.5 MB). Needs a browser that records MP4 (Chrome or Edge) and runs from a click.
  const MP4_TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1'];   // H.264 only: what Instagram, Facebook and TikTok accept
  async function shrinkVideo(blob, step, aim) {
    aim = aim || 10;   // MB; recorders overshoot, so aim well under the 16 MB limit
    const type = typeof MediaRecorder !== 'undefined' && MP4_TYPES.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } });
    if (!type) return { ok: false, reason: 'This browser cannot re-save videos as H.264 MP4 (what Instagram and Facebook need). Open the app in a current Chrome or Edge, or export the video under 16 MB.' };
    const url = URL.createObjectURL(blob), v = document.createElement('video'); v.src = url; v.playsInline = true; v.preload = 'auto'; v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px'; document.body.appendChild(v);
    const cleanup = () => { try { v.pause(); v.remove(); URL.revokeObjectURL(url); } catch (_) {} };
    try {
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('The video could not be read.')); setTimeout(() => rej(new Error('The video took too long to open.')), 20000); });
      const dur = v.duration; if (!isFinite(dur) || dur <= 0 || dur > 600) throw new Error('Only videos up to 10 minutes can be shrunk here.');
      const vbits = Math.max(400000, Math.floor(aim * 1048576 * 8 / dur - 128000));
      const vs = v.captureStream ? v.captureStream() : v.mozCaptureStream(); let tracks = vs.getVideoTracks(), ac = null;
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination(); src.connect(dest); await ac.resume(); if (ac.state === 'running') tracks = tracks.concat(dest.stream.getAudioTracks()); } catch (_) {}
      const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: vbits, audioBitsPerSecond: 128000 }), chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise(res => { rec.onstop = res; });
      const tick = setInterval(() => { step && step(`Shrinking the video… ${Math.min(99, Math.round(v.currentTime / dur * 100))}%`); }, 1000);
      rec.start(1000);
      try { await v.play(); } catch (e) { clearInterval(tick); rec.stop(); throw new Error('The browser would not play the video to shrink it. Press Send to Metricool yourself so it runs from your click.'); }
      await new Promise(res => { v.onended = res; });
      rec.stop(); await done; clearInterval(tick); if (ac) try { ac.close(); } catch (_) {}
      const out = new Blob(chunks, { type: 'video/mp4' });
      if (!out.size) throw new Error('Shrinking produced an empty file.');
      if (out.size > DRIVE_MAX) { if (aim > 7) { cleanup(); return shrinkVideo(blob, step, aim * 0.6); } throw new Error(`After shrinking the video is still ${(out.size / 1048576).toFixed(1)} MB. Export it shorter or at a lower quality.`); }
      return { ok: true, blob: out };
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    finally { cleanup(); }
  }
  async function driveUpload(blob, fname, mime, step) {
    const mcp = await use('mcp'); if (!mcp) return { ok: false, reason: 'This view cannot reach Google Drive. Paste a public link to the file in the box above, then send again.' };
    let fileArgs = false; try { const lt = await mcp.listTools(); fileArgs = !!lt.fileArgs && (lt.servers || []).some(x => x.server === GD); } catch (_) {}
    if (!fileArgs) return { ok: false, reason: 'Google Drive is not allowed for this page yet (or this browser cannot send files to it). Allow Google Drive when asked, or paste a public link in the box above.' };
    const type = mime || blob.type || 'video/mp4', ext = (type.split('/')[1] || 'mp4').replace('quicktime', 'mov').replace('jpeg', 'jpg');
    const name = (String(fname || 'rsh-post').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9 _()-]/g, '').trim() || 'rsh-post') + '.' + ext;
    step && step('Uploading to Google Drive…');
    let id = '';
    try {
      const r = await mcp.callTool(GD, 'create_file', { title: 'RSH Sports · ' + name, contentMimeType: type, disableConversionToGoogleType: true, base64Content: { $file: { data: blob, name, type } } });
      const pl = r && r.payload !== undefined ? r.payload : r; id = (pl && (pl.id || (pl.file && pl.file.id))) || ((JSON.stringify(pl).match(/"id"\s*:\s*"([A-Za-z0-9_-]{10,})"/) || [])[1]) || '';
    } catch (e) { return { ok: false, reason: 'Google Drive did not take the file: ' + String((e && e.message) || e).slice(0, 160) }; }
    if (!id) return { ok: false, reason: 'Google Drive did not return the file. Paste a public link in the box above instead.' };
    step && step('Making the share link…');
    let link = '';
    try {
      const r = await mcp.callTool(GD, 'share_file', { fileId: id, role: 'reader', permissionId: 'anyoneWithLink' });
      const pl = r && r.payload !== undefined ? r.payload : r; link = (pl && pl.shareableLink) || ((JSON.stringify(pl).match(/https:\/\/drive\.google\.com[^"\\\s]*/) || [])[0]) || '';
    } catch (e) { return { ok: false, reason: 'The file is in your Google Drive but could not be shared: ' + String((e && e.message) || e).slice(0, 160) }; }
    link = link || `https://drive.google.com/file/d/${id}/view?usp=sharing`;
    return { ok: true, link: link || `https://drive.google.com/file/d/${id}/view?usp=sharing` };
  }
  // A file picked right on the calendar card: straight to Google Drive, and its link goes on every unsent channel of that campaign.
  async function attachForPost(key, file, step) {
    const it = find(key); if (!it || !file) return { ok: false, reason: 'Pick a file first.' };
    if (!/^(video|image)\//.test(file.type || '')) return { ok: false, reason: 'Pick a photo or a video.' };
    let data = file;
    if (file.size > DRIVE_MAX) {
      if (!/^video\//.test(file.type)) return { ok: false, reason: `That file is ${(file.size / 1048576).toFixed(1)} MB; the app can send files up to 16 MB to Google Drive. Pick a smaller copy.` };
      step && step('Shrinking the video…'); const sh = await shrinkVideo(file, step); if (!sh.ok) return { ok: false, reason: `That file is ${(file.size / 1048576).toFixed(1)} MB (the limit is 16 MB) and could not be shrunk here: ${sh.reason}` }; data = sh.blob;
    }
    const up = await driveUpload(data, file.name, data.type || file.type, step); if (!up.ok) return up;
    for (const x of (plan.items || [])) if (x.postId === it.postId && !(x.sent && /scheduled|draft/.test(x.sent.status)) && (x === it || !x.mediaUrl)) { x.mediaUrl = up.link; const f = fileFor(x); if (f) x.mediaFor = f.id; }
    await save(); render(); notify(); return { ok: true };
  }
  async function autoLink(it, step) {
    const a = fileFor(it); if (!a) return { ok: false, reason: `No ${needsFile(it) && (it.channel === 'facebook' || it.channel === 'youtube') ? 'video' : 'photo or video'} is attached to this campaign yet. Attach it in the campaign, then send again.` };
    plan.links = plan.links || {};
    if (plan.links[a.id]) { it.mediaUrl = plan.links[a.id]; return { ok: true }; }
    const sib = ((plan && plan.items) || []).find(x => x.postId === it.postId && x !== it && x.mediaUrl && (!x.mediaFor || x.mediaFor === a.id)); if (sib) { it.mediaUrl = sib.mediaUrl; return { ok: true }; }
    step && step('Getting the file ready…');
    let blob; try { blob = await window.RSH_HOST.fileBlob(a); } catch (_) { return { ok: false, reason: 'The attached file could not be read. Attach it again in the campaign, then send again.' }; }
    if (blob.size > DRIVE_MAX) {
      if (!/^video\//.test(a.mime || blob.type || '')) return { ok: false, reason: `The file is ${(blob.size / 1048576).toFixed(1)} MB; the app can upload files up to 16 MB to Google Drive. Attach a smaller copy, or paste a public link in the box above.` };
      step && step('Shrinking the video…'); const sh = await shrinkVideo(blob, step); if (!sh.ok) return { ok: false, reason: `The video is ${(blob.size / 1048576).toFixed(1)} MB (the limit is 16 MB) and could not be shrunk here: ${sh.reason}` }; blob = sh.blob;
    }
    const up = await driveUpload(blob, a.name, a.mime, step); if (!up.ok) return up; const link = up.link;
    plan.links[a.id] = link; it.mediaUrl = link; it.mediaFor = a.id; await save();
    return { ok: true };
  }

  async function sendToMetricool(key, mode, ai, step) {
    const it = find(key); if (!it || !it.ready || !it.placed) return { ok: false, reason: 'Only a ready post placed on a day can be sent.' };
    if (`${it.date}T${it.time}` <= new Date(Date.now() + 10 * 60000).toISOString().slice(0, 16) && it.date <= todayIso()) return { ok: false, reason: 'That time has passed or is less than 10 minutes away. Pick a later time.' };
    if (!seo[it.postId]) { const q = (app().data().posts || []).find(x => x.id === it.postId); if (q) { step && step('Writing hashtags…'); if (await writeSeo(q) && db) { try { await db.doc('bots/seo').set({ json: JSON.stringify(seo).slice(0, 240000), updatedAt: new Date().toISOString() }); } catch (_) {} } } }
    if (!it.mediaUrl && fileFor(it)) { const l = await autoLink(it, step); if (!l.ok && needsFile(it)) return l; }
    if (it.rb) { const p0 = (app().data().posts || []).find(x => x.id === it.postId) || {}; ai = ai || aiOf(p0, rbFileFor(it, p0)); }   // rulebook rule 9: declare AI media
    const args = metricoolPost(it, mode, ai);
    if (needsFile(it) && !it.mediaUrl) return { ok: false, reason: `${NAME[it.channel]}${it.channel === 'facebook' ? ' (a Reel)' : ''} needs the ${it.channel === 'facebook' || it.channel === 'youtube' ? 'video' : 'photo or video'}, even as a draft. Paste a public link to the file (Google Drive or Dropbox) in the box above, then send again.` };
    const mcp = await use('mcp'); let res = null, err = null;
    if (mcp) { try { res = await mcp.callTool(MC, 'createScheduledPost', args); } catch (e) { err = e; } }
    if (res) {
      const txt = JSON.stringify(res.payload !== undefined ? res.payload : res), url = (txt.match(/https:\/\/[^"\\\s]*metricool[^"\\\s]*/) || [''])[0];
      if (/"isError"\s*:\s*true|error/i.test(txt) && !url) { it.sent = { status: 'error', at: new Date().toISOString(), reason: txt.slice(0, 240) }; await save(); render(); notify(); return { ok: false, reason: 'Metricool did not accept it: ' + txt.slice(0, 200) + (/drive/i.test(txt) ? ' (Metricool can read Google Drive links only after Google Drive is connected inside Metricool: Settings → Connections.)' : '') }; }
      it.sent = { status: mode === 'draft' ? 'draft' : 'scheduled', at: new Date().toISOString(), plannerUrl: url }; await save(); render(); notify(); return { ok: true };
    }
    const code = (err && err.code) || 'no_connection';
    if (err && err.code === 'tool_error') { it.sent = { status: 'error', at: new Date().toISOString(), reason: String(err.message || '').slice(0, 240) }; await save(); render(); notify(); return { ok: false, reason: 'Metricool did not accept it: ' + String(err.message || '').slice(0, 200) }; }
    // This view cannot reach Metricool: leave the post with everything ready for a Claude session to send.
    const id = (it.postId + '_' + it.channel).replace(/[^A-Za-z0-9_-]/g, '');
    if (db) { try { await db.doc('scheduleJobs/' + id).set({ key, postId: it.postId, channel: it.channel, mode, status: 'queued', queuedAt: new Date().toISOString(), args: JSON.stringify(args), lastError: code }); } catch (_) {} }
    it.sent = { status: 'queued', at: new Date().toISOString(), mode }; await save(); render(); notify();
    return { ok: true, queued: true };
  }

  function seoHtml(it) {
    const so = seoFor(it.postId, it.channel); if (!so) return '';
    const key = it.postId + '|' + it.channel, tags = (so.ch.hashtags || []).filter(t => !it.caption.toLowerCase().includes(t.toLowerCase()));
    const rows = [];
    if (so.primary) rows.push(`<div><b>Main keyword:</b> ${esc(so.primary)}</div>`);
    if (so.firstLine && !it.caption.toLowerCase().startsWith(so.firstLine.toLowerCase().slice(0, 25))) rows.push(`<div><b>Keyword-first opening (optional):</b> ${esc(so.firstLine)} <button type="button" class="btn ghost smallbtn" data-bot-firstline="${esc(key)}">Use as first line</button></div>`);
    if (so.ch.descriptionLead) rows.push(`<div><b>Description opening:</b> ${esc(so.ch.descriptionLead)}</div>`);
    if (so.onScreen) rows.push(`<div><b>On screen, first 3 seconds:</b> ${esc(so.onScreen)}</div>`);
    if (so.spoken) rows.push(`<div><b>Say, first 3 seconds:</b> ${esc(so.spoken)}</div>`);
    if (so.ch.title) rows.push(`<div><b>${it.channel === 'youtube' ? 'YouTube title' : it.channel === 'pinterest' ? 'Pin title' : 'Title'}:</b> ${esc(so.ch.title)}</div>`);
    if (so.ch.description) rows.push(`<div><b>Pin description:</b> ${esc(so.ch.description)}</div>`);
    if (so.ch.tags && so.ch.tags.length) rows.push(`<div><b>Tags:</b> ${esc(so.ch.tags.join(', '))}</div>`);
    if (so.ch.hashtags && so.ch.hashtags.length) rows.push(`<div><b>Hashtags:</b> ${esc(so.ch.hashtags.join(' '))} ${tags.length ? `<button type="button" class="btn ghost smallbtn" data-bot-addtags="${esc(key)}">Add hashtags</button>` : '<span class="small">✓ in caption</span>'}</div>`);
    if (so.keywords.length) rows.push(`<div><b>Keywords:</b> ${esc(so.keywords.join(', '))}</div>`);
    if (so.altText) rows.push(`<div><b>Alt text:</b> ${esc(so.altText)}</div>`);
    if (so.notes) rows.push(`<div><b>Senior note:</b> ${esc(so.notes)}</div>`);
    return `<details class="seo" style="margin-top:6px"><summary class="small"><strong>SEO by Quill</strong> · hashtags, titles, tags and alt text go to Metricool with the post</summary><div class="small" style="display:grid;gap:4px;margin-top:6px">${rows.join('')}</div></details>`;
  }
  // Ref's advice for a held-back campaign: the one thing to do next, with a button that opens that step.
  function nextStep(p, c) {
    if (c.state === 'ready') return '';
    if (c.ok === c.mine.length) { const miss = (c.an.needs || []).filter(n => n.state !== 'have' && !/^optional/i.test(n.label)).map(n => n.label); return `<div class="nextstep" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0 4px;padding:8px 10px;border-radius:10px;background:var(--soft,#f5f5f7)"><span><strong>Ref, Manager Bot:</strong> Every post here is ready to place on the Calendar.${miss.length ? ' Pixel would still like ' + esc(miss.join(', ')) + ' for a better fit on some channels (not required).' : ''}</span></div>`; }
    const t = app().track(p), stops = [...new Set(c.mine.flatMap(i => (i.checks || []).filter(x => x[0] === 'stop').map(x => x[1])))];
    const what = t.stage !== 'ready' && t.advice ? String(t.advice) : t.stage === 'brief' ? 'Finish the brief (hook, caption and call to action).'
      : t.stage === 'media' ? (t.assets ? 'Do the five visual checks on the attached file.' : 'Attach the photo or video. Drop it in the Office, or a .zip so Reel has it edited.')
      : t.stage === 'manager' ? 'Manager review is waiting. Open it and approve or send back.'
      : t.stage === 'anthony' || t.stage === 'final' ? 'Waiting for Anthony’s final approval.'
      : stops.filter(x => !/^Waiting|^No media|^Brief|^Visual/.test(x)).join(' · ') || 'Fix the checks below.';
    return `<div class="nextstep" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0 4px;padding:8px 10px;border-radius:10px;background:var(--soft,#f5f5f7)"><span><strong>Ref, Manager Bot:</strong> ${esc(what)}</span><button type="button" class="btn smallbtn" data-bot-opencamp="${esc(p.id)}">Open campaign →</button></div>`;
  }
  function find(key) { return ((plan && plan.items) || []).find(i => i.postId + '|' + i.channel === key); }
  async function onClick(e) {
    const rv = e.target.closest('[data-bot-review]'); if (rv && window.RSH_REVIEW) { window.RSH_REVIEW.open(null, rv.dataset.botReview); return; }
    const pu = e.target.closest('[data-prod-use],[data-prod-video]');
    if (pu) { const [pid, h, k] = (pu.dataset.prodUse || pu.dataset.prodVideo).split('|'); const msg = await productJob(pid, pu.dataset.prodUse ? 'image' : 'video', pu.dataset.prodUse ? [[h, Number(k)]] : null); note = msg; openProds.add(pid); render(); return; }
    const pg = e.target.closest('[data-prod-get],[data-prod-getall]');
    if (pg) { const pid = (pg.dataset.prodGet || pg.dataset.prodGetall).split('|')[0], q = (app().data().posts || []).find(x => x.id === pid), hs = pg.dataset.prodGet ? [pg.dataset.prodGet.split('|')[1]] : productsFor(q).map(c => c.h); openProds.add(pid); await requestPhotos(hs); render(); return; }
    const pp = e.target.closest('[data-prod-pin],[data-prod-unpin]');
    if (pp) { const [pid, h] = (pp.dataset.prodPin || pp.dataset.prodUnpin).split('|'), q = (app().data().posts || []).find(x => x.id === pid); const cur = pins[pid] && pins[pid].length ? pins[pid].slice() : productsFor(q).map(c => c.h); pins[pid] = pp.dataset.prodPin ? [...new Set(cur.concat(h))].slice(0, 6) : cur.filter(x => x !== h); if (!pins[pid].length) delete pins[pid]; if (pp.dataset.prodPin) delete prodQ[pid]; openProds.add(pid); await savePins(); render(); return; }
    const ps = e.target.closest('[data-prod-search]');
    if (ps) { const inp = document.querySelector(`#rshBots [data-prod-q="${CSS.escape(ps.dataset.prodSearch)}"]`); prodQ[ps.dataset.prodSearch] = inp ? inp.value.trim() : ''; openProds.add(ps.dataset.prodSearch); render(); return; }
    const pd = e.target.closest('[data-prod-dl]');
    if (pd) { const [h, k] = pd.dataset.prodDl.split('|'), c = catalog.find(x => x.h === h), r = refs[h]; if (!c || !r || !r.assets) return; const old = pd.textContent; pd.textContent = 'Preparing…';
      try { const dl = await use('downloads'); if (!dl) throw new Error('Saving files is not available here'); for (const [n, a] of (k === 'all' ? r.assets.map((a, n) => [n, a]) : [[Number(k), r.assets[Number(k)]]])) { const blob = await (await fetch('/_blob/' + a.id)).blob(); await dl.save({ filename: a.name || refName(c, n), data: blob }); } pd.textContent = 'Saved ✓'; } catch (err) { pd.textContent = 'Not saved'; note = 'The photo was not saved: ' + ((err && err.message) || 'cancelled') + '.'; }
      setTimeout(() => { pd.textContent = old; }, 2000); return; }
    const md = e.target.closest('[data-bot-dlmedia]');
    if (md) { const [pid, k] = md.dataset.botDlmedia.split('|'), q = (app().data().posts || []).find(x => x.id === pid); if (!q) return; const files = [q.creativeAsset].concat(q.creativeAssets || []).filter((a, i, arr) => a && a.id && arr.findIndex(b => b && b.id === a.id) === i), a = files[Number(k)]; if (!a) return; const old = md.textContent; md.textContent = 'Preparing…';
      try { const dl = await use('downloads'); if (!dl) throw new Error('Saving files is not available here'); const blob = await window.RSH_HOST.fileBlob(a); await dl.save({ filename: a.name || ('rsh-' + slug(q.title) + (/video/.test(a.mime || '') ? '.mp4' : '.jpg')), data: blob }); md.textContent = 'Saved ✓'; } catch (err) { md.textContent = 'Not saved'; note = 'The file was not saved: ' + ((err && err.message) || 'cancelled') + '.'; }
      setTimeout(() => { md.textContent = old; }, 2000); return; }
    const sw = e.target.closest('[data-sage-write]');
    if (sw) { const q = (app().data().posts || []).find(x => x.id === sw.dataset.sageWrite); if (!q || sageBusy) return; if (scripts[q.id] && scripts[q.id].edited && !confirm('The team edited this pack. Replace it with a new one from Sage?')) return; sageNote = ''; sageBusy = q.id; openPacks.add(q.id); render(); const ok = await writeScript(q); sageBusy = ''; note = ok ? '' : sageNote; render(); return; }
    const ss = e.target.closest('[data-sage-save]');
    if (ss) { const ta = document.querySelector(`#rshBots [data-sage-text="${CSS.escape(ss.dataset.sageSave)}"]`); if (!ta) return; try { await saveScript(ss.dataset.sageSave, ta.value); ss.textContent = 'Saved'; setTimeout(() => render(), 900); } catch (_) { ss.textContent = 'Could not save'; } return; }
    const sc = e.target.closest('[data-sage-copy]');
    if (sc) { const ta = document.querySelector(`#rshBots [data-sage-text="${CSS.escape(sc.dataset.sageCopy)}"]`), full = ta ? ta.value : packFor(sc.dataset.sageCopy), n = Number(sc.dataset.part), text = n ? (packPart(full, n) || full) : full, old = sc.textContent; try { await navigator.clipboard.writeText(text); sc.textContent = 'Copied'; } catch (_) { sc.textContent = 'Copy failed'; } setTimeout(() => { sc.textContent = old; }, 1600); return; }
    const sd = e.target.closest('[data-sage-dl]');
    if (sd) { const q = (app().data().posts || []).find(x => x.id === sd.dataset.sageDl), ta = document.querySelector(`#rshBots [data-sage-text="${CSS.escape(sd.dataset.sageDl)}"]`); try { const dl = await use('downloads'); if (!dl) throw new Error('Saving files is not available here'); await dl.save({ filename: `production-pack-${slug(q ? q.title : 'campaign') || 'campaign'}.txt`, data: new Blob([ta ? ta.value : packFor(sd.dataset.sageDl)], { type: 'text/plain' }) }); } catch (err) { note = 'The file was not saved: ' + ((err && err.message) || 'cancelled') + '.'; render(); } return; }
    const at = e.target.closest('[data-bot-addtags]');
    if (at) { const it = find(at.dataset.botAddtags), so = it && seoFor(it.postId, it.channel); if (it && so) { const add = (so.ch.hashtags || []).filter(t => !it.caption.toLowerCase().includes(t.toLowerCase())); if (add.length) { it.caption = it.caption.replace(/\s+$/, '') + (/(#[\p{L}\p{N}_]+)\s*$/u.test(it.caption) ? ' ' : '\n\n') + add.join(' '); it.edited = true; await save(); render(); } } return; }
    if (e.target.closest('[data-bot-weekly]')) { const pre = document.querySelector('#rshBots [data-bot-weeklytext]'), text = weeklyReport(); if (pre) { pre.hidden = false; pre.textContent = text; } const b = e.target.closest('[data-bot-weekly]'); try { navigator.clipboard.writeText(text).then(() => { b.textContent = 'Copied: paste it to Anthony'; setTimeout(() => { b.textContent = 'Weekly report for Anthony'; }, 2500); }, () => {}); } catch (_) {} return; }
    const pba = e.target.closest('[data-pb-add]'); if (pba) { if (addIdea(Number(pba.dataset.pbAdd))) { note = `Added “${IDEAS[Number(pba.dataset.pbAdd)].title}” as a draft campaign. Find it on the Checklist.`; } return render(); }
    const rb = e.target.closest('[data-bot-raw]'); if (rb) { e.preventDefault(); return openRaw(rb.dataset.botRaw); }
    const fln = e.target.closest('[data-bot-firstline]');
    if (fln) { const it = find(fln.dataset.botFirstline), so = it && seoFor(it.postId, it.channel); if (it && so && so.firstLine) { it.caption = so.firstLine + '\n\n' + it.caption; it.edited = true; await save(); render(); } return; }
    const oc = e.target.closest('[data-bot-opencamp]'); if (oc) { e.preventDefault(); if (app().openNext) app().openNext(oc.dataset.botOpencamp); return; }
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
    const mp = e.target.closest('[data-bot-posted]'); if (mp) { const it = find(mp.dataset.botPosted); if (it && it.ready) { it.posted = { at: new Date().toISOString(), how: 'by hand' }; await save(); render(); } return; }
    const up = e.target.closest('[data-bot-unpost]'); if (up) { const it = find(up.dataset.botUnpost); if (it) { delete it.posted; await save(); render(); } return; }
    const sf = e.target.closest('[data-bot-save]');
    if (sf) { const it = find(sf.dataset.botSave), q = it && (app().data().posts || []).find(x => x.id === it.postId); const files = q ? [q.creativeAsset].concat(q.creativeAssets || []).filter(Boolean).filter((a, i, all) => all.findIndex(x => x.id === a.id) === i) : [];
      if (!files.length) { sf.textContent = 'No file'; return; }
      sf.textContent = 'Preparing…';
      try { const dl = await use('downloads'); if (!dl) throw new Error('Saving files is not available here'); for (const a of files) { const blob = await window.RSH_HOST.fileBlob(a); await dl.save({ filename: a.name || ('rsh-' + it.channel + (/video/.test(a.mime || '') ? '.mp4' : '.jpg')), data: blob }); } sf.textContent = 'Saved'; }
      catch (err) { sf.textContent = (err && err.code === 'declined') ? 'Save file' : 'Could not save'; }
      setTimeout(() => { sf.textContent = 'Save file'; }, 2000); return; }
    const cp = e.target.closest('[data-bot-copy]');
    if (cp) { const it = find(cp.dataset.botCopy); if (!it) return; const text = `${NAME[it.channel]} · ${it.date} ${clock(it.time)} US Eastern\n\n${it.caption}`, done = ok => { cp.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { cp.textContent = 'Copy'; }, 1600); }; try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); } }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches('[data-prod-q]')) { prodQ[t.dataset.prodQ] = String(t.value || '').trim(); openProds.add(t.dataset.prodQ); return render(); }
    if (t.matches('[data-conn-via]')) { const ch = t.dataset.connVia; conns[ch] = { ...(conns[ch] || {}), via: t.value }; await saveConns(); return render(); }
    if (t.matches('[data-conn-step]')) { const [ch, n] = t.dataset.connStep.split('|'); const c = conns[ch] = { ...(conns[ch] || {}) }; const st = new Set(c.steps || []); if (t.checked) st.add(Number(n)); else st.delete(Number(n)); c.steps = [...st].sort(); if (c.via === 'direct' && c.steps.length < CONN_STEPS.length) c.via = 'metricool'; await saveConns(); return render(); }
    if (t.matches('[data-conn-note]')) { const ch = t.dataset.connNote; conns[ch] = { ...(conns[ch] || {}), note: String(t.value).slice(0, 600) }; await saveConns(); return; }
    if (t.matches('[data-conn-other]')) { const ch = t.dataset.connOther; conns[ch] = { ...(conns[ch] || {}), other: String(t.value).slice(0, 60) }; await saveConns(); return; }
    if (t.matches('[data-bot-file]')) { const files = [...t.files], camp = document.querySelector('#rshBots [data-bot-dropcamp]'); t.value = ''; return attach(files, camp && camp.value); }
    if (t.matches('[data-bot-dropcamp]')) return;
    if (t.id === 'rshBotAlways') { try { localStorage.setItem(AO_KEY, t.checked ? '1' : '0'); } catch (_) {} if (t.checked) aoStart(); else { if (aoTimer) clearInterval(aoTimer); aoTimer = null; if (aoInfo && aoInfo.id === aoId && db) { try { await db.doc('bots/alwaysOn').set({ ...aoInfo, on: false, at: new Date().toISOString(), status: 'switched off' }); } catch (_) {} } await aoRead(); } return render(); }
    if (t.id === 'rshBotDaily') { settings.dailyAuto = t.checked; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotAutoSend') { settings.autoSend = t.checked; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotAutoEdit') { settings.autoEdit = t.checked; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.dataset.botCh) { settings.channels = [...document.querySelectorAll('#rshBots [data-bot-ch]:checked')].map(x => x.dataset.botCh); note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotTimes') { const labels = {}, ts = []; for (const part of t.value.split(',')) { const m = part.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)\s*(.*)$/); if (!m) continue; const k = m[1].padStart(2, '0') + ':' + m[2]; if (!ts.includes(k)) ts.push(k); if (m[3].trim()) labels[k] = m[3].trim().slice(0, 30); } if (!ts.length) { note = 'Enter at least one time like 18:00.'; return render(); } settings.times = ts; settings.labels = labels; note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotPin') { settings.pinBoard = String(t.value || '').trim().slice(0, 120); if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotDyk') { settings.dykDay = t.value === '' ? '' : Number(t.value); note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.id === 'rshBotDays') { settings.days = Number(t.value) || 14; note = 'Setup changed. Press “Run everything” to apply it.'; if (db) { try { await db.doc('bots/settings').set({ json: JSON.stringify(settings) }); } catch (_) {} } return render(); }
    if (t.dataset.botTime) { const it = find(t.dataset.botTime); if (it && /^\d\d:\d\d$/.test(t.value)) { it.time = t.value; it.edited = true; await save(); render(); } }
  }

  async function start() {
    const view = document.getElementById('view-bots'); if (!view || !app() || !app().track || document.getElementById('rshBots')) return;
    const host = document.createElement('div'); host.id = 'rshBots'; view.appendChild(host);
    host.addEventListener('click', onClick); host.addEventListener('change', onChange);
    host.addEventListener('toggle', e => { const d = e.target; if (d && d.matches && d.matches('details.camp')) { if (d.open) openCamps.add(d.dataset.botCamp); else openCamps.delete(d.dataset.botCamp); } if (d && d.matches && d.matches('details.deskbox')) deskOpen = d.open; if (d && d.matches && d.matches('details.prods')) { if (d.open) openProds.add(d.dataset.prodBox); else openProds.delete(d.dataset.prodBox); } if (d && d.matches && d.matches('details.pack')) { if (d.open) openPacks.add(d.dataset.sagePack); else openPacks.delete(d.dataset.sagePack); } }, true);
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
    Promise.all([rawCounts(), loadAllComments()]).then(() => { render(); if (window.RSH_TRACKER && window.RSH_TRACKER.render) try { window.RSH_TRACKER.render(); } catch (_) {} });
    if (db) {
      try { const s = await db.doc('bots/settings').get(); if (s.exists) settings = { ...DEFAULTS, ...JSON.parse(s.data().json) }; } catch (_) {}
      try { const s = await db.doc('bots/seo').get(); if (s.exists) seo = JSON.parse(s.data().json) || {}; } catch (_) {}
      try { const p = await db.doc('bots/plan').get(); if (p.exists) plan = JSON.parse(p.data().json); } catch (_) {}
      try { const m = await db.doc('bots/morning').get(); if (m.exists) morning = JSON.parse(m.data().json); } catch (_) {}
      await reconcileJobs();
      reviseFromNotes();   // remember the notes already there, so only new ones start a revision
      await collect();
      await aoRead(); await loadConns(); await loadScripts(); await loadCatalog();
      setTimeout(() => { if (aoOn()) aoStart(); else nightOwl(); }, 1500);
      setInterval(() => { aoRead().then(render); }, 5 * 60000);
    }
    render();
  }
  window.RSH_BOTS = { planItems: id => ((plan && plan.items) || []).filter(i => i.postId === id), commentsFor: id => (comments[id] || []).slice(), whoIs: async ids => { await whoIs(ids); return Object.fromEntries(ids.map(i => [i, names[i] || 'Teammate'])); }, mealNow, rbOn, rbHome, rbTargets, rbPlace, rbCaption, rbChecks, rbFileFor, rbYouTubeTitle, manila, TAGLINE, RB_SLOTS, aiOf, SPECS, sizePlan, sizeLines, specFor, kindOf, ratioOf, productJob, readyRefs, POST_SIZE, catalog: () => catalog, refs: () => refs, productsFor, productBlock, searchCatalog, requestPhotos, loadCatalog, scripts: () => scripts, scriptPrompt, writeScript, scriptRun, saveScript, packPart, packHtml, conns: () => conns, viaOf, engineFor, HOUSE, music: () => MUSIC, musicStart, musicStop, match: () => ISO.match, startMatch: (a, b) => startMatch(ISO.people[a], ISO.people[b], performance.now()), zoneAt, addIdea, IDEAS: () => IDEAS, postComment, loadAllComments, cmtCount, ctaFor, withCta, isoPeople: () => ISO.people, aoCycle, aoStart, aoBeat, aoAlive, reviseFromNotes, shrinkVideo, nightOwl, weeklyReport, learnedTags, resultsForPrompt, openRaw, addRaw, sendRaw, rawCount, loadRaw, dayFor, isDyk, targets, sendText, autoSend, seoFor, seoRun, learnedTimes, schedule, attachForPost, driveUpload, fileFor, autoLink, needsFile, readyItems, placedOn, place, unplace, setMediaUrl, sendToMetricool, metricoolPost, NAME, freshVideos, watch, onChange: f => listeners.push(f), handoff, collect, start, captionFor, assetNeeds, imagePrompt, videoBrief, editJob };
})();
