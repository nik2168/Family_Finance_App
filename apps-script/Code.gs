// Google Apps Script attached to the family Google Sheet. Paste shared.js next to it as shared.gs.
// The sheet is laid out for people, and it is also the app's storage:
//   - one tab per year ("2026"): a summary table on top, then 12 month tables side by side, each growing downward;
//   - one "Loans & Settings" tab: the Others limit (B1), then side by side: money borrowed + what we paid back, money given + what we
//     got back, and investments + what was withdrawn (DIRS in shared.js).
// The category list lives in the script property CATS (not in a tab, so a hand edit can't orphan entries); changing it rewrites every summary.
// Settings (budgets, bills, EMIs, SIPs, goals, the focus) live in the property SET (shared.js validateSet); the Others budget is cell B1.
// Who added an entry is the note on its Date cell ("Added by Sunita"), so the month tables keep their columns.
// A "Notes" tab (made with the first note) holds the assistant's notes and lists, one row each, one line per item (☐ to do, ☑ done).
// Every sync loads everything, applies the phone's ops in memory, and rewrites only the month tables / tables that changed.
var COMMON = 'Loans & Settings';
var NOTES = 'Notes', N_COLS = 7;                     // Title | List | Notes | Category | Added | By | Id, from row 2
var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var M_TITLE = 19, M_HEAD = 20, M_FIRST = 21;         // month tables: title row, header row, first entry row
var M_COLS = 6, M_STEP = 7;                          // Date | Category | Income | Expense | Reason | Id, then a gap column
var L_FIRST = 5, L_COLS = 9, R_COLS = 5;              // tables start on row 5
var LOAN_COL = { borrowed: 1, given: 17, invested: 33 }; // MONEY BORROWED A:I, MONEY GIVEN Q:Y, INVESTED AG:AO
var PAY_COL = { borrowed: 11, given: 27, invested: 43 }; // PAID BACK K:O, GOT BACK AA:AE, WITHDRAWN AQ:AU
var LAST_COL = PAY_COL.invested + R_COLS - 1;
// Per table: title, name column, rate, 6th column (priority; for investments compound or simple), repaid, left, payments title, its name column.
var TABLES = {
  borrowed: ['MONEY BORROWED', 'From whom / why', 'Interest %', 'Priority', 'Paid back', 'Still owed', 'PAID BACK', 'Loan'],
  given: ['MONEY GIVEN', 'To whom / why', 'Interest %', 'Priority', 'Got back', 'Still to get', 'GOT BACK', 'Given to'],
  invested: ['INVESTED', 'Fund / scheme', 'Return %', 'Interest', 'Withdrawn', 'Still invested', 'WITHDRAWN', 'Fund']
};
var DATE_FORMAT = 'dd mmm yyyy, h:mm am/pm';
var SUMMARY = '2'; // the year summary's layout; 2: steps over the hidden Id columns
var LOOK = '1';    // colours and number formats; bump it and every tab is repainted on the next sync
var ROWS = 1000;   // how far down the month and loan tables are formatted
// The app's Pastel theme (src/index.html): mint = income, blush = expenses, lavender = saved.
var COLOR = { ink: '#0B0B0C', muted: '#8A8A8E', line: '#D9D9DE', head: '#F1F1F3', band: '#FAFAFB', white: '#FFFFFF', good: '#15803D', bad: '#B42318',
  income: '#D7F2DC', incomeD: '#8FD6A0', expense: '#F7D9D9', expenseD: '#EE9F9F', saved: '#E8DDFB', savedD: '#B9A5F3', month: '#DCDDF6',
  butter: '#F8E9B8', butterD: '#EBC75E', sky: '#D9EEF6', skyD: '#8DC8E2' };
var MONEY = '#,##0;-#,##0;"–"', SAVED_MONEY = '#,##0;[Red]-#,##0;"–"';
var VALIDATE = { entry: validateEntry, loan: validateLoan, repay: validateRepay, note: validateNote };
var LIST_OF = { entry: 'rows', loan: 'loans', repay: 'repays', note: 'notes' };

// Run once from the editor: creates the tabs, moves data from an older layout, and makes the family key (shown in the log).
function setup() {
  writeDirty(loadAll(SpreadsheetApp.getActiveSpreadsheet()));
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('KEY')) props.setProperty('KEY', Utilities.getUuid());
  Logger.log('Family key: ' + props.getProperty('KEY'));
}

