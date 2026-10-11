// Family Money: offline-first. Every change is queued on the phone as an op, shown at once, then synced to the Google Sheet.
// Each connected Google Sheet keeps its own copy on the phone under a prefix: the first one 'fm.' (as before), others 'fm.<id>.'.
function keys(p) {
  var k = {};
  ['cfg', 'rows', 'loans', 'repays', 'ops', 'limit', 'synced', 'cats'].forEach(function (n) { k[n] = p + n; });
  return k;
}
var P = load('fm.active', 'fm.'), K = keys(P);
// Pictures handed out to new sheets in this order, each with its own background.
var SHEET_PICS = { farmer: '--butter', house: '--peri', job: '--sky', crops: '--mint', dairy: '--blush', bank: '--lavender', bag: '--butter', others: '--sky' };
var IMG = { Job: 'job', Salary: 'job', Dairy: 'dairy', Milk: 'dairy', Crops: 'crops', House: 'house', Home: 'house', Others: 'others' };
var DISC = { 'Income-Job': '--sky', 'Income-Dairy': '--mint', 'Income-Crops': '--butter', 'Income-Others': '--sky', 'Expense-House': '--peri', 'Expense-Dairy': '--blush', 'Expense-Crops': '--butter', 'Expense-Others': '--lavender' };
var PASTELS = ['--sky', '--mint', '--butter', '--peri', '--blush', '--lavender'];
var TABS = { home: ['house', 'Home'], history: ['clock-counter-clockwise', 'History'], cats: ['', 'Categories'], loans: ['hand-arrow-down', 'Loans'], given: ['hand-arrow-up', 'Money given'], invested: ['trend-up', 'Investments'], insights: ['chart-bar', 'Insights'] };
// Words for the three kinds of loan (DIRS): money we borrowed (Loans tab), gave to others (Given tab) or invested (Invested tab).
var LOAN_TEXT = {
  borrowed: { color: '--blush', pic: 'bank', left: 'Still owed', total: 'Borrowed', totalSub: 'All loans', back: 'Repaid', backSub: 'Paid back so far',
    intSub: 'Each month, on what is still owed', add: 'Add a loan', list: 'Loans', none: ['No loans', 'Tap "Add a loan" when you borrow money'],
    foot: 'Loans are kept apart from income and expenses, so Saved stays correct.', newTitle: 'New loan', editTitle: 'Edit loan',
    kind: 'Money borrowed', kindIcon: 'arrow-down-left', label: 'Borrowed from, and why', ph: 'e.g. From Ramesh, tractor repair',
    need: 'Write who you borrowed from and why', left2: ' owed', over: ' still owed', done: 'Repaid', small: 'Borrowed ', action: 'Pay back', actionIcon: 'hand-coins',
    paid: 'Repaid ', save: 'Save loan', saved: 'Loan saved', paidToast: 'Paid back ', what: 'this loan', payments: ['repayment', 'repayments'], deleted: 'Loan deleted', pill: 'bad',
    int: 'Interest', ins: 'We owe', rate: 'Interest (optional)', rates: [0, 1, 1.5, 2, 3], per: 'month' },
  given: { color: '--mint', pic: 'bag', left: 'Still to get back', total: 'Given', totalSub: 'All money given', back: 'Got back', backSub: 'Received so far',
    intSub: 'Each month, on what is still to get', add: 'Give money', list: 'Money given', none: ['Nothing given', 'Tap "Give money" when you lend to someone'],
    foot: 'Money given is kept apart from income and expenses, so Saved stays correct.', newTitle: 'Give money', editTitle: 'Edit money given',
    kind: 'Money given', kindIcon: 'arrow-up-right', label: 'Given to, and why', ph: 'e.g. To Raju, for his shop',
    need: 'Write who you gave it to and why', left2: ' to get', over: ' still to get', done: 'Got back', small: 'Gave ', action: 'Got back', actionIcon: 'hand-arrow-down',
    paid: 'Got back ', save: 'Save', saved: 'Saved', paidToast: 'Received ', what: 'this', payments: ['payment received', 'payments received'], deleted: 'Deleted', pill: 'ok',
    int: 'Interest', ins: 'Others owe us', rate: 'Interest (optional)', rates: [0, 1, 1.5, 2, 3], per: 'month' },
  // Funds and deposits: "worth now" grows at the expected return (an estimate, for the forecast); withdrawals take money out.
  invested: { color: '--lavender', pic: 'up', left: 'Worth now (estimate)', total: 'Invested', totalSub: 'All investments', back: 'Withdrawn', backSub: 'Taken out so far',
    intSub: 'This month, at the expected returns', add: 'Add an investment', list: 'Investments', none: ['No investments', 'Tap "Add an investment" for a fund or deposit'],
    foot: 'Investments are kept apart from income and expenses. "Worth now" is an estimate from the expected return; the forecast uses it.', newTitle: 'New investment', editTitle: 'Edit investment',
    kind: 'Investment', kindIcon: 'trend-up', label: 'Fund or scheme', ph: 'e.g. HDFC Liquid Fund', need: 'Write the fund or scheme', left2: ' now', over: '', done: 'Withdrawn', small: 'Invested ', action: 'Withdraw', actionIcon: 'hand-arrow-down',
    paid: 'Withdrawn ', save: 'Save investment', saved: 'Investment saved', paidToast: 'Withdrew ', what: 'this investment', payments: ['withdrawal', 'withdrawals'], deleted: 'Investment deleted', pill: 'ok',
    int: 'Growth', ins: 'Investments, worth about', rate: 'Expected return (average XIRR)', rates: [6, 7, 8, 10, 12], per: 'year' }
};
function loansOf(v, dir) { return v.loans.filter(function (l) { return loanDir(l) === dir; }); }
function tabDir() { return state.tab === 'given' || state.tab === 'invested' ? state.tab : 'borrowed'; }
var QUICK = [100, 500, 1000, 2000];
var HISTORY_LIMIT = 20, HISTORY_SHOW = 100, HOME_LATEST = 3, INSIGHTS_SHOW = 10;
var $ = function (s) { return document.querySelector(s); };
// Tablets and laptops: sidebar with the sheet switcher and History, page titles in the toolbar (index.html, same width).
var wide = matchMedia('(min-width:768px)');
var money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
var stamp = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
var day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
var clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

// sheet: {mode: 'add'|'edit'|'loan-add'|'loan-edit'|'repay', type, category, id, loan, owed}
var state = { tab: 'home', view: 'month', date: new Date(), bar: -1, slice: '', fcN: 3, fcPick: -1, f: { q: '', year: '', month: '', cat: '' }, sheet: null, amt: '', syncing: false, again: false, error: '', out: 'given' }; // out: the Given tab's side last shown (lent or invested)

function load(k, d) {
  try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
}
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
}
function icon(id, cls) { return '<svg class="i ' + (cls || '') + '"><use href="#i-' + id + '"/></svg>'; }
// Categories named by the family get the Others picture and a pastel picked from their name.
function pic(cat) { return IMG[cat] || 'others'; }
function discOf(type, cat) {
  for (var h = 0, i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) % 997;
  return DISC[type + '-' + cat] || PASTELS[h % PASTELS.length];
}
function img(cat, size) { return '<img class="e" src="assets/3d/' + pic(cat) + '.png" width="' + size + '" height="' + size + '" alt="">'; }
function signed(n) { return (n < 0 ? '−' : n > 0 ? '+' : '') + money.format(Math.abs(n)); }
function toast(msg) {
  var t = $('#toast');
  t.innerHTML = icon('check', 'sm') + esc(msg);
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { t.hidden = true; }, 2200);
}

// ---- Setup link: https://…/#setup=<Apps Script /exec URL>|<family key>
function parseSetup(text) {
  var m = String(text).match(/#setup=(.+)$/);
  var parts = m ? decodeURIComponent(m[1]).split('|') : [];
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(parts[0] || '') || !parts[1]) return null;
  return { url: parts[0], key: parts[1].trim() };
}

function readSetupFromUrl() {
  var cfg = parseSetup(location.hash);
  if (!cfg) return;
  P = connect(cfg);
  K = keys(P);
  save('fm.active', P);
  history.replaceState(null, '', location.pathname + location.search); // keep the key out of the address bar
}

