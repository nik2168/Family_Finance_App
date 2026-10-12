// Shared by the phone app and Apps Script (pasted there as shared.gs). Pure functions only.
// Each sheet keeps its own category list (Apps Script property CATS); Others is always last and never changes.
// CATEGORIES: what sheets made before categories could change were using. A new, empty sheet starts with NEW_CATEGORIES,
// what most Indian families spend on (each family edits its own list).
var CATEGORIES = {
  Income: ['Job', 'Dairy', 'Crops', 'Others'],
  Expense: ['House', 'Dairy', 'Crops', 'Others']
};
var NEW_CATEGORIES = { Income: ['Salary', 'Business', 'Others'], Expense: ['Rent', 'Kirana', 'Milk', 'Bills', 'School', 'Petrol', 'Medical', 'Eating out', 'Others'] };
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
var PRIORITY = { high: 0, medium: 1, low: 2 }; // loans: high shows first ("Pay this first" is high)
var INTEREST = 'Interest', LOAN_INTEREST = 'Loan interest'; // where interest got and interest paid are counted
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
// The reason is optional for income and expenses (a loan still needs its name). by: who added it, set once per phone.
function validateEntry(e) {
  if (!e || typeof e !== 'object') return 'bad entry';
  if (!checkId(e.id)) return 'bad id';
  if (!CATEGORIES.hasOwnProperty(e.type)) return 'bad type';
  if (!checkCatName(e.category)) return 'bad category'; // any name: a phone may not have heard of a rename yet
  if (!checkAmount(e.amount)) return 'bad amount';
  if (!checkDate(e.dateTime)) return 'bad date';
  if (e.by != null && !(typeof e.by === 'string' && e.by.length <= 30)) return 'bad by';
  if (e.note != null && typeof e.note !== 'string') return 'bad reason';
  return e.note && e.note.trim().length > 200 ? 'reason too long' : '';
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
  if (!checkAmount(Math.abs(r.amount))) return 'bad amount'; // below 0: money added to an investment (Code.gs checks it is one)
  if (!checkDate(r.dateTime)) return 'bad date';
  return '';
}

// [start, end) in local time. Weeks start Monday. 'fy': the Indian financial year, April to March.
function periodRange(view, date) {
  var y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  if (view === 'all') return { start: new Date(2000, 0, 1), end: new Date(2100, 0, 1) }; // every entry
  if (view === 'fy') { var fy = m >= 3 ? y : y - 1; return { start: new Date(fy, 3, 1), end: new Date(fy + 1, 3, 1) }; }
  if (view === 'week') {
    var s = d - (date.getDay() + 6) % 7;
    return { start: new Date(y, m, s), end: new Date(y, m, s + 7) };
  }
  if (view === 'month') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}

function shiftPeriod(view, date, n) {
  if (view === 'all') return date;
  if (view === 'week') return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * n);
  if (view === 'month') return new Date(date.getFullYear(), date.getMonth() + n, 1);
  if (view === 'fy') return new Date(periodRange('fy', date).start.getFullYear() + n, 3, 1);
  return new Date(date.getFullYear() + n, 0, 1);
}

function periodLabel(view, date) {
  var r = periodRange(view, date);
  if (view === 'all') return 'All time';
  if (view === 'year') return String(r.start.getFullYear());
  if (view === 'fy') return 'FY ' + r.start.getFullYear() + '-' + String(r.end.getFullYear()).slice(2);
  if (view === 'month') return MONTHS[r.start.getMonth()] + ' ' + r.start.getFullYear();
  var last = new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate() - 1);
  return r.start.getDate() + ' ' + MONTHS[r.start.getMonth()] + ' - ' + last.getDate() + ' ' + MONTHS[last.getMonth()];
}

// Chart buckets: days of the week, 7-day chunks of the month (1-7, 8-14, …), or months of the year.
function buckets(view, start) {
  if (view === 'all') return ['All'];
  if (view === 'week') return DAYS.slice();
  if (view === 'year') return MONTHS.slice();
  if (view === 'fy') return MONTHS.slice(3).concat(MONTHS.slice(0, 3));
  var days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(), out = [];
  for (var a = 1; a <= days; a += 7) out.push(a + '-' + Math.min(a + 6, days));
  return out;
}

