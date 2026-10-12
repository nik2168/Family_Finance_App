// Run: make demo. A dry run of ~2 years of family use, without touching the real Google Sheet:
// the real app + the real apps-script/Code.gs on the in-memory fake sheet (tests/fake-sheet.js).
// 1. Seeds Nov 2024 .. today through the real sync protocol, plus hand-typed and half-typed rows.
// 2. Checks the sheet (month tables, summary and loan formulas) against the app's own maths, and the app in a browser.
// 3. Opens a visible browser: the app, and a sheet viewer at http://localhost:8765/__sheet. NO_WINDOW=1 skips this.
process.env.TZ = 'Asia/Kolkata';
const { chromium } = require('playwright');
const path = require('path');
const { spawn } = require('child_process');
const s = require('../src/shared.js');
const { createBackend } = require('./fake-sheet.js');

const APP = path.join(__dirname, '..', 'src'), PORT = 8765, BASE = `http://localhost:${PORT}`;
const SCRIPT = 'https://script.google.com/macros/s/DEMO/exec', KEY = 'demo-key';
const SHOTS = process.env.SHOTS;
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = n => { const a = Math.round(n); return a >= 1e5 ? '₹' + Math.round(a / 1e4) / 10 + 'L' : a >= 1e4 ? '₹' + Math.round(a / 100) / 10 + 'K' : money.format(a); };
const backend = createBackend();
backend.props.CATS = JSON.stringify(backend.ctx.CATEGORIES); // a family sheet with the starting categories
backend.ctx.setup();
backend.props.KEY = KEY;
const post = ops => backend.doPost(JSON.stringify({ key: KEY, ops }));
const sheet = () => JSON.parse(JSON.stringify(backend.ctx.loadAll(backend.ss), (k, v) => k === 'ss' ? undefined : v));

// ---- Report
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
}
const eqv = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const round2 = x => Math.round(x * 100) / 100;

// ---- 1. Two years of a farming family's money (deterministic)
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const between = (lo, hi) => Math.round((lo + rand() * (hi - lo)) / 10) * 10;
const at = (d, hour) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, Math.floor(rand() * 60)).toISOString();
const ops = [];
let n = 0;
function add(type, category, amount, note, dateTime) {
  const id = 'sim-' + String(++n).padStart(5, '0');
  ops.push({ opId: id, kind: 'entry', action: 'add', id, data: { id, dateTime, type, category, amount, note, createdAt: dateTime } });
}
const START = new Date(2024, 10, 1), NOW = new Date();
for (let d = new Date(START); d < NOW; d.setDate(d.getDate() + 1)) {
  const day = d.getDate(), m = d.getMonth(), dow = d.getDay(), p = rand();
  if (day === 1) add('Income', 'Job', 35000, 'Salary', at(d, 10));
  if (day % 10 === 0) add('Income', 'Dairy', between(3000, 5500), 'Milk payment', at(d, 18));
  if (dow === 1) add('Expense', 'Dairy', between(800, 1600), 'Cattle feed', at(d, 9));
  if (day === 15 && p < 0.35) add('Expense', 'Dairy', between(300, 900), 'Vet visit', at(d, 11));
  if (day === 5 || day === 20) add('Expense', 'House', between(1500, 3000), 'Ration from kirana', at(d, 12));
  if (day === 12) add('Expense', 'House', between(600, 1200), 'Electricity bill', at(d, 16));
  if (dow === 3 || dow === 6) add('Expense', 'House', between(100, 300), 'Vegetables', at(d, 8));
  if (dow === 5 && p < 0.2) add('Expense', 'House', between(200, 700), 'Medicine', at(d, 19));
  if (day === 10 && (m === 3 || m === 9)) add('Expense', 'House', 8000, 'School fees', at(d, 11));
  if (dow === 2) add('Expense', 'Crops', between(400, 900), 'Diesel for tractor', at(d, 7));
  if ([5, 6, 10, 11].includes(m) && day % 9 === 0) add('Expense', 'Crops', between(1500, 5000), ['Seeds', 'Fertiliser (DAP)', 'Labour for sowing'][day % 3], at(d, 14));
  if ([2, 3].includes(m) && day === 25) add('Income', 'Crops', between(40000, 70000), 'Wheat sold at mandi', at(d, 15));
  if ([9, 10].includes(m) && day === 22) add('Income', 'Crops', between(30000, 60000), 'Soybean sold', at(d, 15));
  if (day === 3) add('Expense', 'Others', 299, 'Phone recharge', at(d, 20));
  if (dow === 0 && p < 0.15) add('Expense', 'Others', between(500, 2500), ['Wedding gift', 'Temple donation', 'Bus tickets'][day % 3], at(d, 17));
  if (day === 28 && p < 0.12) add('Income', 'Others', between(500, 3000), ['Sold old bicycle', 'Rent from shop'][day % 2], at(d, 13));
}
// The year and month boundaries, in India time
add('Expense', 'House', 650, 'New year sweets', new Date(2025, 11, 31, 23, 30).toISOString());
add('Income', 'Dairy', 1200, 'Milk, first day of the year', new Date(2026, 0, 1, 6, 0).toISOString());
add('Expense', 'Dairy', 400, 'Last minute of February', new Date(2026, 1, 28, 23, 59).toISOString());
const ENTRY_COUNT = ops.length;