// ---- Sheets on this phone: [{p: key prefix, name, pic}]. Names stay on the phone.
function sheets() { return load('fm.sheets', null) || [{ p: 'fm.', name: 'Family Money', pic: 'farmer' }]; }
function sheetOf(p) { return sheets().filter(function (s) { return s.p === p; })[0] || sheets()[0]; }
function addSheet(name) {
  var list = sheets(), used = list.map(function (s) { return s.pic; });
  var free = Object.keys(SHEET_PICS).filter(function (x) { return used.indexOf(x) < 0; });
  var s = { p: 'fm.' + crypto.randomUUID().slice(0, 8) + '.', name: name, pic: free[0] || Object.keys(SHEET_PICS)[list.length % 8] };
  save('fm.sheets', list.concat(s));
  return s.p;
}
// Switching reloads: nothing from the other sheet (a sync still running, filters, errors) can carry over. Every op is safe to resend.
function useSheet(p) { save('fm.active', p); location.reload(); }
// A setup link connects the sheet that already has its address, else this sheet if it has none yet, else a new sheet.
function connect(cfg) {
  var list = sheets(), same = list.filter(function (s) { var c = load(keys(s.p).cfg, null); return c && c.url === cfg.url; })[0];
  var p = same ? same.p : !load(K.cfg, null) ? P : addSheet('Sheet ' + (list.length + 1));
  save(keys(p).cfg, cfg);
  return p;
}
function renameSheet(p) {
  var list = sheets(), s = list.filter(function (x) { return x.p === p; })[0], name = prompt('Name for this sheet', s.name);
  if (!name || !name.trim()) return;
  s.name = name.trim().slice(0, 40);
  save('fm.sheets', list);
  render();
}
// Only this phone's copy is removed; the Google Sheet is not touched.
function removeSheet(p) {
  var list = sheets(), s = sheetOf(p), k = keys(p), n = load(k.ops, []).length;
  if (!confirm('Remove "' + s.name + '" from this device? The Google Sheet stays as it is.' + (n ? ' ' + n + ' changes not synced yet will be lost.' : ''))) return;
  Object.keys(k).forEach(function (x) { localStorage.removeItem(k[x]); }); // exactly its keys: 'fm.' is a prefix of every other key
  save('fm.sheets', list.filter(function (x) { return x.p !== p; }));
  if (p === P) useSheet(sheets()[0].p); else render();
}

// ---- Data: last server snapshot + queued ops (src/shared.js applyOps)
function view() {
  // Before its script has replied, an added sheet shows only Others; the first one (the family's) the starting categories.
  var cats = load(K.cats, null) || (P === 'fm.' ? null : NEW_CATEGORIES);
  return applyOps({ rows: load(K.rows, []), loans: load(K.loans, []), repays: load(K.repays, []), cats: cats }, load(K.ops, []));
}

function waiting() {
  var m = {};
  load(K.ops, []).forEach(function (op) { m[op.id] = true; if (op.kind === 'repay' && op.data) m[op.data.loanId] = true; });
  return m;
}

function queue(kind, action, id, data) {
  var ops = load(K.ops, []);
  ops.push({ opId: crypto.randomUUID(), kind: kind, action: action, id: id, data: data });
  return save(K.ops, ops) ? '' : 'Phone storage is full. Not saved.';
}

// Older versions queued plain entries in fm.pending; turn them into add ops of the first sheet once.
function migratePending() {
  var old = load('fm.pending', null);
  if (!old) return;
  var ops = old.map(function (e) { return { opId: e.id, kind: 'entry', action: 'add', id: e.id, data: e }; }).concat(load('fm.ops', []));
  if (save('fm.ops', ops)) localStorage.removeItem('fm.pending');
}

function trySync() {
  var cfg = load(K.cfg, null);
  if (!cfg) return;
  if (state.syncing) { state.again = true; return; }
  state.syncing = true;
  renderSync();
  fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain avoids a CORS preflight Apps Script can't answer
    body: JSON.stringify({ key: cfg.key, ops: load(K.ops, []) })
  }).then(function (res) { return res.json(); }).then(function (data) {
    if (data.error) throw new Error(data.error);
    var gone = {};
    data.done.forEach(function (id) { gone[id] = true; });
    data.rejected.forEach(function (r) { gone[r.opId] = true; });
    // Re-read the queue: changes made while this request was running must stay.
    save(K.ops, load(K.ops, []).filter(function (op) { return !gone[op.opId]; }));
    // Apps Script takes 500 changes per request: keep going while each round makes progress.
    if ((data.done.length || data.rejected.length) && load(K.ops, []).length) state.again = true;
    save(K.rows, data.rows);
    save(K.loans, data.loans || []);
    save(K.repays, data.repays || []);
    save(K.limit, data.othersLimit);
    if (data.cats) save(K.cats, data.cats);
    save(K.synced, Date.now());
    // A script deployed before History/Loans ignores ops and never returns loans: say so instead of "waiting" forever.
    state.error = Array.isArray(data.loans) ? '' : 'old script';
    if (data.rejected.length) alert(data.rejected.length + ' change could not be saved: ' + data.rejected[0].error);
  }).catch(function (err) {
    state.error = /wrong key/.test(err.message) ? 'wrong key' : 'offline';
  }).then(function () {
    state.syncing = false;
    render();
    if (state.again) { state.again = false; trySync(); }
  });
}

// ---- Rendering
function syncText() {
  var n = load(K.ops, []).length, synced = load(K.synced, 0);
  if (!load(K.cfg, null)) return { icon: 'link', text: n ? 'Not connected, ' + n + ' waiting' : 'Not connected' };
  if (state.error === 'wrong key') return { icon: 'cloud-slash', text: 'Setup needed' };
  if (state.error === 'old script' && n) return { icon: 'cloud-slash', text: 'Update Apps Script to sync' };
  if (state.syncing) return { icon: 'arrows-clockwise', text: 'Syncing…' };
  if (n) return { icon: 'cloud-slash', text: n + ' waiting to sync' };
  if (synced) return { icon: 'cloud-check', text: 'Synced ' + clock.format(new Date(synced)) };
  return { icon: 'cloud-slash', text: 'Not synced yet' };
}

function renderSync() {
  var s = syncText(), n = load(K.ops, []).length, btn = $('#syncBtn'), dot = btn.querySelector('.dot');
  btn.classList.toggle('spin', state.syncing);
  dot.hidden = !(n || state.error === 'wrong key');
  dot.className = 'dot' + (state.error === 'wrong key' ? ' bad' : '');
  $('#syncPill').innerHTML = icon(s.icon, 'sm') + esc(s.text);
  if (state.tab !== 'home' || wide.matches) $('#headSub').innerHTML = icon(s.icon, 'sm') + esc(s.text);
}

// Entry row; editable rows are buttons that open the edit sheet.
function entryRow(e, w, editable) {
  var isIn = e.type === 'Income', tag = editable ? 'button' : 'div';
  return '<' + tag + (editable ? ' type="button" data-edit="' + esc(e.id) + '" class="lrow tap"' : ' class="lrow"') + '>' +
    '<span class="disc s" style="background:var(' + discOf(e.type, e.category) + ')">' + img(e.category, 26) + '</span>' +
    '<div class="grow"><div class="what">' + esc(e.note || e.category) + '</div>' +
    '<small>' + esc((e.note ? e.category + ', ' : '') + stamp.format(new Date(e.dateTime))) + '</small>' +
    (w[e.id] ? '<small style="color:var(--ink-2)">' + icon('clock-countdown', 'sm') + 'Waiting to sync</small>' : '') + '</div>' +
    '<span class="amt num' + (isIn ? ' pos' : '') + '">' + (isIn ? '+' : '−') + esc(money.format(e.amount)) + '</span>' +
    (editable ? '<span class="edit">' + icon('pencil-simple', 'sm') + '</span>' : '') + '</' + tag + '>';
}

function emptyRow(title, text, picture) {
  return '<div class="lrow"><span class="disc s" style="background:var(--mint)"><img class="e" src="assets/3d/' + (picture || 'check') + '.png" width="26" height="26" alt=""></span><div class="grow"><div class="what">' + title + '</div><small>' + text + '</small></div></div>';
}

// Others-limit card: calm when under the limit, a warning when over.
function limitCard(s) {
  if (!(s.othersLimit > 0)) return '';
  var pct = Math.min(100, s.others / s.othersLimit * 100);
  if (s.overLimit) {
    return '<div class="pcard" style="background:var(--butter);display:flex;gap:12px;align-items:center;padding:14px 16px"><img class="e" src="assets/3d/warn.png" width="38" height="38" alt="">' +
      '<div class="grow"><div style="font-weight:600">Others is over the limit</div><div class="muted t-sm">' + money.format(s.others) + ' spent of ' + money.format(s.othersLimit) + '</div></div>' +
      '<span class="pill white">' + money.format(s.others - s.othersLimit) + ' over</span></div>';
  }
  return '<div class="pcard" style="background:var(--butter);padding:14px 16px"><div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">' + img('Others', 34) +
    '<div class="grow"><div style="font-weight:600">Others this month</div><div class="muted t-sm">' + money.format(s.others) + ' of ' + money.format(s.othersLimit) + '</div></div>' +
    '<span class="pill white">' + money.format(s.othersLimit - s.others) + ' left</span></div><span class="bar"><i style="width:' + pct + '%;background:var(--butter-d)"></i></span></div>';
}

