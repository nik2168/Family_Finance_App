// Google Apps Script attached to the family Google Sheet. Paste shared.js next to it as shared.gs.
// The sheet is laid out for people, and it is also the app's storage:
//   - one tab per year ("2026"): a summary table on top, then 12 month tables side by side, each growing downward;
//   - one "Loans & Settings" tab: the Others limit (B1), then money borrowed + what we paid back, and money given + what we got back.
// Every sync loads everything, applies the phone's ops in memory, and rewrites only the month tables / tables that changed.
var COMMON = 'Loans & Settings';
var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var M_TITLE = 19, M_HEAD = 20, M_FIRST = 21;         // month tables: title row, header row, first entry row
var M_COLS = 6, M_STEP = 7;                          // Date | Category | Income | Expense | Reason | Id, then a gap column
var L_FIRST = 5, L_COLS = 9, R_COLS = 5;              // tables start on row 5
var LOAN_COL = { borrowed: 1, given: 17 };              // MONEY BORROWED A:I, MONEY GIVEN Q:Y
var PAY_COL = { borrowed: 11, given: 27 };              // PAID BACK K:O, GOT BACK AA:AE
var DIRS = ['borrowed', 'given'];
var DATE_FORMAT = 'dd mmm yyyy, h:mm am/pm';
var VALIDATE = { entry: validateEntry, loan: validateLoan, repay: validateRepay };
var LIST_OF = { entry: 'rows', loan: 'loans', repay: 'repays' };

// Run once from the editor: creates the tabs, moves data from an older layout, and makes the family key (shown in the log).
function setup() {
  writeDirty(loadAll(SpreadsheetApp.getActiveSpreadsheet()));
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('KEY')) props.setProperty('KEY', Utilities.getUuid());
  Logger.log('Family key: ' + props.getProperty('KEY'));
}

// Body: {key, ops: [op]} (older phones send {key, pending: [entry]}).
// op = {opId, kind: 'entry'|'loan'|'repay', action: 'add'|'update'|'delete', id, data}
// Reply: {rows, loans, repays, othersLimit, done: [opId], rejected: [{opId, error}]} or {error}.
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply({ error: 'bad request' }); }
  var key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || !body || body.key !== key) return reply({ error: 'wrong key' });

  var ops = Array.isArray(body.ops) ? body.ops : [];
  if (Array.isArray(body.pending)) {
    ops = body.pending.map(function (p) { return { opId: p && p.id, kind: 'entry', action: 'add', id: p && p.id, data: p }; }).concat(ops);
  }
  ops = ops.slice(0, 500);

  var st, done = [], rejected = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    st = loadAll(SpreadsheetApp.getActiveSpreadsheet());
    ops.forEach(function (op) {
      var err = applyOp(st, op);
      if (err) rejected.push({ opId: op && op.opId, error: err }); else done.push(op.opId);
    });
    writeDirty(st);
  } finally {
    lock.releaseLock();
  }

  return reply({
    rows: st.rows.map(function (r) { return { id: r.id, dateTime: r.dateTime, type: r.type, category: r.category, amount: r.amount, note: r.note }; }),
    loans: st.loans, repays: st.repays, othersLimit: st.limit, done: done, rejected: rejected
  });
}

// ---- Load: everything the sheet holds, plus what must be rewritten.
// st.keep holds rows we could not read (half typed), so a rewrite never loses them. st.size is each table's old length.
function loadAll(ss) {
  var st = { ss: ss, tz: ss.getSpreadsheetTimeZone(), rows: [], loans: [], repays: [], keep: {}, size: {}, dirty: {},
    keepL: { borrowed: [], given: [] }, keepR: { borrowed: [], given: [] }, sizeL: { borrowed: 0, given: 0 }, sizeR: { borrowed: 0, given: 0 }, payDir: {}, dirtyL: false, dirtyR: false, limit: 0, seen: {} };
  ss.getSheets().forEach(function (sh) { if (/^\d{4}$/.test(sh.getName())) readYear(st, sh); });
  readCommon(st, ensureCommon(ss));
  migrateOld(st);
  return st;
}

// Rows typed by hand have no Id, and copy-pasted rows repeat one: both get a fresh Id so the app can change them.
function freshId(st, id) {
  id = String(id == null ? '' : id).trim();
  if (!id || st.seen[id]) id = Utilities.getUuid();
  st.seen[id] = true;
  return id;
}

