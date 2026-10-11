// Run: make test (or node tests/shared.test.js)
process.env.TZ = 'Asia/Kolkata';
const assert = require('assert');
const s = require('../src/shared.js');

const e = (id, dateTime, type, category, amount) => ({ id: 'id-' + id + '-xxxx', dateTime, type, category, amount });
const iso = (...a) => new Date(...a).toISOString();

// Periods: Sunday belongs to the week that started Monday; next Monday starts a new week.
let r = s.periodRange('week', new Date(2026, 9, 11)); // Sun 11 Oct 2026
assert.deepStrictEqual([r.start, r.end], [new Date(2026, 9, 5), new Date(2026, 9, 12)]);
r = s.periodRange('week', new Date(2026, 9, 12)); // Mon
assert.deepStrictEqual(r.start, new Date(2026, 9, 12));
r = s.periodRange('week', new Date(2026, 11, 31)); // week crossing the year
assert.deepStrictEqual([r.start, r.end], [new Date(2026, 11, 28), new Date(2027, 0, 4)]);
assert.deepStrictEqual(s.shiftPeriod('month', new Date(2026, 0, 31), 1), new Date(2026, 1, 1));
assert.deepStrictEqual(s.shiftPeriod('year', new Date(2026, 5, 9), -1), new Date(2025, 0, 1));
assert.strictEqual(s.periodLabel('week', new Date(2026, 9, 11)), '5 Oct - 11 Oct');
assert.deepStrictEqual(s.buckets('month', new Date(2026, 1, 1)), ['1-7', '8-14', '15-21', '22-28']);
assert.deepStrictEqual(s.buckets('month', new Date(2026, 9, 1)), ['1-7', '8-14', '15-21', '22-28', '29-31']);

const rows = [
  e(1, iso(2026, 9, 1, 9), 'Income', 'Job', 50000),
  e(2, iso(2026, 9, 5, 7), 'Income', 'Dairy', 12000.5),
  e(3, iso(2026, 9, 5, 18), 'Expense', 'Dairy', 4000.25),
  e(4, iso(2026, 9, 10, 12), 'Expense', 'House', 0.1),
  e(5, iso(2026, 9, 10, 13), 'Expense', 'House', 0.2),
  e(6, iso(2026, 9, 31, 23, 59), 'Expense', 'Others', 2500), // last minute of the month
  e(7, iso(2026, 10, 1, 0, 0), 'Expense', 'Others', 999),     // first minute of next month
  e(8, iso(2026, 9, 20), 'Expense', 'Others', 1000),
  e(9, iso(2026, 9, 21), 'Expense', 'Crops', 3000),
  e(8, iso(2026, 9, 20), 'Expense', 'Others', 1000),          // duplicate id (synced + pending)
  e(10, iso(2025, 11, 31, 23), 'Income', 'Crops', 7000)
];

const m = s.summarize(rows, 'month', new Date(2026, 9, 11), 3000);
assert.strictEqual(m.income, 62000.5);
assert.strictEqual(m.expense, 10500.55);
assert.strictEqual(m.savings, 51499.95);
assert.deepStrictEqual(m.net, { Job: 50000, Dairy: 8000.25, Crops: -3000, House: -0.3, Others: -3500 });
assert.strictEqual(m.spent.House, 0.3);
assert.strictEqual(m.others, 3500);
assert.strictEqual(m.overLimit, true);
assert.strictEqual(m.entries.length, 8);
assert.strictEqual(m.entries[0].id, 'id-6-xxxx'); // newest first
assert.deepStrictEqual(m.labels.length, 5);
assert.deepStrictEqual(m.incomeSeries, [62000.5, 0, 0, 0, 0]);
assert.deepStrictEqual(m.expenseSeries, [4000.25, 0.3, 4000, 0, 2500]);

const w = s.summarize(rows, 'week', new Date(2026, 9, 11), 3000);
assert.deepStrictEqual(w.incomeSeries, [12000.5, 0, 0, 0, 0, 0, 0]); // Mon 5 Oct
assert.deepStrictEqual(w.expenseSeries, [4000.25, 0, 0, 0, 0, 0.3, 0]); // Sat 10 Oct
assert.strictEqual(s.summarize(rows, 'week', new Date(2026, 9, 5), 0).income, 12000.5); // Mon 5 Oct
assert.strictEqual(s.summarize(rows, 'month', new Date(2026, 9, 1), 0).overLimit, false); // no limit set

const y = s.summarize(rows, 'year', new Date(2026, 3, 1), 3000);
assert.strictEqual(y.labels.length, 12);
assert.strictEqual(y.expenseSeries[10], 999);
assert.strictEqual(y.income, 62000.5); // 2025 entry excluded
assert.strictEqual(s.summarize(rows, 'year', new Date(2025, 0, 1), 0).net.Crops, 7000);

// Others income: counts as income and in Others' profit, but never against the Others spending limit
const oi = s.summarize(rows.concat(e(11, iso(2026, 9, 12), 'Income', 'Others', 1500)), 'month', new Date(2026, 9, 11), 3000);
assert.deepStrictEqual([oi.income, oi.net.Others, oi.spent.Others, oi.others], [63500.5, -2000, 3500, 3500]);

