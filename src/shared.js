// Shared by the phone app and Apps Script (pasted there as shared.gs). Pure functions only.
// Each sheet keeps its own category list (Apps Script property CATS); Others is always last and never changes.
// CATEGORIES: what sheets made before categories could change were using. A new, empty sheet starts with only Others.
var CATEGORIES = {
  Income: ['Job', 'Dairy', 'Crops', 'Others'],
  Expense: ['House', 'Dairy', 'Crops', 'Others']
};
var NEW_CATEGORIES = { Income: ['Others'], Expense: ['Others'] };
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
var PRIORITY = { high: 0, medium: 1, low: 2 }; // loans: high shows first
// Money we borrowed, gave to others (on interest), or invested (funds, deposits). Their "repayments": paid back, got back, withdrawn.
var DIRS = ['borrowed', 'given', 'invested'];
function loanDir(l) { return l && DIRS.indexOf(l.dir) > 0 ? l.dir : 'borrowed'; } // missing = borrowed (older records)

function checkId(id) { return typeof id === 'string' && /^[\w-]{8,64}$/.test(id); }
function checkAmount(a) { return typeof a === 'number' && isFinite(a) && a > 0 && a <= 1e9; }
function checkDate(s) { return typeof s === 'string' && !isNaN(Date.parse(s)); }
// A category name starts with a letter and has none of the characters sheet formulas and SUMIF treat specially.
// 'Saved' is the pie's own slice; names like 'constructor' would clash with object keys.
function checkCatName(s) {
  return typeof s === 'string' && s === s.trim() && /^\p{L}[^"*?~<>=\x00-\x1f]{0,29}$/u.test(s) && s.toLowerCase() !== 'saved' && !(s in {});
}
// "dairy " typed by hand still counts as "Dairy".
function matchName(names, v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  for (var i = 0; i < names.length; i++) if (names[i].toLowerCase() === s) return names[i];
  return '';
}
function checkReason(s) {
  var t = typeof s === 'string' ? s.trim() : '';
  return !t ? 'reason required' : t.length > 200 ? 'reason too long' : '';
}

// Validators return '' when valid, otherwise the reason.
function validateEntry(e) {
  if (!e || typeof e !== 'object') return 'bad entry';
  if (!checkId(e.id)) return 'bad id';
  if (!CATEGORIES.hasOwnProperty(e.type)) return 'bad type';
  if (!checkCatName(e.category)) return 'bad category'; // any name: a phone may not have heard of a rename yet
  if (!checkAmount(e.amount)) return 'bad amount';
  if (!checkDate(e.dateTime)) return 'bad date';
  return checkReason(e.note);
}

// Money borrowed. Repayments are separate records so part payments made offline never clash.
function validateLoan(l) {
  if (!l || typeof l !== 'object') return 'bad loan';
  if (!checkId(l.id)) return 'bad id';
  if (!checkAmount(l.amount)) return 'bad amount';
  if (!checkDate(l.dateTime)) return 'bad date';
  // Interest is optional: a % (0 = none) charged per 'month' or per 'year'.
  if (l.interest != null && !(typeof l.interest === 'number' && l.interest >= 0 && l.interest <= 100)) return 'bad interest';
  if (l.interest > 0 && l.per !== 'month' && l.per !== 'year') return 'bad interest';
  if (l.priority != null && !PRIORITY.hasOwnProperty(l.priority)) return 'bad priority';
  if (l.dir != null && DIRS.indexOf(l.dir) < 0) return 'bad dir';
  if (l.compound != null && typeof l.compound !== 'boolean') return 'bad interest'; // investments: compound (missing) or simple
  return checkReason(l.reason);
}

function validateRepay(r) {
  if (!r || typeof r !== 'object') return 'bad repayment';
  if (!checkId(r.id) || !checkId(r.loanId)) return 'bad id';
  if (!checkAmount(r.amount)) return 'bad amount';
  if (!checkDate(r.dateTime)) return 'bad date';
  return '';
}

// [start, end) in local time. Weeks start Monday.
function periodRange(view, date) {
  var y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  if (view === 'week') {
    var s = d - (date.getDay() + 6) % 7;
    return { start: new Date(y, m, s), end: new Date(y, m, s + 7) };
  }
  if (view === 'month') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}

function shiftPeriod(view, date, n) {
  if (view === 'week') return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * n);
  if (view === 'month') return new Date(date.getFullYear(), date.getMonth() + n, 1);
  return new Date(date.getFullYear() + n, 0, 1);
}