// Loans: mixed interest and priority, partial and full repayments
const loanOps = [], L = (id, date, reason, amount, interest, per, priority, dir) => loanOps.push({ opId: id, kind: 'loan', action: 'add', id, data: { id, dateTime: date.toISOString(), reason, amount, interest, per, priority, dir: dir || 'borrowed' } });
const R = (loanId, date, amount) => { const id = 'rep-' + loanId.slice(5) + '-' + date.getTime(); loanOps.push({ opId: id, kind: 'repay', action: 'add', id, data: { id, loanId, dateTime: date.toISOString(), amount } }); };
L('loan-ramesh', new Date(2025, 1, 10, 11), 'From Ramesh, tractor repair', 50000, 2, 'month', 'high');
for (let i = 0; i < 6; i++) R('loan-ramesh', new Date(2025, 2 + i, 10, 12), 5000);
L('loan-kcc-sbi', new Date(2024, 11, 5, 11), 'SBI Kisan credit card', 100000, 7, 'year', 'medium');
R('loan-kcc-sbi', new Date(2025, 5, 1, 12), 25000); R('loan-kcc-sbi', new Date(2026, 5, 1, 12), 25000);
L('loan-sunita', new Date(2025, 5, 15, 11), 'From Sunita (sister), school fees', 15000, 0, 'month', 'low');
R('loan-sunita', new Date(2025, 7, 1, 12), 5000); R('loan-sunita', new Date(2025, 9, 1, 12), 5000); R('loan-sunita', new Date(2025, 11, 1, 12), 5000);
L('loan-coop', new Date(2026, 5, 20, 11), 'Cooperative society, seeds', 30000, 12, 'year', 'medium');
R('loan-coop', new Date(2026, 8, 20, 12), 10000);
// Money given to others: one partly back with interest, one fully back
L('give-raju', new Date(2025, 8, 5, 10), 'To Raju (cousin), for his shop', 40000, 1.5, 'month', 'high', 'given');
R('give-raju', new Date(2025, 11, 5, 10), 10000); R('give-raju', new Date(2026, 3, 5, 10), 10000);
L('give-mohan', new Date(2026, 1, 12, 10), 'To Mohan, hospital bill', 8000, 0, 'month', 'low', 'given');
R('give-mohan', new Date(2026, 4, 1, 10), 8000);

console.log(`\nSeeding ${ENTRY_COUNT} entries and ${loanOps.length} loan changes through Code.gs …`);
let t0 = Date.now(), rejected = [];
for (let i = 0; i < ops.length; i += 400) rejected = rejected.concat(post(ops.slice(i, i + 400)).rejected);
rejected = rejected.concat(post(loanOps).rejected);
check('seeding: every change accepted by Code.gs', !rejected.length, rejected.length ? JSON.stringify(rejected.slice(0, 3)) : `${Date.now() - t0} ms`);