function renderHome(v) {
  var now = new Date(), s = summarize(v.rows, 'month', now, load(K.limit, 0), v.cats), w = waiting();
  $('#heroLabel').textContent = 'Saved in ' + now.toLocaleString('en-IN', { month: 'long' });
  $('#heroSaved').textContent = signed(s.savings).replace(/^\+/, '');
  $('#heroPie').innerHTML = donut(spendShare(s), '');
  $('#heroIn').textContent = money.format(s.income);
  $('#heroOut').textContent = money.format(s.expense);
  $('[data-new="Income"]').setAttribute('aria-label', 'Add income. ' + money.format(s.income) + ' this month');
  $('[data-new="Expense"]').setAttribute('aria-label', 'Add expense. ' + money.format(s.expense) + ' this month');
  $('#homeLimit').innerHTML = limitCard(s);
  var rows = recentEntries(v.rows, wide.matches ? 8 : HOME_LATEST); // a wide screen has room for more
  $('#recent').innerHTML = rows.length
    ? rows.map(function (e) { return entryRow(e, w, true); }).join('')
    : emptyRow('No entries yet', 'Tap Income or Expenses above to add the first one');
}

// History: every entry, filtered by search, year, month and category. Only the newest 20 can be changed here.
function renderHistory(v) {
  var f = state.f, w = waiting(), editable = {}, years = {}, inSum = 0, outSum = 0;
  var all = filterEntries(v.rows, f), shown = all.slice(0, HISTORY_SHOW), on = !!(f.q || f.year || f.month !== '' || f.cat);
  recentEntries(v.rows, HISTORY_LIMIT).forEach(function (e) { editable[e.id] = true; });
  years[new Date().getFullYear()] = true;
  v.rows.forEach(function (e) { years[new Date(e.dateTime).getFullYear()] = true; });
  all.forEach(function (e) { if (e.type === 'Income') inSum += e.amount; else outSum += e.amount; });

  function opt(key, val, label, cls, pic) {
    return '<button type="button" class="opt' + (cls ? ' ' + cls : '') + '" data-f="' + key + '" data-v="' + esc(val) + '" aria-pressed="' + (String(f[key]) === String(val)) + '">' + (pic || '') + esc(label) + '</button>';
  }
  function fbtn(id, label, active) {
    $(id).className = 'fbtn' + (active ? ' on' : '');
    $(id).innerHTML = '<span>' + label + '</span>' + icon('caret-right', 'sm dda');
  }
  var catLabel = !f.cat ? 'Category' : f.cat === 'Income' ? 'All income' : f.cat === 'Expense' ? 'All expenses' : esc(f.cat.slice(f.cat.indexOf('-') + 1));
  fbtn('#fYear', f.year || 'Year', f.year);
  fbtn('#fMonth', f.month !== '' ? MONTHS[f.month] : 'Month', f.month !== '');
  fbtn('#fCat', (f.cat.indexOf('-') > 0 ? icon(f.cat.indexOf('Income') === 0 ? 'arrow-down-left' : 'arrow-up-right', 'sm') : '') + catLabel, f.cat);
  $('#ddYear').innerHTML = opt('year', '', 'All years', 'txt full') + Object.keys(years).sort().reverse().map(function (y) { return opt('year', y, y, 'txt'); }).join('');
  $('#ddMonth').innerHTML = opt('month', '', 'All months', 'txt full') + MONTHS.map(function (m, i) { return opt('month', i, m, 'txt'); }).join('');
  $('#ddCat').innerHTML = opt('cat', '', 'Everything', 'txt full') + opt('cat', 'Income', 'All income', 'txt') + opt('cat', 'Expense', 'All expenses', 'txt') +
    ['Income', 'Expense'].map(function (type) {
      return '<h4>' + (type === 'Income' ? 'Income' : 'Expenses') + '</h4>' + v.cats[type].map(function (c) {
        return opt('cat', type + '-' + c, c, '', '<span class="disc xs" style="background:var(' + discOf(type, c) + ')">' + img(c, 24) + '</span>');
      }).join('');
    }).join('');

  $('#qClear').hidden = !f.q;
  $('#hClear').hidden = !on;
  $('#hSum').innerHTML = all.length ? all.length + (all.length === 1 ? ' entry' : ' entries') +
    (inSum ? ' · <span class="pos">+' + esc(money.format(round2(inSum))) + '</span>' : '') + (outSum ? ' · −' + esc(money.format(round2(outSum))) : '') : '';
  $('#historyList').innerHTML = shown.length
    ? shown.map(function (e) { return entryRow(e, w, editable[e.id]); }).join('')
    : on ? emptyRow('No matches', 'Try another search or clear the filters') : emptyRow('Nothing yet', 'Entries you add show up here');
  $('#hFoot').innerHTML = (all.length > shown.length ? 'Showing the newest ' + HISTORY_SHOW + ' of ' + all.length + '. Use the filters to find older ones.<br>' : '') +
    'Only the newest ' + HISTORY_LIMIT + ' entries (with ' + icon('pencil-simple', 'sm') + ') can be changed here. Change older ones in the Google Sheet.';
}

function loanCard(l, w, T) {
  var pct = l.amount ? Math.min(100, l.repaid / l.amount * 100) : 0;
  return '<div class="lcard' + (l.done ? ' ldone' : '') + '">' +
    '<button type="button" class="lhead" data-loan-edit="' + esc(l.id) + '"><span class="disc s" style="background:var(' + T.color + ')"><img class="e" src="assets/3d/' + T.pic + '.png" width="26" height="26" alt=""></span>' +
    '<div class="grow">' + (l.done || l.dir === 'invested' ? '' : prioTag(l.priority)) + '<div class="what" style="font-weight:600">' + esc(l.reason) + '</div><small>' + T.small + esc(money.format(l.amount)) + ', ' + esc(day.format(new Date(l.dateTime))) + '</small>' +
    (w[l.id] ? '<small style="color:var(--ink-2)">' + icon('clock-countdown', 'sm') + 'Waiting to sync</small>' : '') + '</div>' +
    '<span class="pill ' + (l.done ? 'ok' : T.pill) + '" style="font-weight:600">' + (l.done ? icon('check', 'sm') + T.done : esc(money.format(l.owed)) + T.left2) + '</span></button>' +
    '<span class="bar"><i style="width:' + pct + '%;background:var(--mint-d)"></i></span>' +
    (l.interest ? '<div class="lfoot">' + icon('clock', 'sm') + '<span class="grow">' + esc(rateText(l)) + (l.monthly ? ', about ' + esc(money.format(Math.round(l.monthly))) + ' a month now' : '') + '</span></div>' : '') +
    '<div class="lfoot"><span>' + T.paid + esc(money.format(l.repaid)) + ' of ' + esc(money.format(l.amount)) + '</span>' +
    (l.done ? '' : '<button type="button" class="chip dark" data-pay="' + esc(l.id) + '">' + icon(T.actionIcon, 'sm') + T.action + '</button>') + '</div>' +
    (l.repays.length ? '<details><summary>' + l.repays.length + ' ' + T.payments[l.repays.length === 1 ? 0 : 1] + '</summary>' +
      l.repays.map(function (r) {
        return '<div class="rp"><span class="grow">' + esc(day.format(new Date(r.dateTime))) + (w[r.id] ? ', waiting to sync' : '') + '</span><b class="num" style="font-weight:600">' + esc(money.format(r.amount)) + '</b>' +
          '<button type="button" data-del-repay="' + esc(r.id) + '" aria-label="Delete this repayment">' + icon('trash', 'sm') + '</button></div>';
      }).join('') + '</details>' : '') + '</div>';
}

// Priority label with a dot; the word is always shown, so colour is never the only cue.
var PRIO = { high: ['High priority', '--blush-d'], medium: ['Medium priority', '--butter-d'], low: ['Low priority', '--mint-d'] };
function prioTag(p) { return '<span class="prio-tag"><i style="background:var(' + PRIO[p][1] + ')"></i>' + PRIO[p][0] + '</span>'; }

function rateText(l) { return l.dir === 'invested' ? l.interest + '% a ' + l.per + ' expected, ' + (l.compound ? 'compound' : 'simple') : l.interest + '% interest per ' + l.per; }