// Body: {key, ops: [op]} (older phones send {key, pending: [entry]}).
// op = {opId, kind: 'entry'|'loan'|'repay'|'note', action: 'add'|'update'|'delete', id, data} or {opId, kind: 'cat', action, data} (applyCat)
// or {opId, kind: 'set', action: 'update', data: {key, id, value}} (applySet).
// Reply: {rows, loans, repays, notes, othersLimit, cats, settings, done: [opId], rejected: [{opId, error}]} or {error}.
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
    rows: st.rows.map(function (r) { var e = { id: r.id, dateTime: r.dateTime, type: r.type, category: r.category, amount: r.amount, note: r.note }; if (r.by) e.by = r.by; if (r.createdAt) e.createdAt = r.createdAt; if (r.updatedAt) e.updatedAt = r.updatedAt; return e; }),
    loans: st.loans, repays: st.repays, notes: st.notes, othersLimit: st.limit, cats: st.cats, settings: settingsReply(st), done: done, rejected: rejected
  });
}

// The settings as the phone sees them: the Others budget is the sheet's Others limit (B1).
function settingsReply(st) {
  var out = settingsOf(st.settings);
  if (st.limit > 0) out.budgets.Others = st.limit;
  return out;
}

// ---- Load: everything the sheet holds, plus what must be rewritten.
// st.keep holds rows we could not read (half typed), so a rewrite never loses them. st.size is each table's old length.
function loadAll(ss) {
  // No saved list: a sheet with entries (year tabs, or the older Entries tab) used the starting categories; an empty one starts
  // with only Others, saved at once (dirtyCats) so it stays that way after its first entry.
  var cats = PropertiesService.getScriptProperties().getProperty('CATS');
  var used = ss.getSheets().some(function (sh) { return /^\d{4}$/.test(sh.getName()) || sh.getName() === 'Entries'; });
  var start = cats ? JSON.parse(cats) : used ? CATEGORIES : NEW_CATEGORIES;
  var set = PropertiesService.getScriptProperties().getProperty('SET');
  var st = { ss: ss, tz: ss.getSpreadsheetTimeZone(), rows: [], loans: [], repays: [], notes: [], keepN: [], sizeN: 0, dirtyN: false, keep: {}, size: {}, dirty: {}, dirtyCats: !cats && !used,
    cats: { Income: start.Income.slice(), Expense: start.Expense.slice() }, settings: settingsOf(set ? JSON.parse(set) : null), dirtySet: false, dirtyLimit: false,
    keepL: {}, keepR: {}, sizeL: {}, sizeR: {}, payDir: {}, dirtyL: false, dirtyR: false, limit: 0, seen: {} };
  DIRS.forEach(function (d) { st.keepL[d] = []; st.keepR[d] = []; st.sizeL[d] = st.sizeR[d] = 0; });
  ss.getSheets().forEach(function (sh) { if (/^\d{4}$/.test(sh.getName())) readYear(st, sh); });
  readCommon(st, ensureCommon(ss));
  readNotes(st, ss.getSheetByName(NOTES));
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
  var block = sh.getRange(M_FIRST, 1, last - M_FIRST + 1, 12 * M_STEP), vals = block.getValues(), notes = block.getNotes();
  for (var m = 0; m < 12; m++) {
    var home = sh.getName() + '-' + pad2(m + 1);
    st.keep[home] = [];
    vals.forEach(function (row, i) {
      var c = row.slice(m * M_STEP, m * M_STEP + M_COLS);
      if (isBlank(c)) return;
      st.size[home] = i + 1;
      var e = parseEntry(c, st.cats);
      if (!e) { st.keep[home].push(c); return; }
      var id = freshId(st, e.id);
      if (id !== e.id) { e.id = id; st.dirty[home] = true; }
      e.home = home;
      readStamp(e, notes[i][m * M_STEP]);
      st.rows.push(e);
    });
  }
}

// [Date, Category, Income, Expense, Reason, Id] -> entry, or null while the row isn't complete (or the category is misspelled).
function parseEntry(c, cats) {
  var d = toDate(c[0]), inc = Number(c[2]) || 0, exp = Number(c[3]) || 0;
  var type = inc > 0 && !exp ? 'Income' : exp > 0 && !inc ? 'Expense' : '';
  var category = type ? matchName(cats[type], c[1]) : '';
  if (!d || !category) return null;
  return { id: String(c[5]).trim(), dateTime: d.toISOString(), type: type, category: category, amount: type === 'Income' ? inc : exp, note: String(c[4]).trim() };
}

