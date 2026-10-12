// Run: make e2e. The assistant (src/ai.js) in the real app, in headless Chromium. Gemini Live is a scripted fake WebSocket:
// a typed question gets the tool call the test sets in window.__next, and a tool answer gets a short reply. No network, no key.
const { chromium } = require('playwright');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');
const APP = path.join(__dirname, '..', 'src');

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8766', '-d', APP], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      // Kirana this month (₹500 + ₹300) and last month (₹999), no sheet connected: entries stay on the phone.
      if (!localStorage.getItem('fm.rows')) {
        const now = new Date(), e = (ms, type, category, amount, note) => ({ id: crypto.randomUUID(), dateTime: new Date(ms).toISOString(), type, category, amount, note, createdAt: new Date().toISOString() });
        localStorage.setItem('fm.cats', JSON.stringify({ Income: ['Salary', 'Business', 'Others'], Expense: ['Rent', 'Kirana', 'Milk', 'Bills', 'Others'] }));
        localStorage.setItem('fm.rows', JSON.stringify([e(Date.now() - 6e4, 'Expense', 'Kirana', 500, 'Kirana'), e(Date.now() - 12e4, 'Expense', 'Kirana', 300, 'Atta'),
          e(new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime(), 'Expense', 'Kirana', 999, 'Kirana')]));
      }
      window.__sent = []; window.__urls = []; window.__next = null;
      window.WebSocket = function (url) {
        const s = this, reply = o => setTimeout(() => s.onmessage && s.onmessage({ data: JSON.stringify(o) }), 5);
        __urls.push(url);
        s.readyState = 0;
        setTimeout(() => { s.readyState = 1; if (s.onopen) s.onopen(); }, 5);
        s.send = raw => {
          const m = JSON.parse(raw);
          __sent.push(m);
          if (m.setup) reply({ setupComplete: {} });
          else if (m.realtimeInput && m.realtimeInput.text && __next) { const c = __next; __next = null; reply({ toolCall: { functionCalls: [{ id: 'c' + __sent.length, name: c.name, args: c.args }] } }); }
          else if (m.toolResponse) { reply({ serverContent: { outputTranscription: { text: 'Done.' } } }); reply({ serverContent: { turnComplete: true } }); }
        };
        s.close = () => { s.readyState = 3; if (s.onclose) s.onclose({ code: 1000, reason: '' }); };
      };
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // What the app sent back for the last tool call
    let answers = 0;
    const lastAnswer = () => page.waitForFunction(n => { const r = __sent.filter(m => m.toolResponse); return r.length >= n && r[n - 1].toolResponse.functionResponses[0]; }, ++answers).then(h => h.jsonValue());
    const say = async (text, call) => { await page.evaluate(c => { window.__next = c; }, call); await page.fill('#aiText', text); await page.press('#aiText', 'Enter'); };
    const setKey = async k => { await page.click('#setBtn'); await page.fill('#aiKey', k); await page.locator('#aiKey').evaluate(e => e.blur()); await page.click('#backHome'); };

    await page.goto('http://localhost:8766/');
    await page.waitForSelector('#home:not([hidden])');
    assert.ok(await page.locator('#aiBtn').isHidden(), 'no key: no assistant');

    // A key in Settings turns it on
    await setKey('test-key');
    await page.waitForSelector('#aiBtn:not([hidden])');
    await page.click('#aiBtn');
    await page.waitForSelector('#ai[open]');
    const setup = (await page.waitForFunction(() => __sent.find(m => m.setup)).then(h => h.jsonValue())).setup;
    assert.strictEqual(setup.model, 'models/gemini-3.8-live');
    assert.deepStrictEqual(setup.tools[0].functionDeclarations.map(d => d.name), ['add_entry', 'add_bill', 'add_loan', 'query_entries', 'overview']);
    assert.ok((await page.evaluate(() => __urls[0])).endsWith('?key=test-key'));
    await page.waitForFunction(() => document.querySelector('#aiBig').textContent.trim() === 'How can I help you today?');

    // "got my salary 30k today": a confirm card, saved by the user's tap through the app's own queue
    await say('got my salary 30k today', { name: 'add_entry', args: { type: 'Income', category: 'salary', amount: 30000, note: 'October salary' } });
    await page.waitForSelector('.ai-card.ai-on #aiSave');
    assert.strictEqual(await page.textContent('#aiAsk'), 'got my salary 30k today');
    assert.strictEqual(await page.textContent('.ai-cat[aria-pressed=true]'), 'Salary');
    assert.strictEqual(await page.inputValue('#aiAmt'), '30,000');
    assert.strictEqual(await page.textContent('#aiSave'), 'Save ₹30,000');
    await page.click('#aiSave');
    const saved = await lastAnswer();
    assert.strictEqual(saved.response.saved, true);
    assert.strictEqual(saved.response.final.amount, 30000);
    assert.strictEqual(await page.evaluate(() => view().rows.filter(e => e.category === 'Salary' && e.amount === 30000 && e.note === 'October salary').length), 1);
    await page.waitForSelector('.ai-card:not(.ai-on)');

    // "kirana this month?": the card's numbers are the app's own totals
    const from = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; });
    await say('kirana this month?', { name: 'query_entries', args: { category: 'kirana', from } });
    const q = await lastAnswer();
    assert.strictEqual(q.response.expense, 800);
    assert.strictEqual(q.response.count, 2);
    await page.waitForSelector('.ai-card.ai-on .ai-tile b');
    assert.strictEqual(await page.textContent('.ai-tile b'), '₹800');
    assert.ok((await page.textContent('.ai-h')).startsWith('Kirana'));
    await page.keyboard.press('Escape'); // closes the card, not the assistant
    await page.waitForSelector('.ai-card:not(.ai-on)');
    assert.ok(await page.evaluate(() => $('#ai').open));

    // A loan card that is cancelled saves nothing, and says so
    await say('gave ramesh 5000 at 2 percent', { name: 'add_loan', args: { dir: 'given', reason: 'Ramesh', amount: 5000, interest: 2, per: 'month' } });
    await page.waitForSelector('.ai-card.ai-on #aiCancel');
    assert.ok((await page.textContent('.ai-what')).includes('Ramesh'));
    await page.click('#aiCancel');
    assert.strictEqual((await lastAnswer()).response.saved, false);
    assert.strictEqual(await page.evaluate(() => view().loans.length), 0);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !$('#ai').open);
    assert.ok((await page.textContent('#recent')).includes('October salary'), 'the saved entry shows on Home');

    // No key: no assistant
    await setKey('');
    await page.waitForSelector('#aiBtn[hidden]', { state: 'attached' });
    assert.deepStrictEqual(errors, []);
    console.log('assistant tests passed');
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