// The Loans, Given and Invested tabs: same screen, each with its own loans and words.
function renderLoans(v) {
  var dir = tabDir(), T = LOAN_TEXT[dir], L = summarizeLoans(loansOf(v, dir), v.repays), w = waiting(), open = L.loans.filter(function (l) { return !l.done; }).length;
  $('#givenSeg').hidden = dir === 'borrowed';
  document.querySelectorAll('#givenSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === dir)); });
  $('#loanSummary').style.background = 'var(' + T.color + ')';
  $('#loanPic').src = 'assets/3d/' + T.pic + '.png';
  $('#loanTotalIcon').setAttribute('href', '#i-' + (dir === 'borrowed' ? 'arrow-down-left' : 'arrow-up-right')); // money coming in / going out
  $('#loanBackIcon').setAttribute('href', '#i-' + (dir === 'borrowed' ? 'arrow-up-right' : 'arrow-down-left'));
  ['left', 'total', 'totalSub', 'back', 'backSub', 'int', 'intSub'].forEach(function (k) { $('#loan' + k.charAt(0).toUpperCase() + k.slice(1) + (/Sub$/.test(k) ? '' : 'Label')).textContent = T[k]; });
  $('#addLoanText').textContent = T.add;
  $('#loanListTitle').textContent = T.list;
  $('#loanFoot').textContent = T.foot;
  $('#loanOwed').textContent = money.format(L.owed);
  $('#loanBorrowed').textContent = money.format(L.borrowed);
  $('#loanRepaid').textContent = money.format(L.repaid);
  $('#loanIntRow').hidden = !L.monthlyInterest;
  $('#loanInt').textContent = '≈ ' + money.format(Math.round(L.monthlyInterest)); // an estimate: whole rupees
  $('#loanCount').textContent = L.loans.length ? open + ' open, ' + (L.loans.length - open) + ' ' + T.done.toLowerCase() : '';
  $('#loanList').innerHTML = L.loans.length
    ? L.loans.map(function (l) { return loanCard(l, w, T); }).join('')
    : emptyRow(T.none[0], T.none[1], T.pic);
}

function renderInsights(v) {
  var s = summarize(v.rows, state.view, state.date, load(K.limit, 0), v.cats);
  document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); });
  $('#periodLabel').textContent = s.label;
  $('#next').disabled = s.end > new Date();
  $('#sIn').textContent = money.format(s.income);
  $('#sOut').textContent = money.format(s.expense);
  $('#sSave').textContent = signed(s.savings).replace(/^\+/, '');
  $('#insLimit').innerHTML = state.view === 'month' ? limitCard(s) : '';

  $('#net').innerHTML = Object.keys(s.net).map(function (c) {
    var val = s.net[c], isIn = v.cats.Income.indexOf(c) >= 0, isOut = v.cats.Expense.indexOf(c) >= 0;
    var sub = isIn && !isOut ? 'Income' : isOut && !isIn ? 'Spent' : 'Income minus expenses';
    return '<div class="row">' + img(c, 28) + '<div class="grow">' + esc(c) + '<div class="t-xs muted">' + sub + '</div></div>' +
      '<span class="pill ' + (val > 0 ? 'ok' : val < 0 ? 'bad' : '') + '" style="font-weight:600">' + signed(val) + '</span></div>';
  }).join('');

  // Loans card: what we owe, what others owe us and what investments are worth, with this period's movements. Never part of income or expenses.
  var rows = DIRS.map(function (dir) {
    var L = summarizeLoans(loansOf(v, dir), v.repays, s.start, s.end), T = LOAN_TEXT[dir];
    if (!L.loans.length) return '';
    return '<div class="row"><img class="e" src="assets/3d/' + T.pic + '.png" width="28" height="28" alt=""><div class="grow">' + T.ins +
      '<div class="t-xs muted">This period: ' + T.total.toLowerCase() + ' ' + esc(money.format(L.periodBorrowed)) + ', ' + T.back.toLowerCase() + ' ' + esc(money.format(L.periodRepaid)) + '</div></div>' +
      '<span class="pill ' + T.pill + '" style="font-weight:600">' + esc(money.format(L.owed)) + '</span></div>';
  }).join('');
  $('#insLoans').innerHTML = rows ? '<div class="card"><h2>' + (loansOf(v, 'invested').length ? 'Loans & investments' : 'Loans') + '</h2>' + rows + '<p class="t-xs muted" style="margin-top:6px">Kept apart from income and expenses.</p></div>' : '';

  renderForecast(v);

  $('#byLabel').textContent = { week: 'By day', month: 'By week', year: 'By month' }[state.view];
  var max = Math.max.apply(null, s.incomeSeries.concat(s.expenseSeries)) || 1, n = s.labels.length;
  $('#cols').innerHTML = s.labels.map(function (l, i) {
    var a = s.incomeSeries[i], b = s.expenseSeries[i], on = i === state.bar;
    var tip = on ? '<div class="ttip' + (i >= n - 2 ? ' r' : '') + '" style="bottom:calc(' + (Math.max(a, b) / max * 100) + '% + 8px)"><b>' + esc(l) + '</b><br>Income ' + esc(money.format(a)) + '<br>Expenses ' + esc(money.format(b)) + '</div>' : '';
    return '<button type="button" class="col" data-i="' + i + '" aria-pressed="' + on + '" aria-label="' + esc(l + ': income ' + money.format(a) + ', expenses ' + money.format(b)) + '">' + tip +
      '<i style="height:' + (a / max * 100) + '%;background:var(--mint-d)"></i><i style="height:' + (b / max * 100) + '%;background:var(--blush-d)"></i></button>';
  }).join('');
  $('#ticks').innerHTML = s.labels.map(function (l) { return '<span>' + esc(n === 12 ? l.charAt(0) : l) + '</span>'; }).join('');

  renderPie(spendShare(s));

  var w = waiting();
  $('#entryCount').textContent = s.entries.length ? s.entries.length + (s.entries.length === 1 ? ' entry' : ' entries') : '';
  // A year can hold hundreds of entries: show the newest few here, the rest in History with this period filtered.
  $('#entries').innerHTML = s.entries.length
    ? s.entries.slice(0, INSIGHTS_SHOW).map(function (e) { return entryRow(e, w, false); }).join('') +
      (s.entries.length > INSIGHTS_SHOW ? '<button type="button" class="btn soft" id="seeAll">' + icon('clock-counter-clockwise', 'sm') + 'See all ' + s.entries.length + ' in History</button>' : '')
    : emptyRow('Nothing here', 'No entries in this period');
}

function pct(x) { return x.pct < 1 ? '<1%' : Math.round(x.pct) + '%'; }
// Expense categories take --pie-0…4 by their place in the list; Others and Saved keep their own colour.
// ponytail: only 5 colours stay colour-blind safe next to each other, so a 6th category repeats the first; the legend names every slice.
function pieColor(x) { return 'var(--pie-' + (x.name === 'Saved' || x.name === 'Others' ? x.name : x.i % 5) + ')'; }

// Donut of where income went (spendShare), with the saved % (or the picked slice) in the middle. Used on Home and Insights.
function donut(p, picked) {
  var C = 2 * Math.PI * 48, at = 0, gap = p.slices.length > 1 ? 1.6 : 0, sel = null, saved = null;
  p.slices.forEach(function (x) { if (x.name === picked) sel = x; if (x.name === 'Saved') saved = x; });
  var mid = sel ? [pct(sel), sel.name] : [saved ? pct(saved) : '0%', 'saved'];
  var rings = p.slices.length ? p.slices.map(function (x) {
    var len = x.amount / p.base * C, on = sel === x;
    var c = '<circle data-slice="' + esc(x.name) + '" cx="60" cy="60" r="48" transform="rotate(-90 60 60)" stroke="' + pieColor(x) + '" stroke-width="' + (on ? 20 : 15) + '"' +
      ' stroke-dasharray="' + Math.max(0.01, len - gap) + ' ' + C + '" stroke-dashoffset="' + -at + '" opacity="' + (sel && !on ? 0.45 : 1) + '"/>';
    at += len;
    return c;
  }).join('') : '<circle cx="60" cy="60" r="48" stroke="rgba(127,127,127,.2)" stroke-width="15"/>';
  return '<svg viewBox="0 0 120 120" role="img" aria-label="' + esc(p.slices.length ? 'Where income went: ' + p.slices.map(function (x) { return x.name + ' ' + pct(x); }).join(', ') : 'Nothing yet') + '">' +
    rings + '</svg><div class="mid"><b class="num">' + esc(mid[0]) + '</b><span>' + esc(mid[1]) + '</span></div>';
}

// Insights card: the donut plus one legend row per slice with its amount and %, so colour is never the only cue.
function renderPie(p) {
  var sel = p.slices.filter(function (x) { return x.name === state.slice; })[0];
  $('#pieOver').hidden = !p.overBy;
  $('#pieOver').textContent = 'Over by ' + money.format(p.overBy);
  $('#pie').hidden = !p.slices.length;
  if (!p.slices.length) {
    $('#split').innerHTML = '<p class="muted t-sm">No income or expenses in this period.</p>';
    return;
  }
  $('#pie').innerHTML = donut(p, state.slice);
  $('#split').innerHTML = p.slices.map(function (x) {
    var face = x.name === 'Saved' ? '<img class="e" src="assets/3d/bag.png" width="22" height="22" alt="">' : img(x.name, 22);
    return '<button type="button" class="slice" data-slice="' + esc(x.name) + '" aria-pressed="' + (sel === x) + '"><i class="sw" style="background:' + pieColor(x) + '"></i>' + face +
      '<span>' + esc(x.name) + '</span><b class="num" style="font-weight:600">' + money.format(x.amount) + ' <span class="pc">' + pct(x) + '</span></b></button>';
  }).join('');
}