function readCommon(st, sh) {
  st.limit = Number(sh.getRange(1, 2).getValue()) || 0;
  var last = sh.getLastRow();
  if (last < L_FIRST) return;
  var block = sh.getRange(L_FIRST, 1, last - L_FIRST + 1, LAST_COL), notes = block.getNotes();
  block.getValues().forEach(function (row, i) {
    DIRS.forEach(function (dir) {
      var l = row.slice(LOAN_COL[dir] - 1, LOAN_COL[dir] - 1 + L_COLS);
      if (!isBlank(l)) {
        st.sizeL[dir] = i + 1;
        var loan = parseLoan(l[0], l[1], l[2], l[3], l[4], l[5], l[8], dir);
        if (!loan) st.keepL[dir].push(l);
        else { if (claim(st, loan)) st.dirtyL = st.dirtyR = true; readStamp(loan, notes[i][LOAN_COL[dir] - 1]); st.loans.push(loan); }
      }
      var p = row.slice(PAY_COL[dir] - 1, PAY_COL[dir] - 1 + R_COLS);
      if (!isBlank(p)) {
        st.sizeR[dir] = i + 1;
        var repay = parseRepay(p[0], p[2], p[3], p[4], dir);
        if (!repay) st.keepR[dir].push(p);
        else { if (claim(st, repay)) st.dirtyR = true; st.payDir[repay.id] = dir; readStamp(repay, notes[i][PAY_COL[dir] - 1]); st.repays.push(repay); }
      }
    });
  });
}

function readNotes(st, sh) {
  if (!sh || sh.getLastRow() < 2) return;
  var block = sh.getRange(2, 1, sh.getLastRow() - 1, N_COLS), notes = block.getNotes();
  block.getValues().forEach(function (c, i) {
    if (isBlank(c)) return;
    st.sizeN = i + 1;
    var n = parseNote(c);
    if (!n) { st.keepN.push(c); return; }
    if (claim(st, n) || !toDate(c[4])) st.dirtyN = true; // typed by hand: it gets an Id and a date
    readStamp(n, notes[i][4]);
    st.notes.push(n);
  });
}

// [Title, List, Notes, Category, Added, By, Id] -> note, or null without a title. A list line starting with ☑ is done.
function parseNote(c) {
  var line = function (v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }, title = line(c[0], 60);
  if (!title) return null;
  var items = String(c[1]).split('\n').map(function (l) { l = l.trim(); return { t: line(l.replace(/^[☐☑]/, ''), 80), done: l.charAt(0) === '☑' }; });
  return { id: String(c[6]).trim(), dateTime: (toDate(c[4]) || new Date()).toISOString(), title: title, items: items.filter(function (i) { return i.t; }).slice(0, 100),
    text: String(c[2]).trim().slice(0, 2000), category: line(c[3], 40), by: line(c[5], 40) };
}

// Gives rec a usable Id; true when it had to change (so the table is written back).
function claim(st, rec) { var id = freshId(st, rec.id); var changed = id !== rec.id; rec.id = id; return changed; }

// sixth: the priority, or for an investment "Compound" / "Simple" (anything else counts as compound).
function parseLoan(date, reason, amount, rate, per, sixth, id, dir) {
  var d = toDate(date);
  if (!d || !(Number(amount) > 0)) return null;
  var l = { id: String(id).trim(), dateTime: d.toISOString(), reason: String(reason).trim(), amount: Number(amount),
    interest: Number(rate) > 0 ? Number(rate) : 0, per: matchName(['year'], per) ? 'year' : 'month', priority: matchName(Object.keys(PRIORITY), sixth) || 'medium', dir: dir };
  if (dir === 'invested') l.compound = !matchName(['simple'], sixth);
  return l;
}

// Below 0, in the WITHDRAWN table: money added to the investment.
function parseRepay(date, amount, loanId, id, dir) {
  var d = toDate(date), a = Number(amount);
  if (!d || !(a > 0 || (dir === 'invested' && a < 0)) || !String(loanId).trim()) return null;
  return { id: String(id).trim(), loanId: String(loanId).trim(), dateTime: d.toISOString(), amount: Number(amount) };
}