function readYear(st, sh) {
  var last = sh.getLastRow();
  if (last < M_FIRST) return;
  var vals = sh.getRange(M_FIRST, 1, last - M_FIRST + 1, 12 * M_STEP).getValues();
  for (var m = 0; m < 12; m++) {
    var home = sh.getName() + '-' + pad2(m + 1);
    st.keep[home] = [];
    vals.forEach(function (row, i) {
      var c = row.slice(m * M_STEP, m * M_STEP + M_COLS);
      if (isBlank(c)) return;
      st.size[home] = i + 1;
      var e = parseEntry(c);
      if (!e) { st.keep[home].push(c); return; }
      var id = freshId(st, e.id);
      if (id !== e.id) { e.id = id; st.dirty[home] = true; }
      e.home = home;
      st.rows.push(e);
    });
  }
}

// [Date, Category, Income, Expense, Reason, Id] -> entry, or null while the row isn't complete.
function parseEntry(c) {
  var d = toDate(c[0]), inc = Number(c[2]) || 0, exp = Number(c[3]) || 0;
  var type = inc > 0 && !exp ? 'Income' : exp > 0 && !inc ? 'Expense' : '';
  var category = type ? matchName(CATEGORIES[type], c[1]) : '';
  if (!d || !category) return null;
  return { id: String(c[5]).trim(), dateTime: d.toISOString(), type: type, category: category, amount: type === 'Income' ? inc : exp, note: String(c[4]).trim() };
}

function readCommon(st, sh) {
  st.limit = Number(sh.getRange(1, 2).getValue()) || 0;
  var last = sh.getLastRow();
  if (last < L_FIRST) return;
  sh.getRange(L_FIRST, 1, last - L_FIRST + 1, PAY_COL.given + R_COLS - 1).getValues().forEach(function (row, i) {
    DIRS.forEach(function (dir) {
      var l = row.slice(LOAN_COL[dir] - 1, LOAN_COL[dir] - 1 + L_COLS);
      if (!isBlank(l)) {
        st.sizeL[dir] = i + 1;
        var loan = parseLoan(l[0], l[1], l[2], l[3], l[4], l[5], l[8], dir);
        if (!loan) st.keepL[dir].push(l);
        else { if (claim(st, loan)) st.dirtyL = st.dirtyR = true; st.loans.push(loan); }
      }
      var p = row.slice(PAY_COL[dir] - 1, PAY_COL[dir] - 1 + R_COLS);
      if (!isBlank(p)) {
        st.sizeR[dir] = i + 1;
        var repay = parseRepay(p[0], p[2], p[3], p[4]);
        if (!repay) st.keepR[dir].push(p);
        else { if (claim(st, repay)) st.dirtyR = true; st.payDir[repay.id] = dir; st.repays.push(repay); }
      }
    });
  });
}

// Gives rec a usable Id; true when it had to change (so the table is written back).
function claim(st, rec) { var id = freshId(st, rec.id); var changed = id !== rec.id; rec.id = id; return changed; }

function parseLoan(date, reason, amount, rate, per, priority, id, dir) {
  var d = toDate(date);
  if (!d || !(Number(amount) > 0)) return null;
  return { id: String(id).trim(), dateTime: d.toISOString(), reason: String(reason).trim(), amount: Number(amount),
    interest: Number(rate) > 0 ? Number(rate) : 0, per: matchName(['year'], per) ? 'year' : 'month', priority: matchName(Object.keys(PRIORITY), priority) || 'medium', dir: dir };
}

function parseRepay(date, amount, loanId, id) {
  var d = toDate(date);
  if (!d || !(Number(amount) > 0) || !String(loanId).trim()) return null;
  return { id: String(id).trim(), loanId: String(loanId).trim(), dateTime: d.toISOString(), amount: Number(amount) };
}

// ---- Apply one op in memory. Every op is safe to resend: a known add is skipped, an update overwrites, a missing delete is done.
function applyOp(st, op) {
  if (!op || !LIST_OF.hasOwnProperty(op.kind)) return 'bad op';
  if (!checkId(op.id)) return 'bad id';
  var list = st[LIST_OF[op.kind]], i = findIndex(list, op.id);
  if (op.action === 'delete') {
    if (i >= 0) { touch(st, op.kind, list[i]); list.splice(i, 1); }
    if (op.kind === 'loan') {
      var before = st.repays.length;
      st.repays = st.repays.filter(function (r) { return r.loanId !== op.id; });
      if (st.repays.length !== before) st.dirtyR = true;
    }
    return '';
  }
  if (op.action !== 'add' && op.action !== 'update') return 'bad op';
  var d = op.data, err = VALIDATE[op.kind](d);
  if (err) return err;
  if (d.id !== op.id) return 'bad id';
  if (op.kind === 'repay' && findIndex(st.loans, d.loanId) < 0) return 'loan not found';
  if ((op.action === 'add') === (i >= 0)) return ''; // add of a known id, or update of one deleted elsewhere: nothing to do
  var rec = record(st, op.kind, d);
  if (i >= 0) { touch(st, op.kind, list[i]); list[i] = rec; } else list.push(rec);
  touch(st, op.kind, rec);
  return '';
}