// Where income went: % of income, plus Saved; when overspent, % of expenses and overBy
let sh = s.spendShare(m);
assert.deepStrictEqual(sh.slices.map(x => [x.name, x.pct]), [['House', 0], ['Dairy', 6.5], ['Crops', 4.8], ['Others', 5.6], ['Saved', 83.1]]);
assert.strictEqual(sh.overBy, 0);
sh = s.spendShare(s.summarize(rows, 'month', new Date(2026, 10, 1), 0)); // November: only 999 spent, no income
assert.deepStrictEqual([sh.base, sh.overBy, sh.slices.map(x => [x.name, x.pct])], [999, 999, [['Others', 100]]]);
assert.deepStrictEqual(s.spendShare(s.summarize([], 'week', new Date(), 0)).slices, []);

// Validation: the reason is optional for income and expenses (a loan still needs its name); who added it is optional
const ok = { ...e(1, iso(2026, 9, 1), 'Expense', 'House', 10), note: 'Ration' };
assert.strictEqual(s.validateEntry(ok), '');
assert.strictEqual(s.validateEntry({ ...ok, note: undefined }), '');
assert.strictEqual(s.validateEntry({ ...ok, note: '   ' }), '');
assert.strictEqual(s.validateEntry({ ...ok, note: 5 }), 'bad reason');
assert.strictEqual(s.validateEntry({ ...ok, by: 'Sunita' }), '');
assert.strictEqual(s.validateEntry({ ...ok, by: 'x'.repeat(31) }), 'bad by');
assert.strictEqual(s.validateEntry({ ...ok, note: 'x'.repeat(201) }), 'reason too long');
assert.strictEqual(s.validateEntry({ ...ok, amount: -5 }), 'bad amount');
assert.strictEqual(s.validateEntry({ ...ok, amount: '5' }), 'bad amount');
assert.strictEqual(s.validateEntry({ ...ok, type: 'Income', category: 'House' }), '', 'any well-formed name: the sheet adds it if it is new');
['=X', 'a*b', 'Saved', 'constructor', '5 cows', ' Dairy', '', 'x'.repeat(31)].forEach(c => assert.strictEqual(s.validateEntry({ ...ok, category: c }), 'bad category', c));
['Milk', 'दूध', "Ram's shop", 'Fuel-Diesel'].forEach(c => assert.ok(s.checkCatName(c), c));
assert.strictEqual(s.validateEntry({ ...ok, type: 'Income', category: 'Others' }), '');
assert.strictEqual(s.validateEntry({ ...ok, type: 'toString' }), 'bad type');
assert.strictEqual(s.validateEntry({ ...ok, dateTime: 'yesterday' }), 'bad date');
assert.strictEqual(s.validateEntry({ ...ok, id: 'a b' }), 'bad id');

const loan = { id: 'loan-0001', dateTime: iso(2026, 8, 20), reason: 'From Ramesh, tractor repair', amount: 20000 };
assert.strictEqual(s.validateLoan(loan), '');
assert.strictEqual(s.validateLoan({ ...loan, reason: '' }), 'reason required');
assert.strictEqual(s.validateLoan({ ...loan, amount: 0 }), 'bad amount');
assert.strictEqual(s.validateLoan({ ...loan, interest: 2, per: 'month' }), '');
assert.strictEqual(s.validateLoan({ ...loan, interest: 0, per: '' }), '', 'no interest');
assert.strictEqual(s.validateLoan({ ...loan, interest: 2, per: 'week' }), 'bad interest');
assert.strictEqual(s.validateLoan({ ...loan, interest: 101, per: 'year' }), 'bad interest');
assert.strictEqual(s.validateLoan({ ...loan, interest: '2', per: 'year' }), 'bad interest');
assert.strictEqual(s.validateLoan({ ...loan, priority: 'high' }), '');
assert.strictEqual(s.validateLoan({ ...loan, priority: 'urgent' }), 'bad priority');
assert.strictEqual(s.validateLoan({ ...loan, dir: 'given' }), '');
assert.strictEqual(s.validateLoan({ ...loan, dir: 'lent' }), 'bad dir');
const rep = { id: 'rep-00001', loanId: 'loan-0001', dateTime: iso(2026, 9, 5), amount: 5000 };
assert.strictEqual(s.validateRepay(rep), '');
assert.strictEqual(s.validateRepay({ ...rep, loanId: 'x' }), 'bad id');
assert.strictEqual(s.validateRepay({ ...rep, amount: 0 }), 'bad amount');
assert.strictEqual(s.validateRepay({ ...rep, amount: -1000 }), '', 'money added to an investment (Code.gs checks the loan is one)');

// Offline operation queue
const snap = { rows: [{ ...ok, id: 'srv-00001' }], loans: [loan], repays: [rep] };
let v = s.applyOps(snap, [
  { opId: 'o1', kind: 'entry', action: 'add', id: 'new-00001', data: { ...ok, id: 'new-00001', amount: 50 } },
  { opId: 'o2', kind: 'entry', action: 'update', id: 'new-00001', data: { ...ok, id: 'new-00001', amount: 75 } },
  { opId: 'o3', kind: 'entry', action: 'update', id: 'srv-00001', data: { ...ok, id: 'srv-00001', category: 'Dairy' } },
  { opId: 'o4', kind: 'entry', action: 'update', id: 'gone-0001', data: { ...ok, id: 'gone-0001' } },
  { opId: 'o5', kind: 'entry', action: 'add', id: 'srv-00001', data: { ...ok, id: 'srv-00001', amount: 999 } }
]);
assert.deepStrictEqual(v.rows.map(r => [r.id, r.amount, r.category]), [['srv-00001', 10, 'Dairy'], ['new-00001', 75, 'House']]);
assert.strictEqual(snap.rows[0].category, 'House', 'snapshot not mutated');
v = s.applyOps(snap, [
  { opId: 'o6', kind: 'entry', action: 'add', id: 'tmp-00001', data: { ...ok, id: 'tmp-00001' } },
  { opId: 'o7', kind: 'entry', action: 'delete', id: 'tmp-00001' },
  { opId: 'o8', kind: 'loan', action: 'delete', id: 'loan-0001' }
]);
assert.strictEqual(v.rows.length, 1);
assert.deepStrictEqual([v.loans.length, v.repays.length], [0, 0], 'deleting a loan removes its repayments');