// ---- Apply one op in memory. Every op is safe to resend: a known add is skipped, an update overwrites, a missing delete is done.
function applyOp(st, op) {
  if (op && op.kind === 'cat') {
    var bad = applyCat(st.cats, st.rows, op, function (r) { st.dirty[r.home] = true; });
    if (!bad) {
      st.dirtyCats = st.dirtySet = true;
      catInSettings(st.settings, st.cats, op);
      delete st.settings.budgets.Others; // B1 keeps the Others budget
    }
    return bad;
  }
  if (op && op.kind === 'set') {
    var wrong = validateSet(op.data);
    if (wrong) return wrong;
    if (op.data.key === 'budget' && op.data.id === 'Others') { st.limit = op.data.value; st.dirtyLimit = true; }
    else { applySet(st.settings, op.data); st.dirtySet = true; }
    return '';
  }
  if (!op || !LIST_OF.hasOwnProperty(op.kind)) return 'bad op';
  if (!checkId(op.id)) return 'bad id';
  var list = st[LIST_OF[op.kind]], i = findIndex(list, op.id);
  if (op.action === 'delete') {
    if (i >= 0) { touch(st, op.kind, list[i]); list.splice(i, 1); }
    if (op.kind === 'loan') {
      var before = st.repays.length;
      st.repays = st.repays.filter(function (r) { return r.loanId !== op.id; });
      if (st.repays.length !== before) st.dirtyR = true;
      if (st.settings.loans[op.id]) { delete st.settings.loans[op.id]; st.dirtySet = true; }
    }
    return '';
  }
  if (op.action !== 'add' && op.action !== 'update') return 'bad op';
  var d = op.data, err = VALIDATE[op.kind](d);
  if (err) return err;
  if (d.id !== op.id) return 'bad id';
  if (op.kind === 'repay' && findIndex(st.loans, d.loanId) < 0) return 'loan not found';
  if (op.kind === 'repay' && d.amount < 0 && st.loans[findIndex(st.loans, d.loanId)].dir !== 'invested') return 'bad amount'; // only an investment takes money added
  if ((op.action === 'add') === (i >= 0)) return ''; // add of a known id, or update of one deleted elsewhere: nothing to do
  if (op.kind === 'entry') {
    // A phone that missed a rename still sends the old name: bring the category back rather than lose the entry.
    if (!matchName(st.cats[d.type], d.category)) { applyCat(st.cats, [], { action: 'add', data: { type: d.type, name: d.category } }); st.dirtyCats = true; }
    d.category = matchName(st.cats[d.type], d.category);
  }
  var rec = record(st, op.kind, d), now = new Date().toISOString();
  rec.createdAt = i >= 0 ? list[i].createdAt : now; // the server's clock, not the phone's: an offline phone can queue ops for days
  rec.updatedAt = now;
  if (i >= 0) { touch(st, op.kind, list[i]); list[i] = rec; } else list.push(rec);
  touch(st, op.kind, rec);
  return '';
}

function record(st, kind, d) {
  if (kind === 'entry') {
    return { id: d.id, dateTime: d.dateTime, type: d.type, category: d.category, amount: d.amount, note: (d.note || '').trim(), by: d.by || '', home: homeOf(st, d.dateTime) };
  }
  if (kind === 'note') {
    return { id: d.id, dateTime: d.dateTime, title: d.title, items: d.items.map(function (i) { return { t: i.t, done: i.done }; }), text: (d.text || '').trim(), category: d.category || '', by: d.by || '' };
  }
  if (kind === 'loan') {
    var l = { id: d.id, dateTime: d.dateTime, reason: d.reason.trim(), amount: d.amount, interest: d.interest > 0 ? d.interest : 0,
      per: d.per === 'year' ? 'year' : 'month', priority: PRIORITY.hasOwnProperty(d.priority) ? d.priority : 'medium', dir: loanDir(d) };
    if (l.dir === 'invested') l.compound = d.compound !== false;
    return l;
  }
  return { id: d.id, loanId: d.loanId, dateTime: d.dateTime, amount: d.amount };
}

// The month table an entry belongs in ("2026-10"), in the spreadsheet's own time zone.
function homeOf(st, dateTime) { return Utilities.formatDate(new Date(dateTime), st.tz, 'yyyy-MM'); }

// Mark what must be rewritten. A loan's reason also shows in the repayments table.
function touch(st, kind, rec) {
  if (kind === 'entry') st.dirty[rec.home] = true;
  else if (kind === 'note') st.dirtyN = true;
  else if (kind === 'loan') st.dirtyL = st.dirtyR = true;
  else st.dirtyR = true;
}

// ---- Write back only what changed.
function writeDirty(st) {
  Object.keys(st.dirty).sort().forEach(function (home) { writeMonth(st, home); });
  var props = PropertiesService.getScriptProperties();
  if (st.dirtyCats) props.setProperty('CATS', JSON.stringify(st.cats));
  if (st.dirtySet) props.setProperty('SET', JSON.stringify(st.settings));
  if (st.dirtyLimit) ensureCommon(st.ss).getRange(1, 2).setValue(st.limit);
  // Summaries written by an older layout (SUMMARY) are rewritten once, on the first sync after an update.
  if (st.dirtyCats || props.getProperty('SUMMARY') !== SUMMARY) {
    st.ss.getSheets().forEach(function (sh) { if (/^\d{4}$/.test(sh.getName())) writeSummary(sh, st.cats, true); });
    props.setProperty('SUMMARY', SUMMARY);
  }
  var sh = ensureCommon(st.ss);
  if (props.getProperty('LOOK') !== LOOK) {
    st.ss.getSheets().forEach(function (y) { if (/^\d{4}$/.test(y.getName())) { styleYear(y, st.ss.getName()); styleSummary(y, st.cats); } });
    styleCommon(sh);
    props.setProperty('LOOK', LOOK);
  }
  if (st.dirtyL) writeLoans(st, sh);
  if (st.dirtyR) writeRepays(st, sh);
  if (st.dirtyN) writeNotes(st);
  removeBlankDefault(st.ss);
}