// ---- 2. The mess real families make, typed straight into the sheet
backend.typeRow(2026, 8, [new Date(2026, 8, 18, 9), 'house ', '', 450, 'Typed: gas cylinder']);
backend.typeRow(2026, 8, [new Date(2026, 8, 19, 9), 'Dairy', '', '', 'Typed: forgot the amount']);
backend.typeRow(2026, 8, [new Date(2026, 8, 19, 10), 'Dairyy', '', 700, 'Typed: misspelled category']);
const copied = backend.month(2025, 4).find(r => r[4] === 'Salary').slice();
copied[4] = 'Typed: pasted salary row (bonus)';
backend.typeRow(2025, 4, copied);
t0 = Date.now();
post([]);
check('a sync with everything loaded (fake sheet)', true, `${Date.now() - t0} ms; real Apps Script will be slower`);

// ---- Sheet checks: month tables and the formulas people read, against the app's own maths
function colIndex(a) { let x = 0; for (const ch of a) x = x * 26 + ch.charCodeAt(0) - 64; return x; }
function cellsOf(tab, ref) {
  const m = ref.replace(/\$/g, '').match(/^([A-Z]+)(\d+):([A-Z]+)(\d*)$/), out = [];
  for (let r = +m[2]; r <= (m[4] ? +m[4] : tab.rows.length); r++) for (let c = colIndex(m[1]); c <= colIndex(m[3]); c++) out.push([r, c]);
  return out;
}
const num = v => typeof v === 'number' ? v : 0;
// Evaluates the formula shapes Code.gs writes. SUMIF matches like Google Sheets: case-insensitive, exact (no trimming).
function value(tab, r, c) {
  const v = (tab.rows[r - 1] || [])[c - 1];
  if (typeof v !== 'string' || v[0] !== '=') return v == null ? '' : v;
  const f = v.slice(1), ref = x => { const m = x.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/); return value(tab, +m[2], colIndex(m[1])); };
  let m;
  if ((m = f.match(/^SUMIF\(([^,]+),(?:"([^"]*)"|([^,]+)),([^)]+)\)$/))) {
    const crit = String(m[2] != null ? m[2] : ref(m[3])).toLowerCase(), a = cellsOf(tab, m[1]), b = cellsOf(tab, m[4]);
    return round2(a.reduce((sum, [ar, ac], i) => String(value(tab, ar, ac)).toLowerCase() === crit ? sum + num(value(tab, ...b[i])) : sum, 0));
  }
  if ((m = f.match(/^SUM\(([^)]+)\)$/))) return round2(cellsOf(tab, m[1]).reduce((sum, rc) => sum + num(value(tab, ...rc)), 0));
  if ((m = f.match(/^([A-Z]+\d+)-([A-Z]+\d+)$/))) return round2(num(ref(m[1])) - num(ref(m[2])));
  throw new Error('unknown formula ' + v);
}