// Categories: add, rename, merge, delete (into Others); entries move with them; Others never changes
const D = (id, category, type) => ({ ...ok, id, type: type || 'Expense', category });
const cat = (action, data) => ({ opId: 'c-' + action, kind: 'cat', action, data: { type: 'Expense', ...data } });
const csnap = { rows: [D('row-00001', 'Dairy'), D('row-00002', 'Dairy', 'Income')] };
v = s.applyOps(csnap, [cat('add', { name: 'Goats' }), { opId: 'g', kind: 'entry', action: 'add', id: 'row-00003', data: D('row-00003', 'Goats') }, cat('rename', { name: 'goats', to: 'Animals' })]);
assert.deepStrictEqual([v.cats.Expense, v.rows.map(r => r.category)], [['House', 'Dairy', 'Crops', 'Animals', 'Others'], ['Dairy', 'Dairy', 'Animals']], 'added before Others; rename moves its entries');
v = s.applyOps(csnap, [cat('add', { name: 'Goats' }), { opId: 'g', kind: 'entry', action: 'add', id: 'row-00003', data: D('row-00003', 'Goats') }, cat('rename', { name: 'Goats', to: 'dairy' }), cat('delete', { name: 'Dairy' })]);
assert.deepStrictEqual([v.cats.Expense, v.rows.map(r => r.type + ' ' + r.category)], [['House', 'Crops', 'Others'], ['Expense Others', 'Income Dairy', 'Expense Others']], 'merge into Dairy, then delete moves both to Others; Income Dairy untouched');
v = s.applyOps(csnap, [cat('rename', { name: 'Dairy', to: 'dairy' }), cat('rename', { name: 'Others', to: 'Misc' }), cat('delete', { name: 'Others' }), cat('rename', { name: 'Gone', to: 'X' }), cat('add', { name: 'house' })]);
assert.deepStrictEqual([v.cats.Expense, v.rows[0].category], [['House', 'dairy', 'Crops', 'Others'], 'dairy'], 'a case-only rename keeps it; Others, unknown names and duplicates change nothing');
assert.deepStrictEqual([s.CATEGORIES.Expense, csnap.rows[0].category], [['House', 'Dairy', 'Crops', 'Others'], 'Dairy'], 'defaults and snapshot not mutated');
assert.strictEqual(s.applyCat({ Income: ['Others'], Expense: ['Others'] }, [], cat('delete', { name: 'Others' })), 'Others cannot be changed');
assert.strictEqual(s.applyCat({ Income: ['Others'], Expense: ['Others'] }, [], cat('add', { name: '=1+1' })), 'bad category');
// Totals follow the sheet's categories; an entry whose category was renamed elsewhere still counts (no NaN)
const goats = { Income: ['Milk', 'Others'], Expense: ['Goats', 'Milk', 'Others'] };
const gs = s.summarize([D('row-g0001', 'Goats'), D('row-g0002', 'Milk', 'Income'), D('row-g0003', 'Fuel')].map(r => ({ ...r, dateTime: iso(2026, 9, 2) })), 'month', new Date(2026, 9, 11), 0, goats);
assert.deepStrictEqual([Object.keys(gs.net), gs.net, gs.spent], [['Milk', 'Goats', 'Others', 'Fuel'], { Milk: 10, Goats: -10, Others: 0, Fuel: -10 }, { Goats: 10, Milk: 0, Others: 0, Fuel: 10 }]);
assert.deepStrictEqual(s.spendShare(gs).slices.map(x => [x.name, x.i]), [['Goats', 0], ['Fuel', 3]], 'i = place in the list, for the pie colour');

// Most recent 20 for History
const many = Array.from({ length: 25 }, (_, i) => ({ ...ok, id: 'many-' + String(i).padStart(4, '0'), dateTime: iso(2026, 9, 1 + i) }));
const recent = s.recentEntries(many.concat(many[24]), 20);
assert.strictEqual(recent.length, 20);
assert.strictEqual(recent[0].id, 'many-0024');
assert.strictEqual(recent[19].id, 'many-0005');

// History filters: year, month (0-11), type or type-category, search on reason / category / amount
const notes = [{ ...e(1, iso(2026, 9, 1), 'Expense', 'Dairy', 450), note: 'Cattle feed' }, { ...e(2, iso(2026, 8, 3), 'Income', 'Dairy', 12000), note: 'Milk payment' },
  { ...e(3, iso(2025, 9, 9), 'Expense', 'House', 1250), note: 'Ration' }, { ...e(4, iso(2026, 9, 2), 'Income', 'Others', 1500) }];