function writeMonth(st, home) {
  var m = Number(home.slice(5)) - 1, keep = st.keep[home] || [], old = st.size[home] || 0;
  var rows = st.rows.filter(function (r) { return r.home === home; }).sort(byOldest);
  var out = rows.map(function (r) {
    return [new Date(r.dateTime), r.category, r.type === 'Income' ? r.amount : '', r.type === 'Expense' ? r.amount : '', safeText(r.note), r.id];
  }).concat(keep);
  var sh = ensureYearTab(st.ss, home.slice(0, 4), st.cats);
  writeBlock(sh, M_FIRST, 1 + m * M_STEP, M_COLS, out, old);
  writeStamps(sh, M_FIRST, 1 + m * M_STEP, rows, keep.length, old);
  st.size[home] = out.length;
}

// Each direction has its own table and its own payments table. "Paid back / Got back" sums those payments; "Still owed / Still to get" subtracts them.
function writeLoans(st, sh) {
  DIRS.forEach(function (dir) {
    var c = LOAN_COL[dir], A = function (k, r) { return colName(c + k) + r; };
    var ids = colName(PAY_COL[dir] + 3), amounts = colName(PAY_COL[dir] + 2);
    var recs = st.loans.filter(function (l) { return l.dir === dir; }).sort(byOldest);
    var out = recs.map(function (l, i) {
      var r = L_FIRST + i;
      return [new Date(l.dateTime), safeText(l.reason), l.amount, l.interest || '', l.interest ? l.per : '', dir === 'invested' ? (l.compound === false ? 'Simple' : 'Compound') : l.priority,
        '=SUMIF($' + ids + '$' + L_FIRST + ':$' + ids + ',' + A(8, r) + ',$' + amounts + '$' + L_FIRST + ':$' + amounts + ')', '=' + A(2, r) + '-' + A(6, r), l.id];
    }).concat(st.keepL[dir]);
    writeBlock(sh, L_FIRST, c, L_COLS, out, st.sizeL[dir]);
    writeStamps(sh, L_FIRST, c, recs, st.keepL[dir].length, st.sizeL[dir]);
    st.sizeL[dir] = out.length;
  });
}

// A payment goes in the table next to its loan (a payment whose loan was removed by hand stays where it was).
function writeRepays(st, sh) {
  var loans = {};
  st.loans.forEach(function (l) { loans[l.id] = l; });
  DIRS.forEach(function (dir) {
    var recs = st.repays.filter(function (p) { return (loans[p.loanId] ? loans[p.loanId].dir : st.payDir[p.id] || 'borrowed') === dir; }).sort(byOldest);
    var out = recs.map(function (p) {
        return [new Date(p.dateTime), safeText(loans[p.loanId] ? loans[p.loanId].reason : ''), p.amount, p.loanId, p.id];
      }).concat(st.keepR[dir]);
    writeBlock(sh, L_FIRST, PAY_COL[dir], R_COLS, out, st.sizeR[dir]);
    writeStamps(sh, L_FIRST, PAY_COL[dir], recs, st.keepR[dir].length, st.sizeR[dir]);
    st.sizeR[dir] = out.length;
  });
}

// A note syncs whole. ponytail: two phones ticking the same list at the same moment: the last one wins; per-item ops if that bites.
function writeNotes(st) {
  var recs = st.notes.slice().sort(byOldest);
  var out = recs.map(function (n) {
    return [safeText(n.title), n.items.map(function (i) { return (i.done ? '☑ ' : '☐ ') + i.t; }).join('\n'), safeText(n.text), safeText(n.category), new Date(n.dateTime), n.by, n.id];
  }).concat(st.keepN);
  var sh = ensureNotes(st.ss);
  writeBlock(sh, 2, 1, N_COLS, out, st.sizeN);
  writeStamps(sh, 2, 5, recs, st.keepN.length, st.sizeN); // on the Added cell
  st.sizeN = out.length;
}