function periodLabel(view, date) {
  var r = periodRange(view, date);
  if (view === 'year') return String(r.start.getFullYear());
  if (view === 'month') return MONTHS[r.start.getMonth()] + ' ' + r.start.getFullYear();
  var last = new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate() - 1);
  return r.start.getDate() + ' ' + MONTHS[r.start.getMonth()] + ' - ' + last.getDate() + ' ' + MONTHS[last.getMonth()];
}

// Chart buckets: days of the week, 7-day chunks of the month (1-7, 8-14, …), or months of the year.
function buckets(view, start) {
  if (view === 'week') return DAYS.slice();
  if (view === 'year') return MONTHS.slice();
  var days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(), out = [];
  for (var a = 1; a <= days; a += 7) out.push(a + '-' + Math.min(a + 6, days));
  return out;
}

function bucketIndex(view, d, start) {
  if (view === 'week') return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5);
  if (view === 'month') return Math.floor((d.getDate() - 1) / 7);
  return d.getMonth();
}

function round2(n) { return Math.round(n * 100) / 100; }

// Profit by source: income categories, then expense-only ones, then Others. A name in both lists is income minus expenses.
function netOrder(cats) {
  var out = cats.Income.filter(function (c) { return c !== 'Others'; });
  cats.Expense.forEach(function (c) { if (c !== 'Others' && out.indexOf(c) < 0) out.push(c); });
  return out.concat('Others');
}

// rows: [{id, dateTime, type, category, amount, note}], duplicates by id are counted once. cats: the sheet's categories.
function summarize(rows, view, date, othersLimit, cats) {
  cats = cats || CATEGORIES;
  var r = periodRange(view, date), labels = buckets(view, r.start);
  var out = {
    start: r.start, end: r.end, label: periodLabel(view, date), labels: labels,
    income: 0, expense: 0, net: {}, spent: {},
    incomeSeries: labels.map(function () { return 0; }),
    expenseSeries: labels.map(function () { return 0; }),
    entries: [], others: 0, othersLimit: othersLimit || 0
  };
  netOrder(cats).forEach(function (c) { out.net[c] = 0; });
  cats.Expense.forEach(function (c) { out.spent[c] = 0; });
  var seen = {};
  rows.forEach(function (e) {
    if (seen[e.id]) return;
    seen[e.id] = true;
    var d = new Date(e.dateTime);
    if (!(d >= r.start && d < r.end)) return;
    var i = bucketIndex(view, d, r.start);
    if (e.type === 'Income') {
      out.income += e.amount; out.net[e.category] = (out.net[e.category] || 0) + e.amount; out.incomeSeries[i] += e.amount;
    } else { // || 0: a queued entry can still carry a name renamed on another phone
      out.expense += e.amount; out.net[e.category] = (out.net[e.category] || 0) - e.amount; out.spent[e.category] = (out.spent[e.category] || 0) + e.amount; out.expenseSeries[i] += e.amount;
    }
    out.entries.push(e);
  });
  out.entries.sort(function (a, b) { return Date.parse(b.dateTime) - Date.parse(a.dateTime); });
  out.income = round2(out.income);
  out.expense = round2(out.expense);
  out.savings = round2(out.income - out.expense);
  Object.keys(out.net).forEach(function (c) { out.net[c] = round2(out.net[c]); });
  Object.keys(out.spent).forEach(function (c) { out.spent[c] = round2(out.spent[c]); });
  out.incomeSeries = out.incomeSeries.map(round2);
  out.expenseSeries = out.expenseSeries.map(round2);
  out.others = out.spent.Others || 0;
  out.overLimit = out.othersLimit > 0 && out.others > out.othersLimit;
  return out;
}

// Where the period's income went: each expense category and what was saved, as % of income.
// When more was spent than earned, the % are of expenses and overBy says by how much. i: the category's place in the list (its colour).
function spendShare(s) {
  var base = Math.max(s.income, s.expense), slices = [];
  Object.keys(s.spent).forEach(function (c, i) { if (s.spent[c] > 0) slices.push({ name: c, amount: s.spent[c], i: i }); });
  if (s.savings > 0) slices.push({ name: 'Saved', amount: s.savings });
  slices.forEach(function (x) { x.pct = Math.round(x.amount / base * 1000) / 10; });
  return { base: base, slices: slices, overBy: round2(Math.max(0, s.expense - s.income)) };
}