// ---- Money forecast: where today's saving rate leads. Below ₹0 is still owed on loans, above is saved.
function monthYear(d) { return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function lakh(n) { var a = Math.abs(n); return a >= 100000 ? '₹' + (Math.round(a / 10000) / 10) + ' lakh' : money.format(Math.round(a)); }
function signedLakh(n) { return (n < 0 ? '−' : n > 0 ? '+' : '') + lakh(n); }

function renderForecast(v) {
  if (!v.rows.length && !v.loans.length) { $('#insForecast').innerHTML = ''; return; }
  var now = new Date(), r = savingRate(v.rows, now, state.fcN), f = forecast(v.loans, v.repays, r.perMonth, now);
  // cash: what comes in each month to pay loans (savings + interest from money given); gain also counts investment growth
  var head, note = '', cash = r.perMonth + f.interestIn, gain = cash + f.growthNow;
  if (f.hasLoans && f.payoff) head = 'Loans paid off in about <b>' + f.payoff.months + (f.payoff.months === 1 ? ' month' : ' months') + '</b>, by <b>' + monthYear(f.payoff.date) + '</b>';
  else if (f.hasLoans && cash > f.monthlyInterestNow) head = 'Loans paid off in <b>more than 10 years</b> at this rate';
  else if (f.hasLoans) {
    head = 'At this saving rate the loans <b>won\'t be paid off</b>';
    note = cash > 0 ? 'Interest adds about ' + lakh(f.monthlyInterestNow) + ' a month; saving more than that starts paying them down.'
      : 'Nothing was saved in these months. Interest adds about ' + lakh(f.monthlyInterestNow) + ' a month.';
  } else if (gain > 0) head = 'In 1 year you\'d have saved about <b>' + lakh(f.months[11].position) + '</b>';
  else if (gain < 0) head = 'Spending is more than income: about <b>' + lakh(gain) + ' short</b> each month';
  else head = 'Nothing was saved in these months';
  var basis = (r.perMonth >= 0 ? 'Saving about <b>' + esc(money.format(Math.round(r.perMonth))) + ' a month</b>' : 'Spending about <b>' + esc(money.format(Math.round(-r.perMonth))) + ' more than income</b> a month') +
    ' (average of ' + MONTHS[r.from.getMonth()] + (state.fcN > 1 ? '–' + MONTHS[r.to.getMonth()] : '') + ')' +
    (f.interestIn ? ', + <b>' + esc(money.format(Math.round(f.interestIn))) + ' a month</b> interest from money given' : '') +
    (f.growthNow ? ', + about <b>' + esc(money.format(Math.round(f.growthNow))) + ' a month</b> growth on investments' : '') +
    (f.hasLoans && f.payoff && f.totalInterest ? '. Loan interest on the way: about <b>' + esc(lakh(f.totalInterest)) + '</b>.' : '.');

  var seg = '<span class="lbl" style="margin:0 0 6px 4px">Saving rate from the last</span><div class="seg sm" role="group" aria-label="Saving rate from the last">' + [3, 6, 12].map(function (n) {
    return '<button type="button" data-fc="' + n + '" aria-pressed="' + (state.fcN === n) + '">' + n + ' months</button>';
  }).join('') + '</div>';
  var chips = '<div class="fc-chips">' + [[6, 'In 6 months'], [12, 'In 1 year'], [24, 'In 2 years']].map(function (x) {
    var p = f.months[x[0] - 1];
    return p ? '<div><span>' + x[1] + '</span><b class="num ' + (p.position < 0 ? '' : 'pos') + '">' + esc(signedLakh(p.position)) + '</b></div>' : '';
  }).join('') + '</div>';
  var loans = f.hasLoans ? f.perLoan.map(function (l) {
    return '<div class="row"><img class="e" src="assets/3d/bank.png" width="26" height="26" alt=""><div class="grow">' + esc(l.reason) +
      '<div class="t-xs muted">' + (l.interest ? esc(l.interest + '% a ' + l.per) + ' · ' : 'No interest · ') + (l.months ? 'paid off in ' + l.months + (l.months === 1 ? ' month' : ' months') : 'not paid off at this rate') + '</div></div>' +
      (l.months ? '<span class="pill ok">' + monthYear(l.date) + '</span>' : '') + '</div>';
  }).join('') : '';
  if (f.hasInvest) loans += '<div class="row"><img class="e" src="assets/3d/up.png" width="26" height="26" alt=""><div class="grow">Investments<div class="t-xs muted">Worth about ' + esc(lakh(f.investedNow)) + ' now' +
    (f.months[11] ? ', about ' + esc(lakh(f.months[11].invested)) + ' in 1 year' : '') + '</div></div></div>';

  $('#insForecast').innerHTML = '<div class="card"><h2>Money forecast<span class="pill">From today</span></h2>' +
    '<p class="fc-head">' + head + '</p>' + (note ? '<p class="t-sm muted" style="margin-top:4px">' + note + '</p>' : '') +
    '<p class="t-sm muted" style="margin:6px 0 10px">' + basis + '</p>' + seg + forecastChart(f) + chips + loans + '</div>';
}

// One line: today's position, then each month. Shaded blush below ₹0 (still owed), mint above (saved). Tap or hover for the value.
function forecastChart(f) {
  var pts = [{ date: new Date(), position: -f.owedNow, owed: f.owedNow, saved: 0 }].concat(f.months.slice(0, 60));
  var W = 320, H = 150, T = 22, B = 128, n = pts.length - 1;
  var vals = pts.map(function (p) { return p.position; }), lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
  if (hi === lo) hi = lo + 1;
  var x = function (i) { return 6 + i / n * (W - 12); }, y = function (val) { return T + (hi - val) / (hi - lo) * (B - T); }, y0 = y(0);
  var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.position).toFixed(1); }).join(' ');
  var area = line + ' L' + x(n).toFixed(1) + ' ' + y0.toFixed(1) + ' L' + x(0).toFixed(1) + ' ' + y0.toFixed(1) + ' Z';
  var svg = '<defs><clipPath id="fcUp"><rect x="0" y="0" width="' + W + '" height="' + y0 + '"/></clipPath><clipPath id="fcDown"><rect x="0" y="' + y0 + '" width="' + W + '" height="' + (H - y0) + '"/></clipPath></defs>' +
    '<path d="' + area + '" fill="var(--mint-d)" opacity=".45" clip-path="url(#fcUp)"/><path d="' + area + '" fill="var(--blush-d)" opacity=".45" clip-path="url(#fcDown)"/>' +
    '<line x1="0" x2="' + W + '" y1="' + y0 + '" y2="' + y0 + '" stroke="var(--muted)" stroke-width="1"/><text x="' + W + '" y="' + (y0 - 4) + '" text-anchor="end">₹0</text>' +
    '<path d="' + line + '" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>' +
    '<circle cx="' + x(0) + '" cy="' + y(pts[0].position) + '" r="4" fill="var(--ink)"/><text x="' + x(0) + '" y="' + (T - 8) + '">Today</text>';
  if (f.payoff && f.payoff.months <= n) {
    var px = x(f.payoff.months), side = px < W * 0.35 ? 'start' : px > W * 0.65 ? 'end' : 'middle';
    svg += '<circle cx="' + px + '" cy="' + y0 + '" r="5" fill="var(--mint-d)" stroke="var(--surface)" stroke-width="2"/>' +
      '<text class="lbl halo" x="' + (px + (side === 'start' ? 8 : side === 'end' ? -8 : 0)) + '" y="' + (y0 - 10) + '" text-anchor="' + side + '">Debt-free · ' + monthYear(f.payoff.date) + '</text>';
  }
  var endY = y(pts[n].position);
  svg += '<text class="lbl" x="' + x(n) + '" y="' + (endY + (pts[n].position >= 0 ? -8 : 14)) + '" text-anchor="end">' + esc(signedLakh(pts[n].position)) + '</text>';
  var step = Math.ceil(n / 4);
  for (var i = step; i <= n; i += step) svg += '<text x="' + x(i) + '" y="' + (H - 4) + '" text-anchor="' + (i > n - step / 2 ? 'end' : 'middle') + '">' + MONTHS[pts[i].date.getMonth()] + ' ’' + String(pts[i].date.getFullYear()).slice(2) + '</text>';
  var tip = '';
  if (state.fcPick >= 0 && state.fcPick <= n) {
    var p = pts[state.fcPick], cx = x(state.fcPick);
    svg += '<line x1="' + cx + '" x2="' + cx + '" y1="' + T + '" y2="' + B + '" stroke="var(--ink)" stroke-width="1" opacity=".35"/><circle cx="' + cx + '" cy="' + y(p.position) + '" r="4.5" fill="var(--ink)"/>';
    var what = p.owed > 0 ? lakh(p.owed) + ' still owed' : lakh(p.saved) + (p.saved < 0 ? ' short' : ' saved');
    tip = '<div class="ttip' + (cx > W / 2 ? ' r' : '') + '" style="top:0' + (cx > W / 2 ? '' : ';left:' + Math.max(0, cx / W * 100 - 4) + '%') + '"><b>' + (state.fcPick ? monthYear(p.date) : 'Today') + '</b><br>' + esc(what) + '</div>';
  }
  return '<div class="fc-chart" id="fcChart" data-n="' + n + '"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Forecast line from today over ' + n + ' months">' + svg + '</svg>' + tip + '</div>' +
    '<p class="t-xs muted">Dashed line = forecast. Below ₹0 is still owed on loans, above is saved. Tap the graph to see a month.</p>';
}
// Tap or hover on the graph: pick the nearest month.
function pickForecast(ev) {
  var c = ev.target.closest && ev.target.closest('#fcChart');
  if (!c) return false;
  var box = c.getBoundingClientRect(), n = Number(c.dataset.n), i = Math.round((ev.clientX - box.left - box.width * 6 / 320) / (box.width * 308 / 320) * n);
  i = Math.max(0, Math.min(n, i));
  if (i !== state.fcPick) { state.fcPick = i; renderForecast(view()); }
  return true;
}

