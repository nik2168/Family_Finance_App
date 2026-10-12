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
const ym = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

(async () => {
  const { createBackend } = require('./fake-sheet.js'), backend = createBackend();
  backend.props.CATS = JSON.stringify(backend.ctx.CATEGORIES); // the family sheet; a new one (backend2) starts with the household list
  backend.ctx.setup();
  backend.props.KEY = 'k1';
  const sheet = () => JSON.parse(JSON.stringify(backend.ctx.loadAll(backend.ss), (k, v) => k === "ss" ? undefined : v)); // what the sheet holds, read like Code.gs
  const SET = () => JSON.parse(backend.props.SET || '{}');

  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', APP], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  var errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    let online = true, oldScript = false;
    await ctx.route(SCRIPT, route => {
      if (!online) return route.abort('internetdisconnected');
      // oldScript: what a deployment from before History/Loans replies (ignores ops, no loans, no settings)
      const reply = oldScript ? { rows: [], othersLimit: 3000, done: [], rejected: [] } : backend.doPost(route.request().postData());
      route.fulfill({ json: reply, headers: { 'access-control-allow-origin': '*' } });
    });
    var page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
    page.on('dialog', d => { errors.push('a browser dialog opened: ' + d.message()); d.dismiss(); }); // the app asks in its own sheet
    const goOffline = async () => { online = false; await ctx.setOffline(true); };
    const synced = () => page.waitForFunction(() => document.querySelector('#syncPill').textContent.includes('Synced'));
    const goOnline = async () => { online = true; await ctx.setOffline(false); await synced(); };
    // Tabs: Home, History, Insights, Money (Loans, Given, Investments inside it)
    const tab = async name => {
      if (['loans', 'given', 'invested'].includes(name)) { await page.click('.nav [data-tab="money"]'); return page.click(`#moneySeg [data-tab="${name}"]`); }
      return page.click(`.nav [data-tab="${name}"]`);
    };
    // The app's own question sheet: type the answer (if it asks for one) and confirm
    const reply = async text => { await page.waitForSelector('#ask[open]'); if (text != null) await page.fill('#askInput', text); await page.click('#askOk'); await page.waitForSelector('#ask', { state: 'hidden' }); };
    // The amount is a normal field (the phone's own number pad): type at the end of it, or empty it
    const keypad = async digits => { await page.focus('#amount'); await page.keyboard.press('End'); await page.keyboard.type(digits); };
    const clearAmount = () => page.fill('#amount', '');
    const focused = () => page.evaluate(() => document.activeElement.id);
    const closed = () => page.waitForSelector('#sheet', { state: 'hidden' });
    // Home's Expenses / Income button opens the sheet with the category grid; one tap picks
    const pick = async (type, cat) => { await page.click(`[data-new="${type}"]`); await page.click(`#catGrid [data-cat="${cat}"]`); };
    const sync = async () => { await page.click('#syncBtn'); await synced(); };

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
    assert.match(await page.textContent('#hero'), /Focus: grow savings.*Start your savings/, 'no loans, no savings yet: the starter');

    // A category must be chosen, from the grid; the reason is optional
    await page.click('[data-new="Expense"]');
    assert.deepStrictEqual(await page.$$eval('#catGrid .cg', b => b.map(x => x.textContent)), ['House', 'Dairy', 'Crops', 'Others']);
    await keypad('500');
    await page.click('#saveBtn');
    assert.strictEqual(await page.textContent('#err'), 'Choose a category');
    await page.click('#catGrid [data-cat="House"]');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'House');
    assert.strictEqual(await page.getAttribute('#catGrid [data-cat="House"]', 'aria-pressed'), 'true');
    await page.click('#typeSeg [data-type="Income"]');
    assert.deepStrictEqual(await page.$$eval('#catGrid .cg', b => b.map(x => x.textContent)), ['Job', 'Dairy', 'Crops', 'Others'], 'Expense / Income switch inside the sheet');
    await page.click('#cancel');

    async function add(type, cat, amount, note) {
      await pick(type, cat);
      await keypad(amount);
      if (note) await page.fill('#note', note);
      await page.click('#saveBtn');
      await closed();
    }
    await add('Income', 'Dairy', '12000', 'Milk payment');
    await add('Expense', 'House', '1250', 'Ration');
    await add('Expense', 'Others', '3500', 'Wedding gift');
    await add('Expense', 'Dairy', '2400.5', 'Cattle feed');
    await add('Income', 'Others', '1500', '');
    assert.match(await page.textContent('#recent'), /Others/, 'no reason: the row shows its category');

    // Quick amounts, recent-reason chips, Today / Yesterday
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
    assert.strictEqual(await page.getAttribute('#dateChips [data-day="0"]', 'aria-pressed'), 'true', 'Today by default');
    await page.click('#dateChips [data-day="1"]');
    assert.ok(await page.isHidden('#whenBox'));
    await shot(page, '01-add-sheet');
    await page.click('#cancel');
    assert.match(await page.textContent('#syncPill'), /5 waiting to sync/);
    assert.deepStrictEqual([await page.textContent('#heroIn'), await page.textContent('#heroOut')], ['₹13,500', '₹7,150.5']);
    assert.strictEqual(await page.locator('#recent .lrow').count(), 3, 'a phone shows the latest 3, by day');
    assert.match(await page.textContent('#recent .dayh'), /Today/);
    await shot(page, '02-home-offline', true);

    // ---- History, still offline: its own tab; edit amount + category, then delete (asked in the app's own sheet)
    await tab('history');
    assert.strictEqual(await page.textContent('#headTitle'), 'History');
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 5);
    await page.click('#historyList .lrow:has-text("Ration")');
    assert.strictEqual(await page.getAttribute('#catGrid [data-cat="House"]', 'aria-pressed'), 'true');
    assert.ok(await page.isVisible('#deleteBtn'));
    assert.strictEqual(await page.inputValue('#amount'), '1250');
    assert.notStrictEqual(await focused(), 'amount', 'editing keeps the keyboard down');
    assert.strictEqual(await page.inputValue('#note'), 'Ration');
    await clearAmount();
    await keypad('1500');
    await page.click('#catGrid [data-cat="Crops"]');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'Crops');
    await shot(page, '03-edit-sheet');
    await page.click('#saveBtn');
    await closed();
    assert.match(await page.textContent('#historyList'), /Ration.*Crops/);
    await page.click('#historyList .lrow:has-text("Wedding gift")');
    await page.click('#deleteBtn');
    await reply();
    await closed();
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 4);
    assert.match(await page.textContent('#syncPill'), /7 waiting to sync/);
    await shot(page, '04-history', true);

    // ---- Loans, still offline: add (★ pay first), pay back part, too-much is refused, delete a payment, pay the month's interest
    await tab('loans');
    assert.strictEqual(await page.textContent('#headTitle'), 'Money');
    await page.click('#addLoan');
    assert.strictEqual(await focused(), 'amount', 'the number pad opens straight away for a new loan');
    assert.ok(await page.isVisible('#emiBox') && await page.isVisible('#starBox') && await page.isHidden('#typeBox'));
    await keypad('20000');
    await page.click('#saveBtn');
    assert.match(await page.textContent('#err'), /borrowed from/);
    await page.fill('#note', 'From Ramesh, tractor repair');
    await page.click('#rateChips [data-rate="2"]');
    assert.strictEqual(await page.inputValue('#rate'), '2');
    await page.click('[data-per="year"]');
    await page.click('[data-per="month"]');
    assert.strictEqual(await page.getAttribute('[data-per="month"]', 'aria-pressed'), 'true');
    await page.check('#star');
    await shot(page, '05a-loan-sheet');
    await page.click('#saveBtn');
    await closed();
    assert.strictEqual(await page.textContent('#loanOwed'), '₹20,000');
    assert.match(await page.textContent('#loanList'), /Pay first.*From Ramesh/);
    await page.click('[data-pay][data-kind="back"]');
    assert.match(await page.textContent('#quick'), /Full ₹20,000/);
    await keypad('25000');
    await page.click('#saveBtn');
    assert.match(await page.textContent('#err'), /more than the ₹20,000 still owed/);
    await clearAmount();
    await keypad('5000');
    await shot(page, '05-repay-sheet');
    await page.click('#saveBtn');
    await closed();
    await page.click('[data-pay][data-kind="back"]');
    await keypad('1000');
    await page.click('#saveBtn');
    await closed();
    assert.strictEqual(await page.textContent('#loanOwed'), '₹14,000');
    assert.match(await page.textContent('#loanList'), /₹14,000 owed/);
    await page.click('#loanList summary');
    await page.click('[data-del-repay] >> nth=0');
    await reply();
    assert.strictEqual(await page.textContent('#loanOwed'), '₹15,000');
    assert.match(await page.textContent('#loanList'), /2% a month, about ₹300 a month/);
    assert.match(await page.textContent('#loanSummary'), /Interest.*≈ ₹300\/mo/);
    // Interest is an expense, not a repayment: "still owed" stays
    await page.click('[data-pay][data-kind="int"]');
    assert.strictEqual(await page.inputValue('#amount'), '300', 'this month\'s interest, ready');
    assert.match(await page.textContent('#payInfo'), /Interest is a cost/);
    await page.click('#saveBtn');
    await closed();
    assert.strictEqual(await page.textContent('#loanOwed'), '₹15,000', 'interest does not lower what is owed');
    assert.match(await page.textContent('#loanList'), /interest ✓ paid/);
    await shot(page, '06-loans', true);

    // ---- Back online: everything reaches the sheet exactly once
    await goOnline();
    const entries = sheet().rows.map(e => [e.category, e.amount, e.note]);
    assert.deepStrictEqual(entries.sort(), [['Crops', 1500, 'Ration'], ['Dairy', 12000, 'Milk payment'], ['Dairy', 2400.5, 'Cattle feed'], ['Loan interest', 300, 'From Ramesh, tractor repair'], ['Others', 1500, '']]);
    assert.deepStrictEqual(sheet().cats.Expense, ['House', 'Dairy', 'Crops', 'Loan interest', 'Others'], 'Loan interest is added the first time');
    const ramesh = sheet().loans[0];
    assert.deepStrictEqual([ramesh.reason, ramesh.amount, ramesh.interest, ramesh.per, ramesh.priority], ['From Ramesh, tractor repair', 20000, 2, 'month', 'high'], '★ pay first is high priority in the sheet');
    assert.deepStrictEqual(SET().loans[ramesh.id], { star: true, paid: ym(new Date()) });
    assert.deepStrictEqual(sheet().repays.map(p => p.amount), [5000]);
    assert.strictEqual(await page.textContent('#loanOwed'), '₹15,000');

    // ---- Insights: totals, where the income went, notes, categories, and the plan for a family in debt
    await tab('insights');
    assert.strictEqual(await page.textContent('#sIn'), '₹13,500');
    assert.strictEqual(await page.textContent('#sOut'), '₹4,200.5', 'interest paid is an expense');
    assert.strictEqual(await page.textContent('#sSave'), '₹9,299.5');
    assert.match(await page.textContent('#splitLeg'), /Spent₹4,200\.5.*Loans paid₹5,000.*In hand₹24,299\.5/, 'saved, less what paid the loan, plus what was borrowed');
    assert.deepStrictEqual(await page.$$eval('#insCats .crow .cn', b => b.map(x => x.textContent)), ['Dairy 57%', 'Crops 36%', 'Loan interest 7%']);
    assert.match(await page.textContent('#insPlan'), /Loan plan.*Not paid off at this pace/, 'more owed than saved: the loan plan; nothing saved in past months yet');
    assert.match(await page.textContent('#insHealth'), /Savings rate.*Safety net.*EMI load.*Net worth/);
    await page.click('#insCats [data-catf="Expense-Dairy"]');
    assert.strictEqual(await page.textContent('#headTitle'), 'History');
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 1, 'a category opens History filtered to it');
    await page.click('#hClear');
    await tab('insights');
    await shot(page, '07-insights', true);
    await page.click('[data-view="year"]');
    assert.strictEqual(await page.textContent('#periodLabel'), String(new Date().getFullYear()));
    await page.click('#prev');
    assert.match(await page.textContent('#insCats'), /No expenses/);
    await page.click('[data-view="month"]');
    await tab('home');
    assert.match(await page.textContent('#hero'), /Focus: clear loans.*Debt-free by.*Not yet/);

    // ---- Dark mode screenshots
    await page.emulateMedia({ colorScheme: 'dark' });
    await tab('insights');
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

    // ---- Every entry can be changed in the app, rows typed into the sheet too
    for (let i = 0; i < 25; i++) backend.typeRow(2026, 8, [new Date(Date.UTC(2026, 8, 1 + i, 6)), 'House', '', 10 + i, 'Old ' + i]); // typed into September
    await sync();
    await tab('history');
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 30, 'every entry is listed');
    assert.strictEqual(await page.locator('#historyList .lrow.tap').count(), 30, 'and every one can be changed');
    await page.click('#historyList .lrow:has-text("Old 0")');
    await clearAmount();
    await keypad('99');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.ok(backend.month(2026, 8).some(r => r[4] === 'Old 0' && r[3] === 99 && r[5]), 'an old hand-typed row got an Id and was updated');

    // ---- History filters: search, period, category, with totals for what matches
    const fpick = async (btn, val) => { await page.click(btn); await page.click(`${btn} + .ddlist [data-v="${val}"]`); };
    const hcount = () => page.locator('#historyList .lrow').count();
    await page.fill('#q', 'old 2');
    assert.strictEqual(await hcount(), 6, 'Old 2 and Old 20-24');
    await page.click('#qClear');
    assert.strictEqual(await hcount(), 30);
    await fpick('#fWhen', '2026-8'); // September
    assert.strictEqual(await page.textContent('#fWhen'), 'Sep 2026');
    await fpick('#fCat', 'Expense-House');
    assert.strictEqual(await hcount(), 25);
    assert.strictEqual(await page.textContent('#hSum'), '25 entries · −₹639', 'sum of 10…34, with Old 0 changed to 99');
    await page.click('#fCat');
    assert.ok(await page.isVisible('#ddCat'));
    await shot(page, '11-history-filters');
    await page.keyboard.press('Escape');
    assert.ok(await page.isHidden('#ddCat'), 'Esc closes the filter list');
    await fpick('#fCat', 'Income-Dairy');
    assert.match(await page.textContent('#historyList'), /No matches/);
    await page.click('#hClear');
    assert.strictEqual(await hcount(), 30);
    assert.ok(await page.isHidden('#hClear'));
    assert.ok(await page.isHidden('#whoBox'), 'no "Everyone" filter until someone has a name');

    // ---- An outdated Apps Script deployment is named, not left as "waiting"
    oldScript = true;
    await tab('home');
    await add('Income', 'Job', '100', 'Old script check');
    await page.waitForSelector('#syncPill:has-text("Update Apps Script to sync")');
    oldScript = false;
    await sync();
    assert.ok(sheet().rows.some(e => e.note === 'Old script check'), 'synced once the script is updated');
    // A phone that has never heard from an updated script keeps settings waiting rather than lose them
    await page.evaluate(() => localStorage.removeItem('fm.settings'));
    oldScript = true;
    await page.reload();
    await page.waitForSelector('#syncPill:has-text("Synced")');
    await page.click('#avatar');
    await page.click('#ddSheets [data-tab="settings"]');
    assert.match(await page.textContent('#setList'), /Update its Apps Script/);
    await page.click('[data-focus="grow"]');
    await page.waitForSelector('#headSub:has-text("Update Apps Script to sync")'); // away from Home the toolbar shows the sync state
    oldScript = false;
    await sync();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('fm.ops')).length === 0);
    assert.strictEqual(SET().focus, 'grow', 'sent once the script answered with its settings');

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

    // ---- Navigation: Home, History, Insights, Money
    assert.deepStrictEqual(await page.$$eval('.nav button', b => b.filter(x => x.offsetParent).map(x => x.textContent.trim())), ['Home', 'History', 'Insights', 'Money']);

    // ---- Settings: who uses this phone, budgets (Others is cell B1), focus, the financial year, a bill and paying it from Due soon
    await page.click('#avatar');
    await page.click('#ddSheets [data-tab="settings"]');
    assert.strictEqual(await page.textContent('#headTitle'), 'Settings');
    await page.fill('#meName', 'Sunita');
    await page.press('#meName', 'Enter');
    await page.locator('#meName').blur();
    await page.fill('[data-daily]', '20000');
    await page.locator('[data-daily]').blur();
    await page.fill('[data-budget="Others"]', '600');
    await page.locator('[data-budget="Others"]').blur();
    await page.click('[data-focus="auto"]');
    await sync();
    assert.deepStrictEqual([SET().daily, SET().focus, backend.tab('Loans & Settings').rows[0][1]], [20000, 'auto', 600], 'the Others budget is the sheet\'s B1');
    await page.click('#addBill');
    await page.click('#catGrid [data-cat="House"]');
    await keypad('12000');
    await page.fill('#note', 'Rent');
    await page.fill('#billDay', String(new Date().getDate())); // due today: Due soon shows only the next 7 days
    await page.click('#saveBtn');
    await closed();
    assert.match(await page.textContent('#setList'), /Rent.*of every month.*₹12,000/);
    await shot(page, '12-settings', true);
    await page.click('#backHome');
    assert.match(await page.textContent('#headSub'), /Namaste Sunita/);
    assert.match(await page.textContent('#strip'), /Left to spend this month/);
    assert.match(await page.textContent('#due'), /Rent/);
    await page.click('#due .row:has-text("Rent") [data-due]');
    assert.deepStrictEqual([await page.inputValue('#amount'), await page.inputValue('#note'), await page.textContent('#byLine')], ['12000', 'Rent', 'Added by Sunita']);
    await page.click('#saveBtn');
    await closed();
    await synced();
    const rentBill = Object.values(SET().bills)[0];
    assert.strictEqual(rentBill.next, ym(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)), 'paid: the bill moves on a month');
    const rentRow = sheet().rows.find(e => e.note === 'Rent');
    assert.deepStrictEqual([rentRow.by, rentRow.amount], ['Sunita', 12000], 'who added it reaches the sheet (the Date cell\'s note)');
    await tab('insights');
    await page.click('[data-view="year"]');
    assert.match(await page.textContent('#periodLabel'), /^20\d\d$/, 'Year is January to December');
    await page.click('[data-view="month"]');
    await tab('history');
    assert.ok(await page.isVisible('#whoBox'), 'now there is a name, History can filter by it');
    await page.click('#fWho');
    await page.click('#ddWho [data-v="Sunita"]');
    assert.strictEqual(await page.locator('#historyList .lrow').count(), 1);
    await page.click('#hClear');

    // ---- Money given: interest got is income (Income › Interest), what comes back is not
    await tab('insights');
    const before = [await page.textContent('#sIn'), await page.textContent('#sOut')];
    await tab('given');
    assert.match(await page.textContent('#loanList'), /Nothing given/);
    await page.click('#addLoan');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'Give money');
    assert.ok(await page.isHidden('#emiBox') && await page.isHidden('#starBox'));
    await keypad('10000');
    await page.click('#saveBtn');
    assert.match(await page.textContent('#err'), /who you gave it to/);
    await page.fill('#note', 'To Raju, for his shop');
    await page.click('#rateChips [data-rate="2"]');
    await page.click('#saveBtn');
    await closed();
    await page.click('[data-pay][data-kind="back"]');
    assert.match(await page.textContent('#sheetKind'), /₹10,000 to get/);
    await keypad('4000');
    await shot(page, '13-given-receive');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.strictEqual(await page.textContent('#loanLeftLabel'), 'Still to get back');
    assert.strictEqual(await page.textContent('#loanOwed'), '₹6,000');
    assert.match(await page.textContent('#loanList'), /To Raju.*2% a month, about ₹120 a month.*₹6,000 to get.*Got back ₹4,000 of ₹10,000/);
    const given = sheet().loans.find(l => l.dir === 'given');
    assert.deepStrictEqual([given.reason, given.amount, given.interest], ['To Raju, for his shop', 10000, 2]);
    assert.ok(sheet().repays.some(p => p.loanId === given.id && p.amount === 4000));
    await tab('insights');
    assert.deepStrictEqual([await page.textContent('#sIn'), await page.textContent('#sOut')], before, 'money given and got back is not income or expense');
    await tab('given');
    await page.click('[data-pay][data-kind="int"]');
    assert.strictEqual(await page.inputValue('#amount'), '120');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.ok(sheet().rows.some(e => e.type === 'Income' && e.category === 'Interest' && e.amount === 120), 'interest got is income, in its own category');
    assert.strictEqual(await page.textContent('#loanOwed'), '₹6,000');
    await tab('loans');
    assert.strictEqual(await page.textContent('#loanOwed'), '₹15,000', 'Loans still shows only money borrowed');

    // ---- Investments: an FD (the type sets its return), a SIP each month, money added (a negative withdrawal in the sheet)
    await tab('invested');
    await page.click('#addLoan');
    assert.strictEqual(await page.textContent('#sheetTitle'), 'New investment');
    assert.ok(await page.isVisible('#typeBox') && await page.isVisible('#compBox') && await page.isHidden('#starBox'), 'type and growth instead of EMI and priority');
    await page.click('[data-itype="fd"]');
    assert.deepStrictEqual([await page.inputValue('#rate'), await page.getAttribute('[data-per="year"]', 'aria-pressed'), await page.getAttribute('[data-comp="compound"]', 'aria-pressed')], ['7', 'true', 'true']);
    await keypad('50000');
    await page.fill('#note', 'HDFC FD');
    await page.fill('#sip', '2000');
    await page.fill('#sipDay', '5');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.match(await page.textContent('#loanList'), /HDFC FD.*Fixed deposit · about 7% a year.*₹2,000 a month on the 5th.*Counts as safety net/);
    const fd = sheet().loans.find(l => l.dir === 'invested');
    assert.deepStrictEqual([fd.reason, fd.amount, fd.interest, fd.per, fd.compound], ['HDFC FD', 50000, 7, 'year', true]);
    assert.deepStrictEqual(SET().loans[fd.id], { type: 'fd', sip: 2000, day: 5 });
    await page.click('[data-pay][data-kind="add"]');
    assert.strictEqual(await page.inputValue('#amount'), '2000', 'the SIP amount, ready');
    await page.click('#saveBtn');
    await closed();
    await synced();
    assert.ok(sheet().repays.some(p => p.loanId === fd.id && p.amount === -2000), 'money added: a negative withdrawal');
    assert.strictEqual(await page.textContent('#loanOwed'), '₹52,000');
    await shot(page, '14-invested', true);
    await tab('insights');
    assert.match(await page.textContent('#splitLeg'), /Invested₹52,000/);

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
    await page.click('[data-cadd="Expense"]');
    await reply('Goats');
    await synced();
    await tab('home');
    await add('Expense', 'Goats', '700', 'Goat feed');
    await synced();
    await page.click('#avatar');
    await page.click('#editCats');
    await page.click('[data-cren="Goats"]');
    await page.fill('#askInput', 'Bad=name');
    await page.click('#askOk');
    assert.match(await page.textContent('#askErr'), /leave out/, 'a bad name is explained in the sheet');
    await reply('Animals');
    await synced();
    assert.match(await page.textContent('#catsList'), /Animals1 entry/);
    assert.strictEqual(sheet().rows.find(e => e.note === 'Goat feed').category, 'Animals');
    assert.ok(backend.tab(String(new Date().getFullYear())).rows[2].includes('Animals'), 'the year summary has an Animals column');
    await shot(page, '15-categories');
    await page.click('[data-cdel="Animals"]');
    await reply();
    await synced();
    assert.strictEqual(sheet().rows.find(e => e.note === 'Goat feed').category, 'Others');
    assert.deepStrictEqual(sheet().cats.Expense, ['House', 'Dairy', 'Crops', 'Loan interest', 'Others']);
    await page.click('#backHome');
    assert.strictEqual(await page.textContent('#headTitle'), 'Settings', 'Categories goes back to Settings');
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
    assert.deepStrictEqual(await page.$$eval('#catGrid .cg', b => b.map(x => x.textContent)), ['Salary', 'Business', 'Others'], 'a new sheet starts with the household list');
    await page.click('#cancel');
    await add('Income', 'Others', '900', 'Shop sale');
    await synced();
    assert.ok(backend2.ctx.loadAll(backend2.ss).rows.some(e => e.note === 'Shop sale') && !sheet().rows.some(e => e.note === 'Shop sale'), 'went to the second sheet only');
    await page.click('#avatar');
    await page.click('[data-sren]:not([data-sren="fm."])');
    await reply('Shop');
    assert.match(await page.textContent('#headTitle'), /^Shop/);
    assert.match(await page.textContent('#ddSheets'), /Family Money.*Shop/);
    await shot(page, '16-sheets');
    await page.click('#avatar');
    await page.click('[data-sheet="fm."]');
    await synced();
    assert.match(await page.textContent('#headTitle'), /^Family Money/);
    assert.match(await page.textContent('#recent'), /Goat feed/);
    await page.click('#avatar');
    await page.click('[data-sdel]:not([data-sdel="fm."])');
    await reply();
    await page.click('#avatar');
    assert.strictEqual(await page.locator('#ddSheets [data-sheet]').count(), 1);
    assert.strictEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => /^fm\.\w{8}\./.test(k)).length), 0, 'its copy on the phone is gone');
    assert.strictEqual(await page.locator('#ddSheets [data-sdel]').count(), 0, 'the last sheet cannot be removed');
    await page.keyboard.press('Escape');

    // ---- Theme: Settings can force dark
    await page.click('#avatar');
    await page.click('#ddSheets [data-tab="settings"]');
    await page.click('[data-theme="dark"]');
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.reload();
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'kept on the phone');
    await page.click('#avatar');
    await page.click('#ddSheets [data-tab="settings"]');
    await page.click('[data-theme="auto"]');
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), undefined);

    // ---- Laptop: a full-height sidebar on the left edge (sheet switcher, tabs), toolbar titles, Home in two columns
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
    assert.ok(await desk.isHidden('#backHome'), 'History is a tab, no back button');
    if (SHOTS) await desk.screenshot({ path: path.join(SHOTS, '17-desktop.png') });
    // iPad portrait: still the sidebar, pages in one column
    await desk.setViewportSize({ width: 820, height: 1180 });
    await desk.click('.nav [data-tab="home"]');
    const [hero, latest] = await Promise.all(['#hero', '#recent'].map(box));
    assert.ok(await desk.isVisible('#sideSheet') && latest.y > hero.y + hero.height && latest.x === hero.x, 'tablet: sidebar, Home in one column');
    await wide.close();

    assert.deepStrictEqual(errors, []);
    console.log('E2E passed');
  } catch (e) { if (errors.length) console.error('Page errors:', errors); throw e; } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