function record(st, kind, d) {
  if (kind === 'entry') {
    return { id: d.id, dateTime: d.dateTime, type: d.type, category: d.category, amount: d.amount, note: d.note.trim(), home: homeOf(st, d.dateTime) };
  }
  if (kind === 'loan') {
    return { id: d.id, dateTime: d.dateTime, reason: d.reason.trim(), amount: d.amount, interest: d.interest > 0 ? d.interest : 0,
      per: d.per === 'year' ? 'year' : 'month', priority: PRIORITY.hasOwnProperty(d.priority) ? d.priority : 'medium', dir: d.dir === 'given' ? 'given' : 'borrowed' };
  }
  return { id: d.id, loanId: d.loanId, dateTime: d.dateTime, amount: d.amount };
}

// The month table an entry belongs in ("2026-10"), in the spreadsheet's own time zone.
function homeOf(st, dateTime) { return Utilities.formatDate(new Date(dateTime), st.tz, 'yyyy-MM'); }

// Mark what must be rewritten. A loan's reason also shows in the repayments table.
function touch(st, kind, rec) {
  if (kind === 'entry') st.dirty[rec.home] = true;
  else if (kind === 'loan') st.dirtyL = st.dirtyR = true;
  else st.dirtyR = true;
}

// ---- Write back only what changed.
function writeDirty(st) {
  Object.keys(st.dirty).sort().forEach(function (home) { writeMonth(st, home); });
  var sh = ensureCommon(st.ss);
  if (st.dirtyL) writeLoans(st, sh);
  if (st.dirtyR) writeRepays(st, sh);
  removeBlankDefault(st.ss);
}

function writeMonth(st, home) {
  var m = Number(home.slice(5)) - 1;
  var out = st.rows.filter(function (r) { return r.home === home; }).sort(byOldest).map(function (r) {
    return [new Date(r.dateTime), r.category, r.type === 'Income' ? r.amount : '', r.type === 'Expense' ? r.amount : '', safeText(r.note), r.id];
  }).concat(st.keep[home] || []);
  writeBlock(ensureYearTab(st.ss, home.slice(0, 4)), M_FIRST, 1 + m * M_STEP, M_COLS, out, st.size[home] || 0);
  st.size[home] = out.length;
}

// Each direction has its own table and its own payments table. "Paid back / Got back" sums those payments; "Still owed / Still to get" subtracts them.
function writeLoans(st, sh) {
  DIRS.forEach(function (dir) {
    var c = LOAN_COL[dir], A = function (k, r) { return colName(c + k) + r; };
    var ids = colName(PAY_COL[dir] + 3), amounts = colName(PAY_COL[dir] + 2);
    var out = st.loans.filter(function (l) { return l.dir === dir; }).sort(byOldest).map(function (l, i) {
      var r = L_FIRST + i;
      return [new Date(l.dateTime), safeText(l.reason), l.amount, l.interest || '', l.interest ? l.per : '', l.priority,
        '=SUMIF($' + ids + '$' + L_FIRST + ':$' + ids + ',' + A(8, r) + ',$' + amounts + '$' + L_FIRST + ':$' + amounts + ')', '=' + A(2, r) + '-' + A(6, r), l.id];
    }).concat(st.keepL[dir]);
    writeBlock(sh, L_FIRST, c, L_COLS, out, st.sizeL[dir]);
    st.sizeL[dir] = out.length;
  });
}

// A payment goes in the table next to its loan (a payment whose loan was removed by hand stays where it was).
function writeRepays(st, sh) {
  var loans = {};
  st.loans.forEach(function (l) { loans[l.id] = l; });
  DIRS.forEach(function (dir) {
    var out = st.repays.filter(function (p) { return (loans[p.loanId] ? loans[p.loanId].dir : st.payDir[p.id] || 'borrowed') === dir; })
      .sort(byOldest).map(function (p) {
        return [new Date(p.dateTime), safeText(loans[p.loanId] ? loans[p.loanId].reason : ''), p.amount, p.loanId, p.id];
      }).concat(st.keepR[dir]);
    writeBlock(sh, L_FIRST, PAY_COL[dir], R_COLS, out, st.sizeR[dir]);
    st.sizeR[dir] = out.length;
  });
}