// The active sheet's picture and name: in the sidebar on a wide screen, in the Home header on a phone. Either opens the list of sheets.
function renderHead() {
  var phoneHome = state.tab === 'home' && !wide.matches, me = sheetOf(P), list = sheets();
  $('#avatar').hidden = !phoneHome;
  $('#backHome').hidden = !(state.tab === 'cats' || (state.tab === 'history' && !wide.matches)); // these open from Home (History has its own tab on a wide screen)
  $('#headTitle').textContent = phoneHome ? me.name : TABS[state.tab][1];
  $('#sideName').textContent = me.name;
  ['#avatar', '#sideAv'].forEach(function (s) { $(s).style.background = 'var(' + SHEET_PICS[me.pic] + ')'; $(s + ' img').src = 'assets/3d/' + me.pic + '.png'; });
  if (phoneHome) {
    $('#headTitle').insertAdjacentHTML('beforeend', icon('caret-right', 'sm dda'));
    $('#headSub').innerHTML = 'Namaste <img class="e" src="assets/3d/wave.png" width="16" height="16" alt="">';
  }
  $('#ddSheets').innerHTML = '<h4>Sheets on this device</h4>' + list.map(function (s) {
    var n = load(keys(s.p).ops, []).length;
    return '<div class="srow"><button type="button" class="opt" data-sheet="' + s.p + '" aria-pressed="' + (s.p === P) + '"><span class="disc xs" style="background:var(' + SHEET_PICS[s.pic] + ')"><img class="e" src="assets/3d/' + s.pic + '.png" width="24" height="24" alt=""></span>' +
      '<span class="grow"><span class="what">' + esc(s.name) + '</span>' + (n ? '<small>' + n + ' waiting to sync</small>' : '') + '</span></button>' +
      '<button type="button" class="rbtn xs" data-sren="' + s.p + '" aria-label="Rename ' + esc(s.name) + '">' + icon('pencil-simple', 'sm') + '</button>' +
      (list.length > 1 ? '<button type="button" class="rbtn xs" data-sdel="' + s.p + '" aria-label="Remove ' + esc(s.name) + '">' + icon('trash', 'sm') + '</button>' : '') + '</div>';
  }).join('') +
    '<button type="button" class="opt" id="addSheet"><span class="disc xs" style="background:var(--field)">' + icon('plus', 'sm') + '</span>Add a new sheet</button>' +
    // Only once this sheet's Apps Script has sent its list: an older script would drop category changes.
    (load(K.cats, null) ? '<button type="button" class="opt" id="editCats"><span class="disc xs" style="background:var(--field)">' + icon('pencil-simple', 'sm') + '</span>Edit categories</button>' : '');
}

// Categories of this sheet: Others is always kept, every other one can be renamed or deleted (its entries move to Others).
function renderCats(v) {
  $('#catsList').innerHTML = ['Income', 'Expense'].map(function (type) {
    return '<div class="card"><h2>' + (type === 'Income' ? 'Income' : 'Expenses') + '</h2>' + v.cats[type].map(function (c) {
      var n = v.rows.filter(function (e) { return e.type === type && e.category === c; }).length, a = ' data-ctype="' + type + '"';
      return '<div class="row"><span class="disc xs" style="background:var(' + discOf(type, c) + ')">' + img(c, 24) + '</span>' +
        '<div class="grow">' + esc(c) + '<div class="t-xs muted">' + n + (n === 1 ? ' entry' : ' entries') + '</div></div>' +
        (c === 'Others' ? '<span class="t-xs muted">Always kept</span>' : '<button type="button" class="rbtn xs" data-cren="' + esc(c) + '"' + a + ' aria-label="Rename ' + esc(c) + '">' + icon('pencil-simple', 'sm') + '</button>' +
          '<button type="button" class="rbtn xs" data-cdel="' + esc(c) + '"' + a + ' aria-label="Delete ' + esc(c) + '">' + icon('trash', 'sm') + '</button>') + '</div>';
    }).join('') + '<button type="button" class="btn soft" data-cadd="' + type + '" style="margin-top:8px">' + icon('plus', 'sm') + 'Add ' + (type === 'Income' ? 'an income' : 'an expense') + ' category</button></div>';
  }).join('');
}

// Queued like any other change, so it waits offline and reaches the sheet in order with the entries.
function editCat(action, type, name) {
  var v = view(), what = type === 'Income' ? 'income' : 'expense', to = '';
  var n = name ? v.rows.filter(function (e) { return e.type === type && e.category === name; }).length : 0;
  if (action === 'delete') {
    if (!confirm('Delete ' + name + '?' + (n ? ' Its ' + n + (n === 1 ? ' entry moves' : ' entries move') + ' to Others.' : ''))) return;
  } else {
    to = prompt(action === 'add' ? 'Name of the new ' + what + ' category' : 'Rename ' + name + ' to', name || '');
    to = to == null ? '' : to.trim();
    if (!to || to === name) return;
    if (!checkCatName(to)) return alert('Start with a letter, use at most 30 characters, and leave out " * ? ~ < > =');
    var hit = matchName(v.cats[type], to);
    if (hit && action === 'add') return alert('There is already an ' + what + ' category called ' + hit + '.');
    if (hit && hit !== name && !confirm(hit + ' already exists. Move ' + (n === 1 ? 'the 1 ' + name + ' entry' : 'all ' + n + ' ' + name + ' entries') + ' into ' + hit + '?')) return;
  }
  var err = queue('cat', action, null, { type: type, name: action === 'add' ? to : name, to: to });
  if (err) return alert(err);
  toast(action === 'add' ? 'Added ' + to : action === 'delete' ? 'Deleted ' + name : 'Renamed to ' + to);
  render();
  trySync();
}

function render() {
  var v = view();
  $('#setup').hidden = !!load(K.cfg, null) && state.error !== 'wrong key';
  renderHead();
  renderSync();
  ({ home: renderHome, history: renderHistory, cats: renderCats, loans: renderLoans, given: renderLoans, invested: renderLoans, insights: renderInsights })[state.tab](v);
}

// ---- One bottom sheet for every form: amount (the phone's own number pad), reason, date and time
function amountValue() { return Number(state.amt) || 0; }
function amountText(a) {
  var parts = a.split('.');
  return '₹' + (Number(parts[0]) || 0).toLocaleString('en-IN') + (parts.length > 1 ? '.' + parts[1] : '');
}

// Digits and one dot, at most 9 digits before it and 2 after. Commas typed as thousands separators are dropped.
function cleanAmount(v) {
  var parts = String(v).replace(/[^\d.]/g, '').split('.');
  return parts[0].replace(/^0+(?=\d)/, '').slice(0, 9) + (parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, 2) : '');
}

function renderAmount() {
  var txt = state.amt ? amountText(state.amt) : '';
  if ($('#amount').value !== state.amt) $('#amount').value = state.amt;
  var T = LOAN_TEXT[state.sheet.dir || 'borrowed'];
  var label = { add: 'Save', edit: 'Save changes', 'loan-add': T.save, 'loan-edit': 'Save changes', repay: T.action }[state.sheet.mode];
  $('#saveText').textContent = amountValue() > 0 && state.sheet.mode !== 'edit' && state.sheet.mode !== 'loan-edit' ? label + ' ' + txt : label;
}

function recentNotes(type, category) {
  var seen = {}, out = [];
  view().rows.filter(function (e) { return e.type === type && e.category === category && e.note; })
    .sort(function (a, b) { return Date.parse(b.dateTime) - Date.parse(a.dateTime); })
    .forEach(function (e) { var n = e.note.trim(); if (!seen[n.toLowerCase()] && out.length < 6) { seen[n.toLowerCase()] = true; out.push(n); } });
  return out;
}

function renderNoteChips() {
  var sh = state.sheet, notes = sh.type ? recentNotes(sh.type, sh.category) : [];
  var cur = $('#note').value.trim().toLowerCase();
  $('#noteChips').hidden = !notes.length;
  $('#noteChips').innerHTML = notes.map(function (n) {
    return '<button type="button" class="chip" data-note="' + esc(n) + '" aria-pressed="' + (n.toLowerCase() === cur) + '">' + icon('note-pencil', 'sm') + esc(n) + '</button>';
  }).join('');
}