function bucketIndex(view, d, start) {
  if (view === 'all') return 0;
  if (view === 'week') return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5);
  if (view === 'month') return Math.floor((d.getDate() - 1) / 7);
  if (view === 'fy') return (d.getMonth() + 9) % 12;
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
    cats: { Income: c.Income.slice(), Expense: c.Expense.slice() }, settings: settingsOf(snap.settings) };
  ops.forEach(function (op) {
    if (op.kind === 'cat') { if (!applyCat(out.cats, out.rows, op)) catInSettings(out.settings, out.cats, op); return; }
    if (op.kind === 'set') { if (!validateSet(op.data)) applySet(out.settings, op.data); return; }
    var key = LISTS[op.kind];
    if (!key) return;
    var list = out[key], i = indexById(list, op.id);
    if (op.action === 'add') { if (i < 0) list.push(op.data); }
    else if (op.action === 'update') { if (i >= 0) list[i] = op.data; }
    else if (op.action === 'delete') {
      if (i >= 0) list.splice(i, 1);
      if (op.kind === 'loan') { out.repays = out.repays.filter(function (r) { return r.loanId !== op.id; }); delete out.settings.loans[op.id]; }
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

// History filters: f = {q, year, month, cat, who}, '' means any. month is 0-11, cat is 'Income', 'Expense' or e.g. 'Expense-Dairy',
// who: the name of the person who added it.
// The search matches the reason, the category or the amount. Newest first.
function filterEntries(rows, f) {
  var q = (f.q || '').trim().toLowerCase();
  return recentEntries(rows, Infinity).filter(function (e) {
    var d = new Date(e.dateTime);
    return (!f.year || d.getFullYear() === Number(f.year)) &&
      (f.month == null || f.month === '' || d.getMonth() === Number(f.month)) &&
      (!f.cat || f.cat === e.type || f.cat === e.type + '-' + e.category) && (!f.who || (e.by || '') === f.who) &&
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
// Loan interest paid is left out too (added back): the forecast charges the interest on what is still owed itself.
function savingRate(rows, now, n) {
  var total = 0, from = null, to = null;
  rows = rows.filter(function (e) { return !matchName([e.type === 'Income' ? INTEREST : LOAN_INTEREST], e.category); });
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

// ---- Settings, kept by the script (property SET) like the categories, changed by {kind: 'set', data: {key, id, value}} ops.
// daily: the monthly budget for everyday spending (every expense category without a bill); budgets: per category (Others is the
// sheet's Others limit, cell B1); bills: {id: {name, category, amount, day, every (months), next ('2026-10', the month next due)}};
// loans: per loan / investment {emi, sip, day, star, type, goal, goalBy, paid ('2026-10': monthly interest paid up to),
//   old (true: the family already had it before; its starting amount is not this month's money)};
// focus: 'auto', 'debt' (clear loans) or 'grow' (grow savings); year: 'jan' or 'apr' (the Indian financial year); goal: savings goal.
// ponytail: one property holds all of it (Apps Script allows 9 KB): plenty for a family's bills and loans; split it if that is ever hit.
var FOCUS = ['auto', 'debt', 'grow'], EVERY = [1, 3, 6, 12];
// Investment types: the expected return a new one starts with (it can be changed), and whether it counts as the safety net.
var INVEST = {
  fd: { name: 'Fixed deposit', rate: 7, compound: true, liquid: true },
  rd: { name: 'Recurring deposit', rate: 6.5, compound: true, liquid: true },
  liquid: { name: 'Savings / liquid fund', rate: 6.5, compound: true, liquid: true },
  sip: { name: 'Mutual fund / SIP', rate: 12, compound: true },
  ppf: { name: 'PPF / EPF', rate: 7.1, compound: true },
  gold: { name: 'Gold', rate: 9, compound: true },
  lic: { name: 'LIC / insurance', rate: 5, compound: true },
  chit: { name: 'Chit fund', rate: 8, compound: false },
  other: { name: 'Other', rate: 7, compound: true }
};
function newSettings() { return { daily: 0, budgets: {}, bills: {}, loans: {}, focus: 'auto', year: 'jan', goal: 0 }; }
function settingsOf(s) {
  var out = newSettings();
  if (s) Object.keys(out).forEach(function (k) { if (s[k] != null) out[k] = JSON.parse(JSON.stringify(s[k])); });
  return out;
}
var MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
function isDay(n) { return typeof n === 'number' && n === Math.floor(n) && n >= 1 && n <= 31; }
function okName(s, n) { return typeof s === 'string' && s === s.trim() && s.length >= 1 && s.length <= n; }
function validateSet(d) {
  if (!d || typeof d !== 'object') return 'bad setting';
  var v = d.value;
  if (d.key === 'focus') return FOCUS.indexOf(v) >= 0 ? '' : 'bad setting';
  if (d.key === 'year') return v === 'jan' || v === 'apr' ? '' : 'bad setting';
  if (d.key === 'goal' || d.key === 'daily') return v === 0 || checkAmount(v) ? '' : 'bad setting';
  if (d.key === 'budget') return checkCatName(d.id) && (v === 0 || checkAmount(v)) ? '' : 'bad setting';
  if (d.key !== 'bill' && d.key !== 'loan') return 'bad setting';
  if (!checkId(d.id) || d.id in {}) return 'bad id';
  if (v === null) return '';
  if (!v || typeof v !== 'object') return 'bad setting';
  if (d.key === 'bill') {
    return okName(v.name, 40) && checkCatName(v.category) && checkAmount(v.amount) && isDay(v.day) && EVERY.indexOf(v.every) >= 0 && MONTH_KEY.test(v.next) ? '' : 'bad setting';
  }
  var ok = ['emi', 'sip', 'goal'].every(function (k) { return v[k] == null || checkAmount(v[k]); }) && (v.day == null || isDay(v.day)) &&
    (v.star == null || typeof v.star === 'boolean') && (v.old == null || typeof v.old === 'boolean') && (v.type == null || INVEST.hasOwnProperty(v.type)) &&
    ['goalBy', 'paid'].every(function (k) { return v[k] == null || MONTH_KEY.test(v[k]); });
  return ok ? '' : 'bad setting';
}
// A budget of 0 and a bill or loan of null are removed. Changes s.
function applySet(s, d) {
  if (d.key === 'budget') { if (d.value) s.budgets[d.id] = d.value; else delete s.budgets[d.id]; }
  else if (d.key === 'bill' || d.key === 'loan') { var m = s[d.key + 's']; if (d.value) m[d.id] = d.value; else delete m[d.id]; }
  else s[d.key] = d.value;
  return s;
}
// After a category op (applyCat) succeeded: an expense category's budget and bills follow its rename; deleting drops its budget
// and moves its bills to Others.
function catInSettings(s, cats, op) {
  var d = op.data || {}, from = String(d.name || '').toLowerCase();
  if (d.type !== 'Expense' || op.action === 'add') return;
  var to = op.action === 'delete' ? '' : matchName(cats.Expense, d.to) || d.to;
  Object.keys(s.budgets).forEach(function (k) {
    if (k.toLowerCase() !== from || k === to) return;
    var v = s.budgets[k];
    delete s.budgets[k];
    if (to && !s.budgets[to]) s.budgets[to] = v;
  });
  Object.keys(s.bills).forEach(function (k) { if (s.bills[k].category.toLowerCase() === from) s.bills[k].category = to || 'Others'; });
}

// ---- Months as '2026-10'
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function monthKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
function addMonths(key, n) { var d = new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1 + n, 1); return monthKey(d); }
// The day in that month, moved back to its last day (a bill on the 31st is due on 30 Sep).
function dayIn(key, day) {
  var y = Number(key.slice(0, 4)), m = Number(key.slice(5)) - 1;
  return new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
}

// Income, expenses and spending per category within [start, end).
function totals(rows, start, end) {
  var out = { income: 0, expense: 0, spent: {} }, seen = {};
  rows.forEach(function (e) {
    if (seen[e.id]) return;
    seen[e.id] = true;
    var d = new Date(e.dateTime);
    if (!(d >= start && d < end)) return;
    if (e.type === 'Income') out.income += e.amount;
    else { out.expense += e.amount; out.spent[e.category] = (out.spent[e.category] || 0) + e.amount; }
  });
  out.income = round2(out.income);
  out.expense = round2(out.expense);
  out.savings = round2(out.income - out.expense);
  Object.keys(out.spent).forEach(function (c) { out.spent[c] = round2(out.spent[c]); });
  return out;
}
// What to compare a period with: the same stretch of the one before ("1-11 Sep" while October runs), or all of it once it is over.
function previousSpan(view, date, now) {
  var r = periodRange(view, date), start = periodRange(view, shiftPeriod(view, date, -1)).start;
  if (view === 'all') return { start: r.start, end: r.start, partial: false }; // nothing before all time
  var running = now >= r.start && now < r.end;
  return { start: start, end: running ? new Date(start.getTime() + (now - r.start)) : r.start, partial: running };
}
// The n complete months before now's month, oldest first (summarize() of each).
function lastMonths(rows, now, n, cats) {
  var out = [];
  for (var i = n; i >= 1; i--) out.push(summarize(rows, 'month', new Date(now.getFullYear(), now.getMonth() - i, 1), 0, cats));
  return out;
}

// Where the money went besides expenses within [start, end): principal paid on loans (loansPaid), money borrowed, put into
// investments (net of withdrawals; money added is a negative withdrawal) and lent out (net of what came back).
// x: the loans' extras (settings.loans); the starting amount of one the family already had (old) is left out.
function cashFlow(loans, repays, start, end, x) {
  var dir = {}, out = { loansPaid: 0, borrowed: 0, invested: 0, lent: 0 };
  function inside(s) { var d = new Date(s); return d >= start && d < end; }
  loans.forEach(function (l) {
    dir[l.id] = loanDir(l);
    if (inside(l.dateTime) && !(x && x[l.id] && x[l.id].old)) out[{ borrowed: 'borrowed', invested: 'invested', given: 'lent' }[dir[l.id]]] += l.amount;
  });
  repays.forEach(function (r) {
    if (!dir[r.loanId] || !inside(r.dateTime)) return;
    if (dir[r.loanId] === 'borrowed') out.loansPaid += r.amount;
    else if (dir[r.loanId] === 'invested') out.invested -= r.amount;
    else out.lent -= r.amount;
  });
  Object.keys(out).forEach(function (k) { out[k] = round2(out[k]); });
  return out;
}

// ---- Budgets: the month's everyday spending (categories without a bill) against the daily budget, and categories over their own.
function budgetStatus(rows, s, cats, now) {
  var r = periodRange('month', now), t = totals(rows, r.start, r.end), fixed = {}, flex = 0;
  Object.keys(s.bills).forEach(function (id) { fixed[s.bills[id].category] = true; });
  Object.keys(t.spent).forEach(function (c) { if (!fixed[c]) flex += t.spent[c]; });
  var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1; // today counts
  var left = round2(s.daily - flex);
  return {
    daily: s.daily ? { limit: s.daily, spent: round2(flex), left: left, days: days, perDay: Math.max(0, Math.floor(left / days)) } : null,
    over: Object.keys(s.budgets).filter(function (c) { return (t.spent[c] || 0) > s.budgets[c]; })
      .map(function (c) { return { cat: c, spent: t.spent[c], limit: s.budgets[c], over: round2(t.spent[c] - s.budgets[c]) }; })
      .sort(function (a, b) { return b.over - a.over; }),
    fixed: fixed
  };
}

// ---- What comes due: bills, EMIs, SIPs and the monthly interest on loans, each with its next date, soonest first.
// An EMI or SIP counts as done for the month once a payment (or money added) is dated in it; interest once loans[id].paid says so.
function dueItems(loans, repays, s, now) {
  var out = [], ym = monthKey(now), next = addMonths(ym, 1);
  Object.keys(s.bills).forEach(function (id) {
    var b = s.bills[id];
    out.push({ kind: 'bill', id: id, name: b.name, category: b.category, amount: b.amount, date: dayIn(b.next, b.day) });
  });
  DIRS.forEach(function (dir) {
    summarizeLoans(loans.filter(function (l) { return loanDir(l) === dir; }), repays, null, null, now).loans.forEach(function (l) {
      if (l.done) return;
      var x = s.loans[l.id] || {}, day = x.day || new Date(l.dateTime).getDate(), from = new Date(l.dateTime);
      function paid(added) { return l.repays.some(function (r) { return monthKey(new Date(r.dateTime)) === ym && (added ? r.amount < 0 : r.amount > 0); }); }
      // the first one falls after the day it started (an FD opened on the 11th with a SIP on the 1st: first due next month)
      var first = dayIn(ym, day) <= new Date(from.getFullYear(), from.getMonth(), from.getDate());
      function add(kind, amount, done) { out.push({ kind: kind, id: l.id, dir: dir, name: l.reason, amount: amount, date: dayIn(done || first ? next : ym, day) }); }
      if (dir === 'borrowed' && x.emi) add('emi', x.emi, paid(false));
      else if (dir === 'invested' && x.sip) add('sip', x.sip, paid(true));
      else if (dir !== 'invested' && l.monthly > 0) add('int', Math.round(l.monthly), x.paid >= ym);
    });
  });
  return out.sort(function (a, b) { return a.date - b.date; });
}

// "Add again": what was entered most often in the last 60 days (same type, category and reason), at least twice.
// amount: the latest one, when it is what most of them were (milk ₹66 every day); 0 when it varies.
function frequent(rows, now, n) {
  var since = now - 60 * 864e5, groups = {}, list = [];
  recentEntries(rows, Infinity).forEach(function (e) {
    var d = Date.parse(e.dateTime), note = (e.note || '').trim(), k = e.type + '|' + e.category + '|' + note.toLowerCase();
    if (d < since || d > now) return;
    var g = groups[k] || (groups[k] = list[list.push({ type: e.type, category: e.category, note: note, count: 0, by: {}, last: e.amount }) - 1]);
    g.count++;
    g.by[e.amount] = (g.by[e.amount] || 0) + 1;
  });
  return list.filter(function (g) { return g.count >= 2; }).sort(function (a, b) { return b.count - a.count; }).slice(0, n).map(function (g) {
    return { type: g.type, category: g.category, note: g.note, amount: g.by[g.last] * 2 >= g.count ? g.last : 0 };
  });
}

// ---- The family's focus: clear loans when more is owed than the savings are worth, else grow savings (Settings can pick).
function worthNow(loans, repays, dir, now) {
  return summarizeLoans(loans.filter(function (l) { return loanDir(l) === dir; }), repays, null, null, now).owed;
}
function focusOf(loans, repays, s, now) {
  if (s.focus === 'debt' || s.focus === 'grow') return s.focus;
  var owed = worthNow(loans, repays, 'borrowed', now);
  return owed > 0 && owed > worthNow(loans, repays, 'invested', now) ? 'debt' : 'grow';
}
// Net worth: investments and what others owe us, minus what we owe. Records dated before `at` only, valued at `at`;
// x (settings.loans): one the family already had (old) counts from the start.
function netWorth(loans, repays, at, x) {
  var before = function (y) { return Date.parse(y.dateTime) < at; };
  var l = loans.filter(function (y) { return before(y) || (x && x[y.id] && x[y.id].old); }), r = repays.filter(before);
  return round2(worthNow(l, r, 'invested', at) + worthNow(l, r, 'given', at) - worthNow(l, r, 'borrowed', at));
}

// Clear loans: months until the borrowed loans are paid off when `cash` goes to them each month (forecast()), or null.
function borrowedOnly(loans) { return loans.filter(function (l) { return loanDir(l) === 'borrowed'; }); }
function payoffIn(loans, repays, cash, now) { var p = forecast(borrowedOnly(loans), repays, cash, now).payoff; return p ? p.months : null; }
// The smallest monthly amount, to ₹100, that pays them off within n months (n up to 120); null when nothing is owed.
function neededToClear(loans, repays, n, now) {
  var lo = 0, hi = 100, done = function (x) { var m = payoffIn(loans, repays, x, now); return m != null && m <= n; };
  if (!forecast(borrowedOnly(loans), repays, 0, now).hasLoans) return null;
  while (!done(hi)) { lo = hi; hi *= 2; if (hi > 1e10) return null; }
  while (hi - lo > 50) { var mid = (lo + hi) / 2; if (done(mid)) hi = mid; else lo = mid; }
  return Math.ceil(hi / 100) * 100;
}
// Grow savings: the investments' worth, their average monthly growth `rate` (7% a year when there are none yet), and
// `monthly`: their SIPs, which grow at addRate (the return of the funds they go into). loans: the investments to count.
function longTerm(loans, repays, s, now) {
  var L = summarizeLoans(loans.filter(function (l) { return loanDir(l) === 'invested'; }), repays, null, null, now), worth = 0, grows = 0, monthly = 0, adds = 0;
  L.loans.forEach(function (l) {
    if (l.done) return;
    var sip = (s.loans[l.id] || {}).sip || 0;
    worth += l.owed; grows += l.monthly; monthly += sip; adds += sip * (growth(l, 1) - 1);
  });
  var rate = worth > 0 ? grows / worth : growth({ interest: 7, per: 'year' }, 1) - 1;
  return { worth: round2(worth), rate: rate, monthly: monthly, addRate: monthly ? adds / monthly : rate };
}
// Months until `worth` (growing at `rate`) plus `monthly` added (growing at addRate) reaches `target`; null after 50 years.
function monthsToGoal(worth, rate, monthly, target, addRate) {
  var a = addRate == null ? rate : addRate, added = 0;
  for (var n = 0; n <= 600; n++) { if (worth + added >= target) return n; worth *= 1 + rate; added = added * (1 + a) + monthly; }
  return null;
}
// The monthly amount, to ₹100, that reaches `target` in n months.
function neededForGoal(worth, rate, target, n, addRate) {
  var a = addRate == null ? rate : addRate, g = Math.pow(1 + a, n), left = target - worth * Math.pow(1 + rate, n);
  return Math.max(0, Math.ceil((a > 0 ? left * a / (g - 1) : left / n) / 100) * 100);
}
// The goal: the family's own (Settings: all investments count toward it), else the investment goal due soonest (that
// investment counts). open: the open investments ({id, reason}). null when no goal is set: none is made up.
function goalOf(s, open) {
  if (s.goal) return { target: s.goal, by: null, id: '', name: '' };
  var best = null;
  open.forEach(function (l) {
    var x = s.loans[l.id] || {};
    if (x.goal && (!best || (x.goalBy || '9999-99') < (best.by || '9999-99'))) best = { target: x.goal, by: x.goalBy || null, id: l.id, name: l.reason };
  });
  return best;
}
// Whole months from now's month to a '2028-01' month.
function monthsUntil(now, key) { return (Number(key.slice(0, 4)) - now.getFullYear()) * 12 + Number(key.slice(5)) - 1 - now.getMonth(); }
// Targets for the plan chips, in months: about 60% and 80% of the time at today's pace (each sooner than it), and the pace itself.
// due: the goal's own date (months away), always one of them, with the pace and one between when they differ.
function targets(pace, due) {
  if (due >= 1) {
    if (!pace) return [due, due + 12, due + 24];
    if (pace === due) return targets(pace);
    var mid = Math.round((due + pace) / 2), out2 = [due, pace];
    if (mid !== due && mid !== pace) out2.push(mid);
    return out2.sort(function (a, b) { return a - b; });
  }
  if (!pace) return [12, 24, 36];
  var out = [];
  [0.6, 0.8].forEach(function (f) { var n = Math.round(pace * f); if (n >= 1 && n < pace && out.indexOf(n) < 0) out.push(n); });
  return out.concat(pace);
}

// ---- "Things to notice": rules, no AI. c: the numbers (see app.js renderInsights). Returns {good, bad}: up to 4 {kind, ...} each, most useful first.
// Clear loans: a small safety net (1 month) first, then the costliest loan. Grow savings: a 6-month safety net, then goals.
function notesFor(c) {
  var good = [], bad = [], aim = c.focus === 'debt' ? 1 : 6;
  if (c.streak >= 3) good.push({ kind: 'streak', months: c.streak, rate: c.streakRate });
  if (c.avgExpense > 0 && c.safety < aim) bad.push({ kind: 'safety', months: c.safety, aim: aim, need: Math.round(c.avgExpense * aim - c.liquid), inHand: c.inHand });
  else if (c.avgExpense > 0 && c.liquid > 0) good.push({ kind: 'safe', months: c.safety, aim: aim });
  if (c.focus === 'debt') {
    if (c.costly && c.costly.rate > c.earn) bad.push({ kind: 'costly', name: c.costly.name, rate: c.costly.rate, earn: c.earn });
    if (c.sooner && c.sooner.months > 0) bad.push({ kind: 'sooner', more: c.sooner.more, months: c.sooner.months, saved: c.sooner.saved });
    if (c.emiLoad > 0.3) bad.push({ kind: 'emi', load: c.emiLoad });
    if (c.interestYear > 0) bad.push({ kind: 'interest', amount: c.interestYear });
  }
  (c.goals || []).forEach(function (g) { if (g.short > 0) bad.push({ kind: 'goal', name: g.name, short: g.short, by: g.by }); else good.push({ kind: 'ontrack', name: g.name, by: g.by }); });
  if (c.low) bad.push({ kind: 'low', rate: c.low.rate, month: c.low.month });
  (c.over || []).forEach(function (o) { bad.push({ kind: 'over', cat: o.cat, over: o.over }); });
  if (c.rise) bad.push({ kind: 'rise', cat: c.rise.cat, now: c.rise.now, before: c.rise.before });
  if (c.under) good.push({ kind: 'under', left: c.under.left, perDay: c.under.perDay });
  if (c.drop) good.push({ kind: 'drop', cat: c.drop.cat, now: c.drop.now, before: c.drop.before });
  if (c.worthUp > 0) good.push({ kind: 'worth', up: c.worthUp });
  return { good: good.slice(0, 4), bad: bad.slice(0, 4) };
}
// The category that went up most against the comparison span: at least ₹500 and 20% more. Bills (fixed) are left out.
// sign -1: the one that went down most, by the same rule.
function biggestRise(now, before, fixed, sign) {
  var best = null, k = sign || 1;
  Object.keys(now).forEach(function (c) {
    var b = before[c] || 0, d = (now[c] - b) * k;
    if (fixed[c] || !b || d < 500 || d < b * 0.2 || (best && d <= (best.now - best.before) * k)) return;
    best = { cat: c, now: now[c], before: b };
  });
  return best;
}

if (typeof module !== 'undefined') {
  module.exports = { CATEGORIES: CATEGORIES, NEW_CATEGORIES: NEW_CATEGORIES, DIRS: DIRS, growth: growth, checkCatName: checkCatName, matchName: matchName, applyCat: applyCat, validateEntry: validateEntry, validateLoan: validateLoan,
    validateRepay: validateRepay, periodRange: periodRange, shiftPeriod: shiftPeriod, periodLabel: periodLabel, buckets: buckets,
    summarize: summarize, spendShare: spendShare, applyOps: applyOps, recentEntries: recentEntries, filterEntries: filterEntries, summarizeLoans: summarizeLoans,
    savingRate: savingRate, forecast: forecast, INVEST: INVEST, INTEREST: INTEREST, LOAN_INTEREST: LOAN_INTEREST, newSettings: newSettings, settingsOf: settingsOf,
    validateSet: validateSet, applySet: applySet, catInSettings: catInSettings, monthKey: monthKey, addMonths: addMonths, dayIn: dayIn, totals: totals,
    previousSpan: previousSpan, lastMonths: lastMonths, cashFlow: cashFlow, budgetStatus: budgetStatus, dueItems: dueItems, frequent: frequent,
    worthNow: worthNow, focusOf: focusOf, netWorth: netWorth, payoffIn: payoffIn, neededToClear: neededToClear, longTerm: longTerm,
    monthsToGoal: monthsToGoal, neededForGoal: neededForGoal, goalOf: goalOf, monthsUntil: monthsUntil, targets: targets, notesFor: notesFor, biggestRise: biggestRise };
}
