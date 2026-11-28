/* RSH Sound Library: real, licensed music and sound effects the team chooses, so videos do not all sound alike.
 *  - Maxine, Jasper or Romeo add MP3/WAV tracks from a free library (Pixabay Music, the YouTube Audio Library) or their
 *    own packs, tagged by kind (music / sound effect), mood, tempo and sport, with where the track came from.
 *  - Every edit job names one music track and up to four sound effects from here; the editor never makes its own music.
 *  - A track used on a post is not picked again for 21 days, so the feed does not repeat itself.
 *  - Sage writes a sound plan (PART 9) for every video script; the editor follows it, and a shopping list shows what to download from Pixabay.
 *  - Files live in the app database in pieces (the file store only takes images and video), meta in db sounds/<id>. */
(function () {
  'use strict';
  const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PIECE = 180000, MAX_BYTES = 8e6, REST_DAYS = 21;
  const MOODS = ['hype', 'epic', 'driving', 'confident', 'uplifting', 'calm', 'emotional', 'playful', 'dark', 'corporate'];
  const FX = ['whoosh', 'swoosh', 'hit', 'impact', 'riser', 'crowd', 'whistle', 'buzzer', 'click'];
  const SPORTS = ['wrestling', 'basketball', 'football', 'soccer', 'volleyball', 'baseball', 'softball', 'track', 'mma', 'any'];
  const SOURCES = [['Pixabay Music', 'https://pixabay.com/music/', 'Free for commercial use under the Pixabay Content License, no credit needed.'],
    ['Pixabay sound effects', 'https://pixabay.com/sound-effects/', 'Free whooshes, hits, risers and crowd sounds under the same license.'],
    ['YouTube Audio Library', 'https://studio.youtube.com/', 'In YouTube Studio → Audio library. Pick tracks marked “No attribution required” and check each track’s terms before using it outside YouTube.']];
  let db = null, me = null, tracks = {}, openUI = false, busy = false, msg = '', filter = 'all', playing = null;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const days = t => (Date.now() - Date.parse(t)) / 864e5;
  const sniff = b => b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 ? 'audio/mpeg' : b[0] === 0xFF && (b[1] & 0xE0) === 0xE0 ? 'audio/mpeg'
    : b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45 ? 'audio/wav' : '';
  function b64(bytes) { let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(out); }
  const list = () => Object.values(tracks).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  const lastUse = t => (t.uses || []).reduce((a, u) => (u.at > a ? u.at : a), '');

  async function load() { if (!db) return; try { const q = await db.collection('sounds').get(); const next = {}; for (const d of q.docs) { const x = d.data(); if (x && x.file) next[d.id] = { id: d.id, ...x }; } tracks = next; } catch (_) {} }

  // Store one audio file (MP3 or WAV, up to 8 MB) and its tags.
  async function add(file, meta) {
    if (!db) throw new Error('Storage is not available in this view.');
    if (!file || file.size > MAX_BYTES) throw new Error(`${file ? file.name : 'The file'} is over 8 MB. Use an MP3 (a 3-minute song at 192 kbps is about 4 MB).`);
    const bytes = new Uint8Array(await file.arrayBuffer()), mime = sniff(bytes.subarray(0, 12));
    if (!mime) throw new Error(`${file.name} is not an MP3 or WAV file. Download the MP3 version from the library and add that.`);
    if (!String(meta.source || '').trim()) throw new Error('Say where the track came from (for example Pixabay Music) so the license can be checked later.');
    const id = uid(), data = b64(bytes), parts = [];
    for (let n = 0, start = 0; start < data.length; n++, start += PIECE) { const doc = `fileStore/snd${id}_${n}`; await db.doc(doc).set({ data: data.slice(start, start + PIECE), name: String(file.name).slice(0, 200), n, at: new Date().toISOString() }); parts.push({ doc, start, end: Math.min(data.length, start + PIECE) }); }
    const t = { title: String(meta.title || file.name.replace(/\.[^.]+$/, '')).slice(0, 120), kind: meta.kind === 'sfx' ? 'sfx' : 'music', moods: (meta.moods || []).filter(m => MOODS.includes(m)), sports: (meta.sports && meta.sports.length ? meta.sports : ['any']).filter(s => SPORTS.includes(s)),
      bpm: Number(meta.bpm) || null, fx: (meta.fx || []).filter(x => FX.includes(x)), source: String(meta.source).slice(0, 80), sourceUrl: /^https:\/\//.test(meta.sourceUrl || '') ? String(meta.sourceUrl).slice(0, 300) : '', license: String(meta.license || '').slice(0, 300),
      file: { name: file.name, mime, bytes: bytes.length, encoding: 'db-base64', parts }, addedBy: me || '', addedAt: new Date().toISOString(), uses: [] };
    await db.doc('sounds/' + id).set(t); tracks[id] = { id, ...t }; return tracks[id];
  }
  async function remove(id) { const t = tracks[id]; if (!t || !db) return; for (const p of t.file.parts) { try { await db.doc(p.doc).delete(); } catch (_) {} } try { await db.doc('sounds/' + id).delete(); } catch (_) {} delete tracks[id]; }
  async function blobOf(t) { const chunks = []; for (const p of t.file.parts) { const s = await db.doc(p.doc).get(); chunks.push(s.exists ? String(s.data().data || '') : ''); } const bin = atob(chunks.join('')), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: t.file.mime }); }

  // The mood a campaign asks for, read from its brief (Sage's pack wording), so picks fit the video.
  // Sage's PART 9 sound plan for this campaign (mood, tempo, style, Pixabay search words, timed sound-effect cues).
  function planOf(p) {
    const B = window.RSH_BOTS, pk = B && B.scripts ? (B.scripts() || {})[p.id] : null, text = String((pk && pk.text) || '');
    const i = text.search(/PART 9\s*[—-]\s*SOUND PLAN/i); if (i < 0) return null; const seg = text.slice(i, i + 1500);
    const line = k => { const m = new RegExp('^\\W*' + k + '\\W*:\\s*(.+)$', 'im').exec(seg); return m ? m[1].trim() : ''; };
    const moods = line('MOOD').toLowerCase().split(/[^a-z]+/).filter(m => MOODS.includes(m)), tm = /(\d{2,3})\s*[–-]\s*(\d{2,3})/.exec(line('TEMPO')) || /(\d{2,3})/.exec(line('TEMPO'));
    const cues = line('SFX').split(/;/).map(c => { const m = /(\d+:\d{2})\s*([a-z]+)/i.exec(c.trim()); return m ? { at: m[1], fx: m[2].toLowerCase() } : null; }).filter(c => c && FX.includes(c.fx));
    return { moods, bpm: tm ? [Number(tm[1]), Number(tm[2] || tm[1])] : null, style: line('STYLE').slice(0, 120), search: line('SEARCH').split(/[;,]|\s{2,}/).map(x => x.replace(/["“”]/g, '').trim()).filter(Boolean).slice(0, 3), cues };
  }
  function moodOf(p) {
    const pl = planOf(p); if (pl && pl.moods.length) return pl.moods;
    const t = [p.title, p.hook, p.video, p.goal, p.postType].join(' ').toLowerCase();
    return /did you know|dyk|explain|rule|quiz|how to/.test(t) ? ['calm', 'confident', 'corporate'] : /quote|motivat|grind|tired|pressure|champion|hype|game day|tournament/.test(t) ? ['hype', 'epic', 'driving']
      : /parent|thank|senior|emotional|memor/.test(t) ? ['emotional', 'uplifting'] : /product|singlet|uniform|reversible|colorway|launch/.test(t) ? ['confident', 'driving', 'uplifting'] : ['uplifting', 'confident'];
  }
  const sportOf = p => { const s = String(p.sport || '').toLowerCase(); return SPORTS.find(x => s.includes(x)) || 'any'; };
  // Best unused track: matching sport and mood score highest; a track used in the last 21 days is skipped while others remain.
  function pick(p, kind, n) {
    const want = moodOf(p), sp = sportOf(p), pool = list().filter(t => t.kind === kind);
    const pl = kind === 'music' ? planOf(p) : null, fxw = kind === 'sfx' ? [].concat(n && n.fx ? n.fx : []) : [];
    const score = t => (t.sports.includes(sp) ? 3 : t.sports.includes('any') ? 1 : 0) + t.moods.filter(m => want.includes(m)).length * 2 - (t.uses || []).length * 0.1
      + (pl && pl.bpm && t.bpm && t.bpm >= pl.bpm[0] - 5 && t.bpm <= pl.bpm[1] + 5 ? 2 : 0) + (fxw.length && (t.fx || []).some(x => fxw.includes(x)) ? 4 : 0);
    if (n && typeof n === 'object') n = n.count;
    const rested = pool.filter(t => !lastUse(t) || days(lastUse(t)) >= REST_DAYS), from = rested.length >= (n || 1) ? rested : pool;
    return from.slice().sort((a, b) => score(b) - score(a) || String(lastUse(a)).localeCompare(String(lastUse(b)))).slice(0, n || 1);
  }
  const fileRef = t => `ArtifactData get ${t.file.parts.map(x => x.doc).join(' + ')} (field "data", join in order, then base64-decode to ${t.file.mime === 'audio/wav' ? 'WAV' : 'MP3'})`;
  // The block every edit job carries. Revisions keep the music already in the video unless the notes ask otherwise.
  function blockFor(p, opts) {
    if (opts && opts.revision) return 'MUSIC AND SOUND: keep the music and sound effects already in the video unless the review notes ask to change them. If they do, use only tracks from the RSH Sound Library (never generate music).';
    const plan = planOf(p), cueTypes = plan ? [...new Set(plan.cues.map(c => c.fx))] : [];
    const music = pick(p, 'music', 1)[0], sfx = cueTypes.length ? [...new Map(cueTypes.map(f => [f, pick(p, 'sfx', { count: 1, fx: [f] })[0]]).filter(([f, t]) => t && (t.fx || []).includes(f)).map(([, t]) => [t.id, t])).values()].slice(0, 6) : pick(p, 'sfx', 4), trend = !!p.trendingSound;
    if (!music && !sfx.length) return 'MUSIC AND SOUND: the RSH Sound Library is empty. Do NOT generate music or sound effects: deliver with the voiceover and natural sound only, and say in the job note that the team should add tracks to the Sound Library (🎵 Sounds at the top of the app).';
    const lines = ['MUSIC AND SOUND (from the RSH Sound Library; never generate music or sound effects; cut and fade to fit, duck under any voiceover, loudness about -14 to -16 LUFS):'];
    lines.push(music ? `• Music: "${music.title}" (${music.moods.join(', ') || 'no mood tag'}${music.bpm ? ', ' + music.bpm + ' BPM' : ''}; ${music.source}). File: ${fileRef(music)}. Cut on its beats.` : '• Music: none in the library yet: use natural sound and the voiceover only.');
    if (plan && (plan.style || plan.bpm)) lines.push(`• Sage’s sound plan: ${plan.moods.join(', ') || 'mood as the script'}${plan.bpm ? ', ' + plan.bpm[0] + '–' + plan.bpm[1] + ' BPM' : ''}${plan.style ? ', ' + plan.style : ''}.`);
    if (plan && plan.cues.length) lines.push('• Sound-effect cues from the script: ' + plan.cues.map(c => { const t = sfx.find(x => (x.fx || []).includes(c.fx)); return `${c.at} ${c.fx}${t ? ` → "${t.title}"` : ' (none in the library: skip it)'}`; }).join('; '));
    if (sfx.length) lines.push('• Sound effects (use where they fit, never on every cut): ' + sfx.map(s => `"${s.title}" (${fileRef(s)})`).join('; '));
    if (trend) lines.push('• TRENDING SOUND: the team will add a trending sound in the Instagram/TikTok app when posting. Deliver the main file with the music above AND an extra file with no music (voice and effects only), named …-nomusic.mp4, in "extra".');
    lines.push(`SOUND IDS (for the app's rotation log): ${[music, ...sfx].filter(Boolean).map(t => t.id).join(',')}`);
    return lines.join('\n');
  }
  // Record that a job used these tracks, so they rest for 21 days.
  async function markUsed(p, text) {
    const m = /SOUND IDS \(for the app's rotation log\): ([\w,]+)/.exec(String(text || '')); if (!m || !db) return;
    for (const id of m[1].split(',')) { const t = tracks[id]; if (!t) continue; t.uses = (t.uses || []).concat([{ postId: p.id, title: String(p.title || '').slice(0, 80), at: new Date().toISOString() }]).slice(-30); try { await db.doc('sounds/' + id).set(Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'id'))); } catch (_) {} }
  }

  // What to download next: moods and effects the next 14 days of video campaigns need that the library cannot cover yet.
  const pixMusic = q => 'https://pixabay.com/music/search/' + encodeURIComponent(q) + '/', pixFx = q => 'https://pixabay.com/sound-effects/search/' + encodeURIComponent(q) + '/';
  function shopping() {
    const posts = ((window.RSH_APP && window.RSH_APP.data().posts) || []), today = new Date().toISOString().slice(0, 10), end = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const vids = posts.filter(p => p.date >= today && p.date <= end && /reel|video|short|story/i.test(String(p.postType || '')) && !/approved|posted|published/i.test(String(p.status || '')));
    const fresh = list().filter(t => !lastUse(t) || days(lastUse(t)) >= REST_DAYS), need = new Map();
    for (const p of vids) {
      const pl = planOf(p), moods = moodOf(p), key = moods.slice(0, 2).join(' + ');
      const have = fresh.filter(t => t.kind === 'music' && t.moods.some(m => moods.includes(m))).length;
      if (have < 2) { const it = need.get('m:' + key) || { kind: 'music', moods, key, posts: [], search: new Set(), style: pl && pl.style, bpm: pl && pl.bpm }; it.posts.push(p.title); ((pl && pl.search) || [moods[0] + ' sport ' + String(p.sport || '').toLowerCase()]).forEach(q => it.search.add(q)); need.set('m:' + key, it); }
      for (const c of (pl ? pl.cues : [])) if (!list().some(t => t.kind === 'sfx' && (t.fx || []).includes(c.fx))) { const it = need.get('f:' + c.fx) || { kind: 'sfx', fx: c.fx, key: c.fx, posts: [], search: new Set([c.fx === 'hit' || c.fx === 'impact' ? 'cinematic ' + c.fx : c.fx]) }; it.posts.push(p.title); need.set('f:' + c.fx, it); }
    }
    return [...need.values()].map(x => ({ ...x, posts: [...new Set(x.posts)], search: [...x.search].slice(0, 3) }));
  }

  /* ---------- view ---------- */
  const css = document.createElement('style');
  css.textContent = `#rshSounds{position:fixed;inset:0;z-index:9991;background:rgba(15,23,42,.45);display:none;justify-content:center;align-items:flex-start;overflow:auto;padding:24px 12px}
  #rshSounds .sheet{background:var(--card,#fff);color:var(--ink,#1d1d1f);width:min(900px,100%);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:22px 24px 26px}
  #rshSounds h2{font-size:21px;margin:4px 0}#rshSounds .box{border:1px solid #e5e7eb;border-radius:14px;padding:12px 14px;margin-top:12px}#rshSounds .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px}
  #rshSounds label{font-size:12.5px;font-weight:700;display:grid;gap:3px}#rshSounds input[type=text],#rshSounds input[type=number],#rshSounds select{border:1px solid #d2d2d7;border-radius:9px;padding:6px 8px;font:13px system-ui;min-width:0}
  #rshSounds .chips{display:flex;gap:6px;flex-wrap:wrap}#rshSounds .chips label{font-weight:500;display:inline-flex;gap:4px;align-items:center;border:1px solid #d2d2d7;border-radius:999px;padding:3px 9px;cursor:pointer}
  #rshSounds .t{display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid #f1f5f9;padding:9px 0;flex-wrap:wrap}#rshSounds .t:first-child{border-top:0}#rshSounds .tag{display:inline-block;font-size:11px;background:#f1f5f9;border-radius:999px;padding:2px 8px;margin:2px 3px 0 0}
  #rshSounds .tag.rest{background:#fef3c7;color:#92400e}#rshSounds .msg{font-size:12.5px;color:#0f5132;min-height:1em;margin-top:6px}#rshSounds a{color:#0071e3}
  #rshSoundsBtn{white-space:nowrap}`;
  document.head.appendChild(css);
  function render() {
    const h = document.getElementById('rshSounds'); if (!h || !openUI) return;
    const all = list(), shown = all.filter(t => filter === 'all' || t.kind === filter), nm = all.filter(t => t.kind === 'music').length, ns = all.length - nm;
    h.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Sound Library"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div class="small" style="font-weight:800;letter-spacing:.08em;color:#64748b">RSH SOUND LIBRARY</div><h2>🎵 Music and sound effects</h2>
      <div class="small">Every edit job picks one music track and a few sound effects from here, matched to the campaign’s sport and mood. A track rests ${REST_DAYS} days after it is used, so the feed never repeats. The editor never makes its own music. ${nm} music track${nm === 1 ? '' : 's'}, ${ns} sound effect${ns === 1 ? '' : 's'}.</div></div>
      <button type="button" class="btn ghost smallbtn" data-snd-close>Close ✕</button></div>
      <div class="box"><strong>Where to get free tracks</strong><div class="small" style="margin-top:4px">${SOURCES.map(([n, u, d]) => `<div style="margin-top:4px"><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)} ↗</a> · ${esc(d)}</div>`).join('')}<div style="margin-top:6px">Pick tracks real creators use less: skip the first page of “popular”, search by mood (for example “dark cinematic sport”, “gritty hip hop”). Download the MP3.</div></div></div>
      ${(() => { const sh = shopping(); return `<div class="box"><strong>🛒 Shopping list</strong> <span class="small">· what the next 14 days of videos need that the library does not have yet (from Sage’s sound plans)</span>
        ${sh.length ? sh.map((x, i) => `<div class="t"><div style="min-width:0;flex:1"><strong>${x.kind === 'music' ? 'Music: ' + esc(x.key) : 'Sound effect: ' + esc(x.fx)}</strong>${x.style ? ` <span class="small">· ${esc(x.style)}</span>` : ''}${x.bpm ? ` <span class="small">· ${x.bpm[0]}–${x.bpm[1]} BPM</span>` : ''}<div class="small">For: ${esc(x.posts.slice(0, 3).join('; '))}${x.posts.length > 3 ? ' …' : ''}</div>
          <div class="small">Search Pixabay: ${x.search.map(q => `<a href="${(x.kind === 'music' ? pixMusic : pixFx)(q)}" target="_blank" rel="noopener noreferrer">${esc(q)} ↗</a>`).join(' · ')} — download ${x.kind === 'music' ? '2' : '1'}, then add below.</div></div>
          <button type="button" class="btn ghost smallbtn" data-snd-prefill="${i}">Fill the tags</button></div>`).join('') : '<p class="small" style="margin-top:6px">Nothing needed: the library covers every planned video for the next 14 days.</p>'}</div>`; })()}
      <div class="box"><strong>Add tracks</strong>
        <div class="row"><label>Files (MP3 or WAV, up to 8 MB each)<input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" multiple data-snd-file></label>
          <label>Kind<select data-snd-kind><option value="music">Music</option><option value="sfx">Sound effect</option></select></label>
          <label>Tempo (BPM, optional)<input type="number" min="40" max="220" data-snd-bpm style="width:110px"></label></div>
        <div class="row"><label style="flex:1">Source<select data-snd-source>${SOURCES.map(([n]) => `<option>${esc(n)}</option>`).join('')}<option>Our own / bought pack</option></select></label>
          <label style="flex:2">Track page link (optional)<input type="text" data-snd-url placeholder="https://pixabay.com/music/…"></label></div>
        <div style="margin-top:8px"><div class="small" style="font-weight:700">Mood</div><div class="chips">${MOODS.map(m => `<label><input type="checkbox" value="${m}" data-snd-mood>${m}</label>`).join('')}</div></div>
        <div style="margin-top:8px"><div class="small" style="font-weight:700">Effect type (sound effects only)</div><div class="chips">${FX.map(f => `<label><input type="checkbox" value="${f}" data-snd-fx>${f}</label>`).join('')}</div></div>
        <div style="margin-top:8px"><div class="small" style="font-weight:700">Sport (leave empty for any sport)</div><div class="chips">${SPORTS.filter(s => s !== 'any').map(s => `<label><input type="checkbox" value="${s}" data-snd-sport>${s}</label>`).join('')}</div></div>
        <div class="row"><button type="button" class="btn smallbtn" data-snd-add ${busy ? 'disabled' : ''}>${busy ? 'Adding…' : '＋ Add to library'}</button><span class="small">The same tags apply to every file you add at once.</span></div>
        <div class="msg" role="status">${esc(msg)}</div></div>
      <div class="box"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><strong>Library</strong><div class="chips">${[['all', 'All'], ['music', 'Music'], ['sfx', 'Sound effects']].map(([v, l]) => `<label><input type="radio" name="sndf" value="${v}" data-snd-filter ${filter === v ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
        ${shown.length ? shown.map(t => { const lu = lastUse(t), rest = lu && days(lu) < REST_DAYS; return `<div class="t"><div style="min-width:0;flex:1"><strong>${esc(t.title)}</strong> <span class="small">· ${t.kind === 'sfx' ? 'sound effect' : 'music'}${t.bpm ? ' · ' + t.bpm + ' BPM' : ''} · ${esc(t.source)}${t.sourceUrl ? ` · <a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener noreferrer">track page ↗</a>` : ''}</span>
          <div>${t.moods.map(m => `<span class="tag">${esc(m)}</span>`).join('')}${t.sports.map(s => `<span class="tag">${esc(s)}</span>`).join('')}${rest ? `<span class="tag rest">resting until ${esc(new Date(Date.parse(lu) + REST_DAYS * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>` : ''}<span class="tag">used ${(t.uses || []).length}×</span></div></div>
          <div style="display:flex;gap:6px"><button type="button" class="btn ghost smallbtn" data-snd-play="${t.id}">${playing && playing.id === t.id ? '■ Stop' : '▶ Play'}</button><button type="button" class="btn ghost smallbtn" data-snd-del="${t.id}">Remove</button></div></div>`; }).join('')
          : '<p class="small" style="margin-top:8px">No tracks yet. Add 10 to 20 music tracks across moods and 10 sound effects (whoosh, hit, riser, crowd, whistle) to start.</p>'}</div>
    </div>`;
  }
  function paintButton() { const b = document.getElementById('rshSoundsBtn'); if (!b) return; const n = list().filter(t => t.kind === 'music').length; const need = shopping().length; b.textContent = '🎵 Sounds' + (need ? ` · ${need} to get` : n ? ` (${n})` : ''); b.title = n ? `${n} music tracks in the Sound Library` : 'The Sound Library is empty: add music so videos do not use generated music'; }
  function openSounds() { openUI = true; msg = ''; let h = document.getElementById('rshSounds'); if (!h) { h = document.createElement('div'); h.id = 'rshSounds'; document.body.appendChild(h); h.addEventListener('click', onClick); h.addEventListener('change', e => { if (e.target.matches('[data-snd-filter]')) { filter = e.target.value; render(); } }); } h.style.display = 'flex'; render(); }
  function closeSounds() { openUI = false; stop(); const h = document.getElementById('rshSounds'); if (h) h.style.display = 'none'; }
  function stop() { if (playing) { try { playing.audio.pause(); URL.revokeObjectURL(playing.url); } catch (_) {} playing = null; } }
  async function onClick(e) {
    const t = e.target, h = document.getElementById('rshSounds');
    if (t.id === 'rshSounds' || t.closest('[data-snd-close]')) return closeSounds();
    if (t.closest('[data-snd-add]')) {
      const files = [...(h.querySelector('[data-snd-file]').files || [])]; if (!files.length) { msg = 'Choose one or more MP3 or WAV files first.'; return render(); }
      const meta = { kind: h.querySelector('[data-snd-kind]').value, bpm: h.querySelector('[data-snd-bpm]').value, source: h.querySelector('[data-snd-source]').value, sourceUrl: h.querySelector('[data-snd-url]').value.trim(),
        moods: [...h.querySelectorAll('[data-snd-mood]:checked')].map(x => x.value), fx: [...h.querySelectorAll('[data-snd-fx]:checked')].map(x => x.value), sports: [...h.querySelectorAll('[data-snd-sport]:checked')].map(x => x.value) };
      busy = true; msg = 'Adding…'; render(); let ok = 0; const fails = [];
      for (const f of files) { try { await add(f, { ...meta, title: f.name.replace(/\.[^.]+$/, '') }); ok++; } catch (err) { fails.push(err.message || String(err)); } }
      busy = false; msg = `${ok} added.${fails.length ? ' Not added: ' + fails.join(' ') : ''}`; paintButton(); return render();
    }
    const pf = t.closest('[data-snd-prefill]'); if (pf) { const x = shopping()[+pf.dataset.sndPrefill]; if (x) { h.querySelector('[data-snd-kind]').value = x.kind; h.querySelector('[data-snd-source]').value = x.kind === 'music' ? 'Pixabay Music' : 'Pixabay sound effects'; h.querySelectorAll('[data-snd-mood]').forEach(c => { c.checked = x.kind === 'music' && x.moods.includes(c.value); }); h.querySelectorAll('[data-snd-fx]').forEach(c => { c.checked = x.kind === 'sfx' && c.value === x.fx; }); msg = 'Tags filled in. Choose the downloaded file(s), then press “Add to library”.'; const m = h.querySelector('.msg'); if (m) m.textContent = msg; h.querySelector('[data-snd-file]').scrollIntoView({ block: 'center' }); } return; }
    const pl = t.closest('[data-snd-play]'); if (pl) { const id = pl.dataset.sndPlay, was = playing && playing.id === id; stop(); if (!was) { try { const url = URL.createObjectURL(await blobOf(tracks[id])), audio = new Audio(url); playing = { id, url, audio }; audio.onended = () => { stop(); render(); }; await audio.play(); } catch (_) { msg = 'This track could not play here.'; } } return render(); }
    const del = t.closest('[data-snd-del]'); if (del) { if (del.dataset.confirm !== '1') { del.dataset.confirm = '1'; del.textContent = 'Click again to remove'; return; } await remove(del.dataset.sndDel); msg = 'Removed from the library.'; paintButton(); return render(); }
  }
  async function start() {
    if (document.getElementById('rshSoundsBtn')) return;
    const top = document.getElementById('rshInboxBtn') || document.getElementById('openCommandPalette');
    if (top) { const b = document.createElement('button'); b.type = 'button'; b.id = 'rshSoundsBtn'; b.className = 'btn ghost smallbtn'; b.addEventListener('click', openSounds); top.parentNode.insertBefore(b, top.nextSibling); }
    db = await use('db'); try { const u = await use('user'); me = u ? await u.id() : null; } catch (_) {}
    await load(); paintButton();
  }
  window.RSH_SOUNDS = { start, open: openSounds, close: closeSounds, add, remove, load, list, pick, blockFor, markUsed, moodOf, planOf, shopping, sniff, REST_DAYS, FX };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 1800)); else setTimeout(start, 1800);
})();