// When a record was made and last changed (server time), plus who added it, as the note on its first cell:
// "Added by Sunita", "Created <ISO>", "Edited <ISO>". Records from before this have no Created line. ponytail: a row edited by hand in the sheet keeps its old stamps.
function stampNote(r) { return [r.by ? 'Added by ' + r.by : '', r.createdAt ? 'Created ' + r.createdAt : '', r.updatedAt ? 'Edited ' + r.updatedAt : ''].filter(Boolean).join('\n'); }

function readStamp(rec, text) {
  text = String(text || '');
  var by = /^Added by (.+)$/m.exec(text), c = /^Created (\S+)/m.exec(text), u = /^Edited (\S+)/m.exec(text);
  if (by && !rec.by) rec.by = by[1].trim().slice(0, 30);
  if (c) rec.createdAt = c[1];
  if (u) rec.updatedAt = u[1];
}

// Notes for the rows just written at (row, col): one per record, then blanks for kept rows and for whatever was below before.
function writeStamps(sh, row, col, recs, kept, oldSize) {
  var notes = recs.map(function (r) { return [stampNote(r)]; });
  while (notes.length < Math.max(recs.length + kept, oldSize)) notes.push(['']);
  if (notes.length) sh.getRange(row, col, notes.length, 1).setNotes(notes);
}

// Writes rows at (row, col) and blanks whatever was below them before. Strings starting with "=" become formulas.
function writeBlock(sh, row, col, width, out, oldSize) {
  out = out.slice();
  while (out.length < oldSize) out.push(blankRow(width));
  if (out.length) sh.getRange(row, col, out.length, width).setValues(out);
}

// ---- Layout, created once per tab.
function ensureYearTab(ss, year, cats) {
  var sh = ss.getSheetByName(year);
  if (sh) return sh;
  var newer = ss.getSheets().filter(function (s) { return /^\d{4}$/.test(s.getName()) && s.getName() > year; }).length;
  sh = ss.insertSheet(year, newer); // newest year first
  writeSummary(sh, cats);
  sh.getRange(17, 1).setValue('To add by hand: use the first empty row of the month and put the amount under Income or Expense. Leave the Id column alone.');
  for (var m = 0; m < 12; m++) {
    var c = 1 + m * M_STEP;
    sh.getRange(M_TITLE, c).setValue(MONTH_NAMES[m].toUpperCase());
    sh.getRange(M_HEAD, c, 1, M_COLS).setValues([['Date', 'Category', 'Income', 'Expense', 'Reason', 'Id']]);
  }
  styleYear(sh, ss.getName());
  return sh;
}

// ---- Looks: colours, number formats, widths. Never values (except the title), so a repaint is always safe.
// The summary and the month tables share columns, so widths suit both and only the Id columns are hidden.
function styleYear(sh, name) {
  sh.setHiddenGridlines(true);
  sh.setTabColor(COLOR.incomeD);
  sh.getRange(1, 1).setValue(sh.getName() + ' · ' + name).setFontSize(18).setFontWeight('bold').setFontColor(COLOR.ink);
  sh.setRowHeight(1, 40);
  sh.getRange(17, 1).setFontStyle('italic').setFontSize(9).setFontColor(COLOR.muted);
  sh.getBandings().forEach(function (b) { b.remove(); });
  for (var m = 0; m < 12; m++) {
    var c = 1 + m * M_STEP;
    sh.getRange(M_TITLE, c, 1, M_COLS - 1).setBackground(COLOR.month).setFontWeight('bold').setFontColor(COLOR.ink);
    sh.getRange(M_HEAD, c, ROWS + 1, M_COLS - 1).applyRowBanding().setHeaderRowColor(COLOR.head).setFirstRowColor(COLOR.white).setSecondRowColor(COLOR.band);
    sh.getRange(M_HEAD, c, 1, M_COLS - 1).setFontWeight('bold').setBorder(null, null, true, null, null, null, COLOR.line, null);
    sh.getRange(M_FIRST, c, ROWS, 1).setNumberFormat(DATE_FORMAT);
    sh.getRange(M_FIRST, c + 2, ROWS, 1).setNumberFormat(MONEY).setFontColor(COLOR.good);
    sh.getRange(M_FIRST, c + 3, ROWS, 1).setNumberFormat(MONEY).setFontColor(COLOR.bad);
    [150, 110, 95, 95, 180].forEach(function (px, k) { sh.setColumnWidth(c + k, px); });
    sh.hideColumns(c + 5);
  }
}