// ---- Offline operation queue. op = {opId, kind: 'entry'|'loan'|'repay', action: 'add'|'update'|'delete', id, data},
// or a category change {opId, kind: 'cat', action: 'add'|'rename'|'delete', data: {type, name, to}} (see applyCat).
// The phone shows server data with its queued ops applied; Apps Script applies the same ops in the same order.
var LISTS = { entry: 'rows', loan: 'loans', repay: 'repays' };

function indexById(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
  return -1;
}

function applyOps(snap, ops) {
  var c = snap.cats || CATEGORIES;
  var out = { rows: (snap.rows || []).slice(), loans: (snap.loans || []).slice(), repays: (snap.repays || []).slice(),
    cats: { Income: c.Income.slice(), Expense: c.Expense.slice() } };
  ops.forEach(function (op) {
    if (op.kind === 'cat') { applyCat(out.cats, out.rows, op); return; }
    var key = LISTS[op.kind];
    if (!key) return;
    var list = out[key], i = indexById(list, op.id);
    if (op.action === 'add') { if (i < 0) list.push(op.data); }
    else if (op.action === 'update') { if (i >= 0) list[i] = op.data; }
    else if (op.action === 'delete') {
      if (i >= 0) list.splice(i, 1);
      if (op.kind === 'loan') out.repays = out.repays.filter(function (r) { return r.loanId !== op.id; });
    }
  });
  return out;
}

// Changes cats ({Income: [...], Expense: [...]}) in place. Renaming onto an existing name merges the two; deleting is renaming into Others.
// Entries of a renamed category are replaced in rows by moved copies, and onMove(copy) is called for each. Returns '' or the reason.
function applyCat(cats, rows, op, onMove) {
  var d = op.data || {}, list = CATEGORIES.hasOwnProperty(d.type) ? cats[d.type] : null;
  if (!list) return 'bad type';
  if (op.action === 'add') {
    if (!checkCatName(d.name)) return 'bad category';
    if (!matchName(list, d.name)) list.splice(list.length - 1, 0, d.name); // before Others
    return '';
  }
  var to = op.action === 'delete' ? 'Others' : op.action === 'rename' ? d.to : '';
  if (!checkCatName(to)) return op.action === 'rename' ? 'bad category' : 'bad op';
  var name = matchName(list, d.name);
  if (name === 'Others') return 'Others cannot be changed';
  if (!name) return ''; // already renamed or deleted on another phone
  var hit = matchName(list, to);
  if (hit && hit !== name) list.splice(list.indexOf(name), 1); else list[list.indexOf(name)] = hit = to; // merge, or rename (also "dairy" -> "Dairy")
  rows.forEach(function (r, i) {
    if (r.type !== d.type || r.category !== name) return;
    var moved = {};
    for (var k in r) moved[k] = r[k];
    moved.category = hit;
    rows[i] = moved;
    if (onMove) onMove(moved);
  });
  return '';
}

function byNewest(a, b) { return Date.parse(b.dateTime) - Date.parse(a.dateTime); }

// The newest n entries (History tab).
function recentEntries(rows, n) {
  var seen = {};
  return rows.filter(function (e) { if (seen[e.id]) return false; seen[e.id] = true; return true; }).sort(byNewest).slice(0, n);
}

// History filters: f = {q, year, month, cat}, '' means any. month is 0-11, cat is 'Income', 'Expense' or e.g. 'Expense-Dairy'.
// The search matches the reason, the category or the amount. Newest first.
function filterEntries(rows, f) {
  var q = (f.q || '').trim().toLowerCase();
  return recentEntries(rows, Infinity).filter(function (e) {
    var d = new Date(e.dateTime);
    return (!f.year || d.getFullYear() === Number(f.year)) &&
      (f.month == null || f.month === '' || d.getMonth() === Number(f.month)) &&
      (!f.cat || f.cat === e.type || f.cat === e.type + '-' + e.category) &&
      (!q || [e.note || '', e.category, String(e.amount)].join(' ').toLowerCase().indexOf(q) >= 0);
  });
}

