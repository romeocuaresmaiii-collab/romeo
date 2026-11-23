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
         f'<strong>ARTIFACT EDITION · V{version} · BUILD 46</strong><div class="small">Your workspace and uploaded media are saved automatically to this artifact’s private storage. Approvals are local records, not authenticated. No Metricool sync or publishing.</div>')
s = once(s, "'Use python3 server.py in the extracted v%s folder, then open http://127.0.0.1:8765. Buttons and media uploads require the local server.'" % version, "'Open this page from your Claude artifacts.'")

for old, new in (('Local editorial plans are separate from the read-only Metricool monthly archive.', 'Team plans, with what is scheduled and published in Metricool.'), ('Metricool connected to ChatGPT only', 'Live results from Metricool'), ('Local workspace · demo/pilot', 'RSH Sports workspace')):
    assert old in s, old
    s = s.replace(old, new)

# Live results panel (artifact edition only) loads before the host layer starts the app.
assert s.count('<script>\n' + shim) == 1
s = s.replace('<script>\n' + shim, '<script>\n' + live + '\n</script>\n<script>\n' + score + '\n</script>\n<script>\n' + camp + '\n</script>\n<script>\n' + exper + '\n</script>\n<script>\n' + signoff + '\n</script>\n<script>\n' + cal + '\n</script>\n<script>\n' + homejs + '\n</script>\n<script>\n' + tracker + '\n</script>\n<script>\n' + bots + '\n</script>\n<script>\n' + shim)

# Claude's sharing review accepts only JPEG, PNG, GIF or WebP images (MP4/WebM video, MP3/WAV audio).
# A version with anything else cannot be opened by invited people, so fail the build instead.
assert '<svg' not in s.lower() and 'image/svg' not in s.lower(), 'SVG is not allowed in the artifact page'
(OUT / 'RSH Sports Marketing OS.html').write_text(s, encoding='utf-8')
print('built', len(s), 'bytes; bundled media:', len(bundled), '; weekly packs:', len(packs))