// Writes rows at (row, col) and blanks whatever was below them before. Strings starting with "=" become formulas.
function writeBlock(sh, row, col, width, out, oldSize) {
  out = out.slice();
  while (out.length < oldSize) out.push(blankRow(width));
  if (out.length) sh.getRange(row, col, out.length, width).setValues(out);
}

// ---- Layout, created once per tab.
function ensureYearTab(ss, year) {
  var sh = ss.getSheetByName(year);
  if (sh) return sh;
  var newer = ss.getSheets().filter(function (s) { return /^\d{4}$/.test(s.getName()) && s.getName() > year; }).length;
  sh = ss.insertSheet(year, newer); // newest year first
  sh.getRange(1, 1).setValue(year + ' · Family Money');
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(16);
  sh.getRange(2, 2).setValue('INCOME');
  sh.getRange(2, 7).setValue('EXPENSES');
  sh.getRange(3, 1, 1, 12).setValues([['Month', 'Job', 'Dairy', 'Crops', 'Others', 'Income', 'House', 'Dairy', 'Crops', 'Others', 'Expenses', 'Saved']]);
  sh.getRange(2, 1, 2, 12).setFontWeight('bold');
  sh.getRange(4, 1, 13, 1).setValues(MONTH_NAMES.concat(['Total']).map(function (n) { return [n]; }));
  sh.getRange(4, 2, 13, 11).setFormulas(summaryFormulas());
  sh.getRange(16, 1, 1, 12).setFontWeight('bold');
  sh.getRange(17, 1).setValue('To add by hand: use the first empty row of the month and put the amount under Income or Expense. Leave the Id column alone.');
  for (var m = 0; m < 12; m++) {
    var c = 1 + m * M_STEP;
    sh.getRange(M_TITLE, c).setValue(MONTH_NAMES[m].toUpperCase());
    sh.getRange(M_HEAD, c, 1, M_COLS).setValues([['Date', 'Category', 'Income', 'Expense', 'Reason', 'Id']]);
    sh.getRange(M_TITLE, c, 2, M_COLS).setFontWeight('bold');
    sh.getRange(M_FIRST, c, 1000, 1).setNumberFormat(DATE_FORMAT);
    sh.setColumnWidth(c + 4, 180);
    sh.hideColumns(c + 5);
  }
  return sh;
}

// Rows 4-15: one per month, row 16: totals. Columns B:L = Job Dairy Crops Others | Income | House Dairy Crops Others | Expenses | Saved.
function summaryFormulas() {
  var out = MONTH_NAMES.map(function (n, m) {
    var c = 1 + m * M_STEP, r = 4 + m;
    function col(k) { var a = colName(c + k); return a + M_FIRST + ':' + a; }
    function sumif(name, k) { return '=SUMIF(' + col(1) + ',"' + name + '",' + col(k) + ')'; }
    // Totals add up the category cells, not the whole column, so a misspelled row is never counted (the app skips it too).
    return CATEGORIES.Income.map(function (x) { return sumif(x, 2); }).concat(['=SUM(B' + r + ':E' + r + ')'])
      .concat(CATEGORIES.Expense.map(function (x) { return sumif(x, 3); })).concat(['=SUM(G' + r + ':J' + r + ')', '=F' + r + '-K' + r]);
  });
  out.push(out[0].map(function (_, k) { var a = colName(2 + k); return '=SUM(' + a + '4:' + a + '15)'; }));
  return out;
}