// Category dropdown: adding shows that type's categories; editing shows both, so a wrong type can be fixed.
function renderCat() {
  var sh = state.sheet, types = sh.mode === 'edit' ? ['Income', 'Expense'] : [sh.type], cats = view().cats;
  function disc(type, c) { return '<span class="disc xs" style="background:var(' + discOf(type, c) + ')">' + img(c, 24) + '</span>'; }
  $('#catBtn').innerHTML = (sh.category ? disc(sh.type, sh.category) + esc(sh.category) : '<span class="ph">Choose a category</span>') + icon('caret-right', 'sm dda');
  $('#catList').innerHTML = types.map(function (type) {
    return (types.length > 1 ? '<h4>' + (type === 'Income' ? 'Income' : 'Expenses') + '</h4>' : '') + cats[type].map(function (c) {
      return '<button type="button" class="opt" data-cat-type="' + type + '" data-cat="' + esc(c) + '" aria-pressed="' + (sh.type === type && sh.category === c) + '">' + disc(type, c) + esc(c) + '</button>';
    }).join('');
  }).join('');
}
// Dropdowns: a button with aria-controls opens its list; picking, tapping outside or Esc closes it.
function toggleDD(btn, open) {
  document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}
function closeDDs(target) {
  document.querySelectorAll('[aria-controls][aria-expanded="true"]').forEach(function (b) { if (!target || !b.parentNode.contains(target)) toggleDD(b, false); });
}
function toggleCat(open) { toggleDD($('#catBtn'), open); }

// Header of the sheet: picture, title and the coloured pill under it.
function sheetHeader(picture, disc, title, pillCls, pillHtml) {
  $('#sheetDisc').style.background = 'var(' + disc + ')';
  $('#sheetImg').src = 'assets/3d/' + picture + '.png';
  $('#sheetTitle').textContent = title;
  $('#sheetKind').className = 'pill ' + pillCls;
  $('#sheetKind').innerHTML = pillHtml;
}

function entryHeader() {
  var sh = state.sheet, isIn = sh.type === 'Income', c = sh.category;
  sheetHeader(c ? pic(c) : isIn ? 'up' : 'wings', c ? discOf(sh.type, c) : isIn ? '--mint' : '--blush', c || (isIn ? 'New income' : 'New expense'), isIn ? 'ok' : 'bad',
    icon(isIn ? 'arrow-down-left' : 'arrow-up-right', 'sm') + (isIn ? 'Income' : 'Expense'));
}

