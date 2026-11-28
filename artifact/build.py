#!/usr/bin/env python3
"""Builds the Claude-artifact edition of the app from index.html (the local app stays the source of truth).

  python3 artifact/build.py [path/to/complete_backup.zip]

Output: artifact/dist/RSH Sports Marketing OS.html plus the files it needs (logo, bundled media).
With a backup ZIP, its media are copied beside the page and artifact/dist/seed.json holds the
workspace to load into the artifact database after publishing. Campaign data never enters the page itself.
"""
import json, re, shutil, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifact' / 'dist'
src = (ROOT / 'index.html').read_text(encoding='utf-8')
version = re.search(r"APP_VERSION = '([^']+)'", (ROOT / 'server.py').read_text()).group(1)

def once(text, old, new, count=1):
    assert text.count(old) == count, f'expected {count} of {old[:70]!r}, found {text.count(old)}'
    return text.replace(old, new)

OUT.mkdir(parents=True, exist_ok=True)
for stale in OUT.glob('media/*'): stale.unlink()
(OUT / 'media').mkdir(exist_ok=True)
shutil.copy(ROOT / 'rsh_logo.png', OUT / 'rsh_logo.png')

bundled = {}
if len(sys.argv) > 1:
    with zipfile.ZipFile(sys.argv[1]) as z:
        manifest = json.loads(z.read('manifest.json'))
        for item in manifest['attachments']:
            assert re.fullmatch(r'[0-9a-f]{32}', item['id']) and re.fullmatch(r'(media|assets)/[0-9a-f]{32}\.(png|jpg|webp|mp4|webm|mov)', item['path'])
            name = 'media/' + item['path'].split('/')[1]
            (OUT / name).write_bytes(z.read(item['path']))
            bundled[item['id']] = name
        workspace = z.read('workspace.json').decode('utf-8')
        json.loads(workspace)
        (OUT / 'seed.json').write_text(json.dumps({'json': workspace, 'updatedAt': manifest['created'], 'appVersion': version, 'seededFrom': Path(sys.argv[1]).name}), encoding='utf-8')

packs = []
for p in sorted((ROOT / 'reports_inbox').glob('RSH_Weekly_Evidence_*.json'), reverse=True):
    packs.append({'filename': p.name, 'location': 'Shipped with this artifact', 'pack': json.loads(p.read_text(encoding='utf-8'))})

shim = (ROOT / 'artifact' / 'shim.js').read_text(encoding='utf-8')
live = (ROOT / 'artifact' / 'live.js').read_text(encoding='utf-8')
score = (ROOT / 'artifact' / 'scorecard.js').read_text(encoding='utf-8')
camp = (ROOT / 'artifact' / 'campaigns.js').read_text(encoding='utf-8')
exper = (ROOT / 'artifact' / 'experiments.js').read_text(encoding='utf-8')
signoff = (ROOT / 'artifact' / 'signoff.js').read_text(encoding='utf-8')
cal = (ROOT / 'artifact' / 'calendar.js').read_text(encoding='utf-8')
homejs = (ROOT / 'artifact' / 'home.js').read_text(encoding='utf-8')
tracker = (ROOT / 'artifact' / 'tracker.js').read_text(encoding='utf-8')
bots = (ROOT / 'artifact' / 'bots.js').read_text(encoding='utf-8')
organize = (ROOT / 'artifact' / 'organize.js').read_text(encoding='utf-8')
review = (ROOT / 'artifact' / 'review.js').read_text(encoding='utf-8')
health = (ROOT / 'artifact' / 'health.js').read_text(encoding='utf-8')
report = (ROOT / 'artifact' / 'report.js').read_text(encoding='utf-8')
mwatch = (ROOT / 'artifact' / 'mwatch.js').read_text(encoding='utf-8')
rivals = (ROOT / 'artifact' / 'rivals.js').read_text(encoding='utf-8')
sales = (ROOT / 'artifact' / 'sales.js').read_text(encoding='utf-8')
campaign = (ROOT / 'artifact' / 'campaign.js').read_text(encoding='utf-8')
inbox = (ROOT / 'artifact' / 'inbox.js').read_text(encoding='utf-8')
sounds = (ROOT / 'artifact' / 'sounds.js').read_text(encoding='utf-8')
shim = once(shim, '__APP_VERSION__', version)
shim = once(shim, '__BUNDLED_MEDIA__', json.dumps(bundled))
shim = once(shim, '__WEEKLY_PACKS__', json.dumps(packs, ensure_ascii=False).replace('</', '<\\/'))

