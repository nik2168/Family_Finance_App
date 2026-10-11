// Run: make e2e. Checks that a new deploy reaches an installed app on its next open, and that it still opens offline.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
// Works on a throwaway copy of src/ so the real files are never edited.
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'family-money-'));
fs.cpSync(path.join(__dirname, '..', 'src'), DIR, { recursive: true });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8766', '-d', DIR], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('http://localhost:8766/');
    await page.waitForFunction(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.strictEqual(await page.textContent('.pick small'), 'Income');

    // "Deploy" a change.
    const f = DIR + '/index.html';
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<small>Income</small>', '<small>Income v2</small>'));

    await page.reload();                       // served from cache, refresh happens in background
    assert.strictEqual(await page.textContent('.pick small'), 'Income');
    await page.waitForTimeout(1000);
    await page.reload();                       // next open shows the new deploy
    assert.strictEqual(await page.textContent('.pick small'), 'Income v2');

    await ctx.setOffline(true);                // still opens offline, with the new version
    await page.reload();
    assert.strictEqual(await page.textContent('.pick small'), 'Income v2');
    assert.ok(await page.isVisible('.pick'));
    console.log('Update test passed');
  } finally { await browser.close(); srv.kill(); fs.rmSync(DIR, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
