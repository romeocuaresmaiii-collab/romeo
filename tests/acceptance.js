#!/usr/bin/env node
/* RSH Sports Marketing OS — automated acceptance checks.
 *
 * Starts its OWN server on a spare port with a throw-away data folder, so it never
 * touches a real workspace, Data Vault or media. Nothing is published or sent anywhere.
 *
 *   node tests/acceptance.js [path/to/RSH_Sports_Complete_Backup.zip]
 *
 * The backup ZIP is optional (it holds confidential campaign data and is not stored in
 * this project). Without it, restore-dependent checks are reported as SKIPPED.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const BACKUP = process.argv[2] || process.env.RSH_TEST_BACKUP || '';
const EXPECTED_VERSION = /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8'))[1];

const results = [];
const record = (status, name, detail) => { results.push({ status, name }); console.log(`${status.padEnd(5)} ${name}${detail ? ' — ' + detail : ''}`); };
async function check(name, fn) {
  try { const detail = await fn(); record('PASS', name, detail); }
  catch (e) { record('FAIL', name, String(e.message || e).split('\n')[0].slice(0, 300)); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function raw(method, urlPath, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsh-test-data-'));
  const server = spawn('python3', ['server.py'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RSH_PORT: String(PORT), RSH_DATA_DIR: dataDir, RSH_NO_BROWSER: '1', OPENAI_API_KEY: '' },
  });
  let serverLog = ''; server.stdout.on('data', c => serverLog += c); server.stderr.on('data', c => serverLog += c);
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { await raw('GET', '/api/app-info', { Host: `127.0.0.1:${PORT}` }); break; } catch (_) { await new Promise(r => setTimeout(r, 150)); } }

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => { window.WS = () => JSON.parse(localStorage.getItem('rsh_growth_command_v1') || '{"posts":[]}'); });
    const vaultAt = async rev => { for (let i = 0; i < 50; i++) { const st = JSON.parse((await raw('GET', '/api/vault/status', { Host: `127.0.0.1:${PORT}` })).body); if (st.latestRevision === rev) return; await page.waitForTimeout(200); } throw new Error('Data Vault never reached revision ' + rev); };
    await page.goto(BASE + '/');
    await page.waitForFunction(() => /Connected|mismatch|not verified/i.test(document.getElementById('rshBuildLabel')?.textContent || ''), null, { timeout: 10000 });

    await check('Browser build matches Python server version', async () => {
      const info = JSON.parse((await raw('GET', '/api/app-info', { Host: `127.0.0.1:${PORT}` })).body);
      const label = await page.textContent('#rshBuildLabel');
      assert(info.version === EXPECTED_VERSION, `server reports ${info.version}`);
      assert(label.includes(`v${EXPECTED_VERSION}`) && label.includes('Connected'), `header label is "${label}"`);
      return label.trim();
    });

    await check('Sidebar footer shows the same version as the header', async () => {
      const foot = await page.textContent('.sidefoot strong');
      assert(foot.toUpperCase().includes('V' + EXPECTED_VERSION), `sidebar says "${foot}"`);
    });

    await check('Official RSH logo loads in the sidebar', async () => {
      const ok = await page.evaluate(() => [...document.images].some(i => i.src.endsWith('/rsh_logo.png') && i.complete && i.naturalWidth > 0));
      assert(ok, 'rsh_logo.png did not render');
    });

    await check('No AI key: free/manual mode reported honestly', async () => {
      const st = JSON.parse((await raw('GET', '/api/status', { Host: `127.0.0.1:${PORT}` })).body);
      assert(st.aiConfigured === false, 'aiConfigured should be false without a key');
    });

    const views = await page.$$eval('[data-view]', els => [...new Set(els.map(e => e.dataset.view))].filter(v => /^[a-z]+$/.test(v)));
    await check(`Home and every navigation view open without errors (${views.length} views)`, async () => {
      const before = pageErrors.length; const hidden = [];
      for (const v of views) {
        await page.evaluate(v => document.querySelector(`[data-view="${v}"]`).click(), v);
        await page.waitForTimeout(250);
        if (!(await page.evaluate(v => { const s = document.getElementById('view-' + v); return !!s && s.offsetParent !== null; }, v))) hidden.push(v);
      }
      assert(pageErrors.length === before, 'page errors: ' + pageErrors.slice(before).join(' | '));
      assert(!hidden.length, 'views did not become visible: ' + hidden.join(', '));
    });

    await check('Server rejects requests from other origins and hosts', async () => {
      const body = JSON.stringify({ baseRevision: 0, data: {} });
      const badOrigin = await raw('POST', '/api/vault/save', { Host: `127.0.0.1:${PORT}`, Origin: 'http://evil.example', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body);
      assert(badOrigin.status === 403, `foreign Origin got ${badOrigin.status}`);
      const badHost = await raw('GET', '/api/app-info', { Host: 'evil.example' });
      assert(badHost.status === 403, `foreign Host got ${badHost.status}`);
    });

    await check('Media upload rejects a file whose bytes do not match its declared type', async () => {
      const fake = Buffer.alloc(600, 0x41);
      const r = await raw('POST', '/api/media', { Host: `127.0.0.1:${PORT}`, Origin: BASE, 'Content-Type': 'image/png', 'Content-Length': fake.length }, fake);
      assert(r.status === 400, `got ${r.status}`);
      const left = fs.existsSync(path.join(dataDir, 'campaign_media')) ? fs.readdirSync(path.join(dataDir, 'campaign_media')) : [];
      assert(left.length === 0, 'rejected upload left a file behind');
    });

    await check('A fresh workspace has no approvals and nothing published', async () => {
      const s = await page.evaluate(() => { const d = WS(); return ({ approved: d.posts.filter(p => p.status === 'Approved').length, log: (d.approvalLog || []).length }); });
      assert(s.approved === 0 && s.log === 0, JSON.stringify(s));
    });

    if (!BACKUP || !fs.existsSync(BACKUP)) {
      for (const n of ['Complete ZIP restore', 'Restored media displays in Reviews', 'Approval guards', 'Restore then save to Data Vault', 'Backup export round-trip']) record('SKIP', n, 'no backup ZIP supplied');
    } else {
      let expected;
      await check('Complete ZIP restore verifies integrity and loads every campaign', async () => {
        await page.evaluate(() => document.querySelector('[data-view="settings"]').click());
        const dl = page.waitForEvent('download').catch(() => null); // safety JSON copy of the previous workspace
        await page.setInputFiles('#backupZipImport', BACKUP);
        await dl;
        await page.waitForFunction(() => /Verified complete archive|Restore stopped/.test(document.getElementById('backupZipStatus').textContent), null, { timeout: 30000 });
        assert(/Verified complete archive/.test(await page.textContent('#backupZipStatus')), await page.textContent('#backupZipStatus'));
        const s = await page.evaluate(() => { const d = WS(); return { posts: d.posts.length, refs: d.posts.reduce((n, p) => n + (p.creativeAsset ? 1 : 0) + (p.creativeAssets || []).length, 0) }; });
        const onDisk = ['campaign_media', 'creative_assets'].reduce((n, f) => n + (fs.existsSync(path.join(dataDir, f)) ? fs.readdirSync(path.join(dataDir, f)).length : 0), 0);
        assert(s.posts > 0, 'no campaigns loaded');
        assert(onDisk > 0 || s.refs === 0, 'referenced media was not restored');
        expected = s;
        return `${s.posts} campaigns, ${onDisk} media files on disk`;
      });

      await check('Restored media displays in Reviews (real image pixels, not placeholders)', async () => {
        const id = await page.evaluate(() => (WS().posts.find(p => (p.creativeAssets || []).length) || {}).id);
        assert(id, 'backup has no campaign with attachments');
        await page.evaluate(() => document.querySelector('[data-view="approvals"]').click());
        await page.click(`[data-review-select="${id}"]`);
        await page.waitForFunction(() => { const i = document.querySelector('#reviewMediaGallery img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
        const w = await page.evaluate(() => document.querySelector('#reviewMediaGallery img').naturalWidth);
        return `image ${w}px wide`;
      });

      await check('Manager review is blocked for a campaign with no media, even with all four boxes ticked', async () => {
        const id = await page.evaluate(() => (WS().posts.find(p => p.status === 'Review' && !(p.creativeAssets || []).length && !p.creativeAsset && !(p.approvalMeta || {}).pmReviewedAt) || {}).id);
        assert(id, 'no media-less campaign in Review to test with');
        await page.click(`[data-review-select="${id}"]`);
        for (const c of ['reviewCheckAssets', 'reviewCheckFacts', 'reviewCheckRights', 'reviewCheckPlatform']) await page.check('#' + c);
        await page.click('#reviewApprove');
        const m = await page.evaluate(id => { const p = WS().posts.find(x => x.id === id); return { pm: (p.approvalMeta || {}).pmReviewedAt || null, status: p.status }; }, id);
        assert(!m.pm && m.status === 'Review', 'manager review was recorded without media: ' + JSON.stringify(m));
      });

      await check("Anthony's final decision stays locked until manager review; nothing is auto-approved", async () => {
        assert((await page.$('#reviewConfirmFinal')) === null, 'final-approval button is available before manager review');
        const approved = await page.evaluate(() => WS().posts.filter(p => p.status === 'Approved').length);
        assert(approved === 0, approved + ' campaign(s) are Approved after restore');
      });

      await check('Restored workspace can be saved to the Data Vault, and again after a second restore (history kept)', async () => {
        await page.evaluate(() => document.querySelector('[data-view="settings"]').click());
        await page.click('#vaultSave');
        await vaultAt(1);
        const dl = page.waitForEvent('download').catch(() => null);
        await page.setInputFiles('#backupZipImport', BACKUP);
        await dl;
        await page.waitForFunction(() => /NOT yet saved to the local Data Vault/.test(document.getElementById('backupZipStatus').textContent), null, { timeout: 30000 });
        await page.evaluate(() => document.querySelector('[data-view="settings"]').click());
        await page.click('#vaultSave');
        await vaultAt(2);
        const st = JSON.parse((await raw('GET', '/api/vault/status', { Host: `127.0.0.1:${PORT}` })).body);
        assert(st.latestRevision === 2 && st.revisions.length === 2, 'vault status: ' + JSON.stringify(st).slice(0, 200));
        const saved = JSON.parse((await raw('GET', '/api/vault/load', { Host: `127.0.0.1:${PORT}` })).body);
        assert(saved.data.posts.length === expected.posts, 'vault holds a different campaign count');
        return 'revisions 1 and 2 both kept';
      });

      await check('Stale browser cannot overwrite a newer Vault revision (conflict detected)', async () => {
        const body = JSON.stringify({ baseRevision: 1, data: await page.evaluate(() => WS()) });
        const r = await raw('POST', '/api/vault/save', { Host: `127.0.0.1:${PORT}`, Origin: BASE, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body);
        assert(r.status === 409, `got ${r.status}`);
      });

      await check('Complete backup export contains every attachment and restores back identically', async () => {
        const body = JSON.stringify(await page.evaluate(() => WS()));
        const h = { Host: `127.0.0.1:${PORT}`, Origin: BASE, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
        const rep = JSON.parse((await raw('POST', '/api/backup/check', h, body)).body);
        assert(rep.missing.length === 0 && rep.available === rep.referenced, 'media check: ' + JSON.stringify(rep));
        const zip = await raw('POST', '/api/backup/export', h, body);
        assert(zip.status === 200 && zip.body.slice(0, 2).toString() === 'PK', `export status ${zip.status}`);
        const back = await raw('POST', '/api/backup/restore', { Host: `127.0.0.1:${PORT}`, Origin: BASE, 'Content-Type': 'application/zip', 'Content-Length': zip.body.length }, zip.body);
        const res = JSON.parse(back.body);
        assert(back.status === 200, 'round-trip restore failed: ' + (res.error || back.status));
        assert(res.data.posts.length === expected.posts && res.attachments === rep.referenced && res.restoredMedia === 0, JSON.stringify({ posts: res.data.posts.length, attachments: res.attachments, restoredMedia: res.restoredMedia }));
        return `${rep.referenced} attachments, ${(zip.body.length / 1048576).toFixed(1)} MB`;
      });

      await check('Media endpoint supports range requests (needed for video scrubbing)', async () => {
        const files = fs.readdirSync(path.join(dataDir, 'campaign_media'));
        assert(files.length, 'no media to request');
        const r = await raw('GET', '/api/media/' + files[0].split('.')[0], { Host: `127.0.0.1:${PORT}`, Range: 'bytes=0-99' });
        assert(r.status === 206 && r.body.length === 100, `status ${r.status}, ${r.body.length} bytes`);
      });
    }

    await check('No page errors during the whole run', async () => { assert(!pageErrors.length, pageErrors.join(' | ')); });
  } finally {
    if (browser) await browser.close();
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  const n = s => results.filter(r => r.status === s).length;
  console.log(`\n${n('PASS')} passed, ${n('FAIL')} failed, ${n('SKIP')} skipped`);
  if (n('FAIL')) { console.log('\n--- server log (tail) ---\n' + serverLog.split('\n').slice(-15).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