s = src
# 1. The publish step supplies the document skeleton: keep only title, styles and body content.
s = once(s, '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="theme-color" content="#f5f5f7">\n', '')
s = once(s, f'<title>RSH Sports Marketing OS v{version}</title>', '<title>RSH Sports Marketing OS</title>')
s = once(s, '\n</head>\n<body>\n', '\n')
assert s.rstrip().endswith('</script>\n</body>\n</html>')
s = s.rstrip()[:-len('</body>\n</html>')]

# 2. The app starts only after the host layer has loaded the saved workspace.
s = once(s, "<script>\n(()=>{'use strict';\nconst KEY='rsh_growth_command_v1';", "<script>\nwindow.__rshBoot=(()=>{'use strict';\nconst KEY='rsh_growth_command_v1';")
tail = "vaultStatus().catch(()=>{});\n\n\n})();\n\n</script>"
assert s.rstrip().endswith(tail)
s = s.rstrip()[:-len(tail)] + "vaultStatus().catch(()=>{});\n\n\n});\n\n</script>\n<script>\n" + shim + "\n</script>\n"

# 3. Storage, media, exports and prompts go through the host layer.
s = once(s, 'localStorage.getItem(KEY)', 'RSH_HOST.read(KEY)')
s = once(s, 'localStorage.setItem(KEY,JSON.stringify(d))', 'RSH_HOST.persist(KEY,JSON.stringify(d))', 3)
s = once(s, "const visualAssetUrl=a=>(a?.storage==='media'?'/api/media/':'/api/assets/')+encodeURIComponent(a.id);", 'const visualAssetUrl=a=>RSH_HOST.mediaUrl(a);')
s = once(s, "const exportFile=(name,text,mime)=>{const b=new Blob([text],{type:mime}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)};", 'const exportFile=(name,text,mime)=>{RSH_HOST.exportFile(name,text)};')
s = once(s, "const t=prompt('Record a dated competitor observation:',c.notes||'');if(t!==null){c.notes=t;c.added=new Date().toISOString().slice(0,10);save();notice('Notes updated')}", "RSH_HOST.ask('Record a dated competitor observation:',c.notes||'').then(t=>{if(t!==null){c.notes=t;c.added=new Date().toISOString().slice(0,10);save();notice('Notes updated')}})")

# Every server request goes to the host layer explicitly.
n_fetch = len(re.findall(r'(?<![\w.])fetch\(', s.split(shim)[0]))
head, tail_ = s.split(shim)
head = re.sub(r'(?<![\w.])fetch\(', 'RSH_HOST.fetch(', head)
s = head + shim + tail_
assert n_fetch >= 8, n_fetch
s = once(s, "function visualFileDimensions(file){return new Promise(", "function visualFileDimensions(file){return RSH_HOST.imageSize(file)}function visualFileDimensionsLocal(file){return new Promise(")
s = once(s, "if(f.size<256||f.size>(f.type.startsWith('image/')?12_000_000:120_000_000)){el('visualUploadMsg').textContent='File too large: '+f.name+'. Images max 12 MB; videos max 120 MB.';return}", "if(f.size<256||f.size>(f.type.startsWith('image/')?12_000_000:120_000_000)){el('visualUploadMsg').textContent='File too large: '+f.name+'. Images max 12 MB; videos max 120 MB.';return}")
s = once(s, "uploadedAt:new Date().toISOString(),storage:'media'});", "uploadedAt:new Date().toISOString(),storage:'media',...(result.parts?{parts:result.parts}:{}),...(result.store?{store:result.store}:{})});")
s = once(s, "const f=files[i];el('visualUploadMsg').textContent=`Uploading ${i+1}/${files.length}: ${f.name} (${(f.size/1_000_000).toFixed(1)} MB)...`;", "const f=files[i];const upLabel=`Uploading ${i+1}/${files.length}: ${f.name} (${(f.size/1_000_000).toFixed(1)} MB)`;el('visualUploadMsg').textContent=upLabel+'...';RSH_HOST.onUploadProgress=(done,total)=>{el('visualUploadMsg').textContent=upLabel+' · '+Math.round(done/total*100)+'%'};")