function sheetChecks(label) {
  const st = sheet(), rows = st.rows;
  check(`${label}: entry Ids are unique`, new Set(rows.map(r => r.id)).size === rows.length, `${rows.length} entries`);
  const years = backend.ss.getSheets().map(t => t.name).filter(x => /^\d{4}$/.test(x));
  let misplaced = 0, unsorted = 0, badSummary = [];
  years.forEach(y => {
    const tab = backend.tab(y);
    for (let m = 0; m < 12; m++) {
      const block = backend.month(+y, m).filter(r => r[0] instanceof Date && r[5]);
      block.forEach((r, i) => {
        if (r[0].getFullYear() !== +y || r[0].getMonth() !== m) misplaced++;
        if (i && r[0] < block[i - 1][0]) unsorted++;
      });
      const sm = s.summarize(rows, 'month', new Date(+y, m, 1), 0), inc = c => round2((sm.net[c] || 0) + (sm.spent[c] || 0));
      const want = [inc('Job'), inc('Dairy'), inc('Crops'), inc('Others'), sm.income, sm.spent.House, sm.spent.Dairy, sm.spent.Crops, sm.spent.Others, sm.expense, sm.savings];
      const cols = tab.rows[2].map((v, c) => v ? c + 1 : 0).filter(Boolean).slice(1); // after Month; blanks under hidden Id columns skipped
      const got = want.map((_, k) => value(tab, 4 + m, cols[k]));
      if (!eqv(got, want)) badSummary.push(`${y}-${m + 1}: sheet ${JSON.stringify(got)} app ${JSON.stringify(want)}`);
    }
  });
  check(`${label}: every entry sits in its own month table`, !misplaced, misplaced + ' misplaced');
  check(`${label}: month tables are sorted by date`, !unsorted, unsorted + ' out of order');
  check(`${label}: sheet summary formulas = app totals, every month of ${years.join(', ')}`, !badSummary.length, badSummary.slice(0, 2).join(' | '));
  const LS = s.summarizeLoans(st.loans, st.repays), tab = backend.tab('Loans & Settings');
  // Borrowed loans live in A:I (Id in I), money given in Q:Y (Id in Y); each has Paid/Got back and Still owed/to get formulas.
  const bad = LS.loans.filter(l => {
    const c = l.dir === 'given' ? 16 : 0, r = tab.rows.findIndex(x => x && x[c + 8] === l.id) + 1;
    return !r || value(tab, r, c + 7) !== l.repaid || value(tab, r, c + 8) !== round2(l.amount - l.repaid);
  });
  check(`${label}: borrowed and given tables, formulas = app`, !bad.length && LS.loans.some(l => l.dir === 'given'), bad.map(l => l.reason).join(', '));
  return st;
}
let st = sheetChecks('sheet');
check('hand-typed "house " row became an editable House entry', st.rows.some(r => r.note === 'Typed: gas cylinder' && r.category === 'House' && r.id));
check('half-typed and misspelled rows are kept in the sheet, not lost', ['Typed: forgot the amount', 'Typed: misspelled category'].every(t => backend.month(2026, 8).some(r => r[4] === t)));
check('a pasted row with a copied Id became its own entry', st.rows.filter(r => /Salary|pasted salary/.test(r.note) && r.dateTime.startsWith('2025-05')).length === 2);
check('year boundary: 31 Dec 23:30 is in 2025, 1 Jan 06:00 in 2026, no 2027 tab yet',
  backend.month(2025, 11).some(r => r[4] === 'New year sweets') && backend.month(2026, 0).some(r => /first day/.test(r[4])) && !backend.tab('2027'));

// ---- 3. The app in a browser
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '-d', APP], { stdio: 'ignore' });
let online = true;
async function connect(ctx) {
  await ctx.route(SCRIPT, route => online
    ? route.fulfill({ json: backend.doPost(route.request().postData()), headers: { 'access-control-allow-origin': '*' } })
    : route.abort('internetdisconnected'));
  await ctx.route(BASE + '/__sheet*', route => route.fulfill({ contentType: 'text/html', body: viewer(new URL(route.request().url()).searchParams.get('tab')) }));
}