function ensureCommon(ss) {
  var sh = ss.getSheetByName(COMMON);
  if (sh) return sh;
  sh = ss.insertSheet(COMMON, ss.getSheets().length);
  sh.getRange(1, 1, 1, 2).setValues([['Others monthly limit', 3000]]);
  sh.getRange(3, LOAN_COL.borrowed).setValue('MONEY BORROWED');
  sh.getRange(4, LOAN_COL.borrowed, 1, L_COLS).setValues([['Date', 'From whom / why', 'Amount', 'Interest %', 'Per', 'Priority', 'Paid back', 'Still owed', 'Id']]);
  sh.getRange(3, LOAN_COL.given).setValue('MONEY GIVEN');
  sh.getRange(4, LOAN_COL.given, 1, L_COLS).setValues([['Date', 'To whom / why', 'Amount', 'Interest %', 'Per', 'Priority', 'Got back', 'Still to get', 'Id']]);
  sh.getRange(3, PAY_COL.borrowed).setValue('PAID BACK');
  sh.getRange(4, PAY_COL.borrowed, 1, R_COLS).setValues([['Date', 'Loan', 'Amount', 'LoanId', 'Id']]);
  sh.getRange(3, PAY_COL.given).setValue('GOT BACK');
  sh.getRange(4, PAY_COL.given, 1, R_COLS).setValues([['Date', 'Given to', 'Amount', 'LoanId', 'Id']]);
  sh.getRange(1, 1, 4, PAY_COL.given + R_COLS - 1).setFontWeight('bold');
  DIRS.forEach(function (dir) {
    [LOAN_COL[dir], PAY_COL[dir]].forEach(function (c) { sh.getRange(L_FIRST, c, 1000, 1).setNumberFormat(DATE_FORMAT); });
    sh.setColumnWidth(LOAN_COL[dir] + 1, 200);
    [LOAN_COL[dir] + 8, PAY_COL[dir] + 3, PAY_COL[dir] + 4].forEach(function (c) { sh.hideColumns(c); });
  });
  return sh;
}

// A new spreadsheet starts with an empty "Sheet1"; once the real tabs exist it is just clutter.
function removeBlankDefault(ss) {
  var s = ss.getSheetByName('Sheet1');
  if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
}

// ---- One-time move from the older layout (Entries / Loans / Repayments / Settings tabs). They are kept as hidden "Old …" tabs.
var OLD_TABS = ['Entries', 'Loans', 'Repayments', 'Settings'];
function migrateOld(st) {
  var ss = st.ss, tabs = {};
  OLD_TABS.forEach(function (n) { tabs[n] = ss.getSheetByName(n); });
  if (!tabs.Entries) return;
  function rows(sh, width) { return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues() : []; }
  rows(tabs.Entries, 6).forEach(function (r) { // Id DateTime Type Category Amount Note
    var e = parseEntry([r[1], r[3], r[2] === 'Income' ? r[4] : '', r[2] === 'Expense' ? r[4] : '', r[5], r[0]]);
    if (!e || findIndex(st.rows, e.id) >= 0) return;
    claim(st, e);
    e.home = homeOf(st, e.dateTime);
    st.rows.push(e);
    st.dirty[e.home] = true;
  });
  rows(tabs.Loans, 8).forEach(function (r) { // Id Date Reason Amount CreatedAt Interest Per Priority
    var l = parseLoan(r[1], r[2], r[3], r[5], r[6], r[7], r[0], 'borrowed');
    if (!l || findIndex(st.loans, l.id) >= 0) return;
    claim(st, l);
    st.loans.push(l);
    st.dirtyL = st.dirtyR = true;
  });
  rows(tabs.Repayments, 4).forEach(function (r) { // Id LoanId Date Amount
    var p = parseRepay(r[2], r[3], r[1], r[0]);
    if (!p || findIndex(st.repays, p.id) >= 0 || findIndex(st.loans, p.loanId) < 0) return;
    claim(st, p);
    st.repays.push(p);
    st.dirtyR = true;
  });
  if (tabs.Settings) {
    st.limit = Number(tabs.Settings.getRange(1, 2).getValue()) || 0;
    ensureCommon(ss).getRange(1, 2).setValue(st.limit);
  }
  OLD_TABS.forEach(function (n) { if (tabs[n]) { tabs[n].setName('Old ' + n); tabs[n].hideSheet(); } });
}

// ---- Small helpers
function findIndex(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; }
function byOldest(a, b) { return Date.parse(a.dateTime) - Date.parse(b.dateTime); }
function isBlank(cells) { return cells.every(function (v) { return v === '' || v == null; }); }
function blankRow(n) { var r = []; while (r.length < n) r.push(''); return r; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function toDate(v) { var d = v instanceof Date ? v : v === '' || v == null ? null : new Date(v); return d && !isNaN(d) ? d : null; }
// "dairy " typed by hand still counts as "Dairy".
function matchName(names, v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  for (var i = 0; i < names.length; i++) if (names[i].toLowerCase() === s) return names[i];
  return '';
}
function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// Stop notes like "=SUM(...)" from turning into formulas in the sheet.
function safeText(s) {
  s = s ? String(s) : '';
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