const ids = f => s.filterEntries(notes, { q: '', year: '', month: '', cat: '', ...f }).map(x => x.id.split('-')[1]);
assert.deepStrictEqual(ids({}), ['4', '1', '2', '3'], 'everything, newest first');
assert.deepStrictEqual(ids({ year: '2026' }), ['4', '1', '2']);
assert.deepStrictEqual(ids({ month: '9' }), ['4', '1', '3'], 'October in any year');
assert.deepStrictEqual(ids({ month: '0' }), [], 'January is month 0, not "any"');
assert.deepStrictEqual(ids({ year: '2026', month: '9' }), ['4', '1']);
assert.deepStrictEqual(ids({ cat: 'Income' }), ['4', '2']);
assert.deepStrictEqual(ids({ cat: 'Expense-Dairy' }), ['1']);
assert.deepStrictEqual(ids({ q: '  MILK ' }), ['2']);
assert.deepStrictEqual(ids({ q: 'others' }), ['4'], 'matches the category when there is no reason');
assert.deepStrictEqual(ids({ q: '1250' }), ['3'], 'matches the amount');
assert.deepStrictEqual(ids({ q: 'feed', cat: 'Income' }), []);
assert.deepStrictEqual(s.filterEntries([{ ...notes[0], by: 'Sunita' }, notes[1]], { q: '', year: '', month: '', cat: '', who: 'Sunita' }).map(x => x.id), [notes[0].id], 'who added it');

// Loans: partial repayment, fully repaid, period totals; loans never touch money in/out
const loans = [loan, { id: 'loan-0002', dateTime: iso(2026, 9, 2), reason: 'Bank, seeds', amount: 10000 }];
const repays = [rep, { ...rep, id: 'rep-00002', dateTime: iso(2026, 9, 9), amount: 2500.5 },
  { id: 'rep-00003', loanId: 'loan-0002', dateTime: iso(2026, 9, 3), amount: 10000 },
  { id: 'rep-00004', loanId: 'no-such-loan', dateTime: iso(2026, 9, 3), amount: 1 }];
const oct = s.periodRange('month', new Date(2026, 9, 11));
const L = s.summarizeLoans(loans, repays, oct.start, oct.end);
assert.deepStrictEqual([L.borrowed, L.repaid, L.owed], [30000, 17500.5, 12499.5]);
assert.deepStrictEqual([L.periodBorrowed, L.periodRepaid], [10000, 17500.5]);
assert.deepStrictEqual(L.loans.map(x => [x.id, x.repaid, x.owed, x.done]), [['loan-0001', 7500.5, 12499.5, false], ['loan-0002', 10000, 0, true]]);
assert.deepStrictEqual(L.loans[0].repays.map(r => r.id), ['rep-00002', 'rep-00001'], 'newest repayment first');
assert.deepStrictEqual(s.summarizeLoans(loans, repays).periodBorrowed, 0, 'no period given');
// Interest: simple, on what is still owed, shown per month (a yearly rate is spread over 12 months); repaid loans cost nothing
const LI = s.summarizeLoans([{ ...loan, interest: 2, per: 'month' }, { ...loans[1], interest: 12, per: 'year' }, { ...loan, id: 'loan-0003', interest: 18, per: 'year' }], repays);
assert.deepStrictEqual(LI.loans.map(x => [x.id, x.monthly]), [['loan-0001', 249.99], ['loan-0003', 300], ['loan-0002', 0]]);
assert.strictEqual(LI.monthlyInterest, 549.99);
assert.deepStrictEqual([L.loans[0].interest, L.loans[0].monthly, L.monthlyInterest], [0, 0, 0], 'older loans without interest');
// Priority: open loans High > Medium > Low, then newest; repaid loans stay last whatever their priority; missing = medium
const P = (id, date, priority) => ({ id, dateTime: iso(2026, 9, date), reason: 'x', amount: 100, priority });
const order = s.summarizeLoans([P('loan-low-1', 9, 'low'), P('loan-med-1', 1), P('loan-hig-1', 2, 'high'), P('loan-med-2', 5, 'medium'), P('loan-hig-done', 9, 'high')],
  [{ id: 'rep-done-1', loanId: 'loan-hig-done', dateTime: iso(2026, 9, 10), amount: 100 }]).loans;
// Each direction is summarised on its own: the other direction's repayments are ignored
const given = { id: 'loan-given', dateTime: iso(2026, 9, 1), reason: 'To Raju', amount: 10000, dir: 'given' };
const G = s.summarizeLoans([given], repays.concat([{ id: 'rep-given1', loanId: 'loan-given', dateTime: iso(2026, 9, 5), amount: 4000 }]));
assert.deepStrictEqual([G.borrowed, G.repaid, G.owed], [10000, 4000, 6000]);
assert.deepStrictEqual([G.loans[0].dir, L.loans[0].dir], ['given', 'borrowed'], 'direction kept; missing means borrowed');
assert.deepStrictEqual(order.map(x => [x.id, x.priority]), [['loan-hig-1', 'high'], ['loan-med-2', 'medium'], ['loan-med-1', 'medium'], ['loan-low-1', 'low'], ['loan-hig-done', 'high']]);

// ---- Forecast from the saving rate
const NOW = new Date(2026, 9, 11);
const sav = (y, m, amount) => ({ id: 'sv-' + y + '-' + m + '-x', dateTime: iso(y, m, 10), type: amount > 0 ? 'Income' : 'Expense', category: 'Others', amount: Math.abs(amount) });
const hist = [sav(2026, 6, 30000), sav(2026, 7, 20000), sav(2026, 8, 10000), sav(2026, 3, -6000), sav(2026, 9, 99999)]; // Jul, Aug, Sep; April; this month
let sr = s.savingRate(hist, NOW, 3);
assert.deepStrictEqual([sr.perMonth, sr.from.getMonth(), sr.to.getMonth()], [20000, 6, 8], 'last 3 complete months: Jul-Sep; October is not counted');
assert.strictEqual(s.savingRate(hist, NOW, 6).perMonth, 9000, '(30000+20000+10000-6000)/6');
assert.strictEqual(s.savingRate([sav(2026, 8, -3000)], NOW, 3).perMonth, -1000, 'spending more than earning');