s = once(s, "notice('Some uploads could not finish. Saved files were retained.');", "notice('Upload stopped: '+failed.message);")
# Campaign Checklist: its own screen and sidebar entry (the click handler binds to markup present at start-up).
s = once(s, '<button data-view="studio" type="button"><span class="icon">✦</span> Create</button>', '<button data-view="tracker" type="button"><span class="icon">☑</span> Checklist</button>\n<button data-view="studio" type="button"><span class="icon">✦</span> Create</button>')
s = once(s, '<section class="section" id="view-calendar">', '<section class="section" id="view-tracker"></section>\n<section class="section" id="view-calendar">')
s = once(s, "approvals:['Approval Desk',", "tracker:['Campaign Checklist','Every campaign, where it stands, and the one thing to do next.'],approvals:['Approval Desk',")

# 24/7 Bots: its own sidebar entry and screen. Purely additive; no existing screen is touched.
s = once(s, '<button data-view="weekly" type="button"><span class="icon">▤</span> Insights</button>', '<button data-view="weekly" type="button"><span class="icon">▤</span> Insights</button>\n<div class="nav-group-label" style="margin-top:10px">AUTOMATION</div>\n<button data-view="bots" type="button"><span class="icon">◎</span> 24/7 Bots</button>')
s = once(s, '<section class="section" id="view-tracker"></section>', '<section class="section" id="view-tracker"></section>\n<section class="section" id="view-bots"></section>')
s = once(s, "tracker:['Campaign Checklist',", "bots:['24/7 Bots','Captions, timing and checks prepared automatically from your planned campaigns.'],tracker:['Campaign Checklist',")

# 4. Wording that would be untrue here.
s = once(s, f'<strong>LOCAL APP · V{version}</strong><div class="small">Activate the local Data Vault in Setup & Backup to preserve browser work. Export a backup before upgrading. Metricool is connected in ChatGPT only, not this local app.</div>',
         f'<strong>ARTIFACT EDITION · V{version} · BUILD 115</strong><div class="small">Everything saves automatically to this app’s shared storage. Anthony’s final approval is signed with his own account. Approved posts go to Metricool. Open ⋯ More → System check to see that everything works.</div>')
s = once(s, "'Use python3 server.py in the extracted v%s folder, then open http://127.0.0.1:8765. Buttons and media uploads require the local server.'" % version, "'Open this page from your Claude artifacts.'")

for old, new in (('Local editorial plans are separate from the read-only Metricool monthly archive.', 'Team plans, with what is scheduled and published in Metricool.'), ('Metricool connected to ChatGPT only', 'Live results from Metricool'), ('Local workspace · demo/pilot', 'RSH Sports workspace')):
    assert old in s, old
    s = s.replace(old, new)