(async () => {
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Kolkata' });
    await connect(ctx);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
    page.on('dialog', d => { errors.push('a browser dialog: ' + d.message()); d.dismiss(); });
    const synced = () => page.waitForFunction(() => /Synced/.test(document.querySelector('#syncPill').textContent), null, { timeout: 30000 });
    const tab = async x => {
      if (x === 'loans' || x === 'given') { await page.click('.nav [data-tab="money"]'); return page.click(`#moneySeg [data-tab="${x}"]`); }
      return page.click(`.nav [data-tab="${x}"]`);
    };
    const shot = name => SHOTS ? page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }) : null;

    console.log('\nApp in the browser …');
    t0 = Date.now();
    await page.goto(`${BASE}/#setup=${SCRIPT}|${KEY}`);
    await synced();
    check('first open: downloads everything and shows it', true, `${Date.now() - t0} ms for ${st.rows.length} entries`);
    const renderMs = await page.evaluate(() => { const t = performance.now(); for (let i = 0; i < 5; i++) render(); return Math.round((performance.now() - t) / 5); });
    check('screen redraw with 2 years of data stays quick', renderMs < 150, renderMs + ' ms per redraw');

    // Home: this month's tiles, the latest 3 by day, and the plan for a family with loans
    const month = s.summarize(st.rows, 'month', new Date(), 3000);
    check('Home: latest 3 entries, by day', await page.locator('#recent .lrow').count() === 3 && await page.locator('#recent .dayh').count() > 0);
    check('Home: Income / Expenses buttons show this month', eqv([await page.textContent('#heroIn'), await page.textContent('#heroOut')], [compact(month.income), compact(month.expense)]),
      `${await page.textContent('#heroIn')} / ${await page.textContent('#heroOut')}`);
    const hero = await page.textContent('#hero'), heroDate = await page.textContent('#heroDate');
    check('Home: more owed than saved, so the focus is clearing the loans', /Focus: clear loans.*Debt-free by/.test(hero), heroDate);
    await page.click('#hero .tchip >> nth=0');
    check('Home: a plan chip says what it takes', /more than now/.test(await page.textContent('#hero .tout')), await page.textContent('#hero .tout'));
    await shot('demo-01-home');

    // History: every entry can be changed
    await tab('history');
    const total = st.rows.length;
    check('History: newest 100 listed, every one editable', await page.locator('#historyList .lrow').count() === 100 && await page.locator('#historyList .lrow.tap').count() === 100);
    check('History: says how many in all', (await page.textContent('#hFoot')).includes(`of ${total}`));
    const fpick = async (btn, v) => { await page.click(btn); await page.click(`${btn} + .ddlist [data-v="${v}"]`); };
    await fpick('#fWhen', '2025-2');
    let want = s.filterEntries(st.rows, { q: '', year: '2025', month: '2', cat: '' });
    check('History: filter March 2025', await page.locator('#historyList .lrow').count() === want.length && (await page.textContent('#hSum')).startsWith(want.length + ' entries'), want.length + ' entries');
    await fpick('#fWhen', '2025-');
    await page.fill('#q', 'salary');
    want = s.filterEntries(st.rows, { q: 'salary', year: '2025', month: '', cat: '' });
    check('History: search "salary" in 2025', await page.locator('#historyList .lrow').count() === want.length, want.length + ' found');
    await page.click('#hClear');
    await fpick('#fCat', 'Income-Crops');
    want = s.filterEntries(st.rows, { q: '', year: '', month: '', cat: 'Income-Crops' });
    check('History: category Crops income across both years', await page.locator('#historyList .lrow').count() === want.length, want.length + ' harvest sales');
    await shot('demo-02-history-filter');
    await page.click('#hClear');

    // Insights: back through the years
    await tab('insights');
    await page.click('.seg [data-view="year"]');
    for (const y of [2026, 2025, 2024]) {
      const ys = s.summarize(st.rows, 'year', new Date(y, 0, 1), 0);
      check(`Insights ${y}: income, expenses and saved`, eqv([await page.textContent('#sIn'), await page.textContent('#sOut')], [money.format(ys.income), money.format(ys.expense)]),
        `${await page.textContent('#sIn')} / ${await page.textContent('#sOut')}`);
      if (y === 2025) await shot('demo-03-insights-2025');
      if (y > 2024) await page.click('#prev');
    }
    check('Insights: where the income went', await page.locator('#splitLeg > div').count() > 0);
    const y24 = s.summarize(st.rows, 'year', new Date(2024, 0, 1), 0), topCat = Object.keys(y24.spent).sort((a, b) => y24.spent[b] - y24.spent[a])[0];
    await page.click('#insCats .crow >> nth=0');
    want = s.filterEntries(st.rows, { q: '', year: '2024', month: '', cat: 'Expense-' + topCat });
    check('Insights: the biggest category opens History filtered to it and that year', await page.textContent('#fWhen') === '2024' && await page.locator('#historyList .lrow').count() === Math.min(100, want.length), topCat + ', ' + want.length);
    await page.click('#hClear');
    await tab('insights');
    await page.click('.seg [data-view="month"]');

    // The loan plan says what the Home hero says
    const plan = await page.textContent('#insPlan');
    check('Insights: the loan plan matches Home', plan.includes('Loan plan') && plan.includes(heroDate === 'Not yet' ? 'Not paid off' : 'Debt-free by ' + heroDate), plan.slice(0, 60));
    await page.locator('#insPlan').screenshot({ path: SHOTS ? path.join(SHOTS, 'demo-06-plan.png') : path.join(require('os').tmpdir(), 'fc.png') });

    // Loans (money borrowed) and Given (money given to others): each tab shows only its own
    await tab('loans');
    const LS = s.summarizeLoans(st.loans.filter(l => l.dir !== 'given'), st.repays);
    check('Loans: High first, repaid last', eqv(await page.$$eval('#loanList .what', x => x.map(e => e.textContent)), LS.loans.map(l => l.reason)), LS.loans.map(l => l.priority + (l.done ? ' (repaid)' : '')).join(' > '));
    check('Loans: still owed and monthly interest', await page.textContent('#loanOwed') === money.format(LS.owed) && (await page.textContent('#loanSummary')).includes('≈ ' + money.format(Math.round(LS.monthlyInterest))),
      `${await page.textContent('#loanOwed')}, interest ${money.format(Math.round(LS.monthlyInterest))}`);
    await shot('demo-04-loans');
    await tab('given');
    const GS = s.summarizeLoans(st.loans.filter(l => l.dir === 'given'), st.repays);
    check('Given: still to get back, monthly interest, high first', eqv([await page.textContent('#loanOwed'), await page.$$eval('#loanList .what', x => x.map(e => e.textContent))], [money.format(GS.owed), GS.loans.map(l => l.reason)]) &&
      (await page.textContent('#loanSummary')).includes('≈ ' + money.format(Math.round(GS.monthlyInterest))), `${await page.textContent('#loanOwed')} to get`);
    await shot('demo-05-given');

    // Edit in History: move the newest entry into last year
    await tab('history');
    const first = page.locator('#historyList .lrow.tap').first(), movedId = await first.getAttribute('data-edit');
    await first.click();
    await page.fill('#when', '2025-10-11T10:00');
    await page.click('#saveBtn');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    await synced();
    check('editing the date moves the row from the 2026 tab to 2025 / October',
      backend.month(2025, 9).some(r => r[5] === movedId) && ![...Array(12).keys()].some(m => backend.month(2026, m).some(r => r[5] === movedId)));

    // Offline for a long time: 600 changes waiting, then back online
    online = false;
    await ctx.setOffline(true);
    await page.evaluate(() => {
      const ops = JSON.parse(localStorage.getItem('fm.ops') || '[]');
      for (let i = 0; i < 600; i++) {
        const id = 'burst-' + String(i).padStart(4, '0'), dateTime = new Date(Date.now() - i * 60000).toISOString();
        ops.push({ opId: id, kind: 'entry', action: 'add', id, data: { id, dateTime, type: 'Expense', category: 'House', amount: 10, note: 'Offline ' + i, createdAt: dateTime } });
      }
      localStorage.setItem('fm.ops', JSON.stringify(ops));
      render();
    });
    check('offline: 600 changes wait on the phone', /600 waiting/.test(await page.textContent('#syncPill')));
    online = true;
    await ctx.setOffline(false);
    const left = await page.waitForFunction(() => JSON.parse(localStorage.getItem('fm.ops') || '[]').length === 0, null, { timeout: 15000 }).then(() => 0, () => page.evaluate(() => JSON.parse(localStorage.getItem('fm.ops')).length));
    check('back online: all 600 reach the sheet without tapping anything', left === 0, left ? left + ' still waiting' : '');

    st = sheetChecks('after edits and the offline burst');

    // With no loans the plan is about savings instead (loans deleted offline only, then put back)
    online = false;
    await ctx.setOffline(true);
    await page.evaluate(ids => { localStorage.setItem('fm.ops', JSON.stringify(ids.map((id, i) => ({ opId: 'tmp-del-' + i, kind: 'loan', action: 'delete', id })))); }, st.loans.map(l => l.id));
    await tab('insights');
    const plan2 = await page.textContent('#insPlan');
    check('Without loans: a savings plan, not a debt-free date', plan2.includes('Savings plan') && !plan2.includes('Debt-free'), plan2.slice(0, 60));
    await page.locator('#insPlan').screenshot({ path: SHOTS ? path.join(SHOTS, 'demo-07-plan-no-loans.png') : path.join(require('os').tmpdir(), 'fc2.png') });
    await page.evaluate(() => localStorage.setItem('fm.ops', '[]'));
    online = true;
    await ctx.setOffline(false);
    check('no errors in the browser console', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  } finally { await browser.close(); }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  if (process.env.NO_WINDOW) { srv.kill(); process.exit(failed.length ? 1 : 0); }

  // ---- 4. A window to look around in. The fake sheet stays live until the window is closed.
  const win = await chromium.launch({ headless: false });
  const appCtx = await win.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'Asia/Kolkata' });
  const sheetCtx = await win.newContext({ viewport: null, timezoneId: 'Asia/Kolkata' });
  await connect(appCtx);
  await connect(sheetCtx);
  await (await sheetCtx.newPage()).goto(BASE + '/__sheet');
  await (await appCtx.newPage()).goto(`${BASE}/#setup=${SCRIPT}|${KEY}`);
  console.log(`\nOpened a browser window: the app, and the sheet at ${BASE}/__sheet (refresh it after changes).\nClose the window or press Ctrl+C to stop. Nothing here touches the real Google Sheet.`);
  const stop = () => { srv.kill(); process.exit(0); };
  win.on('disconnected', stop);
  process.on('SIGINT', stop);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });

// ---- Sheet viewer: each tab as a grid; formulas show their value (hover for the formula), hidden Id columns greyed
function viewer(name) {
  const tabs = backend.ss.getSheets().filter(t => !t.hidden), t = backend.tab(name) || tabs[0];
  const width = Math.max(...t.rows.map(r => (r || []).length), 1), esc = x => String(x).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
  const fmt = v => v instanceof Date ? v.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : typeof v === 'number' ? v.toLocaleString('en-IN') : v;
  const head = Array.from({ length: width }, (_, c) => `<th class="${t.hiddenCols.includes(c + 1) ? 'h' : ''}">${backend.ctx.colName(c + 1)}</th>`).join('');
  const body = t.rows.map((r, i) => `<tr><th>${i + 1}</th>` + Array.from({ length: width }, (_, c) => {
    const raw = (r || [])[c], f = typeof raw === 'string' && raw[0] === '=';
    const v = f ? value(t, i + 1, c + 1) : raw == null ? '' : raw;
    return `<td class="${f ? 'f ' : ''}${t.hiddenCols.includes(c + 1) ? 'h ' : ''}${typeof v === 'number' ? 'n' : ''}"${f ? ` title="${esc(raw)}"` : ''}>${esc(fmt(v))}</td>`;
  }).join('') + '</tr>').join('');
  const nav = tabs.map(x => `<a href="/__sheet?tab=${encodeURIComponent(x.name)}" class="${x === t ? 'on' : ''}">${esc(x.name)}</a>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Sheet · ${esc(t.name)}</title><style>
    body{margin:0;font:12px system-ui,sans-serif;color:#202124;background:#fff}
    .wrap{overflow:auto;height:calc(100vh - 40px)} table{border-collapse:collapse}
    th,td{border:1px solid #e2e3e3;padding:3px 6px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}
    th{background:#f8f9fa;color:#5f6368;font-weight:500;position:sticky;top:0} tr th:first-child{position:sticky;left:0;z-index:1}
    td.n{text-align:right} td.f{background:#f1f8f4} .h{background:#eee;color:#aaa}
    nav{position:fixed;bottom:0;left:0;right:0;height:40px;background:#f8f9fa;border-top:1px solid #ddd;display:flex;gap:2px;padding:0 8px}
    nav a{padding:10px 16px;color:#444;text-decoration:none} nav a.on{background:#fff;color:#188038;font-weight:600;border-bottom:3px solid #188038}
    .note{position:fixed;right:12px;bottom:48px;background:#202124;color:#fff;padding:6px 10px;border-radius:6px;opacity:.85}
  </style><div class="wrap"><table><tr><th></th>${head}</tr>${body}</table></div><nav>${nav}</nav>
  <div class="note">Simulated sheet (not your real one). Green cells are formulas; hover to see them. Grey = hidden Id columns.</div>`;
}