// What one rupee invested grows to after `months` at the expected return (a yearly rate is the fund's XIRR):
// compounding (liquid and mutual funds, cumulative deposits) or simple interest (the same amount every month).
var MONTH_MS = 365.25 / 12 * 864e5;
function growth(l, months) {
  var r = l.interest > 0 ? l.interest / 100 : 0;
  if (l.compound === false) return 1 + r / (l.per === 'year' ? 12 : 1) * months;
  return Math.pow(1 + r, l.per === 'year' ? months / 12 : months);
}

// Totals for one kind of loan: overall, per loan, and within [start, end) when given.
// Borrowed and given: owed = still to pay or to get, monthly = simple interest on it.
// Invested: owed = worth now (an estimate: what went in and came out, each grown to today), monthly = this month's growth.
function summarizeLoans(loans, repays, start, end, now) {
  now = now || new Date();
  function inPeriod(s) { var d = new Date(s); return !!start && d >= start && d < end; }
  var out = { loans: [], borrowed: 0, repaid: 0, owed: 0, periodBorrowed: 0, periodRepaid: 0, monthlyInterest: 0 }, byLoan = {};
  loans.forEach(function (l) { byLoan[l.id] = []; });
  repays.forEach(function (r) {
    if (!byLoan[r.loanId]) return;
    byLoan[r.loanId].push(r);
    if (inPeriod(r.dateTime)) out.periodRepaid += r.amount;
  });
  loans.forEach(function (l) {
    var paid = round2(byLoan[l.id].reduce(function (sum, r) { return sum + r.amount; }, 0)), dir = loanDir(l);
    var principal = round2(Math.max(0, l.amount - paid)), owed = principal;
    var rate = l.interest > 0 ? l.interest : 0, per = l.per === 'year' ? 'year' : 'month';
    // Simple interest on what is still owed, as a monthly amount (a yearly rate is spread over 12 months).
    var monthly = round2(owed * rate / 100 / (per === 'year' ? 12 : 1));
    if (dir === 'invested') {
      var at = function (s) { return growth(l, Math.max(0, (now - Date.parse(s)) / MONTH_MS)); };
      // whole rupees: it is an estimate
      owed = Math.round(Math.max(0, l.amount * at(l.dateTime) - byLoan[l.id].reduce(function (sum, r) { return sum + r.amount * at(r.dateTime); }, 0)));
      monthly = Math.round((l.compound === false ? principal : owed) * (growth(l, 1) - 1));
    }
    out.loans.push({ id: l.id, reason: l.reason, dateTime: l.dateTime, amount: l.amount, interest: rate, per: per, monthly: monthly,
      priority: PRIORITY.hasOwnProperty(l.priority) ? l.priority : 'medium', dir: dir, compound: l.compound !== false, principal: principal,
      repaid: paid, owed: owed, done: dir === 'invested' ? owed < 1 : owed === 0, repays: byLoan[l.id].sort(byNewest) });
    out.borrowed += l.amount; out.repaid += paid; out.owed += owed; out.monthlyInterest += monthly;
    if (inPeriod(l.dateTime)) out.periodBorrowed += l.amount;
  });
  // Open loans first, then High > Medium > Low priority, then newest.
  out.loans.sort(function (a, b) { return (a.done - b.done) || (PRIORITY[a.priority] - PRIORITY[b.priority]) || byNewest(a, b); });
  ['borrowed', 'repaid', 'owed', 'periodBorrowed', 'periodRepaid', 'monthlyInterest'].forEach(function (k) { out[k] = round2(out[k]); });
  return out;
}

// ---- Forecast from the current saving rate

// Average monthly Saved over the last n complete months (this month is still running, so it is left out). Can be negative.
// Income in the Interest category is left out: the forecast adds the interest still to come on money given instead.
function savingRate(rows, now, n) {
  var total = 0, from = null, to = null;
  rows = rows.filter(function (e) { return !(e.type === 'Income' && matchName(['Interest'], e.category)); });
  for (var i = n; i >= 1; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    total += summarize(rows, 'month', d, 0).savings;
    from = from || d;
    to = d;
  }
  return { perMonth: round2(total / n), from: from, to: to };
}