# 5. Organized navigation (Nov 26): daily work on top; one entry per topic under "More tools", related screens as tabs.
NAV_NEW = """<div class="nav-group-label">YOUR DAILY WORK</div>
<button class="active" data-view="overview" type="button"><span class="icon">◈</span> Home</button>
<button data-view="tracker" type="button"><span class="icon">☑</span> Checklist</button>
<button data-view="studio" type="button"><span class="icon">✦</span> Create</button>
<button data-view="calendar" type="button"><span class="icon">▦</span> Calendar</button>
<button data-view="approvals" type="button"><span class="icon">✓</span> Reviews</button>
<button data-view="bots" type="button"><span class="icon">◎</span> 24/7 Bots</button>
<details class="nav-more-details" id="navMoreDetails"><summary><span class="icon">⊞</span><span>More tools</span><span class="nav-caret">⌄</span></summary><div class="nav-extra"><div class="nav-group-label" style="margin-top:10px">RESULTS</div>
<button data-view="weekly" type="button"><span class="icon">▤</span> Insights & Performance<span class="nav-keywords"> Insights Performance Metricool history Manual tracker Content Library Growth Operating System</span></button>
<button data-view="revenue" type="button"><span class="icon">＄</span> Revenue & ROI<span class="nav-keywords"> campaign link builder UTM</span></button>
<div class="nav-group-label" style="margin-top:10px">PLAN & RESEARCH</div>
<button data-view="strategy" type="button"><span class="icon">◇</span> Strategy<span class="nav-keywords"> Strategy Lab Decision Engine Season Intelligence radar</span></button>
<button data-view="competitors" type="button"><span class="icon">⌕</span> Competitors<span class="nav-keywords"> Competitive Intelligence watchlist</span></button>
<button data-view="experiments" type="button"><span class="icon">◷</span> Growth Experiments</button>
<button data-view="aiworkbench" type="button"><span class="icon">✧</span> AI Workbench</button>
<div class="nav-group-label" style="margin-top:10px">FOR ANTHONY</div>
<button data-view="executive" type="button"><span class="icon">▤</span> Executive Brief<span class="nav-keywords"> Anthony Review Center</span></button>
<button data-view="market" type="button"><span class="icon">◈</span> Scorecard & Roadmap<span class="nav-keywords"> Market Audit</span></button>
<div class="nav-group-label" style="margin-top:10px">SYSTEM</div>
<button data-view="settings" type="button"><span class="icon">⚙</span> Setup & Backup</button>
""" + "".join(f'<button data-view="{v}" type="button" class="nav-merged" tabindex="-1" aria-hidden="true"><span class="icon">·</span> {t}</button>\n' for v, t in (('recommend', 'Decision Engine'), ('seasons', 'Season Intelligence'), ('analytics', 'Manual tracker'), ('metricool', 'Metricool history'), ('november', 'Content Library'), ('growthos', 'Growth Operating System'), ('compintel', 'Competitive Intelligence'), ('pitch', 'Anthony Review Center'))) + "</div></details>"
i = s.index('<div class="nav-group-label">YOUR DAILY WORK</div>'); j = s.index('</div></details>', i) + len('</div></details>')
s = s[:i] + NAV_NEW + s[j:]
GROUPS_OLD = """ {tabs:[['strategy','Strategy Lab'],['recommend','Decision Engine']]},
 {tabs:[['metricool','Metricool history'],['analytics','Manual tracker']]},"""
s = once(s, GROUPS_OLD, """ {tabs:[['strategy','Strategy Lab'],['recommend','Decision Engine'],['seasons','Season radar']]},
 {tabs:[['weekly','Insights'],['metricool','Metricool history'],['analytics','Manual tracker'],['november','Content Library'],['growthos','Growth OS']]},""")