const bl = (id, amount, interest, per, priority, date) => ({ id, dateTime: iso(2026, 0, date || 1), reason: id, amount, interest, per, priority });
let f = s.forecast([], [], 5000, NOW);
assert.deepStrictEqual([f.hasLoans, f.months.length, f.months[11].position, f.months[0].date.getMonth()], [false, 24, 60000, 10], 'no loans: savings pile up; first point is November');
f = s.forecast([bl('loan-a', 10000, 0)], [], 3000, NOW);
assert.deepStrictEqual([f.payoff.months, f.months[3].owed, f.months[3].saved, f.months.length], [4, 0, 2000, 24], 'no interest: ceil(10000/3000)=4; the 4th month leaves 2000 over');
f = s.forecast([bl('loan-b', 10000, 2, 'month')], [], 5000, NOW);
// 10000*1.02-5000=5200; 5200*1.02=5304-5000=304; 304*1.02=310.08 paid, 4689.92 saved
assert.deepStrictEqual([f.payoff.months, f.months[0].owed, f.months[1].owed, f.months[2].saved, f.totalInterest, f.monthlyInterestNow], [3, 5200, 304, 4689.92, 310.08, 200]);
assert.strictEqual(s.forecast([bl('loan-y', 12000, 12, 'year')], [], 12000, NOW).months[0].owed, 120, 'yearly rate spread over 12 months: 12000*1.01-12000');
// Priority first, then dearer interest, then older; loans given to others and repaid loans are ignored
f = s.forecast([bl('low-cheap', 5000, 0, 'month', 'low'), bl('med-cheap', 5000, 1, 'month', 'medium', 2), bl('med-dear', 5000, 3, 'month', 'medium', 3), { ...bl('lent-out', 9000), dir: 'given' }, bl('repaid-1', 100)],
  [{ id: 'rp-repaid-1', loanId: 'repaid-1', dateTime: iso(2026, 1, 1), amount: 100 }], 6000, NOW);
assert.deepStrictEqual(f.perLoan.map(l => l.reason), ['med-dear', 'med-cheap', 'low-cheap']);
assert.strictEqual(f.owedNow, 15000);
f = s.forecast([bl('loan-c', 100000, 3, 'month')], [], 2000, NOW);
assert.deepStrictEqual([f.never, f.payoff, f.monthlyInterestNow, f.months.length], [true, null, 3000, 24], 'saving less than the interest: never paid off');
assert.strictEqual(s.forecast([bl('loan-d', 1000000, 0)], [], 1000, NOW).never, true, 'more than 10 years counts as never in the graph');

// ---- Investments: worth now and growth, compound (funds) or simple; money given adds its interest to each month's savings
const ivs = extra => ({ id: 'inv-00001', dateTime: iso(2026, 9, 11), reason: 'Liquid fund', amount: 100000, interest: 12, per: 'year', dir: 'invested', ...extra });
f = s.forecast([ivs()], [], 0, NOW);
assert.deepStrictEqual([f.hasInvest, f.investedNow, f.growthNow, f.months[11].position, f.months[23].position], [true, 100000, 948.88, 12000, 25440], 'compound: 12% a year');
f = s.forecast([ivs({ compound: false })], [], 0, NOW);
assert.deepStrictEqual([f.growthNow, f.months[11].position, f.months[23].position], [1000, 12000, 24000], 'simple: the same 1,000 every month');
const IV = s.summarizeLoans([ivs({ dateTime: iso(2025, 9, 11) })], [{ id: 'wd-000001', loanId: 'inv-00001', dateTime: iso(2026, 3, 11), amount: 50000 }], null, null, NOW).loans[0];
assert.ok(Math.abs(IV.owed - (100000 * 1.12 - 50000 * Math.sqrt(1.12))) < 20, 'worth now: a year of growth, minus a withdrawal and the growth it missed (' + IV.owed + ')');
assert.deepStrictEqual([IV.dir, IV.repaid, IV.principal, IV.done], ['invested', 50000, 50000, false]);
f = s.forecast([{ id: 'giv-00001', dateTime: iso(2026, 0, 1), reason: 'To Raju', amount: 10000, interest: 2, per: 'month', dir: 'given' }], [], 0, NOW);
assert.deepStrictEqual([f.interestIn, f.months[11].position, f.hasLoans], [200, 2400, false], 'money given: 2% a month on 10,000 comes in every month');
// Interest already received is not averaged in (the forecast adds what is still to come instead)
assert.strictEqual(s.savingRate([sav(2026, 8, 3000), { ...sav(2026, 8, 900), id: 'int-0001', category: 'interest' }], NOW, 3).perMonth, 1000);
assert.strictEqual(s.validateLoan({ ...ivs(), compound: false }), '');
assert.strictEqual(s.validateLoan({ ...ivs(), compound: 'no' }), 'bad interest');
assert.strictEqual(s.validateLoan({ ...ivs(), dir: 'stocks' }), 'bad dir');

