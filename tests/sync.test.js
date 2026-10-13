// Run: make test (or node tests/sync.test.js). Runs Code.gs + shared.js against a fake in-memory Google Sheet.
const assert = require('assert');
const eq = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const { createBackend } = require('./fake-sheet.js');

const B = createBackend(), { ctx, props, tab, month } = B;
props.CATS = JSON.stringify(ctx.CATEGORIES); // the family sheet: Job, Dairy, Crops / House, Dairy, Crops (a new sheet starts with only Others, below)
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
// Six tables, left to right: MONEY BORROWED A:I, PAID BACK K:O, MONEY GIVEN Q:Y, GOT BACK AA:AE, INVESTED AG:AO, WITHDRAWN AQ:AU
eq([0, 10, 16, 26, 32, 42].map(c => tab('Loans & Settings').rows[2][c]), ['MONEY BORROWED', 'PAID BACK', 'MONEY GIVEN', 'GOT BACK', 'INVESTED', 'WITHDRAWN']);
eq(tab('Loans & Settings').rows[3].slice(0, 9), ['Date', 'From whom / why', 'Amount', 'Interest %', 'Per', 'Priority', 'Paid back', 'Still owed', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(10, 15), ['Date', 'Loan', 'Amount', 'LoanId', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(16, 25), ['Date', 'To whom / why', 'Amount', 'Interest %', 'Per', 'Priority', 'Got back', 'Still to get', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(26, 31), ['Date', 'Given to', 'Amount', 'LoanId', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(32, 41), ['Date', 'Fund / scheme', 'Amount', 'Return %', 'Per', 'Interest', 'Withdrawn', 'Still invested', 'Id']);
eq(tab('Loans & Settings').rows[3].slice(42, 47), ['Date', 'Fund', 'Amount', 'LoanId', 'Id']);
eq(tab('Loans & Settings').hiddenCols, [9, 14, 15, 25, 30, 31, 41, 46, 47], 'Id columns hidden');
eq(ctx.doPost({ postData: { contents: JSON.stringify({ key: 'nope', ops: [] }) } }), { error: 'wrong key' });
eq(ctx.doPost({ postData: { contents: '{oops' } }), { error: 'bad request' });

// ---- Old phones: {pending: [entry]}; a bad entry is refused
let r = post({ pending: [entry('aaaaaaaa-1'), entry('bbbbbbbb-2', { amount: 0 })] });
eq(r.done, ['aaaaaaaa-1']);
eq(r.rejected, [{ opId: 'bbbbbbbb-2', error: 'bad amount' }]);
eq(B.ss.getSheets().map(t => t.name), ['2026', 'Loans & Settings'], 'the 2026 tab is made by the first 2026 entry, before the common tab');

// ---- The year tab: title, summary (live formulas), 12 month tables side by side
const y = tab('2026');
assert.strictEqual(y.rows[0][0], '2026 · Family Money');
eq(y.rows[2], ['Month', 'Job', 'Dairy', 'Crops', 'Others', '', 'Income', 'House', 'Dairy', 'Crops', 'Others', 'Expenses', '', 'Saved'], 'F and M stay blank: they are month Id columns');
eq(y.rows[3].slice(0, 2), ['January', '=SUMIF(B21:B,"Job",C21:C)']);
eq(y.rows[12].slice(7, 14), ['=SUMIF(BM21:BM,"House",BO21:BO)', '=SUMIF(BM21:BM,"Dairy",BO21:BO)', '=SUMIF(BM21:BM,"Crops",BO21:BO)', '=SUMIF(BM21:BM,"Others",BO21:BO)', '=SUM(H13:K13)', '', '=G13-L13'], 'October = month 10, columns BL:BQ');
eq(y.rows[15].slice(0, 3), ['Total', '=SUM(B4:B15)', '=SUM(C4:C15)']);
eq(y.rows[18][7 * OCT], 'OCTOBER');
eq(y.rows[19].slice(7 * OCT, 7 * OCT + 6), ['Date', 'Category', 'Income', 'Expense', 'Reason', 'Id']);
eq(y.hiddenCols.slice(0, 2), [6, 13], 'the Id column of each month is hidden');
[1, 2, 3, 15].forEach(r => y.rows[r].forEach((v, c) => assert.ok(v === '' || !y.hiddenCols.includes(c + 1), `summary cell ${ctx.colName(c + 1)}${r + 1} sits in a hidden Id column`)));
// A summary written by an older layout (Income under the hidden F) is rewritten on the next sync
props.SUMMARY = '1';
y.rows[2][5] = 'Income';
post({ ops: [] });
eq([y.rows[2][5], y.rows[2][6], props.SUMMARY], ['', 'Income', ctx.SUMMARY], 'old summary rewritten once');
// Looks: one set of alternating colours per month table and per loan / payments table; bumping LOOK repaints, never stacking them
eq([props.LOOK, y.bandings.length, tab('Loans & Settings').bandings.length], [ctx.LOOK, 12, 6]);
props.LOOK = '0';
post({ ops: [] });
eq([props.LOOK, y.bandings.length, tab('Loans & Settings').bandings.length, y.rows[0][0]], [ctx.LOOK, 12, 6, '2026 · Family Money'], 'repainted in place');
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
r = post({ ops: [op('o5', 'entry', 'update', 'cccccccc-3', entry('cccccccc-3', { note: ' ', dateTime: '2027-01-03T04:30:00.000Z' }))] });
eq([r.rejected, cells(month(2027, 0))], [[], [['Dairy', '', 450, '']]], 'the reason is optional');

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

// ---- Investments: their own table (AG:AO) with Compound / Simple in the sixth column, withdrawals in AQ:AU
const inv = { id: 'inv-00001', dateTime: '2026-01-01T05:00:00.000Z', reason: 'HDFC Liquid Fund', amount: 50000, interest: 7, per: 'year', dir: 'invested' };
r = post({ ops: [op('i1', 'loan', 'add', 'inv-00001', inv), op('i2', 'loan', 'add', 'inv-00002', { ...inv, id: 'inv-00002', reason: 'Post office FD', compound: false }),
  op('i3', 'repay', 'add', 'wd-000001', rep('wd-000001', 5000, 'inv-00001')), op('i4', 'loan', 'add', 'inv-00003', { ...inv, id: 'inv-00003', compound: 'yes' })] });
eq([r.done, r.rejected], [['i1', 'i2', 'i3'], [{ opId: 'i4', error: 'bad interest' }]]);
eq(r.loans.filter(l => l.dir === 'invested').map(l => [l.reason, l.compound]), [['HDFC Liquid Fund', true], ['Post office FD', false]]);
eq(L.rows[4].slice(33, 41), ['HDFC Liquid Fund', 50000, 7, 'year', 'Compound', '=SUMIF($AT$5:$AT,AO5,$AS$5:$AS)', '=AI5-AM5', 'inv-00001']);
eq(L.rows[5].slice(37, 38), ['Simple']);
eq(L.rows[4].slice(43, 46), ['HDFC Liquid Fund', 5000, 'inv-00001'], 'the withdrawal sits in WITHDRAWN');
L.rows[5][37] = 'compound'; // changed by hand in the sheet
assert.strictEqual(post({ ops: [] }).loans.find(l => l.id === 'inv-00002').compound, true);
// A sheet laid out before investments existed gets the INVESTED / WITHDRAWN tables on its next sync, and keeps its own
const X = createBackend();
X.props.KEY = 'k';
const xs = X.ss.insertSheet('Loans & Settings');
xs.rows = [['Others monthly limit', 2000], [], ['MONEY BORROWED', , , , , , , , , , 'PAID BACK', , , , , , 'MONEY GIVEN', , , , , , , , , , 'GOT BACK']];
X.ctx.doPost({ postData: { contents: JSON.stringify({ key: 'k', ops: [] }) } });
eq([xs.rows[2][32], xs.rows[2][42], xs.rows[3][0], xs.rows[0][1]], ['INVESTED', 'WITHDRAWN', undefined, 2000], 'only the missing tables are laid out');

// ---- Categories: kept in the CATS property; renames move the rows; every year tab's summary follows the list
const C = createBackend();
C.props.KEY = 'k';
C.props.CATS = JSON.stringify(C.ctx.CATEGORIES);
const cpost = ops => C.ctx.doPost({ postData: { contents: JSON.stringify({ key: 'k', ops }) } });
const cat = (opId, action, data) => ({ opId, kind: 'cat', action, data: { type: 'Expense', ...data } });
r = cpost([op('c0', 'entry', 'add', 'cat-00001', entry('cat-00001')), op('c00', 'entry', 'add', 'cat-00002', entry('cat-00002', { dateTime: '2025-03-01T05:00:00.000Z' }))]);
eq(r.cats, { Income: ['Job', 'Dairy', 'Crops', 'Others'], Expense: ['House', 'Dairy', 'Crops', 'Others'] }, 'the starting list');
r = cpost([cat('c1', 'add', { name: 'Goats' }), cat('c2', 'rename', { name: 'Dairy', to: 'Animals' })]);
eq([r.done, r.cats.Expense], [['c1', 'c2'], ['House', 'Animals', 'Crops', 'Goats', 'Others']]);
eq(cells(C.month(2026, OCT)), [['Animals', '', 450, 'Cattle feed']], 'the row is renamed in the sheet');
eq(cells(C.month(2025, 2)), [['Animals', '', 450, 'Cattle feed']], 'in every year');
const cy = C.tab('2026');
eq(cy.rows[2].slice(0, 15), ['Month', 'Job', 'Dairy', 'Crops', 'Others', '', 'Income', 'House', 'Animals', 'Crops', 'Goats', 'Others', '', 'Expenses', 'Saved']);
eq(cy.rows[3].slice(7, 15), ['=SUMIF(B21:B,"House",D21:D)', '=SUMIF(B21:B,"Animals",D21:D)', '=SUMIF(B21:B,"Crops",D21:D)', '=SUMIF(B21:B,"Goats",D21:D)', '=SUMIF(B21:B,"Others",D21:D)', '', '=SUM(H4:L4)', '=G4-N4']);
eq([cy.rows[1][7], cy.rows[15][0]], ['EXPENSES', 'Total']);
eq(C.tab('2025').rows[2][10], 'Goats', 'older year tabs follow too');
r = cpost([cat('c3', 'delete', { name: 'Animals' }), cat('c4', 'delete', { name: 'Goats' }), cat('c5', 'rename', { name: 'Others', to: 'Misc' }), cat('c6', 'add', { name: '=HYPERLINK("x")' }), cat('c7', 'add', { type: 'toString', name: 'X' })]);
eq([r.done, r.rejected.map(x => x.error)], [['c3', 'c4'], ['Others cannot be changed', 'bad category', 'bad type']]);
eq(cells(C.month(2026, OCT)), [['Others', '', 450, 'Cattle feed']], 'deleting moves the rows into Others');
eq([cy.rows[2].slice(0, 12), cy.rows[2].slice(12, 15)], [['Month', 'Job', 'Dairy', 'Crops', 'Others', '', 'Income', 'House', 'Crops', 'Others', 'Expenses', 'Saved'], ['', '', '']], 'old columns blanked');
// A phone that missed the delete still sends "Goats" (in any case): the category comes back, the entry is never lost
r = cpost([op('c8', 'entry', 'add', 'cat-00003', entry('cat-00003', { category: 'goats' })), op('c9', 'entry', 'add', 'cat-00004', entry('cat-00004', { category: 'Crops ' }))]);
eq([r.rejected, r.cats.Expense], [[{ opId: 'c9', error: 'bad category' }], ['House', 'Crops', 'goats', 'Others']]);
eq(cpost([]).cats.Expense, ['House', 'Crops', 'goats', 'Others'], 'kept between syncs');
C.typeRow(2026, OCT, [new Date(T), 'GOATS', '', 50, 'Typed']);
assert.ok(cpost([]).rows.some(x => x.note === 'Typed' && x.category === 'goats'), 'hand-typed rows match the new list');

// ---- A new, empty sheet starts with the household list (saved at setup); a sheet with entries but no saved list keeps the starting categories
const N = createBackend();
N.ctx.setup();
eq(JSON.parse(N.props.CATS), N.ctx.NEW_CATEGORIES);
eq(N.ctx.NEW_CATEGORIES.Expense.slice(0, 3), ['Rent', 'Kirana', 'Milk'], 'a household list, Others last');
const E = createBackend();
E.props.KEY = 'k';
E.ss.insertSheet('2025'); // made before categories could change
eq(E.ctx.doPost({ postData: { contents: JSON.stringify({ key: 'k', ops: [] }) } }).cats, { Income: ['Job', 'Dairy', 'Crops', 'Others'], Expense: ['House', 'Dairy', 'Crops', 'Others'] });
assert.strictEqual(E.props.CATS, undefined, 'nothing saved for it');

// ---- Who added it: the note on the Date cell; a hand-typed row has none
const S = createBackend();
S.props.KEY = 'k';
S.props.CATS = JSON.stringify(S.ctx.CATEGORIES);
const spost = ops => S.ctx.doPost({ postData: { contents: JSON.stringify({ key: 'k', ops }) } });
r = spost([op('b1', 'entry', 'add', 'by-000001', entry('by-000001', { by: 'Sunita' })), op('b2', 'entry', 'add', 'by-000002', entry('by-000002', { dateTime: early }))]);
const so = S.tab('2026'), dcol = 7 * OCT;
eq([so.notes[20][dcol], (so.notes[21] || [])[dcol]], ['', 'Added by Sunita'], '2 Oct (no one) sorts first, 11 Oct is Sunita\'s');
eq([r.rows.find(x => x.id === 'by-000001').by, 'by' in r.rows.find(x => x.id === 'by-000002')], ['Sunita', false]);
so.notes[21][dcol] = 'Added by Kavita'; // changed by hand in the sheet
eq(spost([]).rows.find(x => x.id === 'by-000001').by, 'Kavita');
spost([op('b3', 'entry', 'delete', 'by-000002')]);
eq([so.notes[20][dcol], so.notes[21][dcol]], ['Added by Kavita', ''], 'notes move with their rows; the freed row loses its note');

// ---- Settings: kept in the SET property; the Others budget is cell B1; categories and loans keep them tidy
const set = (opId, key, value, id) => op(opId, 'set', 'update', undefined, { key, id, value });
const rent = { name: 'Rent', category: 'House', amount: 12000, day: 1, every: 1, next: '2026-11' };
r = spost([set('s1', 'daily', 20000), set('s2', 'budget', 8000, 'Dairy'), set('s3', 'bill', rent, 'bill-0001'), set('s4', 'focus', 'grow'), set('s5', 'budget', 600, 'Others'),
  set('s6', 'focus', 'rich'), set('s7', 'bill', { ...rent, day: 40 }, 'bill-0002')]);
eq([r.done, r.rejected.map(x => x.error)], [['s1', 's2', 's3', 's4', 's5'], ['bad setting', 'bad setting']]);
eq([r.settings.daily, r.settings.budgets, r.settings.bills['bill-0001'].name, r.settings.focus, r.othersLimit], [20000, { Dairy: 8000, Others: 600 }, 'Rent', 'grow', 600]);
eq([S.tab('Loans & Settings').rows[0][1], JSON.parse(S.props.SET).budgets], [600, { Dairy: 8000 }], 'the Others budget lives in B1 only');
S.tab('Loans & Settings').rows[0][1] = 2500; // changed by hand
eq(spost([]).settings.budgets.Others, 2500);
r = spost([cat('s8', 'rename', { name: 'Dairy', to: 'Milk' }), cat('s9', 'rename', { name: 'House', to: 'Home' })]);
eq([r.settings.budgets, r.settings.bills['bill-0001'].category], [{ Milk: 8000, Others: 2500 }, 'Home'], 'budgets and bills follow a rename');
// Loan extras (EMI, SIP, goal) go with their loan; money added to an investment is a negative withdrawal, refused for anything else
const sloan = { id: 'sl-000001', dateTime: T, reason: 'Personal loan', amount: 120000, interest: 14, per: 'year' };
const sinv = { id: 'si-000001', dateTime: T, reason: 'SIP', amount: 50000, interest: 12, per: 'year', dir: 'invested' };
r = spost([op('s10', 'loan', 'add', sloan.id, sloan), op('s11', 'loan', 'add', sinv.id, sinv), set('s12', 'loan', { emi: 5600, day: 5 }, sloan.id),
  op('s13', 'repay', 'add', 'su-000001', { id: 'su-000001', loanId: sinv.id, dateTime: T, amount: -5000 }), op('s14', 'repay', 'add', 'su-000002', { id: 'su-000002', loanId: sloan.id, dateTime: T, amount: -5000 })]);
eq([r.done, r.rejected], [['s10', 's11', 's12', 's13'], [{ opId: 's14', error: 'bad amount' }]]);
const SL = S.tab('Loans & Settings');
eq(SL.rows[4].slice(43, 46), ['SIP', -5000, 'si-000001'], 'added money sits in WITHDRAWN as a negative amount');
eq(SL.rows[4][39], '=AI5-AM5', 'so "Still invested" counts it');
eq(spost([]).repays.map(x => x.amount), [-5000], 'and it reads back');
r = spost([op('s15', 'loan', 'delete', sloan.id)]);
eq(r.settings.loans, {}, 'its EMI goes with it');

// ---- Notes: a Notes tab made with the first one, one row per note, one line per item (☐ to do, ☑ done), the Id hidden
assert.ok(!B.ss.getSheetByName('Notes'), 'no Notes tab before the first note');
const note = { id: 'note-00001', dateTime: T, title: 'Groceries', items: [{ t: 'Atta', done: false }, { t: 'Paneer', done: true }], text: '', category: 'Kirana', by: 'Sunita' };
r = post({ ops: [op('n1', 'note', 'add', note.id, note), op('n2', 'note', 'add', 'note-00002', { ...note, id: 'note-00002', title: '' })] });
eq([r.done, r.rejected], [['n1'], [{ opId: 'n2', error: 'bad note' }]]);
const NT = tab('Notes');
eq(NT.rows[0], ['Title', 'List', 'Notes', 'Category', 'Added', 'By', 'Id']);
eq(NT.rows[1].slice(0, 4).concat(NT.rows[1].slice(5)), ['Groceries', '☐ Atta\n☑ Paneer', '', 'Kirana', 'Sunita', 'note-00001']);
eq(NT.hiddenCols, [7], 'the Id column is hidden');
eq(r.notes, [{ id: 'note-00001', dateTime: T, title: 'Groceries', items: note.items, text: '', category: 'Kirana', by: 'Sunita' }], 'the reply carries the notes');
eq(post({ ops: [op('n1', 'note', 'add', note.id, { ...note, title: 'Changed' })] }).notes[0].title, 'Groceries', 'a resent add changes nothing');
// A tick rewrites the row in place; rows handNote in the sheet get an Id and a date; a row without a title is kept as it is
r = post({ ops: [op('n3', 'note', 'update', note.id, { ...note, items: [{ t: 'Atta', done: true }, { t: 'Paneer', done: true }] })] });
eq(NT.rows[1][1], '☑ Atta\n☑ Paneer');
NT.rows[2] = ['To do', 'Bring paneer\n☑  Call Ramesh', 'Before 7', '', '', '', ''];
NT.rows[3] = ['', 'half handNote', '', '', '', '', ''];
r = post({ ops: [] });
const handNote = r.notes.find(n => n.title === 'To do');
eq(handNote.items, [{ t: 'Bring paneer', done: false }, { t: 'Call Ramesh', done: true }]);
assert.ok(handNote.id && NT.rows[2][6] === handNote.id && NT.rows[2][4] instanceof Date, 'the typed note got an Id and a date in the sheet');
eq(NT.rows[3].slice(0, 2), ['', 'half handNote'], 'a row without a title stays');
r = post({ ops: [op('n4', 'note', 'delete', note.id)] });
eq(r.notes.map(n => n.title), ['To do']);
eq([NT.rows[1][0], NT.rows[2][0], NT.rows[3].join('')], ['To do', '', ''], 'the rest moves up and the old last row is blanked');
eq(NT.rows[2][1], 'half handNote', 'with the half-handNote row kept below the notes');

console.log('Code.gs harness passed');
