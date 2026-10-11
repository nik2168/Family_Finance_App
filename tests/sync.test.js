// Run: make test (or node tests/sync.test.js). Runs Code.gs + shared.js against a fake in-memory Google Sheet.
const assert = require('assert');
const eq = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const { createBackend } = require('./fake-sheet.js');

const B = createBackend(), { ctx, props, tab, month } = B;
ctx.setup();
const KEY = props.KEY;
const post = body => ctx.doPost({ postData: { contents: JSON.stringify({ key: KEY, ...body }) } });
const T = '2026-10-11T04:30:00.000Z'; // 11 Oct 2026, 10:00 in India
const entry = (id, extra) => ({ id, dateTime: T, type: 'Expense', category: 'Dairy', amount: 450, note: 'Cattle feed', createdAt: T, ...extra });
const op = (opId, kind, action, id, data) => ({ opId, kind, action, id, data });
const OCT = 9, SEP = 8;
const cells = rows => rows.map(r => r.slice(1, 5)); // Category, Income, Expense, Reason

// ---- setup(): only the common tab exists until there is an entry; year tabs are made when needed
eq(B.ss.getSheets().map(t => t.name), ['Loans & Settings']);
eq(tab('Loans & Settings').rows[0], ['Others monthly limit', 3000]);
// Four tables, left to right: MONEY BORROWED A:I, PAID BACK K:O, MONEY GIVEN Q:Y, GOT BACK AA:AE
eq([0, 10, 16, 26].map(c => tab('Loans & Settings').rows[2][c]), ['MONEY BORROWED', 'PAID BACK', 'MONEY GIVEN', 'GOT BACK']);
eq(tab('Loans & Settings').rows[3].slice(0, 9), ['Date', 'From whom / why', 'Amount', 'Interest %', 'Per', 'Priority', 'Paid back', 'Still owed', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(10, 15), ['Date', 'Loan', 'Amount', 'LoanId', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(16, 25), ['Date', 'To whom / why', 'Amount', 'Interest %', 'Per', 'Priority', 'Got back', 'Still to get', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(26, 31), ['Date', 'Given to', 'Amount', 'LoanId', 'Id']);
eq(tab('Loans & Settings').hiddenCols, [9, 14, 15, 25, 30, 31], 'Id columns hidden');
eq(ctx.doPost({ postData: { contents: JSON.stringify({ key: 'nope', ops: [] }) } }), { error: 'wrong key' });
eq(ctx.doPost({ postData: { contents: '{oops' } }), { error: 'bad request' });

// ---- Old phones: {pending: [entry]}; the reason is required
let r = post({ pending: [entry('aaaaaaaa-1'), entry('bbbbbbbb-2', { note: '' })] });
eq(r.done, ['aaaaaaaa-1']);
eq(r.rejected, [{ opId: 'bbbbbbbb-2', error: 'reason required' }]);
eq(B.ss.getSheets().map(t => t.name), ['2026', 'Loans & Settings'], 'the 2026 tab is made by the first 2026 entry, before the common tab');

// ---- The year tab: title, summary (live formulas), 12 month tables side by side
const y = tab('2026');
assert.strictEqual(y.rows[0][0], '2026 · Family Money');
eq(y.rows[2], ['Month', 'Job', 'Dairy', 'Crops', 'Others', 'Income', 'House', 'Dairy', 'Crops', 'Others', 'Expenses', 'Saved']);
eq(y.rows[3].slice(0, 2), ['January', '=SUMIF(B21:B,"Job",C21:C)']);
eq(y.rows[12].slice(6, 12), ['=SUMIF(BM21:BM,"House",BO21:BO)', '=SUMIF(BM21:BM,"Dairy",BO21:BO)', '=SUMIF(BM21:BM,"Crops",BO21:BO)', '=SUMIF(BM21:BM,"Others",BO21:BO)', '=SUM(G13:J13)', '=F13-K13'], 'October = month 10, columns BL:BQ');
eq(y.rows[15].slice(0, 3), ['Total', '=SUM(B4:B15)', '=SUM(C4:C15)']);
eq(y.rows[18][7 * OCT], 'OCTOBER');
eq(y.rows[19].slice(7 * OCT, 7 * OCT + 6), ['Date', 'Category', 'Income', 'Expense', 'Reason', 'Id']);
eq(y.hiddenCols.slice(0, 2), [6, 13], 'the Id column of each month is hidden');
eq(cells(month(2026, OCT)), [['Dairy', '', 450, 'Cattle feed']]);
assert.ok(month(2026, OCT)[0][0] instanceof Date);

// ---- Add (retry-safe), formula-like reasons are neutralised, rows stay sorted by date
const early = '2026-10-02T04:30:00.000Z';
r = post({ ops: [op('o1', 'entry', 'add', 'cccccccc-3', entry('cccccccc-3', { note: '=HYPERLINK("x")', dateTime: early })), op('o1', 'entry', 'add', 'cccccccc-3', entry('cccccccc-3'))] });
eq(r.done, ['o1', 'o1']);
eq(cells(month(2026, OCT)), [['Dairy', '', 450, '\'=HYPERLINK("x")'], ['Dairy', '', 450, 'Cattle feed']], 'retry not duplicated; 2 Oct sorts first');

// ---- Update: change type and category; then move to another month and another year
r = post({ ops: [op('o2', 'entry', 'update', 'cccccccc-3', entry('cccccccc-3', { amount: 600, type: 'Income', category: 'Crops', note: 'Wheat sold', dateTime: early }))] });
eq(cells(month(2026, OCT))[0], ['Crops', 600, '', 'Wheat sold']);
r = post({ ops: [op('o3', 'entry', 'update', 'cccccccc-3', entry('cccccccc-3', { dateTime: '2026-09-15T04:30:00.000Z', note: 'Moved' }))] });
eq(cells(month(2026, OCT)), [['Dairy', '', 450, 'Cattle feed']], 'gone from October; the old row is blanked');
eq(cells(month(2026, SEP)), [['Dairy', '', 450, 'Moved']]);
r = post({ ops: [op('o4', 'entry', 'update', 'cccccccc-3', entry('cccccccc-3', { dateTime: '2027-01-03T04:30:00.000Z', note: 'Next year' }))] });
eq(B.ss.getSheets().map(t => t.name), ['2027', '2026', 'Loans & Settings'], 'a 2027 tab appears only now, newest first');
eq(month(2026, SEP), []);
eq(cells(month(2027, 0)), [['Dairy', '', 450, 'Next year']]);
r = post({ ops: [op('o5', 'entry', 'update', 'cccccccc-3', entry('cccccccc-3', { note: ' ' }))] });
eq(r.rejected, [{ opId: 'o5', error: 'reason required' }]);

// ---- Month boundary uses India time: 31 Oct 23:30 IST is still October
post({ ops: [op('o6', 'entry', 'add', 'dddddddd-4', entry('dddddddd-4', { dateTime: '2026-10-31T18:00:00.000Z', note: 'Last day' }))] });
eq(cells(month(2026, OCT)).map(x => x[3]), ['Cattle feed', 'Last day']);

// ---- Delete (retry-safe): only that month's rows shift up
r = post({ ops: [op('o7', 'entry', 'delete', 'aaaaaaaa-1'), op('o8', 'entry', 'delete', 'aaaaaaaa-1'), op('o9', 'entry', 'update', 'aaaaaaaa-1', entry('aaaaaaaa-1'))] });
eq(r.done, ['o7', 'o8', 'o9'], 'deleting twice and updating a deleted entry are both harmless');
eq(cells(month(2026, OCT)), [['Dairy', '', 450, 'Last day']]);
eq(r.rows.map(x => x.id).sort(), ['cccccccc-3', 'dddddddd-4']);

// ---- Income from "Others"
r = post({ ops: [op('o10', 'entry', 'add', 'eeeeeeee-5', entry('eeeeeeee-5', { type: 'Income', category: 'Others', note: 'Sold old bicycle' }))] });
eq(r.rows.filter(x => x.id === 'eeeeeeee-5').map(x => [x.type, x.category, x.amount]), [['Income', 'Others', 450]]);

// ---- Rows typed by hand: get an Id and become editable; half-typed rows are kept as they are
B.typeRow(2026, OCT, [new Date('2026-10-20T06:00:00Z'), 'crops ', 9000, '', 'Typed in sheet']);
B.typeRow(2026, OCT, [new Date('2026-10-21T06:00:00Z'), 'House', '', '', 'no amount yet']);
B.typeRow(2026, OCT, [new Date('2026-10-22T06:00:00Z'), 'Job', '', 500, 'Job is not an expense']);
r = post({ ops: [] });
const typed = r.rows.find(x => x.note === 'Typed in sheet');
eq([typed.type, typed.category, typed.amount], ['Income', 'Crops', 9000], 'lower case and spaces are fine');
assert.match(typed.id, /^uuid-\d{4}$/);
assert.ok(month(2026, OCT).some(x => x[5] === typed.id), 'Id written into the sheet');
assert.ok(!r.rows.some(x => /no amount|not an expense/.test(x.note)), 'incomplete rows are not entries');
r = post({ ops: [op('o11', 'entry', 'update', typed.id, { ...entry(typed.id), type: 'Income', category: 'Crops', amount: 9500, note: 'Typed in sheet' })] });
assert.strictEqual(r.rows.find(x => x.id === typed.id).amount, 9500);
eq(month(2026, OCT).map(x => x[4]), ['Sold old bicycle', 'Typed in sheet', 'Last day', 'no amount yet', 'Job is not an expense'], 'incomplete rows survive the rewrite, at the bottom');

// ---- A copy-pasted row (same Id) becomes a separate entry
const copy = month(2026, OCT).find(x => x[4] === 'Sold old bicycle').slice();
copy[4] = 'Pasted';
B.typeRow(2026, OCT, copy);
r = post({ ops: [] });
const pasted = r.rows.find(x => x.note === 'Pasted');
assert.ok(pasted && pasted.id !== 'eeeeeeee-5' && r.rows.some(x => x.id === 'eeeeeeee-5'));

// ---- Loans with partial repayments, interest and priority; deleting a loan deletes its repayments
const L = tab('Loans & Settings');
const loan = { id: 'loan-0001', dateTime: '2026-09-20T05:00:00.000Z', reason: 'From Ramesh, tractor repair', amount: 20000 };
const rep = (id, amount, loanId) => ({ id, loanId: loanId || 'loan-0001', dateTime: T, amount });
r = post({ ops: [op('l1', 'loan', 'add', 'loan-0001', loan), op('r1', 'repay', 'add', 'rep-00001', rep('rep-00001', 5000)), op('r2', 'repay', 'add', 'rep-00002', rep('rep-00002', 1000, 'loan-9999')), op('l2', 'loan', 'add', 'loan-0002', { ...loan, id: 'loan-0002', reason: '' })] });
eq(r.done, ['l1', 'r1']);
eq(r.rejected, [{ opId: 'r2', error: 'loan not found' }, { opId: 'l2', error: 'reason required' }]);
eq(r.loans, [{ id: 'loan-0001', dateTime: loan.dateTime, reason: loan.reason, amount: 20000, interest: 0, per: 'month', priority: 'medium', dir: 'borrowed' }]);
eq(r.repays, [{ id: 'rep-00001', loanId: 'loan-0001', dateTime: T, amount: 5000 }]);
eq(L.rows[4].slice(1, 9), ['From Ramesh, tractor repair', 20000, '', '', 'medium', '=SUMIF($N$5:$N,I5,$M$5:$M)', '=C5-G5', 'loan-0001'], 'paid back and still owed are live formulas');
eq(L.rows[4].slice(11, 15), ['From Ramesh, tractor repair', 5000, 'loan-0001', 'rep-00001'], 'payments show the loan they belong to');
r = post({ ops: [op('l3', 'loan', 'update', 'loan-0001', { ...loan, amount: 25000, interest: 1.5, per: 'year', priority: 'high' }), op('r3', 'repay', 'add', 'rep-00003', rep('rep-00003', 2500))] });
eq(L.rows[4].slice(2, 6), [25000, 1.5, 'year', 'high']);
eq([r.loans[0].interest, r.loans[0].per, r.loans[0].priority, r.repays.length], [1.5, 'year', 'high', 2]);
r = post({ ops: [op('l4', 'loan', 'delete', 'loan-0001')] });
eq([r.loans.length, r.repays.length], [0, 0]);
eq([L.rows[4].slice(0, 9).join(''), L.rows[5].slice(10, 15).join('')], ['', ''], 'old loan and repayment rows are blanked');

// ---- Money given to others: its own table (Q:Y), and what we got back in its own table (AA:AE)
const gave = { id: 'give-0001', dateTime: '2026-08-01T05:00:00.000Z', reason: 'To Raju, for his shop', amount: 10000, interest: 2, per: 'month', priority: 'high', dir: 'given' };
r = post({ ops: [op('g1', 'loan', 'add', 'give-0001', gave), op('g2', 'repay', 'add', 'rep-give1', rep('rep-give1', 4000, 'give-0001'))] });
eq(r.loans.map(l => [l.id, l.dir, l.priority]), [['give-0001', 'given', 'high']]);
eq(L.rows[4].slice(17, 25), ['To Raju, for his shop', 10000, 2, 'month', 'high', '=SUMIF($AD$5:$AD,Y5,$AC$5:$AC)', '=S5-W5', 'give-0001']);
eq(L.rows[4].slice(27, 30), ['To Raju, for his shop', 4000, 'give-0001']);
eq([L.rows[4].slice(0, 15).join('')], [''], 'nothing in the borrowed or paid-back tables');
L.rows[5] = L.rows[5] || [];
[new Date('2026-09-01T05:00:00Z'), 'To Mohan (typed)', 2000].forEach((v, j) => { L.rows[5][16 + j] = v; }); // typed by hand in the Given table
r = post({ ops: [] });
const typedGive = r.loans.find(l => l.reason === 'To Mohan (typed)');
eq([typedGive.dir, typedGive.priority, !!typedGive.id], ['given', 'medium', true]);
r = post({ ops: [op('g3', 'loan', 'delete', 'give-0001')] });
eq([r.loans.map(l => l.reason), r.repays.length], [['To Mohan (typed)'], 0], 'deleting a given loan deletes what was received back');
assert.strictEqual(r.othersLimit, 3000);
L.rows[0][1] = 5000; // the family changes the limit in B1
assert.strictEqual(post({ ops: [] }).othersLimit, 5000);
eq(post({ ops: [{ opId: 'x', kind: 'nope', action: 'add', id: 'zzzzzzzz' }] }).rejected, [{ opId: 'x', error: 'bad op' }]);

// ---- Moving from the old layout (Entries / Loans / Repayments / Settings): data moves, old tabs are hidden, nothing doubles
const O = createBackend();
O.props.KEY = 'k';
const ins = (n, rows) => { const t = O.ss.insertSheet(n); t.rows = rows; };
ins('Sheet1', []);
ins('Entries', [['Id', 'DateTime', 'Type', 'Category', 'Amount', 'Note', 'CreatedAt'], ['old-00001', new Date(T), 'Income', 'Job', 50000, 'Salary', new Date(T)], ['', new Date('2025-12-31T10:00:00Z'), 'Expense', 'House', 300, '', '']]);
ins('Loans', [['Id', 'Date', 'Reason', 'Amount', 'CreatedAt'], ['loan-old1', new Date(T), 'Old loan', 500, new Date(T)]]);
ins('Repayments', [['Id', 'LoanId', 'Date', 'Amount', 'CreatedAt'], ['rep-old01', 'loan-old1', new Date(T), 200, new Date(T)]]);
ins('Settings', [['Others monthly limit', 4000]]);
const go = () => O.ctx.doPost({ postData: { contents: JSON.stringify({ key: 'k', ops: [] }) } });
r = go();
eq(O.ss.getSheets().map(t => [t.name, t.hidden]), [['2026', false], ['2025', false], ['Old Entries', true], ['Old Loans', true], ['Old Repayments', true], ['Old Settings', true], ['Loans & Settings', false]], 'empty Sheet1 removed');
eq(r.rows.map(x => [x.category, x.amount]).sort(), [['House', 300], ['Job', 50000]]);
eq(cells(O.month(2025, 11)), [['House', '', 300, '']]);
eq([r.loans.map(l => [l.id, l.interest, l.priority]), r.repays.map(p => p.amount), r.othersLimit], [[['loan-old1', 0, 'medium']], [200], 4000]);
r = go();
eq([r.rows.length, r.loans.length, r.repays.length], [2, 1, 1], 'running again moves nothing twice');

console.log('Code.gs harness passed');