// ---- Indian financial year (April to March)
assert.deepStrictEqual(Object.values(s.periodRange('fy', new Date(2027, 1, 10))), [new Date(2026, 3, 1), new Date(2027, 3, 1)], 'Feb 2027 is in FY 2026-27');
assert.deepStrictEqual(s.periodRange('fy', new Date(2026, 3, 1)).start, new Date(2026, 3, 1));
assert.strictEqual(s.periodLabel('fy', new Date(2026, 9, 11)), 'FY 2026-27');
assert.deepStrictEqual(s.shiftPeriod('fy', new Date(2027, 1, 10), -1), new Date(2025, 3, 1));
const fy = s.summarize([e(1, iso(2026, 3, 2), 'Income', 'Job', 100), e(2, iso(2027, 2, 30), 'Expense', 'House', 40), e(3, iso(2026, 2, 31), 'Income', 'Job', 7)], 'fy', new Date(2026, 9, 1), 0);
assert.deepStrictEqual([fy.labels[0], fy.labels[11], fy.income, fy.expense, fy.incomeSeries[0], fy.expenseSeries[11]], ['Apr', 'Mar', 100, 40, 100, 40]);

// ---- Settings ops: validated, applied by the phone the same way as by the script, and categories carry budgets and bills along
const set = (key, value, id) => ({ opId: 'set-' + key, kind: 'set', action: 'update', data: { key, id, value } });
const bill = { name: 'Rent', category: 'House', amount: 12000, day: 1, every: 1, next: '2026-11' };
assert.strictEqual(s.validateSet(set('bill', bill, 'bill-0001').data), '');
[{ ...bill, day: 0 }, { ...bill, every: 2 }, { ...bill, next: '2026-13' }, { ...bill, name: '' }, { ...bill, category: '=X' }].forEach(b => assert.strictEqual(s.validateSet(set('bill', b, 'bill-0001').data), 'bad setting'));
assert.strictEqual(s.validateSet(set('bill', bill, '__proto__').data), 'bad id');
assert.strictEqual(s.validateSet(set('loan', { emi: 5600, day: 5, star: true }, 'loan-0001').data), '');
assert.strictEqual(s.validateSet(set('loan', { type: 'stocks' }, 'loan-0001').data), 'bad setting');
assert.strictEqual(s.validateSet(set('focus', 'debt').data), '');
assert.strictEqual(s.validateSet(set('focus', 'rich').data), 'bad setting');
assert.strictEqual(s.validateSet(set('budget', 600, 'Constructor').data), '');
assert.strictEqual(s.validateSet(set('budget', 600, 'constructor').data), 'bad setting');
assert.strictEqual(s.validateSet({ key: 'nope', value: 1 }), 'bad setting');
v = s.applyOps({ rows: [], settings: { budgets: { Dairy: 900 } } }, [set('daily', 20000), set('budget', 600, 'Others'), set('bill', bill, 'bill-0001'), set('bill', { ...bill, category: 'Dairy' }, 'bill-0002'),
  set('loan', { emi: 5600 }, 'loan-0001'), set('year', 'apr'), set('focus', 'nope'), cat('rename', { name: 'dairy', to: 'Animals' }), set('budget', 0, 'Others'), set('bill', null, 'bill-0001')]);
assert.deepStrictEqual([v.settings.daily, v.settings.budgets, Object.keys(v.settings.bills), v.settings.bills['bill-0002'].category, v.settings.loans['loan-0001'].emi, v.settings.year, v.settings.focus],
  [20000, { Animals: 900 }, ['bill-0002'], 'Animals', 5600, 'apr', 'auto'], 'a rename carries the budget and bills along; a bad op changes nothing');
v = s.applyOps({ settings: v.settings, loans: [loan] }, [cat('delete', { name: 'Animals' }), { opId: 'd', kind: 'loan', action: 'delete', id: 'loan-0001' }]);
assert.deepStrictEqual([v.settings.budgets, v.settings.bills['bill-0002'].category, v.settings.loans], [{}, 'Others', {}], 'deleting: budget dropped, bills to Others, loan extras gone');
assert.deepStrictEqual(s.settingsOf(null), s.newSettings());

// ---- Months, totals, and the stretch to compare with
assert.deepStrictEqual([s.monthKey(new Date(2026, 0, 5)), s.addMonths('2026-11', 3), s.dayIn('2026-09', 31).getDate(), s.dayIn('2027-02', 30).getDate()], ['2026-01', '2027-02', 30, 28]);
let ps = s.previousSpan('month', new Date(2026, 9, 11, 15), new Date(2026, 9, 11, 15));
assert.deepStrictEqual([ps.start, ps.end, ps.partial], [new Date(2026, 8, 1), new Date(2026, 8, 11, 15), true], 'October running: 1 Sep to the same moment of 11 Sep');
ps = s.previousSpan('month', new Date(2026, 8, 5), new Date(2026, 9, 11));
assert.deepStrictEqual([ps.start, ps.end, ps.partial], [new Date(2026, 7, 1), new Date(2026, 8, 1), false], 'a finished month: all of the one before');
assert.deepStrictEqual(s.totals(rows, new Date(2026, 9, 1), new Date(2026, 9, 11)), { income: 62000.5, expense: 4000.55, spent: { Dairy: 4000.25, House: 0.3 }, savings: 57999.95 });
assert.deepStrictEqual(s.lastMonths(rows, new Date(2026, 10, 3), 2).map(x => [x.label, x.savings]), [['Sep 2026', 0], ['Oct 2026', 51499.95]]);