function localInputValue(d) {
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function setWhen(dateTime) {
  if (dateTime) { // editing: show the saved date and time, ready to change
    $('#when').value = localInputValue(new Date(dateTime));
    $('#whenBox').hidden = false;
    $('.when').hidden = true;
  } else {
    $('#whenBox').hidden = true;
    $('.when').hidden = false;
    $('#whenText').textContent = 'Now, ' + clock.format(new Date());
  }
}

function openSheet(sh, values) {
  values = values || {};
  state.sheet = sh;
  state.amt = values.amount ? String(values.amount) : '';
  var isEntry = sh.mode === 'add' || sh.mode === 'edit', isLoan = sh.mode === 'loan-add' || sh.mode === 'loan-edit', T = LOAN_TEXT[sh.dir || 'borrowed'];
  if (isEntry) entryHeader();
  else if (isLoan) sheetHeader(T.pic, T.color, sh.mode === 'loan-add' ? T.newTitle : T.editTitle, T.pill, icon(T.kindIcon, 'sm') + T.kind);
  else sheetHeader(T.pic, '--mint', sh.loan.reason, 'ok', icon(T.actionIcon, 'sm') + T.action + ', ' + esc(money.format(sh.owed)) + T.left2);

  $('#catBox').hidden = !isEntry;
  if (isEntry) renderCat();
  toggleCat(isEntry && !sh.category); // a new entry opens with the list showing
  $('#noteBox').hidden = sh.mode === 'repay';
  $('#noteLabel').textContent = isLoan ? T.label : 'Reason';
  $('#note').placeholder = isLoan ? T.ph : 'What was it for?';
  $('#note').value = values.note || '';
  $('#quick').innerHTML = (sh.mode === 'repay' ? '<button type="button" class="chip dark" data-set="' + sh.owed + '">Full ' + esc(money.format(sh.owed)) + '</button>' : '') +
    QUICK.map(function (q) { return '<button type="button" class="chip" data-add="' + q + '">+' + money.format(q) + '</button>'; }).join('');
  $('#deleteBtn').hidden = sh.mode !== 'edit' && sh.mode !== 'loan-edit';
  $('#deleteText').textContent = sh.mode === 'loan-edit' ? 'Delete' : 'Delete entry';
  $('#err').textContent = '';
  setWhen(values.dateTime);
  renderAmount();
  if (isEntry) renderNoteChips(); else $('#noteChips').hidden = true;
  $('#loanOpts').hidden = !isLoan;
  if (isLoan) {
    $('#rate').value = values.interest || '';
    sh.per = values.per || T.per;
    sh.priority = values.priority || 'medium';
    sh.compound = values.compound !== false;
    $('#prioBox').hidden = sh.dir === 'invested'; // an investment has no priority, but compound or simple growth
    $('#compBox').hidden = sh.dir !== 'invested';
    $('#rateLabel').textContent = T.rate;
    renderRate();
  }
  $('#sheet').showModal();
  // Open the number pad straight away for new things; editing keeps the keyboard down so the form stays visible.
  if (sh.mode === 'edit' || sh.mode === 'loan-edit') $('#saveBtn').focus();
  else if (isEntry && !sh.category) $('#catBtn').focus();
  else $('#amount').focus();
}

function renderRate() {
  var r = Number($('#rate').value.replace(',', '.')) || 0;
  document.querySelectorAll('[data-per]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.per === state.sheet.per)); });
  document.querySelectorAll('[data-prio]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.prio === state.sheet.priority)); });
  document.querySelectorAll('[data-comp]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.comp === 'compound') === state.sheet.compound)); });
  $('#rateChips').innerHTML = LOAN_TEXT[state.sheet.dir || 'borrowed'].rates.map(function (x) {
    return '<button type="button" class="chip" data-rate="' + x + '" aria-pressed="' + (x === r) + '">' + (x ? x + '%' : 'No interest') + '</button>';
  }).join('');
}

function findById(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

function openEdit(id) {
  var e = findById(view().rows, id);
  if (e) openSheet({ mode: 'edit', type: e.type, category: e.category, id: e.id }, e);
}

function openLoanEdit(id) {
  var l = findById(view().loans, id);
  if (l) openSheet({ mode: 'loan-edit', id: l.id, dir: loanDir(l) }, { amount: l.amount, note: l.reason, dateTime: l.dateTime, interest: l.interest, per: l.per, priority: l.priority, compound: l.compound });
}

function openRepay(id) {
  var v = view(), l = findById(summarizeLoans(v.loans, v.repays).loans, id);
  if (l) openSheet({ mode: 'repay', loan: l, owed: l.owed, dir: loanDir(findById(v.loans, id)) });
}

function saveSheet(ev) {
  ev.preventDefault();
  var sh = state.sheet, amount = Math.round(amountValue() * 100) / 100, reason = $('#note').value.trim();
  if ((sh.mode === 'add' || sh.mode === 'edit') && !sh.category) { $('#err').textContent = 'Choose a category'; toggleCat(true); return; }
  if (!(amount > 0)) { $('#err').textContent = 'Type the amount'; return; }
  var T = LOAN_TEXT[sh.dir || 'borrowed'];
  if (sh.mode !== 'repay' && !reason) { $('#err').textContent = sh.mode.indexOf('loan') === 0 ? T.need : 'Write what it was for'; $('#note').focus(); return; }
  // (a withdrawal can be more than the estimated worth)
  if (sh.mode === 'repay' && sh.dir !== 'invested' && amount > sh.owed) { $('#err').textContent = 'That is more than the ' + money.format(sh.owed) + T.over; return; }
  var dt = $('#whenBox').hidden ? new Date() : new Date($('#when').value);
  if (isNaN(dt)) { $('#err').textContent = 'Pick a valid date and time'; return; }
  var when = dt.toISOString(), now = new Date().toISOString(), id = sh.id || crypto.randomUUID(), err, msg;

  if (sh.mode === 'add' || sh.mode === 'edit') {
    var e = { id: id, dateTime: when, type: sh.type, category: sh.category, amount: amount, note: reason, createdAt: now };
    err = validateEntry(e) || queue('entry', sh.mode === 'add' ? 'add' : 'update', id, e);
    msg = sh.mode === 'add' ? 'Saved ' + money.format(amount) : 'Changes saved';
  } else if (sh.mode === 'repay') {
    var r = { id: id, loanId: sh.loan.id, dateTime: when, amount: amount, createdAt: now };
    err = validateRepay(r) || queue('repay', 'add', id, r);
    msg = T.paidToast + money.format(amount);
  } else {
    var rateIn = $('#rate').value.trim().replace(',', '.').replace('%', ''), rate = rateIn === '' ? 0 : Number(rateIn);
    if (!(rate >= 0 && rate <= 100)) { $('#err').textContent = 'Interest must be a number from 0 to 100'; $('#rate').focus(); return; }
    var l = { id: id, dateTime: when, reason: reason, amount: amount, interest: round2(rate), per: state.sheet.per, priority: state.sheet.priority, dir: sh.dir, createdAt: now };
    if (sh.dir === 'invested') l.compound = sh.compound;
    err = validateLoan(l) || queue('loan', sh.mode === 'loan-add' ? 'add' : 'update', id, l);
    msg = sh.mode === 'loan-add' ? T.saved : 'Changes saved';
  }
  if (err) { $('#err').textContent = err; return; }
  $('#sheet').close();
  toast(msg);
  render();
  trySync();
}

function deleteFromSheet() {
  var sh = state.sheet, isLoan = sh.mode === 'loan-edit', T = LOAN_TEXT[sh.dir || 'borrowed'];
  var count = isLoan ? view().repays.filter(function (r) { return r.loanId === sh.id; }).length : 0;
  var ask = isLoan ? 'Delete ' + T.what + (count ? ' and its ' + count + ' ' + T.payments[count === 1 ? 0 : 1] : '') + '?' : 'Delete this entry?';
  if (!confirm(ask)) return;
  var err = queue(isLoan ? 'loan' : 'entry', 'delete', sh.id);
  if (err) { $('#err').textContent = err; return; }
  $('#sheet').close();
  toast(isLoan ? T.deleted : 'Entry deleted');
  render();
  trySync();
}

function showTab(tab) {
  state.tab = tab;
  if (tab === 'given' || tab === 'invested') state.out = tab; // Lent and Invested share the Given tab
  document.querySelectorAll('.nav button').forEach(function (b) {
    // Categories lives under Home; History too on a phone, where it has no tab of its own
    var on = b.dataset.tab === tab || (b.dataset.tab === 'given' && tab === 'invested') || (b.dataset.tab === 'home' && (tab === 'cats' || (tab === 'history' && !wide.matches)));
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    b.querySelector('use').setAttribute('href', '#i-' + TABS[b.dataset.tab][0] + (on ? '-fill' : ''));
  });
  ['home', 'history', 'cats', 'loans', 'insights'].forEach(function (id) { $('#' + id).hidden = id !== (tab === 'given' || tab === 'invested' ? 'loans' : tab); });
  window.scrollTo(0, 0);
  render();
}

// ---- Wiring
$('#amount').addEventListener('input', function () {
  var v = cleanAmount(this.value);
  if (v !== this.value) this.value = v;
  state.amt = v;
  $('#err').textContent = '';
  renderAmount();
});
// "Next" on the number pad goes on to the reason (pay-back has no reason, so Enter saves there).
$('#amount').addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && !$('#noteBox').hidden) { ev.preventDefault(); $('#note').focus(); }
});
// Keep the field being typed in above the phone keyboard.
$('#sheet').addEventListener('focusin', function (ev) {
  if (ev.target.tagName === 'INPUT') setTimeout(function () { ev.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
});

document.addEventListener('click', function (ev) {
  closeDDs(ev.target); // a tap outside an open dropdown closes it
  if (pickForecast(ev)) return;
  // On Home the sheet's name works like its picture: both open the list of sheets
  var t = !$('#avatar').hidden && ev.target.closest('#headText') ? $('#avatar') : ev.target.closest('button, circle');
  if (!t) return;
  var d = t.dataset;
  if (d.new) openSheet({ mode: 'add', type: d.new, category: '' });
  else if (t.hasAttribute('aria-controls')) {
    var open = t.getAttribute('aria-expanded') !== 'true';
    closeDDs();
    t.parentNode.appendChild(document.getElementById(t.getAttribute('aria-controls'))); // the sheets list has two buttons (header, sidebar): open it under this one
    toggleDD(t, open);
  }
  else if (d.f) { state.f[d.f] = d.v; closeDDs(); renderHistory(view()); }
  else if (t.id === 'seeAll') {
    var start = periodRange(state.view, state.date).start;
    state.f = { q: '', year: String(start.getFullYear()), month: state.view === 'year' ? '' : String(start.getMonth()), cat: '' };
    $('#q').value = '';
    showTab('history');
  }
  else if (t.id === 'hClear') { state.f = { q: '', year: '', month: '', cat: '' }; $('#q').value = ''; renderHistory(view()); }
  else if (t.id === 'qClear') { state.f.q = ''; $('#q').value = ''; renderHistory(view()); $('#q').focus(); }
  else if (d.add) { state.amt = String(Math.round((amountValue() + Number(d.add)) * 100) / 100); renderAmount(); }
  else if (d.set) { state.amt = d.set; renderAmount(); }
  else if (t.hasAttribute('data-note')) { $('#note').value = d.note; renderNoteChips(); }
  else if (d.catType) { state.sheet.type = d.catType; state.sheet.category = d.cat; $('#err').textContent = ''; entryHeader(); renderCat(); toggleCat(false); renderNoteChips(); (state.sheet.mode === 'add' && !state.amt ? $('#amount') : $('#catBtn')).focus(); }
  else if (d.edit) openEdit(d.edit);
  else if (d.loanEdit) openLoanEdit(d.loanEdit);
  else if (d.pay) openRepay(d.pay);
  else if (d.delRepay) { if (confirm('Delete this repayment?')) { queue('repay', 'delete', d.delRepay); toast('Repayment deleted'); render(); trySync(); } }
  else if (d.sheet) { if (d.sheet !== P) useSheet(d.sheet); else closeDDs(); }
  else if (d.sren) renameSheet(d.sren);
  else if (d.sdel) removeSheet(d.sdel);
  else if (t.id === 'addSheet') { var name = prompt('Name for the new sheet', 'Sheet ' + (sheets().length + 1)); if (name && name.trim()) useSheet(addSheet(name.trim().slice(0, 40))); }
  else if (t.id === 'editCats') { closeDDs(); showTab('cats'); }
  else if (d.cadd) editCat('add', d.cadd);
  else if (d.cren) editCat('rename', d.ctype, d.cren);
  else if (d.cdel) editCat('delete', d.ctype, d.cdel);
  else if (d.tab) showTab(d.tab === 'given' && t.closest('.nav') ? state.out : d.tab); // the Given tab reopens on the side last used
  else if (d.per) { state.sheet.per = d.per; renderRate(); }
  else if (d.prio) { state.sheet.priority = d.prio; renderRate(); }
  else if (d.comp) { state.sheet.compound = d.comp === 'compound'; renderRate(); }
  else if (t.hasAttribute('data-rate')) { $('#rate').value = d.rate === '0' ? '' : d.rate; renderRate(); }
  else if (d.view) { state.view = d.view; state.date = new Date(); state.bar = -1; state.slice = ''; render(); }
  else if (t.id === 'prev' || t.id === 'next') { state.date = shiftPeriod(state.view, state.date, t.id === 'prev' ? -1 : 1); state.bar = -1; state.slice = ''; render(); }
  else if (d.fc) { state.fcN = Number(d.fc); state.fcPick = -1; renderForecast(view()); }
  else if (d.slice) { state.slice = state.slice === d.slice ? '' : d.slice; render(); }
  else if (t.classList.contains('col')) { var i = Number(d.i); state.bar = state.bar === i ? -1 : i; render(); }
  else if (t.id === 'changeWhen') setWhen(new Date().toISOString());
  else if (t.id === 'addLoan') openSheet({ mode: 'loan-add', dir: tabDir() });
  else if (t.id === 'openHistory') showTab('history');
  else if (t.id === 'backHome') showTab('home');
  else if (t.id === 'deleteBtn') deleteFromSheet();
  else if (t.id === 'cancel') $('#sheet').close();
  else if (t.id === 'syncBtn') trySync();
});

$('#rate').addEventListener('input', renderRate);
document.addEventListener('mousemove', function (ev) { if (ev.target.closest && ev.target.closest('#fcChart')) pickForecast(ev); });
$('#q').addEventListener('input', function () { state.f.q = this.value; renderHistory(view()); });
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('#sheet').open) closeDDs(); });
// Esc closes an open dropdown first, not the whole sheet.
$('#sheet').addEventListener('cancel', function (ev) { if (!$('#catList').hidden) { ev.preventDefault(); toggleCat(false); $('#catBtn').focus(); } });
$('#note').addEventListener('input', function () { $('#err').textContent = ''; if (state.sheet && state.sheet.type) renderNoteChips(); });
$('#entryForm').addEventListener('submit', saveSheet);
$('#setupForm').addEventListener('submit', function (ev) {
  ev.preventDefault();
  var cfg = parseSetup($('#setupLink').value.trim());
  if (!cfg) { $('#setupErr').textContent = 'That link does not look right. Ask for the setup link again.'; return; }
  var p = connect(cfg);
  if (p !== P) return useSheet(p); // the link belongs to another sheet
  $('#setupErr').textContent = '';
  $('#setupLink').value = '';
  state.error = '';
  render();
  trySync();
});

window.addEventListener('online', trySync);
wide.addEventListener('change', function () { closeDDs(); showTab(state.tab); }); // resized or rotated across the tablet width
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') trySync(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

migratePending();
readSetupFromUrl();
showTab('home');
trySync();