// Month by month from today: open borrowed loans grow by simple monthly interest, and each month's savings pay them
// High > Medium > Low priority, then the dearest interest first, then the oldest. What is left over is saved.
// Money given adds its interest to each month's savings; investments grow (compound or simple) on top.
// months[k] is the position k+1 months from now: saved (incl. investment growth) minus still owed.
var FORECAST_MAX = 120;
function forecast(loans, repays, perMonth, now) {
  function openOf(dir) { return summarizeLoans(loans.filter(function (l) { return loanDir(l) === dir; }), repays, null, null, now).loans.filter(function (l) { return !l.done; }); }
  var interestIn = round2(openOf('given').reduce(function (s, l) { return s + l.monthly; }, 0));
  // base: what simple interest is paid on (what is still invested); null = compounding on the whole value
  var inv = openOf('invested').map(function (l) { return { value: l.owed, base: l.compound ? null : l.principal, step: growth(l, 1) - 1 }; });
  var invNow = inv.reduce(function (s, x) { return s + x.value; }, 0);
  var open = openOf('borrowed')
    .map(function (l) {
      return { reason: l.reason, interest: l.interest, per: l.per, priority: l.priority, dateTime: l.dateTime, left: l.owed, paidAt: 0,
        rate: l.interest > 0 ? l.interest / (l.per === 'year' ? 1200 : 100) : 0 };
    })
    .sort(function (a, b) { return (PRIORITY[a.priority] - PRIORITY[b.priority]) || (b.rate - a.rate) || (Date.parse(a.dateTime) - Date.parse(b.dateTime)); });
  var owedNow = open.reduce(function (s, l) { return s + l.left; }, 0);
  var out = { months: [], payoff: null, totalInterest: 0, hasLoans: open.length > 0, owedNow: round2(owedNow),
    monthlyInterestNow: round2(open.reduce(function (s, l) { return s + l.left * l.rate; }, 0)), never: false,
    interestIn: interestIn, hasInvest: inv.length > 0, investedNow: round2(invNow),
    growthNow: round2(inv.reduce(function (s, x) { return s + (x.base == null ? x.value : x.base) * x.step; }, 0)) };
  var saved = 0, end = open.length ? FORECAST_MAX : 24;
  for (var m = 1; m <= end; m++) {
    var cash = perMonth + interestIn;
    inv.forEach(function (x) { x.value += (x.base == null ? x.value : x.base) * x.step; });
    open.forEach(function (l) { if (l.left > 0) { var i = l.left * l.rate; l.left += i; out.totalInterest += i; } });
    open.forEach(function (l) {
      if (l.left > 0 && cash > 0) {
        var pay = Math.min(cash, l.left);
        l.left -= pay; cash -= pay;
        if (l.left < 0.005) { l.left = 0; l.paidAt = m; }
      }
    });
    saved += cash;
    var owed = open.reduce(function (s, l) { return s + l.left; }, 0), date = new Date(now.getFullYear(), now.getMonth() + m, 1);
    var grown = inv.reduce(function (s, x) { return s + x.value; }, 0) - invNow;
    out.months.push({ date: date, owed: round2(owed), saved: round2(saved + grown), position: round2(saved + grown - owed), invested: round2(invNow + grown) });
    if (open.length && !out.payoff && owed === 0) { out.payoff = { months: m, date: date }; end = Math.max(24, m + 12); }
  }
  out.never = open.length > 0 && !out.payoff;
  if (out.never) out.months = out.months.slice(0, 24);
  out.totalInterest = round2(out.totalInterest);
  out.perLoan = open.slice().sort(function (a, b) { return (a.paidAt || 1e9) - (b.paidAt || 1e9); }).map(function (l) {
    return { reason: l.reason, interest: l.interest, per: l.per, months: l.paidAt, date: l.paidAt ? new Date(now.getFullYear(), now.getMonth() + l.paidAt, 1) : null };
  });
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { CATEGORIES: CATEGORIES, DIRS: DIRS, growth: growth, checkCatName: checkCatName, matchName: matchName, applyCat: applyCat, validateEntry: validateEntry, validateLoan: validateLoan,
    validateRepay: validateRepay, periodRange: periodRange, shiftPeriod: shiftPeriod, periodLabel: periodLabel, buckets: buckets,
    summarize: summarize, spendShare: spendShare, applyOps: applyOps, recentEntries: recentEntries, filterEntries: filterEntries, summarizeLoans: summarizeLoans,
    savingRate: savingRate, forecast: forecast };
}