// ---- Cash flow: principal paid, borrowed, invested net of withdrawals (added = negative withdrawal), lent net of what came back
const cf = s.cashFlow([loan, { ...loan, id: 'loan-0009', dateTime: iso(2026, 9, 3), amount: 3000 }, { ...given, dateTime: iso(2026, 9, 1) }, ivs({ dateTime: iso(2026, 9, 2), amount: 5000 })],
  [rep, { id: 'gv-000001', loanId: 'loan-given', dateTime: iso(2026, 9, 6), amount: 1000 }, { id: 'tu-000001', loanId: 'inv-00001', dateTime: iso(2026, 9, 7), amount: -2000 }, { id: 'xx-000001', loanId: 'nobody-1', dateTime: iso(2026, 9, 7), amount: 9 }],
  new Date(2026, 9, 1), new Date(2026, 10, 1));
assert.deepStrictEqual(cf, { loansPaid: 5000, borrowed: 3000, invested: 7000, lent: 9000 });
const IVT = s.summarizeLoans([ivs({ dateTime: iso(2026, 9, 11) })], [{ id: 'tu-000002', loanId: 'inv-00001', dateTime: iso(2026, 9, 11), amount: -20000 }], null, null, NOW).loans[0];
assert.deepStrictEqual([IVT.owed, IVT.principal], [120000, 120000], 'money added grows the investment');

// ---- Budgets: everyday spending is every category without a bill
const brows = [e(1, iso(2026, 9, 1), 'Expense', 'House', 12000), e(2, iso(2026, 9, 3), 'Expense', 'Dairy', 6850), e(3, iso(2026, 9, 9), 'Expense', 'Others', 740), e(4, iso(2026, 8, 9), 'Expense', 'Others', 5)];
const bs = s.budgetStatus(brows, { ...s.newSettings(), daily: 20000, budgets: { Others: 600, Dairy: 8000 }, bills: { 'bill-0001': bill } }, s.CATEGORIES, new Date(2026, 9, 11, 9));
assert.deepStrictEqual([bs.daily, bs.over], [{ limit: 20000, spent: 7590, left: 12410, days: 21, perDay: 590 }, [{ cat: 'Others', spent: 740, limit: 600, over: 140 }]]);
assert.strictEqual(s.budgetStatus(brows, s.newSettings(), s.CATEGORIES, NOW).daily, null, 'no daily budget set');

// ---- Due: bills, EMIs, SIPs and monthly interest; a payment this month moves the EMI to next month
const emiLoan = { ...loan, id: 'loan-emi01', amount: 120000, interest: 14, per: 'year' }, gold = { ...loan, id: 'loan-gold1', dateTime: iso(2026, 2, 10), reason: 'Gold loan', amount: 50000, interest: 10, per: 'year' };
const sipInv = ivs({ id: 'inv-sip01', reason: 'SIP' });
const dset = { ...s.newSettings(), bills: { 'bill-0001': bill }, loans: { 'loan-emi01': { emi: 5600, day: 5 }, 'inv-sip01': { sip: 5000, day: 5 }, 'loan-gold1': { paid: '2026-10' } } };
let due = s.dueItems([emiLoan, gold, sipInv, { ...loan, id: 'loan-free1' }], [{ id: 'emi-pay01', loanId: 'loan-emi01', dateTime: iso(2026, 9, 5), amount: 4150 }], dset, NOW);
assert.deepStrictEqual(due.map(d => [d.kind, d.name, d.amount, d.date.getDate(), d.date.getMonth()]),
  [['sip', 'SIP', 5000, 5, 9], ['bill', 'Rent', 12000, 1, 10], ['emi', 'From Ramesh, tractor repair', 5600, 5, 10], ['int', 'Gold loan', 417, 10, 10]],
  'SIP not yet added: 5 Oct (overdue, first); EMI paid in Oct: 5 Nov; interest paid for Oct: 10 Nov; a loan without interest is not due');

// ---- Add again: the same thing entered at least twice in 60 days; its amount only when it is usually the same
const fr = s.frequent([...[1, 2, 3, 4].map(i => ({ ...e(10 + i, iso(2026, 9, i), 'Expense', 'Dairy', 66), note: 'Milk' })), { ...e(20, iso(2026, 9, 5), 'Expense', 'Dairy', 66), note: ' milk ' },
  { ...e(21, iso(2026, 9, 2), 'Expense', 'Others', 500), note: 'Petrol' }, { ...e(22, iso(2026, 9, 6), 'Expense', 'Others', 300), note: 'Petrol' }, { ...e(23, iso(2026, 9, 7), 'Expense', 'Others', 450), note: 'Petrol' },
  { ...e(24, iso(2026, 9, 7), 'Expense', 'House', 9), note: 'Once' }, { ...e(25, iso(2026, 5, 1), 'Expense', 'House', 9), note: 'Once' }], NOW, 4);
assert.deepStrictEqual(fr.map(x => [x.note, x.amount]), [['milk', 66], ['Petrol', 0]], 'milk 5 times at 66; petrol varies; "Once" only once in 60 days');