# Live results panel (artifact edition only) loads before the host layer starts the app.
assert s.count('<script>\n' + shim) == 1
s = s.replace('<script>\n' + shim, '<script>\n' + live + '\n</script>\n<script>\n' + score + '\n</script>\n<script>\n' + camp + '\n</script>\n<script>\n' + exper + '\n</script>\n<script>\n' + signoff + '\n</script>\n<script>\n' + cal + '\n</script>\n<script>\n' + homejs + '\n</script>\n<script>\n' + tracker + '\n</script>\n<script>\n' + bots + '\n</script>\n<script>\n' + organize + '\n</script>\n<script>\n' + review + '\n</script>\n<script>\n' + health + '\n</script>\n<script>\n' + report + '\n</script>\n<script>\n' + mwatch + '\n</script>\n<script>\n' + rivals + '\n</script>\n<script>\n' + sales + '\n</script>\n<script>\n' + campaign + '\n</script>\n<script>\n' + inbox + '\n</script>\n<script>\n' + sounds + '\n</script>\n<script>\n' + shim)

# Claude's sharing review accepts only JPEG, PNG, GIF or WebP images (MP4/WebM video, MP3/WAV audio).
# A version with anything else cannot be opened by invited people, so fail the build instead.
assert '<svg' not in s.lower() and 'image/svg' not in s.lower(), 'SVG is not allowed in the artifact page'
# Header: keep the status, Review and Search in view; the rest goes in one "⋯ More" menu. Drop the stale sidebar note.
s = once(s, '<button class="btn smallbtn" id="topPitch">◉ Present to Anthony</button><button class="btn ghost smallbtn" id="quickExport">↧ Backup data</button><button class="btn ghost smallbtn" id="beginnerToggle" aria-pressed="true">Beginner guide: On</button><button class="btn ghost smallbtn" id="openCommandPalette">⌘ Search</button><button type="button" class="btn ghost smallbtn" id="rshHealthButton">App status</button>',
         '<button class="btn ghost smallbtn" id="openCommandPalette">⌘ Search</button><details class="topmore"><summary class="btn ghost smallbtn">⋯ More</summary><div class="topmore-menu"><button type="button" class="btn ghost smallbtn" id="rshHealthButton">✓ System check</button><button class="btn ghost smallbtn" id="topPitch">◉ Present to Anthony</button><button class="btn ghost smallbtn" id="quickExport">↧ Backup data</button><button class="btn ghost smallbtn" id="beginnerToggle" aria-pressed="true">Beginner guide: On</button></div></details>')
s = once(s, '<div class="sidebar-paused small">Cloud team login is paused until Anthony approves the app.</div>', '')
s = once(s, '<header class="top">', '<style>.topmore{position:relative}.topmore>summary{list-style:none;cursor:pointer}.topmore>summary::-webkit-details-marker{display:none}.topmore:not([open]) .topmore-menu{display:none}.topmore-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:50;display:grid;gap:6px;min-width:210px;padding:10px;background:var(--card,#fff);border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 14px 40px rgba(15,23,42,.18)}.topmore-menu .btn{justify-content:flex-start;width:100%;text-align:left}</style><header class="top">')
# Claude's sharing review must check every image or video the page can show, and it cannot check files hosted on
# other sites. Old snapshot data in the page holds such links (Metricool CDN covers, YouTube and Pinterest thumbnails),
# so external photo and video URLs are removed from the built page. Links to posts and web pages stay.
import re as _re
_media = _re.compile(r"https?://[^\s\"'<>()\\]+?\.(?:jpe?g|png|gif|webp|avif|heic|bmp|svg|mp4|mov|m4v|webm|mp3|wav|m4a)(?:\?[^\s\"'<>()\\]*)?(?=[\s\"'<>()\\,]|$)", _re.I)
_n = len(_media.findall(s)); s = _media.sub('', s)
_left = [u for u in _re.findall(r"https?://(?:i\.ytimg\.com|i\.pinimg\.com|static\.metricool\.com|metricool-download)[^\s\"'<>]*", s)]
assert not _left, _left[:5]
print('external media links removed:', _n)
(OUT / 'RSH Sports Marketing OS.html').write_text(s, encoding='utf-8')
print('built', len(s), 'bytes; bundled media:', len(bundled), '; weekly packs:', len(packs))

