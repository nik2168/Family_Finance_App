// Run: make e2e. Drives the real app in headless Chromium. The "Google Sheet" behind it is the real
// apps-script/Code.gs running on a fake sheet (tests/fake-sheet.js). Set SHOTS=dir to also save screenshots.
const { chromium } = require('playwright');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');
const APP = path.join(__dirname, '..', 'src');
const SHOTS = process.env.SHOTS;
const shot = (page, name, full) => SHOTS ? page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }) : null;
const SCRIPT = 'https://script.google.com/macros/s/TEST123/exec';

(async () => {
  const { createBackend } = require('./fake-sheet.js'), backend = createBackend();
  backend.props.CATS = JSON.stringify(backend.ctx.CATEGORIES); // the family sheet; a new one (backend2) starts with only Others
  backend.ctx.setup();
  backend.props.KEY = 'k1';
  const sheet = () => JSON.parse(JSON.stringify(backend.ctx.loadAll(backend.ss), (k, v) => k === "ss" ? undefined : v)); // what the sheet holds, read like Code.gs

  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', APP], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    let online = true, oldScript = false;
    await ctx.route(SCRIPT, route => {
      if (!online) return route.abort('internetdisconnected');
      // oldScript: what a deployment from before History/Loans replies (ignores ops, no loans)
      const reply = oldScript ? { rows: [], othersLimit: 3000, done: [], rejected: [] } : backend.doPost(route.request().postData());
      route.fulfill({ json: reply, headers: { 'access-control-allow-origin': '*' } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
    let answer = '';
    page.on('dialog', d => d.accept(answer)); // "Delete this …?" confirmations; prompts get `answer`
    const goOffline = async () => { online = false; await ctx.setOffline(true); };
    const synced = () => page.waitForFunction(() => document.querySelector('#syncPill').textContent.includes('Synced'));
    const goOnline = async () => { online = true; await ctx.setOffline(false); await synced(); };
    // History has no tab of its own: it opens from the clock button next to "Latest" on Home.
    const tab = async name => {
      if (name === 'invested') { await page.click('.nav [data-tab="given"]'); return page.click('#givenSeg [data-tab="invested"]'); } // inside the Given tab
      if (name !== 'history') return page.click(`.nav [data-tab="${name}"]`);
      await page.click('.nav [data-tab="home"]');
      await page.click('#openHistory');
    };
    // The amount is a normal field (the phone's own number pad): type at the end of it, or empty it
    const keypad = async digits => { await page.focus('#amount'); await page.keyboard.press('End'); await page.keyboard.type(digits); };
    const clearAmount = () => page.fill('#amount', '');
    const focused = () => page.evaluate(() => document.activeElement.id);
    const closed = () => page.waitForSelector('#sheet', { state: 'hidden' });
    // Home's Income / Expenses button opens the sheet with the category dropdown already open
    const pick = async (type, cat) => { await page.click(`[data-new="${type}"]`); await page.click(`#catList [data-cat="${cat}"]`); };

    await page.goto(`http://localhost:8765/#setup=${SCRIPT}|k1`);
    await page.waitForSelector('#syncPill:has-text("Synced")');
    assert.strictEqual(new URL(page.url()).hash, '');
    await page.waitForFunction(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    // ---- Offline: the app, font and 3D images all load from the phone
    await goOffline();
    await page.reload();
    await page.waitForSelector('[data-new="Income"]');
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.fonts.check('600 16px Lexend')), 'Lexend loaded offline');
    assert.deepStrictEqual(await page.evaluate(() => [...document.images].filter(i => i.offsetParent && !i.naturalWidth).map(i => i.src)), []);

    // The reason is required
    // Compact Saved card: was 250px tall, now at least 34% shorter
    assert.ok((await page.locator('#home .hero').boundingBox()).height <= 165, 'Saved card is compact');
    // A category must be chosen; the dropdown closes on a pick, an outside tap, or Esc (without closing the sheet)
    await page.click('[data-new="Expense"]');
    assert.ok(await page.isVisible('#catList'));
    assert.deepStrictEqual(await page.$$eval('#catList .opt', b => b.map(x => x.textContent)), ['House', 'Dairy', 'Crops', 'Others']);
    await page.click('#sheetTitle');
    assert.ok(await page.isHidden('#catList'), 'outside tap closes it');
    await keypad('500');
    await page.fill('#note', 'Ration');
    await page.click('#saveBtn');
    assert.strictEqual(await page.textContent('#err'), 'Choose a category');
    assert.ok(await page.isVisible('#catList'), 'reopens to choose');
    await page.keyboard.press('Escape');
    assert.ok(await page.isHidden('#catList'));
    assert.ok(await page.isVisible('#sheet'), 'Esc closed only the dropdown');
    await page.click('#catBtn');
    await page.click('#catList [data-cat="House"]');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'House');
    assert.strictEqual(await page.textContent('#catBtn'), 'House');
    await page.fill('#note', '');
    await page.click('#saveBtn');
    assert.match(await page.textContent('#err'), /Write what it was for/);
    await page.click('#cancel');

    async function add(type, cat, amount, note) {
      await pick(type, cat);
      await keypad(amount);
      await page.fill('#note', note);
      await page.click('#saveBtn');
      await closed();
    }
    await add('Income', 'Dairy', '12000', 'Milk payment');
    await add('Expense', 'House', '1250', 'Ration');
    await add('Expense', 'Others', '3500', 'Wedding gift');
    await add('Expense', 'Dairy', '2400.5', 'Cattle feed');
    await add('Income', 'Others', '1500', 'Sold old bicycle');

    // Quick amounts and recent-reason chips
    await pick('Expense', 'Dairy');
    assert.strictEqual(await page.textContent('#noteChips'), 'Cattle feed');
    assert.strictEqual(await focused(), 'amount', 'the number pad opens once a category is picked');
    await page.keyboard.type('12a.3456');
    assert.strictEqual(await page.inputValue('#amount'), '12.34', 'only a valid amount can be typed');
    await page.keyboard.press('Enter');
    assert.strictEqual(await focused(), 'note', '"Next" goes on to the reason');
    await clearAmount();
    await page.click('#noteChips .chip');
    assert.strictEqual(await page.inputValue('#note'), 'Cattle feed');
    await page.click('#quick [data-add="500"]');
    await page.click('#quick [data-add="1000"]');
    await page.focus('#amount'); await page.keyboard.press('End'); await page.keyboard.press('Backspace');
    assert.strictEqual(await page.textContent('#saveText'), 'Save ₹150');
    await shot(page, '01-add-sheet');
    await page.click('#cancel');
    assert.match(await page.textContent('#syncPill'), /5 waiting to sync/);
    assert.strictEqual(await page.textContent('#heroSaved'), '₹6,349.5');
    assert.deepStrictEqual([await page.textContent('#heroIn'), await page.textContent('#heroOut'), await page.textContent('#heroPie .mid')], ['₹13,500', '₹7,150.5', '47%saved']);
    assert.strictEqual(await page.locator('#recent .lrow').count(), 3, 'Home shows the latest 3');
    await shot(page, '02-home-offline', true);

    // ---- History, still offline: edit amount + category, then delete
    await tab('history');
    assert.strictEqual(await page.textContent('#headTitle'), 'History');
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 5);
    await page.click('#historyList .lrow:has-text("Ration")');
    assert.strictEqual(await page.textContent('#catBtn'), 'House');
    assert.ok(await page.isVisible('#deleteBtn'));
    assert.strictEqual(await page.inputValue('#amount'), '1250');
    assert.notStrictEqual(await focused(), 'amount', 'editing keeps the keyboard down');
    assert.strictEqual(await page.inputValue('#note'), 'Ration');
    await clearAmount();
    await keypad('1500');
    await page.click('#catBtn');
    assert.strictEqual(await page.locator('#catList .opt').count(), 8, 'editing can switch between income and expenses');
    await page.click('#catList [data-cat-type="Expense"][data-cat="Crops"]');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'Crops');
    await shot(page, '03-edit-sheet');
    await page.click('#saveBtn');
    await closed();
    assert.match(await page.textContent('#historyList'), /Ration.*Crops/);
    await page.click('#historyList .lrow:has-text("Wedding gift")');
    await page.click('#deleteBtn');
    await closed();
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 4);
    assert.match(await page.textContent('#syncPill'), /7 waiting to sync/);
    await shot(page, '04-history', true);

    // ---- Loans, still offline: add, pay back part, too-much is refused, delete a repayment
    await tab('loans');
    await page.click('#addLoan');
    assert.strictEqual(await focused(), 'amount', 'the number pad opens straight away for a new loan');
    await keypad('20000');
    await page.click('#saveBtn');
    assert.match(await page.textContent('#err'), /borrowed from/);
    await page.fill('#note', 'From Ramesh, tractor repair');
    // Interest: quick pick or typed, per month or per year
    assert.ok(await page.isVisible('#loanOpts'));
    assert.strictEqual(await page.getAttribute('[data-prio="medium"]', 'aria-pressed'), 'true', 'medium by default');
    await page.click('[data-prio="high"]');
    await page.click('#rateChips [data-rate="2"]');
    assert.strictEqual(await page.inputValue('#rate'), '2');
    await page.click('[data-per="year"]');
    await page.click('[data-per="month"]');
    assert.strictEqual(await page.getAttribute('[data-per="month"]', 'aria-pressed'), 'true');
    await shot(page, '05a-loan-sheet');
    await page.click('#saveBtn');
    await closed();
    assert.strictEqual(await page.textContent('#loanOwed'), '₹20,000');
    await page.click('[data-pay]');
    assert.match(await page.textContent('#quick'), /Full ₹20,000/);
    await keypad('25000');
    await page.click('#saveBtn');
    assert.match(await page.textContent('#err'), /more than the ₹20,000 still owed/);
    await clearAmount();
    await keypad('5000');
    await shot(page, '05-repay-sheet');
    await page.click('#saveBtn');
    await closed();
    await page.click('[data-pay]');
    await keypad('1000');
    await page.click('#saveBtn');
    await closed();
    assert.strictEqual(await page.textContent('#loanOwed'), '₹14,000');
    assert.match(await page.textContent('#loanList'), /₹14,000 owed/);
    await page.click('#loanList summary');
    await page.click('[data-del-repay] >> nth=0');
    assert.strictEqual(await page.textContent('#loanOwed'), '₹15,000');
    assert.match(await page.textContent('#loanList'), /2% interest per month, about ₹300 a month now/);
    assert.match(await page.textContent('#loanList .prio-tag'), /High priority/);
    assert.strictEqual(await page.textContent('#loanInt'), '≈ ₹300');
    await shot(page, '06-loans', true);

    // ---- Back online: everything reaches the sheet exactly once
    await goOnline();
    const entries = sheet().rows.map(e => [e.category, e.amount, e.note]);
    assert.deepStrictEqual(entries.sort(), [['Crops', 1500, 'Ration'], ['Dairy', 12000, 'Milk payment'], ['Dairy', 2400.5, 'Cattle feed'], ['Others', 1500, 'Sold old bicycle']]);
    assert.deepStrictEqual(sheet().loans.map(l => [l.reason, l.amount, l.interest, l.per, l.priority]), [['From Ramesh, tractor repair', 20000, 2, 'month', 'high']]);
    assert.deepStrictEqual(sheet().repays.map(p => p.amount), [5000]);
    assert.strictEqual(await page.textContent('#loanOwed'), '₹15,000');

    // ---- Insights: totals and the separate Loans card
    await tab('insights');
    assert.strictEqual(await page.textContent('#sIn'), '₹13,500');
    assert.strictEqual(await page.textContent('#sOut'), '₹3,900.5');
    assert.strictEqual(await page.textContent('#sSave'), '₹9,599.5');
    // Where income went: % of income per expense category, and what was saved
    assert.deepStrictEqual(await page.$$eval('#split .slice', b => b.map(x => x.textContent)), ['Dairy₹2,400.5 18%', 'Crops₹1,500 11%', 'Saved₹9,599.5 71%']);
    assert.strictEqual(await page.textContent('#pie .mid'), '71%saved');
    await page.click('#split [data-slice="Dairy"]');
    assert.strictEqual(await page.textContent('#pie .mid'), '18%Dairy');
    assert.ok(await page.isHidden('#pieOver'));
    assert.match(await page.textContent('#insLoans'), /We owe.*borrowed ₹20,000, repaid ₹5,000.*₹15,000/);
    // Money forecast: no complete past months yet, so nothing is being saved and the 2% loan can't be paid off
    assert.match(await page.textContent('#insForecast'), /won't be paid off.*Nothing was saved.*Interest adds about ₹300 a month/);
    await page.click('[data-fc="6"]');
    assert.strictEqual(await page.getAttribute('[data-fc="6"]', 'aria-pressed'), 'true');
    assert.match(await page.textContent('#insForecast'), /average of Apr–Sep/);
    await page.click('[data-fc="3"]');
    await page.click('#cols .col >> nth=1');
    assert.match(await page.textContent('#cols .ttip'), /Income ₹13,500/);
    await shot(page, '07-insights', true);
    await page.click('.seg [data-view="year"]');
    await page.click('#prev');
    assert.match(await page.textContent('#insLoans'), /We owe.*borrowed ₹0, repaid ₹0.*₹15,000/, 'still owed is all-time; last year borrowed and repaid nothing');
    await page.click('.seg [data-view="month"]');

    // ---- Dark mode screenshots
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, '08-insights-dark', true);
    await tab('home');
    await shot(page, '08b-home-dark', true);
    await tab('loans');
    await shot(page, '09-loans-dark', true);
    await tab('history');
    await page.click('#historyList .lrow >> nth=0');
    await shot(page, '10-edit-dark');
    await page.click('#cancel');
    await page.emulateMedia({ colorScheme: 'light' });

    // ---- History shows only the newest 20; rows typed into the sheet are editable
    for (let i = 0; i < 25; i++) backend.typeRow(2026, 8, [new Date(Date.UTC(2026, 8, 1 + i, 6)), 'House', '', 10 + i, 'Old ' + i]); // typed into September
    await page.click('#syncBtn');
    await synced();
    await tab('history');
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 29, 'every entry is listed');
    assert.strictEqual(await page.locator('#historyList .lrow.tap').count(), 20, 'only the newest 20 can be changed');
    assert.strictEqual(await page.locator('#historyList .lrow:not(.tap):has-text("Old 0")').count(), 1);
    assert.match(await page.textContent('#hFoot'), /newest 20.*Google Sheet/);
    await page.click('#historyList .lrow:has-text("Old 24")');
    await clearAmount();
    await keypad('99');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.ok(backend.month(2026, 8).some(r => r[4] === 'Old 24' && r[3] === 99 && r[5]), 'hand-typed row got an Id and was updated');

    // ---- History filters: search, year, month and category dropdowns, with totals for what matches
    const fpick = async (btn, val) => { await page.click(btn); await page.click(`${btn} + .ddlist [data-v="${val}"]`); };
    const hcount = () => page.locator('#historyList .lrow').count();
    await page.fill('#q', 'old 2');
    assert.strictEqual(await hcount(), 6, 'Old 2 and Old 20-24');
    await page.click('#qClear');
    assert.strictEqual(await hcount(), 29);
    await fpick('#fYear', '2026');
    await fpick('#fMonth', '8'); // September
    assert.strictEqual(await page.textContent('#fMonth'), 'Sep');
    await fpick('#fCat', 'Expense-House');
    assert.strictEqual(await hcount(), 25);
    assert.strictEqual(await page.textContent('#hSum'), '25 entries · −₹615', 'sum of 10…34, with Old 24 changed to 99');
    await page.click('#fCat');
    assert.ok(await page.isVisible('#ddCat'));
    await shot(page, '11-history-filters');
    await page.keyboard.press('Escape');
    assert.ok(await page.isHidden('#ddCat'), 'Esc closes the filter list');
    await fpick('#fCat', 'Income-Dairy');
    assert.match(await page.textContent('#historyList'), /No matches/);
    await page.click('#hClear');
    assert.strictEqual(await hcount(), 29);
    assert.ok(await page.isHidden('#hClear'));

    // ---- An outdated Apps Script deployment is named, not left as "waiting"
    oldScript = true;
    await tab('home');
    await add('Income', 'Job', '100', 'Old script check');
    await page.waitForSelector('#syncPill:has-text("Update Apps Script to sync")');
    oldScript = false;
    await page.click('#syncBtn');
    await synced();
    assert.ok(sheet().rows.some(e => e.note === 'Old script check'), 'synced once the script is updated');

    // ---- Wrong key shows setup; pasting the link fixes it
    await page.evaluate(s => localStorage.setItem('fm.cfg', JSON.stringify({ url: s, key: 'bad' })), SCRIPT);
    await page.reload();
    await page.waitForSelector('#syncPill:has-text("Setup needed")');
    assert.ok(await page.isVisible('#setup'));
    await page.fill('#setupLink', `https://x.vercel.app/#setup=${SCRIPT}|k1`);
    await page.click('#setupForm button[type=submit]');
    await page.waitForSelector('#syncPill:has-text("Synced")');

    // ---- Phones on the old version had fm.pending; it is moved into the new queue
    await page.evaluate(() => localStorage.setItem('fm.pending', JSON.stringify([{ id: 'legacy-0001', dateTime: new Date().toISOString(), type: 'Income', category: 'Job', amount: 777, note: 'Old phone', createdAt: new Date().toISOString() }])));
    await page.reload();
    await page.waitForSelector('#syncPill:has-text("Synced")');
    assert.ok(sheet().rows.some(e => e.id === 'legacy-0001'));
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('fm.pending')), null);

    // ---- Navigation: Home, Loans, Given, Insights; History opens from Home and goes back to it
    assert.deepStrictEqual(await page.$$eval('.nav button', b => b.filter(x => x.offsetParent).map(x => x.textContent.trim())), ['Home', 'Loans', 'Given', 'Insights']);
    await tab('history');
    assert.strictEqual(await page.textContent('#headTitle'), 'History');
    assert.strictEqual(await page.getAttribute('.nav [data-tab="home"]', 'aria-current'), 'page', 'Home stays lit while in History');
    await page.click('#backHome');
    assert.ok(await page.isVisible('#recent'));

    // ---- Money given to others: interest, priority, part received back; never part of income or expenses
    await tab('insights');
    const before = [await page.textContent('#sIn'), await page.textContent('#sOut')];
    await tab('given');
    assert.strictEqual(await page.textContent('#headTitle'), 'Money given');
    assert.match(await page.textContent('#loanList'), /Nothing given/);
    await page.click('#addLoan');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'Give money');
    await keypad('10000');
    await page.click('#saveBtn');
    assert.match(await page.textContent('#err'), /who you gave it to/);
    await page.fill('#note', 'To Raju, for his shop');
    await page.click('#rateChips [data-rate="2"]');
    await page.click('[data-prio="high"]');
    await page.click('#saveBtn');
    await closed();
    await page.click('[data-pay]');
    assert.match(await page.textContent('#sheetKind'), /Got back, ₹10,000 to get/);
    await keypad('4000');
    await shot(page, '12-given-receive');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.strictEqual(await page.textContent('#loanLeftLabel'), 'Still to get back');
    assert.strictEqual(await page.textContent('#loanOwed'), '₹6,000');
    assert.match(await page.textContent('#loanList'), /High priority.*To Raju.*₹6,000 to get.*about ₹120 a month now.*Got back ₹4,000 of ₹10,000/);
    await shot(page, '13-given', true);
    const given = sheet().loans.find(l => l.dir === 'given');
    assert.deepStrictEqual([given.reason, given.amount, given.interest, given.priority], ['To Raju, for his shop', 10000, 2, 'high']);
    assert.ok(sheet().repays.some(p => p.loanId === given.id && p.amount === 4000));
    await tab('loans');
    assert.strictEqual(await page.textContent('#loanOwed'), '₹15,000', 'Loans tab still shows only money borrowed');
    await tab('insights');
    assert.deepStrictEqual([await page.textContent('#sIn'), await page.textContent('#sOut')], before, 'money given is not income or expense');
    assert.match(await page.textContent('#insLoans'), /Others owe us.*₹6,000/);
    await shot(page, '14-insights-loans');

    // ---- Investments: a liquid fund at an expected 7% a year, compounding; the forecast counts its growth and the interest on money given
    await tab('invested');
    assert.strictEqual(await page.textContent('#headTitle'), 'Investments');
    assert.deepStrictEqual([await page.getAttribute('.nav [data-tab="given"]', 'aria-current'), await page.getAttribute('#givenSeg [data-tab="invested"]', 'aria-pressed')], ['page', 'true'], 'Invested lives in the Given tab');
    await page.click('#addLoan');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'New investment');
    assert.ok(await page.isHidden('#prioBox') && await page.isVisible('#compBox'), 'growth type instead of priority');
    assert.deepStrictEqual([await page.getAttribute('[data-comp="compound"]', 'aria-pressed'), await page.getAttribute('[data-per="year"]', 'aria-pressed')], ['true', 'true']);
    await keypad('50000');
    await page.fill('#note', 'HDFC Liquid Fund');
    await page.click('#rateChips [data-rate="7"]');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.match(await page.textContent('#loanList'), /HDFC Liquid Fund.*₹50,000 now.*7% a year expected, compound, about ₹283 a month now/);
    const fund = sheet().loans.find(l => l.dir === 'invested');
    assert.deepStrictEqual([fund.reason, fund.amount, fund.interest, fund.per, fund.compound], ['HDFC Liquid Fund', 50000, 7, 'year', true]);
    await shot(page, '14b-invested');
    await tab('insights');
    assert.match(await page.textContent('#insForecast'), /₹120 a month interest from money given, \+ about ₹283 a month growth on investments/);
    assert.match(await page.textContent('#insLoans'), /Loans & investments.*Investments, worth about.*₹50,000/);
    await page.click('.nav [data-tab="given"]');
    assert.strictEqual(await page.textContent('#headTitle'), 'Investments', 'Given reopens on the side last used');
    await page.click('.nav [data-tab="loans"]');
    assert.ok(await page.isHidden('#givenSeg'), 'no Lent / Invested switch on Loans');

    // ---- Apps Script takes 500 changes per request: 600 waiting all sync without a tap
    await goOffline();
    await page.evaluate(() => {
      const ops = [];
      for (let i = 0; i < 600; i++) {
        const id = 'many-' + String(i).padStart(4, '0'), dateTime = new Date(Date.now() - i * 60000).toISOString();
        ops.push({ opId: id, kind: 'entry', action: 'add', id, data: { id, dateTime, type: 'Expense', category: 'House', amount: 1, note: 'Bulk ' + i, createdAt: dateTime } });
      }
      localStorage.setItem('fm.ops', JSON.stringify(ops));
    });
    await goOnline();
    assert.strictEqual(sheet().rows.filter(e => /^Bulk /.test(e.note)).length, 600);

    // ---- Categories: add one, use it, rename it (the sheet's rows follow), delete it (entries go to Others); Others stays
    await tab('home');
    await page.click('#headTitle'); // the sheet's name opens the same list as its picture
    await page.click('#editCats');
    assert.strictEqual(await page.textContent('#headTitle'), 'Categories');
    assert.strictEqual(await page.locator('[data-cren="Others"], [data-cdel="Others"]').count(), 0, 'Others is always kept');
    answer = 'Goats';
    await page.click('[data-cadd="Expense"]');
    await synced();
    await tab('home');
    await add('Expense', 'Goats', '700', 'Goat feed');
    await synced();
    await page.click('#avatar');
    await page.click('#editCats');
    answer = 'Animals';
    await page.click('[data-cren="Goats"]');
    await synced();
    assert.match(await page.textContent('#catsList'), /Animals1 entry/);
    assert.strictEqual(sheet().rows.find(e => e.note === 'Goat feed').category, 'Animals');
    assert.ok(backend.tab(String(new Date().getFullYear())).rows[2].includes('Animals'), 'the year summary has an Animals column');
    await shot(page, '15-categories');
    await page.click('[data-cdel="Animals"]');
    await synced();
    assert.strictEqual(sheet().rows.find(e => e.note === 'Goat feed').category, 'Others');
    assert.deepStrictEqual(sheet().cats.Expense, ['House', 'Dairy', 'Crops', 'Others']);
    await page.click('#backHome');

    // ---- A second Google Sheet: its link adds "Sheet 2" with its own picture and entries; the header switches between them
    const backend2 = createBackend(), SCRIPT2 = 'https://script.google.com/macros/s/TEST456/exec';
    backend2.ctx.setup();
    backend2.props.KEY = 'k2';
    await ctx.route(SCRIPT2, route => route.fulfill({ json: backend2.doPost(route.request().postData()), headers: { 'access-control-allow-origin': '*' } }));
    await page.goto(`http://localhost:8765/#setup=${SCRIPT2}|k2`);
    await page.reload(); // a hash-only change doesn't restart the app
    await synced();
    assert.match(await page.textContent('#headTitle'), /^Sheet 2/);
    assert.strictEqual(await page.getAttribute('#avatar img', 'src'), 'assets/3d/house.png', 'a picture the first sheet does not use');
    assert.match(await page.textContent('#recent'), /No entries yet/);
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fm.cfg')).url), SCRIPT, 'the first sheet keeps its link');
    await page.click('[data-new="Income"]');
    assert.deepStrictEqual(await page.$$eval('#catList .opt', b => b.map(x => x.textContent)), ['Others'], 'a new sheet starts with only Others');
    await page.click('#cancel');
    await add('Income', 'Others', '900', 'Shop sale');
    await synced();
    assert.ok(backend2.ctx.loadAll(backend2.ss).rows.some(e => e.note === 'Shop sale') && !sheet().rows.some(e => e.note === 'Shop sale'), 'went to the second sheet only');
    await page.click('#avatar');
    answer = 'Shop';
    await page.click('[data-sren]:not([data-sren="fm."])');
    assert.match(await page.textContent('#headTitle'), /^Shop/);
    assert.match(await page.textContent('#ddSheets'), /Family Money.*Shop/);
    await shot(page, '16-sheets');
    await page.click('[data-sheet="fm."]');
    await synced();
    assert.match(await page.textContent('#headTitle'), /^Family Money/);
    assert.match(await page.textContent('#recent'), /Goat feed/);
    await page.click('#avatar');
    await page.click('[data-sdel]:not([data-sdel="fm."])');
    assert.strictEqual(await page.locator('#ddSheets [data-sheet]').count(), 1);
    assert.strictEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => /^fm\.\w{8}\./.test(k)).length), 0, 'its copy on the phone is gone');
    assert.strictEqual(await page.locator('[data-sdel]').count(), 0, 'the last sheet cannot be removed');

    // ---- Laptop: a full-height sidebar on the left edge (sheet switcher, tabs incl. History), toolbar titles, Home in two columns
    const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await wide.route(SCRIPT, route => route.fulfill({ json: backend.doPost(route.request().postData()), headers: { 'access-control-allow-origin': '*' } }));
    const desk = await wide.newPage();
    desk.on('pageerror', e => errors.push(e.message));
    await desk.goto(`http://localhost:8765/#setup=${SCRIPT}|k1`);
    await desk.waitForSelector('#headSub:has-text("Synced")'); // the toolbar shows the sync state on a wide screen
    const box = s => desk.locator(s).boundingBox();
    const [side, main, colA, colB] = await Promise.all(['.navwrap', 'main', '#home .colA', '#home .colB'].map(box));
    assert.ok(side.x === 0 && side.y === 0 && side.height === 800 && side.x + side.width <= main.x, 'sidebar: left edge, full height');
    assert.ok(colA.x + colA.width <= colB.x && Math.abs(colA.y - colB.y) < 2, 'Home side by side');
    assert.strictEqual(await desk.textContent('#sideName'), 'Family Money');
    assert.ok(await desk.isHidden('#avatar'), 'the sheet switcher lives in the sidebar');
    assert.strictEqual(await desk.textContent('#headTitle'), 'Home');
    await desk.click('#sideSheet');
    assert.ok(await desk.isVisible('.side-sheet #ddSheets [data-sheet="fm."]'), 'the sheets list opens under the sidebar switcher');
    await desk.keyboard.press('Escape');
    await desk.click('.nav [data-tab="history"]');
    assert.strictEqual(await desk.getAttribute('.nav [data-tab="history"]', 'aria-current'), 'page');
    assert.ok(await desk.isHidden('#backHome'), 'History is a tab here, no back button');
    if (SHOTS) await desk.screenshot({ path: path.join(SHOTS, '17-desktop.png') });
    // iPad portrait: still the sidebar, pages in one column
    await desk.setViewportSize({ width: 820, height: 1180 });
    await desk.click('.nav [data-tab="home"]');
    const [hero, latest] = await Promise.all(['#home .hero', '#recent'].map(box));
    assert.ok(await desk.isVisible('#sideSheet') && latest.y > hero.y + hero.height && latest.x === hero.x, 'tablet: sidebar, Home in one column');
    await wide.close();

    assert.deepStrictEqual(errors, []);
    console.log('E2E passed');
  } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