// ---- Focus, net worth, and the two plans
const B0 = s.newSettings(), inv1 = ivs({ dateTime: iso(2026, 9, 11) });
assert.deepStrictEqual([s.focusOf([emiLoan], [], B0, NOW), s.focusOf([emiLoan, { ...inv1, amount: 150000 }], [], B0, NOW), s.focusOf([], [], B0, NOW), s.focusOf([], [], { ...B0, focus: 'debt' }, NOW)], ['debt', 'grow', 'grow', 'debt']);
assert.strictEqual(s.netWorth([emiLoan, inv1, given], [], NOW.getTime() + 1), 100000 + 10000 - 120000);
assert.strictEqual(s.netWorth([emiLoan, inv1, given], [], new Date(2026, 9, 1).getTime()), -120000, 'only what existed before 1 Oct: the September loan');
const yadav = [{ ...emiLoan, dateTime: NOW.toISOString(), interest: 14 }, { ...gold, dateTime: NOW.toISOString(), amount: 50000 }, { ...loan, id: 'loan-chacha', dateTime: NOW.toISOString(), amount: 30000 }];
assert.deepStrictEqual([s.payoffIn(yadav, [], 7300, NOW), s.neededToClear(yadav, [], 24, NOW), s.neededToClear(yadav, [], 18, NOW)], [31, 9200, 12000], 'the mockup numbers');
assert.strictEqual(s.payoffIn(yadav, [], 1000, NOW), null, 'too little to ever pay them off');
assert.strictEqual(s.neededToClear([], [], 12, NOW), null, 'nothing owed');
const verma = [ivs({ id: 'inv-sip001', amount: 142300, interest: 12, dateTime: NOW.toISOString() }), ivs({ id: 'inv-ppf001', amount: 62000, interest: 7.1, dateTime: NOW.toISOString() }),
  ivs({ id: 'inv-fd0001', amount: 100000, interest: 7, dateTime: NOW.toISOString() }), ivs({ id: 'inv-rd0001', amount: 22000, interest: 6.5, dateTime: NOW.toISOString() })];
const lt = s.longTerm(verma, [], { ...B0, loans: { 'inv-sip001': { sip: 5000 }, 'inv-rd0001': { sip: 2000, goal: 30000 } } }, NOW);
assert.deepStrictEqual([lt.worth, lt.monthly, Math.round(lt.rate * 1e5)], [304300, 5000, 746], 'the Diwali RD (a goal) is kept apart');
assert.ok(Math.abs(lt.addRate - (Math.pow(1.12, 1 / 12) - 1)) < 1e-9, 'the SIP grows at its fund\'s 12%');
const n10 = s.monthsToGoal(lt.worth, lt.rate, 5000, 1e6, lt.addRate);
assert.strictEqual(n10, 70, '₹10 lakh in 70 months, as in the mockup');
assert.strictEqual(s.monthsToGoal(lt.worth, lt.rate, 5000, 1e5), 0);
const need = s.neededForGoal(lt.worth, lt.rate, 1e6, 60, lt.addRate);
assert.ok(s.monthsToGoal(lt.worth, lt.rate, need, 1e6, lt.addRate) <= 60 && s.monthsToGoal(lt.worth, lt.rate, need - 100, 1e6, lt.addRate) > 60, 'the smallest amount that gets there in 60 months (' + need + ')');
assert.strictEqual(s.neededForGoal(1e6, 0.01, 1e5, 12), 0, 'already there');
assert.deepStrictEqual([s.goalOf(B0, 304300), s.goalOf(B0, 0), s.goalOf({ ...B0, goal: 777777 }, 1)], [5e5, 1e5, 777777]);
assert.deepStrictEqual([s.targets(31), s.targets(4), s.targets(3), s.targets(1), s.targets(null)], [[19, 25, 31], [2, 3, 4], [2, 3], [1], [12, 24, 36]], 'every other chip is sooner than the pace');

// ---- 3 things to notice
const nc = { focus: 'debt', avgExpense: 31500, safety: 0.19, liquid: 6000, inHand: 1300, costly: { name: 'Personal loan', rate: 14 }, earn: 6.5, sooner: { more: 1900, months: 7, saved: 5600 }, emiLoad: 0.16,
  interestYear: 20000, over: [{ cat: 'Kirana', over: 400 }], rise: null, goals: [], streak: 0 };
assert.deepStrictEqual(s.notesFor(nc).map(x => x.kind), ['safety', 'costly', 'sooner']);
assert.strictEqual(s.notesFor(nc)[0].need, 25500, 'a month of expenses, less what is there');
assert.deepStrictEqual(s.notesFor({ ...nc, safety: 2, earn: 15, sooner: null }).map(x => x.kind), ['interest', 'over'], 'a month covered and no costly loan');
const ng = { ...nc, focus: 'grow', safety: 1.9, liquid: 100000, avgExpense: 52000, goals: [{ name: 'Diwali fund', short: 6000, by: '2026-11' }, { name: 'Fees', short: 0 }], over: [], rise: { cat: 'Kirana', now: 6850, before: 5650 }, streak: 4 };
assert.deepStrictEqual(s.notesFor(ng).map(x => x.kind), ['safety', 'goal', 'streak']);
assert.deepStrictEqual(s.notesFor({ ...ng, safety: 7, goals: [], streak: 0 }).map(x => x.kind), ['rise']);
assert.deepStrictEqual(s.biggestRise({ Dairy: 6850, House: 20000, Others: 900, New: 5000 }, { Dairy: 5650, House: 9000, Others: 500 }, { House: true }), { cat: 'Dairy', now: 6850, before: 5650 },
  'bills, new categories and small rises are left out');
// Loan interest paid is added back for the forecast (it charges interest itself); interest got is left out
assert.strictEqual(s.savingRate([sav(2026, 8, 3000), { ...sav(2026, 8, -600), id: 'li-0001', category: 'loan interest' }], NOW, 3).perMonth, 1000);

console.log('all tests passed');