// Rows 2-16. Repainted whenever the summary is rewritten, since the category list sets its width.
function styleSummary(sh, cats) {
  var nI = cats.Income.length, nE = cats.Expense.length, cols = summaryCols(nI + nE + 4), w = cols[cols.length - 1];
  var inc = [cols[1], cols[1 + nI]], exp = [cols[2 + nI], cols[2 + nI + nE]], saved = cols[3 + nI + nE];
  function span(row, a, b, n) { return sh.getRange(row, a, n || 1, b - a + 1); }
  sh.getRange(2, 1, 15, Math.max(w, 12 * M_STEP)).clearFormat(); // a longer old list leaves no colours behind
  span(2, 1, w).setFontWeight('bold').setFontSize(9);
  [[inc, COLOR.incomeD, COLOR.income], [exp, COLOR.expenseD, COLOR.expense], [[saved, saved], COLOR.savedD, COLOR.saved]].forEach(function (g) {
    span(2, g[0][0], g[0][1]).setBackground(g[1]);
    span(3, g[0][0], g[0][1]).setBackground(g[2]);
  });
  span(3, 1, 1).setBackground(COLOR.head);
  span(3, 1, w).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  span(3, 2, w).setHorizontalAlignment('center');
  sh.getRange(4, 1, 12, w).setBackgrounds([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (m) { return blankRow(w).map(function () { return m % 2 ? COLOR.band : COLOR.white; }); }));
  span(4, 2, w, 13).setNumberFormat(MONEY);
  span(4, saved, saved, 13).setNumberFormat(SAVED_MONEY);
  [inc[1], exp[1], saved].forEach(function (c) { span(4, c, c, 13).setFontWeight('bold'); });
  span(16, 1, w).setFontWeight('bold').setBackground(COLOR.head).setBorder(true, null, null, null, null, null, COLOR.ink, null);
  span(2, 1, w, 15).setBorder(true, true, true, true, null, null, COLOR.line, null);
}

// The summary sits above the month tables, so it shares their columns: it steps over each month's hidden Id column (F, M, T, …),
// or that column's summary cell would be hidden too. Returns the first n columns it can use.
function summaryCols(n) {
  var out = [];
  for (var c = 1; out.length < n; c++) if (c % M_STEP !== M_COLS) out.push(c);
  return out;
}

// The summary, rows 2-16: Month | each income category | Income | each expense category | Expenses | Saved.
// pad: blank the rest of each row too, so a shorter category list leaves no old columns behind.
function writeSummary(sh, cats, pad) {
  var nI = cats.Income.length, cols = summaryCols(nI + cats.Expense.length + 4), w = cols[cols.length - 1], top = blankRow(cols.length);
  top[1] = 'INCOME';
  top[nI + 2] = 'EXPENSES';
  var out = [top, ['Month'].concat(cats.Income, ['Income'], cats.Expense, ['Expenses', 'Saved'])].concat(summaryFormulas(cats).map(function (r, m) {
    return [MONTH_NAMES.concat(['Total'])[m]].concat(r);
  }));
  var width = pad ? Math.max(w, 12 * M_STEP) : w;
  sh.getRange(2, 1, out.length, width).setValues(out.map(function (r) {
    var row = blankRow(width);
    r.forEach(function (v, k) { row[cols[k] - 1] = v; });
    return row;
  }));
  styleSummary(sh, cats);
}

// Rows 4-15: one per month, row 16: totals. With the starting categories, columns B:N = Job Dairy Crops Others | (F hidden) Income |
// House Dairy Crops Others | Expenses | (M hidden) Saved.
function summaryFormulas(cats) {
  var nI = cats.Income.length, nE = cats.Expense.length, cols = summaryCols(nI + nE + 4);
  function at(k) { return colName(cols[k]); } // the k-th summary column (0 = Month)
  var inc = at(1 + nI), exp = at(2 + nI + nE);
  var out = MONTH_NAMES.map(function (n, m) {
    var c = 1 + m * M_STEP, r = 4 + m;
    function col(k) { var a = colName(c + k); return a + M_FIRST + ':' + a; }
    function sumif(name, k) { return '=SUMIF(' + col(1) + ',"' + name + '",' + col(k) + ')'; }
    // Totals add up the category cells, not the whole column, so a misspelled row is never counted (the app skips it too).
    // A hidden Id cell inside the range is always blank.
    return cats.Income.map(function (x) { return sumif(x, 2); }).concat(['=SUM(' + at(1) + r + ':' + at(nI) + r + ')'])
      .concat(cats.Expense.map(function (x) { return sumif(x, 3); }))
      .concat(['=SUM(' + at(2 + nI) + r + ':' + at(1 + nI + nE) + r + ')', '=' + inc + r + '-' + exp + r]);
  });
  out.push(out[0].map(function (_, k) { var a = at(1 + k); return '=SUM(' + a + '4:' + a + '15)'; }));
  return out;
}

