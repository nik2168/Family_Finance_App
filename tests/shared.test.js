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

// Validation: the reason is required for income and expenses
const ok = { ...e(1, iso(2026, 9, 1), 'Expense', 'House', 10), note: 'Ration' };
assert.strictEqual(s.validateEntry(ok), '');
assert.strictEqual(s.validateEntry({ ...ok, note: undefined }), 'reason required');
assert.strictEqual(s.validateEntry({ ...ok, note: '   ' }), 'reason required');
assert.strictEqual(s.validateEntry({ ...ok, note: 'x'.repeat(201) }), 'reason too long');
assert.strictEqual(s.validateEntry({ ...ok, amount: -5 }), 'bad amount');
assert.strictEqual(s.validateEntry({ ...ok, amount: '5' }), 'bad amount');
assert.strictEqual(s.validateEntry({ ...ok, type: 'Income', category: 'House' }), 'bad category');
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
assert.strictEqual(s.validateRepay({ ...rep, amount: -1 }), 'bad amount');

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

console.log('all tests passed');
