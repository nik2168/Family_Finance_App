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
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); // a fake mic, allowed
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
      window.__sent = []; window.__urls = []; window.__next = null; window.__gum = 0;
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = c => { __gum++; return gum(c).then(s => (window.__stream = s)); }; // counts the times the browser could ask for the mic
      window.__played = 0; // sound tones played (the sounds are made with oscillators; the voice is a buffer)
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function () { __played++; return start.apply(this, arguments); };
      window.WebSocket = function (url) {
        const s = window.__ws = this, reply = o => setTimeout(() => s.onmessage && s.onmessage({ data: JSON.stringify(o) }), 5);
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
    assert.deepStrictEqual(setup.tools[0].functionDeclarations.map(d => d.name), ['add_entry', 'add_bill', 'add_loan', 'add_entries', 'cancel', 'save_note', 'notes', 'listen', 'query_entries', 'overview']);
    assert.ok((await page.evaluate(() => __urls[0])).endsWith('?key=test-key'));
    await page.waitForFunction(() => document.querySelector('#aiBig').textContent.trim() === 'How can I help you today?');
    // Voice first: the mic is on as it opens, with a sound; tapping the text box stops it
    await page.waitForSelector('.ai-pill.ai-live');
    await page.waitForFunction(() => __played >= 1); // the listening chime
    await page.focus('#aiText');
    await page.waitForSelector('.ai-pill:not(.ai-live)');

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

    // A small question gets a small card (only the part asked for), just above the text box, which stays usable
    await say('top 3 categories?', { name: 'query_entries', args: { type: 'Expense', show: ['categories'], top: 3 } });
    await lastAnswer();
    await page.waitForSelector('.ai-card.ai-on .ai-bar');
    await page.waitForTimeout(600); // the card pops up
    assert.strictEqual(await page.locator('.ai-card .ai-tiles').count(), 0);
    assert.ok(await page.locator('.ai-card .ai-bar').count() <= 3);
    const [card, pill] = await Promise.all(['#aiCard', '#aiPill'].map(s => page.locator(s).boundingBox()));
    assert.ok(card.y + card.height <= pill.y && card.height < 400, 'a small card above the text box');
    assert.ok(await page.locator('#aiText').isVisible());
    await page.keyboard.press('Escape');
    await page.waitForSelector('.ai-card:not(.ai-on)');

    // A loan card that is cancelled saves nothing, and says so
    await say('gave ramesh 5000 at 2 percent', { name: 'add_loan', args: { dir: 'given', reason: 'Ramesh', amount: 5000, interest: 2, per: 'month' } });
    await page.waitForSelector('.ai-card.ai-on #aiCancel');
    assert.ok((await page.textContent('.ai-what')).includes('Ramesh'));
    await page.click('#aiCancel');
    assert.strictEqual((await lastAnswer()).response.saved, false);
    assert.strictEqual(await page.evaluate(() => view().loans.length), 0);

    // Several at once: amount and note per row, one Save for all
    await say('chai 20, auto 80, got 500 from Ramesh', { name: 'add_entries', args: { items: [{ type: 'Expense', category: 'kirana', amount: 20, note: 'Chai' },
      { type: 'Expense', category: 'travel', amount: 80, note: 'Auto' }, { type: 'Income', category: 'others', amount: 500, note: 'From Ramesh' }] } });
    await page.waitForSelector('.ai-card.ai-on .ai-mi');
    assert.strictEqual(await page.locator('.ai-mi').count(), 3);
    assert.strictEqual(await page.textContent('#aiSave'), 'Save all 3');
    await page.fill('.ai-mi >> nth=1 >> [data-f=amount]', '90');
    await page.click('.ai-mi >> nth=0 >> .ai-rm');
    assert.strictEqual(await page.textContent('#aiSave'), 'Save all 2');
    await page.click('#aiSave');
    const many = await lastAnswer();
    assert.deepStrictEqual(many.response.final.map(e => [e.type, e.category, e.amount, e.note]), [['Expense', 'Others', 90, 'Auto'], ['Income', 'Others', 500, 'From Ramesh']]);
    assert.strictEqual(await page.evaluate(() => view().rows.filter(e => (e.note === 'Auto' && e.amount === 90) || e.note === 'From Ramesh').length), 2);
    await page.waitForSelector('.ai-card:not(.ai-on)');

    // "Cancel", said while the card is open, closes it unsaved (the card's own call is answered too). No tool can save: only the tap.
    await say('spent 250 on milk', { name: 'add_entry', args: { type: 'Expense', category: 'milk', amount: 250, note: 'Milk' } });
    await page.waitForSelector('.ai-card.ai-on #aiSave');
    await page.evaluate(() => __ws.onmessage({ data: JSON.stringify({ toolCall: { functionCalls: [{ id: 'v1', name: 'cancel', args: {} }] } }) }));
    await page.waitForFunction(n => __sent.filter(m => m.toolResponse).length >= n, answers + 2);
    answers += 2;
    const conf = await page.evaluate(() => __sent.filter(m => m.toolResponse).map(m => m.toolResponse.functionResponses[0]).find(r => r.name === 'cancel'));
    assert.strictEqual(conf.response.saved, false);
    assert.strictEqual(await page.evaluate(() => view().rows.filter(e => e.category === 'Milk' && e.amount === 250).length), 0);
    await page.waitForSelector('.ai-card:not(.ai-on)');

    // Notes: saved at once and shown in the card; the same title adds to it and ticks by voice
    await say('note down atta and paneer for groceries', { name: 'save_note', args: { title: 'Groceries', items: ['Atta', 'Paneer'], category: 'Kirana' } });
    await page.waitForSelector('.ai-card.ai-on .nt');
    assert.deepStrictEqual(await page.$$eval('.ai-card .nti span', s => s.map(x => x.textContent)), ['Atta', 'Paneer']);
    assert.strictEqual((await lastAnswer()).response.saved, true);
    await say('add milk, paneer is done', { name: 'save_note', args: { title: 'groceries', items: ['Milk', 'atta'], done: ['paneer'] } });
    assert.deepStrictEqual((await lastAnswer()).response.note.items, [{ t: 'Atta', done: false }, { t: 'Paneer', done: true }, { t: 'Milk', done: false }]);
    await say('what is on my list?', { name: 'notes', args: {} });
    assert.strictEqual((await lastAnswer()).response.notes[0].items.length, 3);
    assert.ok(!(await page.evaluate(() => $('#aiCard').classList.contains('ai-on'))), 'a new question closed the note card');
    await page.keyboard.press('Escape'); // so this closes the assistant (by cancel, or by the browser itself: both run closeAI)
    await page.waitForFunction(() => !$('#ai').open);
    assert.ok(await page.evaluate(() => __stream.getTracks().every(t => t.readyState === 'ended')), 'closing lets go of the mic');
    const recent = await page.textContent('#recent');
    assert.ok(['From Ramesh', 'Auto'].every(t => recent.includes(t)), 'the saved entries show on Home');

    // The note stays on Home: tick the rest, then a finished list can become an expense; ✕ removes it
    assert.match(await page.textContent('#notes'), /Groceries.*Atta.*Paneer.*Milk/);
    await page.check('#notes .nti >> nth=0 >> input');
    await page.check('#notes .nti >> nth=2 >> input');
    assert.ok(await page.evaluate(() => notes()[0].items.every(i => i.done)), 'ticks are kept');
    await page.click('#notes [data-nt-act="exp"]');
    await page.waitForSelector('#sheet[open]');
    assert.strictEqual(await page.inputValue('#note'), 'Groceries');
    assert.strictEqual(await page.getAttribute('#catGrid [aria-pressed="true"]', 'data-cat'), 'Kirana');
    await page.click('#cancel');
    await page.waitForFunction(() => !$('#sheet').open);
    await page.click('#notes [data-nt-act="del"]');
    assert.strictEqual(await page.evaluate(() => notes().length), 0);
    assert.ok(await page.locator('#notes').isHidden());

    // Sounds can be turned off (Settings > Assistant, this phone only)
    await page.click('#setBtn');
    await page.uncheck('#aiSfx');
    await page.click('#backHome');
    const played = await page.evaluate(() => __played);

    // Listening: a session of its own with turn-taking off; tapping the orb ends the conversation. The mic is asked for once per opening.
    // It remembers: a new session starts with the last 10 messages (kept while the app is open)
    const setups = await page.evaluate(() => __sent.filter(m => m.setup).length);
    await page.click('#aiBtn');
    await page.waitForSelector('#ai[open]');
    const memo = (await page.waitForFunction(n => { const s = __sent.filter(m => m.setup); return s.length > n && s[s.length - 1].setup; }, setups).then(h => h.jsonValue())).systemInstruction.parts[0].text;
    assert.ok(memo.includes('User: what is on my list?'), 'the last messages go to the new session (a turn cut off by closing too)');
    assert.strictEqual(memo.split('\n').filter(l => /^(User|You): /.test(l)).length, 10, 'only the last 10');
    await say('listen to this conversation', { name: 'listen', args: {} });
    await page.waitForSelector('.ai-pill.ai-live');
    const ls = await page.evaluate(() => __sent.filter(m => m.setup).pop().setup);
    assert.strictEqual(ls.realtimeInputConfig.automaticActivityDetection.disabled, true);
    assert.deepStrictEqual(ls.tools[0].functionDeclarations.map(d => d.name), ['save_note']);
    assert.ok(await page.evaluate(() => __sent.some(m => m.realtimeInput && m.realtimeInput.activityStart)));
    await page.click('#aiOrb', { force: true }); // it swells with the voice, so it is never still
    await page.waitForFunction(() => __sent.some(m => m.realtimeInput && m.realtimeInput.activityEnd));
    await page.evaluate(() => __ws.onmessage({ data: JSON.stringify({ toolCall: { functionCalls: [{ id: 'l1', name: 'save_note', args: { title: 'Call with Ramesh', items: ['Pay him 2000 on Friday'], text: 'Ramesh lends 5000 at 2% a month.' } }] } }) }));
    await page.waitForSelector('.ai-card.ai-on .nt');
    assert.match(await page.textContent('.ai-card .nt'), /Call with Ramesh.*Ramesh lends 5000.*Pay him 2000 on Friday/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.ai-card:not(.ai-on)');
    await page.click('#aiWave'); // talk again: a normal session, the same mic
    await page.waitForSelector('.ai-pill.ai-live');
    assert.ok(!(await page.evaluate(() => __sent.filter(m => m.setup).pop().setup)).realtimeInputConfig);
    assert.strictEqual(await page.evaluate(() => __gum), 2, 'the mic is asked for once each time it opens (twice so far)');
    await page.click('#aiWave');
    await page.waitForSelector('.ai-pill:not(.ai-live)');
    assert.strictEqual(await page.evaluate(() => __played), played, 'no sounds once they are off');

    // A photo of a bill goes as a JPEG frame
    await page.setInputFiles('#aiPhoto', path.join(APP, 'assets', 'icons', 'icon-192.png'));
    await page.waitForFunction(() => __sent.some(m => m.realtimeInput && m.realtimeInput.video && m.realtimeInput.video.mimeType === 'image/jpeg'));
    await page.waitForFunction(() => $('#aiHi').textContent.trim() === 'Photo of a bill');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !$('#ai').open);

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