function ensureCommon(ss) {
  var sh = ss.getSheetByName(COMMON);
  if (!sh) {
    sh = ss.insertSheet(COMMON, ss.getSheets().length);
    sh.getRange(1, 1, 1, 2).setValues([['Others monthly limit', 3000]]);
  }
  // Each table is laid out the first time it is needed, so a sheet made before a table existed (INVESTED) gets it on its next sync.
  var titles = sh.getRange(3, 1, 1, LAST_COL).getValues()[0], laid = false;
  DIRS.forEach(function (dir) {
    var t = TABLES[dir], c = LOAN_COL[dir], p = PAY_COL[dir];
    if (titles[c - 1] === t[0]) return;
    sh.getRange(3, c).setValue(t[0]);
    sh.getRange(4, c, 1, L_COLS).setValues([['Date', t[1], 'Amount', t[2], 'Per', t[3], t[4], t[5], 'Id']]);
    sh.getRange(3, p).setValue(t[6]);
    sh.getRange(4, p, 1, R_COLS).setValues([['Date', t[7], 'Amount', 'LoanId', 'Id']]);
    laid = true;
  });
  if (laid) styleCommon(sh);
  return sh;
}

function ensureNotes(ss) {
  var sh = ss.getSheetByName(NOTES);
  if (sh) return sh;
  sh = ss.insertSheet(NOTES, ss.getSheets().length);
  sh.getRange(1, 1, 1, N_COLS).setValues([['Title', 'List', 'Notes', 'Category', 'Added', 'By', 'Id']]);
  sh.setHiddenGridlines(true);
  sh.setTabColor(COLOR.savedD);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, N_COLS - 1).setBackground(COLOR.saved).setFontWeight('bold').setFontColor(COLOR.ink);
  sh.getRange(2, 1, ROWS, 1).setFontWeight('bold');
  sh.getRange(2, 2, ROWS, 2).setWrap(true).setVerticalAlignment('top');
  sh.getRange(2, 5, ROWS, 1).setNumberFormat(DATE_FORMAT);
  [160, 220, 320, 110, 150, 90].forEach(function (px, k) { sh.setColumnWidth(k + 1, px); });
  sh.hideColumns(N_COLS);
  return sh;
}

// The Others limit, then per direction a coloured table and its payments table (Id columns hidden).
var TINT = { borrowed: [COLOR.expenseD, COLOR.expense], given: [COLOR.skyD, COLOR.sky], invested: [COLOR.incomeD, COLOR.income] };
function styleCommon(sh) {
  sh.setHiddenGridlines(true);
  sh.setTabColor(COLOR.butterD);
  sh.getRange(1, 1).setFontWeight('bold');
  sh.getRange(1, 2).setNumberFormat(MONEY).setFontWeight('bold').setBackground(COLOR.butter).setBorder(true, true, true, true, null, null, COLOR.butterD, null);
  sh.getBandings().forEach(function (b) { b.remove(); });
  DIRS.forEach(function (dir) {
    var c = LOAN_COL[dir], p = PAY_COL[dir];
    // Visible part: the loan table without its Id, the payments table without LoanId and Id.
    [[c, L_COLS - 1, TINT[dir][0]], [p, R_COLS - 2, TINT[dir][1]]].forEach(function (x) {
      sh.getRange(3, x[0], 1, x[1]).setBackground(x[2]).setFontWeight('bold').setFontColor(COLOR.ink);
      sh.getRange(4, x[0], ROWS + 1, x[1]).applyRowBanding().setHeaderRowColor(COLOR.head).setFirstRowColor(COLOR.white).setSecondRowColor(COLOR.band);
      sh.getRange(4, x[0], 1, x[1]).setFontWeight('bold').setBorder(null, null, true, null, null, null, COLOR.line, null);
      sh.getRange(L_FIRST, x[0], ROWS, 1).setNumberFormat(DATE_FORMAT);
      sh.getRange(L_FIRST, x[0] + 2, ROWS, 1).setNumberFormat(MONEY);
      sh.setColumnWidth(x[0], 150);
      sh.setColumnWidth(x[0] + 1, 200);
    });
    sh.getRange(L_FIRST, c + 6, ROWS, 2).setNumberFormat(MONEY);
    sh.getRange(L_FIRST, c + 7, ROWS, 1).setFontWeight('bold');
    [c + 8, p + 3, p + 4].forEach(function (x) { sh.hideColumns(x); });
  });
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
    var e = parseEntry([r[1], r[3], r[2] === 'Income' ? r[4] : '', r[2] === 'Expense' ? r[4] : '', r[5], r[0]], st.cats);
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
function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// Stop notes like "=SUM(...)" from turning into formulas in the sheet.
function safeText(s) {
  s = s ? String(s) : '';
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
