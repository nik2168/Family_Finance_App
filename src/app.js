// Family Money: offline-first. Every change is queued on the phone as an op, shown at once, then synced to the Google Sheet.
// Each connected Google Sheet keeps its own copy on the phone under a prefix: the first one 'fm.' (as before), others 'fm.<id>.'.
function keys(p) {
  var k = {};
  ['cfg', 'rows', 'loans', 'repays', 'notes', 'ops', 'limit', 'synced', 'cats', 'settings'].forEach(function (n) { k[n] = p + n; });
  return k;
}
var P = load('fm.active', 'fm.'), K = keys(P);
// Pictures handed out to new sheets in this order, each with its own background.
var SHEET_PICS = { home2: '--mint', house: '--peri', job: '--sky', crops: '--mint', dairy: '--blush', bank: '--lavender', bag: '--butter', others: '--sky', farmer: '--butter' };
// Category pictures: by name, then by a word in it ("Petrol & diesel" gets the fuel pump); anything else gets the Others picture.
var IMG = { Job: 'job', Dairy: 'dairy', Crops: 'crops', House: 'house', Others: 'others', Interest: 'coin', 'Loan interest': 'bank' };
var PICS = [[/salary|job|wage|pension/, 'job'], [/rent|house|home|ghar/, 'house'], [/kirana|grocer|ration|mart/, 'cart'], [/milk|doodh/, 'milk'],
  [/sabzi|vegetable|fruit/, 'leafy'], [/petrol|diesel|fuel|cng/, 'fuel'], [/fitness|gym|protein|workout|yoga/, 'muscle'], [/medic|doctor|health|pharma|hospital|dawa/, 'pill'],
  [/mobile|recharge|phone|wifi|internet|broadband|dth/, 'mobile'], [/school|fee|college|education/, 'school'], [/tuition|book|coaching|class/, 'books'],
  [/electric|bijli|power|bill/, 'volt'], [/eat|food|restaurant|hotel|swiggy|zomato|dining/, 'food'], [/chai|tea|snack/, 'tea'],
  [/diwali|festival|puja|pooja|holi|eid|christmas/, 'diya'], [/gift|shagun|wedding|shaadi/, 'gift'], [/gas|lpg|cylinder/, 'fire'],
  [/bike|scooter|car|vehicle/, 'scooter'], [/travel|bus|train|auto|taxi|trip|transport/, 'bus'], [/tailor|stitch|sewing/, 'thread'],
  [/cloth|kapde|dress|shoe/, 'shirt'], [/donat|temple|mandir|church|masjid|charity/, 'pray'], [/gold|jewel/, 'gem'],
  [/loan|emi|bank/, 'bank'], [/interest/, 'coin'], [/insurance|lic/, 'shield'], [/invest|sip|mutual|fund/, 'up'],
  [/business|shop|dukaan|sale/, 'bag'], [/farm|crop|kheti/, 'crops'], [/dairy|cattle|cow|buffalo/, 'dairy']];
var PIC_BG = { cart: '--butter', milk: '--sky', leafy: '--mint', fuel: '--butter', pill: '--blush', muscle: '--peri', mobile: '--sky', school: '--sky', books: '--mint', volt: '--mint',
  food: '--blush', tea: '--butter', diya: '--butter', gift: '--lavender', fire: '--sky', scooter: '--peri', bus: '--peri', thread: '--lavender', shirt: '--lavender',
  pray: '--butter', gem: '--lavender', bank: '--blush', coin: '--butter', shield: '--sky', up: '--lavender', bag: '--butter', crops: '--butter', dairy: '--blush',
  job: '--sky', house: '--peri' };
var PASTELS = ['--sky', '--mint', '--butter', '--peri', '--blush', '--lavender'];
var TABS = { home: ['house', 'Home'], history: ['clock-counter-clockwise', 'History'], cats: ['', 'Categories'], settings: ['', 'Settings'], insights: ['chart-bar', 'Insights'],
  money: ['hand-coins', 'Money'], loans: ['hand-coins', 'Money'], given: ['hand-coins', 'Money'], invested: ['hand-coins', 'Money'] };
var MONEY_TABS = { loans: 'borrowed', given: 'given', invested: 'invested' };
// Words for the three kinds of loan (DIRS): money we borrowed, gave to others or invested. All three live in the Money tab.
var LOAN_TEXT = {
  // Pending: what the family owes, a shop's dues (with its expense category: paying it back is an expense in it) or a cash loan.
  borrowed: { color: '--blush', pic: 'bank', left: 'Still to pay', add: 'Add pending', list: 'Pending', none: ['Nothing pending', 'Tap "Add pending" when you owe someone'],
    foot: 'Paying back a pending with a category (a shop\'s dues) counts as an expense in it; a cash loan\'s doesn\'t. Interest you pay counts as an expense.', newTitle: 'New pending', editTitle: 'Edit pending',
    kind: 'Pending', kindIcon: 'arrow-down-left', label: 'Owed to', ph: 'e.g. Kirana shop, Mahesh',
    need: 'Write who it is owed to', left2: ' to pay', over: ' still to pay', done: 'Paid', small: 'Owed ', paid: 'Paid back ',
    save: 'Save', saved: 'Pending saved', what: 'this pending', payments: ['payment', 'payments'], deleted: 'Pending deleted', pill: 'bad',
    rate: 'Interest (optional)', rates: [0, 1, 1.5, 2, 3], per: 'month' },
  given: { color: '--mint', pic: 'hand', left: 'Still to get back', add: 'Give money', list: 'Money given', none: ['Nothing given', 'Tap "Give money" when you lend to someone'],
    foot: '"Got interest" adds it to Income › Interest. Money given is kept apart from income and expenses.', newTitle: 'Give money', editTitle: 'Edit money given',
    kind: 'Money given', kindIcon: 'arrow-up-right', label: 'Given to', ph: 'e.g. Raju, for his shop',
    need: 'Write who you gave it to', left2: ' to get', over: ' still to get', done: 'Got back', small: 'Gave ', paid: 'Got back ',
    save: 'Save', saved: 'Saved', what: 'this', payments: ['payment received', 'payments received'], deleted: 'Deleted', pill: 'ok',
    rate: 'Interest (optional)', rates: [0, 1, 1.5, 2, 3], per: 'month' },
  // Funds and deposits: "worth now" grows at the expected return (an estimate); money added and withdrawals change it.
  invested: { color: '--lavender', pic: 'up', left: 'Worth now (estimate)', add: 'Add an investment', list: 'Investments', none: ['No investments', 'Tap "Add an investment" for an FD, RD, SIP or PPF'],
    foot: '"Worth now" is an estimate from the expected return, not live prices. Money added and taken out are kept apart from income and expenses.',
    newTitle: 'New investment', editTitle: 'Edit investment', kind: 'Investment', kindIcon: 'trend-up', label: 'Invested in', ph: 'e.g. HDFC SIP, Post office RD',
    need: 'Write what you invested in', left2: ' now', over: '', done: 'Withdrawn', small: 'Invested ', paid: 'Withdrawn ', save: 'Save investment', saved: 'Investment saved',
    what: 'this investment', payments: ['withdrawal or top-up', 'withdrawals and top-ups'], deleted: 'Investment deleted', pill: 'ok',
    rate: 'Expected return', rates: [6.5, 7, 8, 10, 12], per: 'year' }
};
function loansOf(v, dir) { return v.loans.filter(function (l) { return loanDir(l) === dir; }); }
function tabDir() { return MONEY_TABS[state.tab] || 'borrowed'; }
// The name every income and expense needs, by type: [label, example, what to say when it is missing]
var ENTRY_NOTE = { Expense: ['Spent on', 'e.g. Milk, Petrol, School fees', 'Write what it was spent on'],
  Income: ['Money from', 'e.g. Salary, Sold wheat, Shop rent', 'Write where the money came from'] };
var HISTORY_SHOW = 100, HOME_LATEST = 3, HOME_LATEST_WIDE = 7;
var $ = function (s) { return document.querySelector(s); };
// Tablets and laptops: sidebar with the sheet switcher, page titles in the toolbar (index.html, same width).
var wide = matchMedia('(min-width:768px)');
var money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
var day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
var dayName = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
var clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
var stampFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
// "Added 15 Oct, 10:02 · Edited 16 Oct, 9:00" from the server's stamps; '' for older rows. Edited shows only once it is a minute past Added.
function stamp(r) {
  if (!r.createdAt) return '';
  var s = 'Added ' + stampFmt.format(new Date(r.createdAt));
  if (r.updatedAt && Date.parse(r.updatedAt) - Date.parse(r.createdAt) > 60000) s += ' · Edited ' + stampFmt.format(new Date(r.updatedAt));
  return s;
}

// sheet: {mode: 'add'|'edit'|'loan-add'|'loan-edit'|'repay'|'bill', type, category, id, dir, loan, pay, bill, day}
var state = { tab: 'home', view: 'month', date: new Date(), f: { q: '', year: '', month: '', cat: '', who: '' }, sheet: null, amt: '', syncing: false, again: false, error: '',
  out: '', again2: [], due: [], ask: null }; // out: the Money sub-tab last shown

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
function pic(cat) {
  if (IMG[cat]) return IMG[cat];
  var s = String(cat).toLowerCase();
  for (var i = 0; i < PICS.length; i++) if (PICS[i][0].test(s)) return PICS[i][1];
  return 'others';
}
function discOf(type, cat) {
  var p = pic(cat);
  if (PIC_BG[p]) return PIC_BG[p];
  for (var h = 0, i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) % 997;
  return PASTELS[h % PASTELS.length];
}
function img3d(name, size) { return '<img class="e" src="assets/3d/' + name + '.png" width="' + size + '" height="' + size + '" alt="">'; }
function img(cat, size) { return img3d(pic(cat), size); }
function disc(type, cat, cls, size) { return '<span class="disc ' + (cls || 's') + '" style="background:var(' + discOf(type, cat) + ')">' + img(cat, size || 26) + '</span>'; }
function signed(n) { return (n < 0 ? '−' : n > 0 ? '+' : '') + money.format(Math.abs(n)); }
function plain(n) { return (n < 0 ? '−' : '') + money.format(Math.abs(n)); }
function monthYear(d) { return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function inMonths(now, n) { return new Date(now.getFullYear(), now.getMonth() + n, 1); }
// Short for the three Home buttons: ₹850, ₹13.5K, ₹4.3L (Intl's compact form differs by browser, Chrome writes ₹13.5T).
function compact(n) { var a = Math.round(n); return a >= 1e5 ? '₹' + Math.round(a / 1e4) / 10 + 'L' : a >= 1e4 ? '₹' + Math.round(a / 100) / 10 + 'K' : money.format(a); }
function lakh(n) { var a = Math.abs(n); return (n < 0 ? '−' : '') + (a >= 100000 ? '₹' + (Math.round(a / 10000) / 10) + ' lakh' : money.format(Math.round(a))); }
function pct(x) { return Math.round(x * 100) + '%'; }
function monthsText(n) { return n === 1 ? '1 month' : n + ' months'; }
function spanText(m) { return m < 1 ? Math.max(0, Math.round(m * 30)) + ' days' : (Math.round(m * 10) / 10) + ' months'; }
function toast(msg, long) {
  var t = $('#toast');
  t.innerHTML = icon('check', 'sm') + esc(msg);
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { t.hidden = true; }, long ? 5000 : 2200);
}
function me() { return load('fm.me', ''); }
// While a sheet is open the page behind is pinned where it was (iOS Safari ignores overflow:hidden for touch), and put back after.
function lockPage(on) {
  var b = document.body.style;
  if (on) fitSheet();
  if (on && !b.position) { lockPage.y = window.scrollY; b.position = 'fixed'; b.left = b.right = '0'; b.top = -lockPage.y + 'px'; }
  else if (!on && b.position && !document.querySelector('dialog[open]')) { b.position = b.left = b.right = b.top = ''; window.scrollTo(0, lockPage.y); }
}
// An amount asked for in the in-app question, saved as a setting (the daily budget, the savings goal).
function askSetting(key, title, text, current, done) {
  ask({ title: title, text: text, input: current ? String(current) : '', numeric: true, ph: '₹ amount', ok: 'Save', need: 'Type the amount',
    check: function (x) { return numberOf(x) ? '' : 'Type the amount'; } }).then(function (x) {
    if (x && !setOp(key, numberOf(x))) { toast(done); render(); trySync(); }
  });
}

// ---- In-app questions instead of the browser's prompt() and confirm(): ask({title, text, input, ok, check}) resolves to the
// typed text (input), true (a plain yes) or null (cancelled). check(value) returns why the answer can't be used, or ''.
function ask(o) {
  $('#askTitle').textContent = o.title;
  $('#askText').textContent = o.text || '';
  $('#askText').hidden = !o.text;
  $('#askInput').hidden = o.input == null;
  $('#askInput').value = o.input || '';
  $('#askInput').inputMode = o.numeric ? 'decimal' : 'text';
  $('#askInput').placeholder = o.ph || '';
  $('#askErr').textContent = '';
  $('#askBody').innerHTML = o.html || '';
  $('#askBody').hidden = !o.html;
  $('#askCancel').hidden = !!o.html; // a list that saves as it goes: only Done
  $('#askOk').textContent = o.ok || 'OK';
  $('#askOk').className = 'btn' + (o.danger ? ' danger' : '');
  $('#ask').showModal();
  lockPage(true);
  if (o.input != null) { $('#askInput').focus(); $('#askInput').select(); }
  return new Promise(function (resolve) { state.ask = { resolve: resolve, o: o }; });
}
function answer(value) {
  var a = state.ask;
  if (!a) return;
  if (value !== null && a.o.input != null) {
    value = $('#askInput').value.trim();
    var bad = !value ? a.o.need || 'Type a name' : a.o.check ? a.o.check(value) : '';
    if (bad) { $('#askErr').textContent = bad; return; }
  }
  if (a.o.html && document.activeElement) document.activeElement.blur(); // the last typed budget saves (change) before closing
  state.ask = null;
  $('#ask').close();
  a.resolve(value);
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
function sheets() { return load('fm.sheets', null) || [{ p: 'fm.', name: 'Family Money', pic: 'home2' }]; }
function sheetOf(p) { return sheets().filter(function (s) { return s.p === p; })[0] || sheets()[0]; }
function addSheet(name) {
  var list = sheets(), used = list.map(function (s) { return s.pic; });
  var free = Object.keys(SHEET_PICS).filter(function (x) { return used.indexOf(x) < 0; });
  var s = { p: 'fm.' + crypto.randomUUID().slice(0, 8) + '.', name: name, pic: free[0] || Object.keys(SHEET_PICS)[list.length % 9] };
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
  var list = sheets(), s = list.filter(function (x) { return x.p === p; })[0] || sheets()[0];
  ask({ title: 'Name for this sheet', input: s.name, ok: 'Save' }).then(function (name) {
    if (!name) return;
    s.name = name.slice(0, 40);
    if (!load('fm.sheets', null)) list = [s]; // the first sheet before any was added
    save('fm.sheets', list);
    render();
  });
}
// Only this phone's copy is removed; the Google Sheet is not touched.
function removeSheet(p) {
  var list = sheets(), s = sheetOf(p), k = keys(p), n = load(k.ops, []).length;
  ask({ title: 'Remove "' + s.name + '" from this phone?', text: 'The Google Sheet stays as it is.' + (n ? ' ' + n + ' changes not synced yet will be lost.' : ''), ok: 'Remove', danger: true }).then(function (yes) {
    if (!yes) return;
    Object.keys(k).forEach(function (x) { localStorage.removeItem(k[x]); }); // exactly its keys: 'fm.' is a prefix of every other key
    save('fm.sheets', list.filter(function (x) { return x.p !== p; }));
    if (p === P) useSheet(sheets()[0].p); else render();
  });
}

// ---- Data: last server snapshot + queued ops (src/shared.js applyOps)
function view() {
  // Before its script has replied, an added sheet shows the household list; the first one (the family's) the starting categories.
  var cats = load(K.cats, null) || (P === 'fm.' ? null : NEW_CATEGORIES), set = load(K.settings, null);
  if (!set) { set = newSettings(); if (load(K.limit, 0) > 0) set.budgets.Others = load(K.limit, 0); } // a script from before settings
  return applyOps({ rows: load(K.rows, []), loans: load(K.loans, []), repays: load(K.repays, []), notes: load(K.notes, []), cats: cats, settings: set }, load(K.ops, []));
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
function setOp(key, value, id) {
  var d = { key: key, id: id, value: value }, err = validateSet(d) || queue('set', 'update', undefined, d);
  if (err) toast(err === 'bad setting' ? 'That can\'t be saved' : err, true);
  return err;
}
// The category, added to the sheet's list first when it isn't there yet (Interest, Loan interest).
function ensureCat(type, name) {
  var hit = matchName(view().cats[type], name);
  if (!hit) queue('cat', 'add', null, { type: type, name: name });
  return hit || name;
}

// Older versions queued plain entries in fm.pending; turn them into add ops of the first sheet once.
function migratePending() {
  var old = load('fm.pending', null);
  if (!old) return;
  var ops = old.map(function (e) { return { opId: e.id, kind: 'entry', action: 'add', id: e.id, data: e }; }).concat(load('fm.ops', []));
  if (save('fm.ops', ops)) localStorage.removeItem('fm.pending');
}

// A script from before settings (its reply has none) would refuse these: settings, money added to an investment, and entries
// without a reason. One from before notes (its reply has none) would refuse notes. They wait on the phone until the script is updated.
function needsNew(op) {
  return op.kind === 'set' || (op.kind === 'repay' && op.data && op.data.amount < 0) || (op.kind === 'entry' && op.data && !String(op.data.note || '').trim());
}
function held(op) { return op.kind === 'note' ? !load(K.notes, null) : !load(K.settings, null) && needsNew(op); }
function trySync() {
  var cfg = load(K.cfg, null);
  if (!cfg) return;
  if (state.syncing) { state.again = true; return; }
  state.syncing = true;
  renderSync();
  var ops = load(K.ops, []).filter(function (op) { return !held(op); }), sent = {};
  ops.forEach(function (op) { sent[op.opId] = true; });
  fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain avoids a CORS preflight Apps Script can't answer
    body: JSON.stringify({ key: cfg.key, ops: ops })
  }).then(function (res) { return res.json(); }).then(function (data) {
    if (data.error) throw new Error(data.error);
    var gone = {};
    data.done.forEach(function (id) { gone[id] = true; });
    data.rejected.forEach(function (r) { gone[r.opId] = true; });
    // Re-read the queue: changes made while this request was running must stay.
    save(K.ops, load(K.ops, []).filter(function (op) { return !gone[op.opId]; }));
    var left = load(K.ops, []);
    save(K.rows, data.rows);
    save(K.loans, data.loans || []);
    save(K.repays, data.repays || []);
    if (Array.isArray(data.notes)) save(K.notes, data.notes);
    save(K.limit, data.othersLimit);
    if (data.cats) save(K.cats, data.cats);
    if (data.settings) save(K.settings, data.settings);
    save(K.synced, Date.now());
    // Go again while something left can go and it is worth it: this round made progress (Apps Script takes 500 a request), or the op
    // was not in it (changed meanwhile, or no longer held now that the reply is saved). A script that ignores ops is not asked twice.
    var moved = data.done.length || data.rejected.length;
    if (left.some(function (op) { return !held(op) && (moved || !sent[op.opId]); })) state.again = true;
    // A script deployed before History/Loans (or before settings, with changes that need it) is named instead of "waiting" forever.
    state.error = !Array.isArray(data.loans) || (!data.settings && left.some(needsNew)) || (!data.notes && left.some(function (op) { return op.kind === 'note'; })) ? 'old script' : '';
    if (data.rejected.length) toast(data.rejected.length + (data.rejected.length === 1 ? ' change' : ' changes') + ' could not be saved: ' + data.rejected[0].error, true);
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
  return '<' + tag + (editable ? ' type="button" data-edit="' + esc(e.id) + '" class="lrow tap"' : ' class="lrow"') + '>' + disc(e.type, e.category) +
    '<div class="grow"><div class="what">' + esc(e.note || e.category) + '</div>' +
    '<small>' + esc((e.note ? e.category + ' · ' : '') + (e.by ? e.by + ' · ' : '') + clock.format(new Date(e.dateTime))) + '</small>' +
    (stamp(e) ? '<small class="stamp">' + esc(stamp(e)) + '</small>' : '') +
    (w[e.id] ? '<small style="color:var(--ink-2)">' + icon('clock-countdown', 'sm') + 'Waiting to sync</small>' : '') + '</div>' +
    '<span class="amt num' + (isIn ? ' pos' : '') + '">' + (isIn ? '+' : '−') + esc(money.format(e.amount)) + '</span>' +
    (editable ? '<span class="edit">' + icon('pencil-simple', 'sm') + '</span>' : '') + '</' + tag + '>';
}
// Entries grouped by day ("Today", "Yesterday", "Fri 9 Oct"), each day with its total.
function byDay(list, w) {
  var now = new Date(), today = now.toDateString(), yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString(), out = '', key = null, rows = [], total = 0;
  function flush() {
    if (key == null) return;
    var d = new Date(key), name = key === today ? 'Today' : key === yest ? 'Yesterday' : dayName.format(d);
    out += '<div class="dayh"><span>' + esc(name) + '</span><span class="num' + (total > 0 ? ' pos' : '') + '">' + esc(signed(round2(total))) + '</span></div>' + rows.join('');
  }
  list.forEach(function (e) {
    var k = new Date(e.dateTime).toDateString();
    if (k !== key) { flush(); key = k; rows = []; total = 0; }
    rows.push(entryRow(e, w, true));
    total += e.type === 'Income' ? e.amount : -e.amount;
  });
  flush();
  return out;
}

function emptyRow(title, text, picture) {
  return '<div class="lrow"><span class="disc s" style="background:var(--mint)">' + img3d(picture || 'check', 26) + '</span><div class="grow"><div class="what">' + title + '</div><small>' + text + '</small></div></div>';
}

function ring(rate, sub) {
  var p = rate == null ? 0 : Math.max(0, Math.min(1, rate)) * 100;
  return '<div class="ringbox"><span class="ring"><svg viewBox="0 0 36 36"><circle class="rt" cx="18" cy="18" r="15.915"/>' + (p ? '<circle class="rv" cx="18" cy="18" r="15.915" stroke-dasharray="' + p.toFixed(1) + ' 100"/>' : '') + '</svg>' +
    '<b>' + (rate == null ? '–' : Math.round(rate * 100) + '%') + '</b></span><small>' + sub + '</small></div>';
}

// ---- The plan behind Home and Insights: the family's focus and its numbers, from the last 6 complete months.
function planOf(v, now) {
  var set = v.settings, focus = focusOf(v.loans, v.repays, set, now), months = lastMonths(v.rows, now, 6, v.cats);
  // For the loans: interest paid and pending paid back (an expense with id '<payment id>-paid') are added back, and interest got is
  // left out, as the forecast counts them itself (savingRate)
  var paidBack = {};
  v.repays.forEach(function (r) { paidBack[r.id + '-paid'] = true; });
  var adj = lastMonths(v.rows.filter(function (e) { return !paidBack[e.id] && !matchName([e.type === 'Income' ? INTEREST : LOAN_INTEREST], e.category); }), now, 6, v.cats);
  var inc = 0, exp = 0, sav = 0, n = 0;
  months.forEach(function (m, i) { if (!m.income && !m.expense) return; n++; inc += m.income; exp += m.expense; sav += adj[i].savings; });
  var given = summarizeLoans(loansOf(v, 'given'), v.repays, null, null, now), inv = summarizeLoans(loansOf(v, 'invested'), v.repays, null, null, now);
  var p = { focus: focus, months: months, n: n, avgIncome: n ? inc / n : 0, avgExpense: n ? exp / n : 0, savingsRate: inc > 0 ? (inc - exp) / inc : null,
    interestIn: 0, sips: 0, growth: 0, worth: inv.owed, inv: inv };
  given.loans.forEach(function (l) { if (!l.done) p.interestIn += l.monthly; });
  inv.loans.forEach(function (l) { if (!l.done) { p.sips += (set.loans[l.id] || {}).sip || 0; p.growth += l.monthly; } });
  var r = periodRange('month', now);
  p.added = cashFlow(v.loans, v.repays, r.start, r.end, set.loans).invested;
  if (focus === 'debt') {
    var B = summarizeLoans(loansOf(v, 'borrowed'), v.repays, null, null, now), cash = Math.max(0, Math.round((n ? sav / n : 0) + p.interestIn - p.sips));
    p.cash = cash; p.owed = B.owed; p.borrowed = B.borrowed; p.repaid = round2(B.borrowed - B.owed); p.open = B.loans.filter(function (l) { return !l.done; });
    p.f = forecast(borrowedOnly(v.loans), v.repays, cash, now);
    p.pace = p.f.payoff ? p.f.payoff.months : null;
    p.chips = targets(p.pace).map(function (m) {
      var need = m === p.pace ? cash : neededToClear(v.loans, v.repays, m, now);
      return { months: m, need: need, interest: need == null ? 0 : forecast(borrowedOnly(v.loans), v.repays, need, now).totalInterest };
    });
  } else {
    // The goal (none is made up): the family's, counting every investment, else an investment's own, counting just that one
    var g = goalOf(set, inv.loans.filter(function (l) { return !l.done; })), lt = longTerm(g && g.id ? v.loans.filter(function (l) { return l.id === g.id; }) : v.loans, v.repays, set, now);
    p.g = g; p.lt = lt; p.goal = g ? g.target : 0;
    p.due = g && g.by && monthsUntil(now, g.by) >= 1 ? monthsUntil(now, g.by) : 0;
    p.pace = g ? monthsToGoal(lt.worth, lt.rate, lt.monthly, g.target, lt.addRate) : null;
    p.chips = g && p.pace !== 0 ? targets(p.pace, p.due).map(function (m) { return { months: m, need: m === p.pace ? lt.monthly : neededForGoal(lt.worth, lt.rate, g.target, m, lt.addRate) }; }) : [];
  }
  return p;
}
// Home's glance, as pastel tiles (a bento): what is left to spend with the month's line (tap to change the budget), the goal
// (clearing loans or growing savings) and how much of this month's income was kept (both tap for Insights).
function tile(cls, attrs, bg, body) { return '<button type="button" class="pcard tile ' + cls + '" ' + attrs + ' style="background:var(' + bg + ')">' + body + '</button>'; }
function starter(cls, id, bg, picture, title, text) { return tile(cls, 'id="' + id + '"', bg, '<span class="grow">' + img3d(picture, 34) + '</span><b>' + title + '</b><small>' + text + '</small>'); }
// Everyday spending this month added up day by day (as budgetStatus counts it: categories without a bill), then today's pace to the month's end.
function paceLine(rows, b, now) {
  var y = now.getFullYear(), m = now.getMonth(), dim = new Date(y, m + 1, 0).getDate(), today = now.getDate(), sum = 0, done = [0], start = new Date(y, m, 1);
  rows = rows.filter(function (e) { return new Date(e.dateTime) >= start; });
  for (var i = 1; i <= today; i++) {
    var sp = totals(rows, new Date(y, m, i), new Date(y, m, i + 1)).spent;
    Object.keys(sp).forEach(function (c) { if (!b.fixed[c]) sum += sp[c]; });
    done.push(sum);
  }
  var rate = sum / today, pace = done.slice();
  for (i = today + 1; i <= dim; i++) pace.push(sum + rate * (i - today));
  return { done: done, pace: pace, end: Math.round(pace[dim]) };
}
function glanceHtml(v, p, now, s) {
  var b = budgetStatus(v.rows, v.settings, v.cats, now), d = b.daily, budget, goal, rate = s.income > 0 ? s.savings / s.income : null;
  if (!d) budget = starter('full', 'setBudget', '--lavender', 'bag', 'Set a monthly budget', 'See what is left to spend each day');
  else {
    var pl = paceLine(v.rows, b, now), over = pl.end > d.limit, mon = ' ' + MONTHS[now.getMonth()];
    // The month's top 3 categories, all spending counted
    var top = Object.keys(s.spent).filter(function (c) { return s.spent[c] > 0; }).sort(function (a, c) { return s.spent[c] - s.spent[a]; }).slice(0, 3);
    // A white card; the budget is said in words, not on the dashed line (a label there runs into the lines once spending passes it)
    budget = '<button type="button" class="card tile full" id="setBudget"><span class="tt"><small>' + (d.left >= 0 ? 'Left to spend' : 'Over the budget') + '</small><span class="pill">' + (d.days === 1 ? 'Last day' : d.days + ' days left') + '</span></span>' +
      '<b class="big num' + (d.left < 0 ? ' neg' : '') + '">' + money.format(Math.abs(d.left)) + '</b>' +
      '<small>Budget ' + compact(d.limit) + '. ' + (d.left > 0 ? 'About ' + money.format(d.perDay) + ' a day, ' : '') + '<span' + (over ? ' class="neg"' : '') + '>' + (d.left > 0 ? 'on' : 'On') + ' pace for ' + compact(pl.end) + '</span></small>' +
      lineSvg([{ v: pl.done }, { v: pl.pace, dashed: true }], { fill: over ? '--blush-d' : '--mint-d', goal: d.limit, goalText: '', label: 'Spending this month against the budget', ticks: ['1' + mon, (pl.pace.length - 1) + mon] }) +
      (top.length ? '<span class="tcats">' + top.map(function (c) { return '<span class="tcat">' + disc('Expense', c, 'xs', 18) + '<span class="grow"><span>' + esc(c) + '</span><b class="num">' + compact(s.spent[c]) + '</b></span></span>'; }).join('') + '</span>' : '') + '</button>';
  }
  if (p.focus === 'debt') {
    goal = tile('', 'id="glGoal" data-tab="insights"', '--butter', img3d('bank', 32) + '<small>Debt-free by</small><b class="tv num">' + (p.pace ? monthYear(inMonths(now, p.pace)) : 'Not yet') + '</b>' +
      '<small>' + lakh(p.owed) + ' left · ' + p.open.length + (p.open.length === 1 ? ' loan' : ' loans') + '</small>');
  } else if (p.g) {
    var g = p.g, gp = pic(g.name || '');
    goal = tile('', 'id="glGoal" data-tab="insights"', '--mint', img3d(gp === 'others' ? 'seed' : gp, 32) + '<small>' + (g.name ? esc(g.name) : 'Savings goal') + '</small>' + ring(Math.min(1, p.lt.worth / g.target), '') +
      '<small>' + lakh(p.lt.worth) + ' of ' + lakh(g.target) + '<br>' + (p.pace === 0 ? 'Reached 🎉' : p.pace ? 'By ' + monthYear(inMonths(now, p.pace)) : 'Not at this pace') + '</small>');
  } else goal = starter('', 'setGoal', '--mint', 'seed', 'Set a savings goal', 'See when you get there');
  var saved = tile('', 'data-tab="insights"', '--sky', '<small>Saved this month</small><b class="big num' + (rate < 0 ? ' neg' : '') + '">' + (rate == null ? '–' : rate < 0 ? '−' + pct(-rate) : pct(rate)) + '</b>' +
    '<small>' + (rate == null ? 'No income yet this month' : rate < 0 ? 'Spent more than came in' : 'Target 20%') + '</small>');
  return budget + goal + saved;
}

// Due soon: the next bills, EMIs, SIPs and monthly interest.
var DUE_ICON = { emi: 'bank', sip: 'up', int: 'coin' };
function dueText(d, now) {
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), days = Math.round((d.date - today) / 864e5);
  return dayName.format(d.date) + (days < 0 ? ' · overdue' : days === 0 ? ' · today' : days === 1 ? ' · tomorrow' : days <= 7 ? ' · in ' + days + ' days' : '');
}
function dueHtml(list, now) {
  if (!list.length) return '';
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), anyLate = list.some(function (d) { return d.date < today; });
  return '<div class="pcard" style="background:var(' + (anyLate ? '--blush' : '--butter') + ')"><h2><span>Due soon <span class="soft num">' + money.format(round2(list.reduce(function (t, d) { return t + d.amount; }, 0))) + '</span></span>' +
    '<button type="button" class="see" data-tab="settings">All bills</button></h2>' + list.map(function (d, i) {
    var picture = d.kind === 'bill' ? pic(d.category) : DUE_ICON[d.kind], late = d.date < today;
    var what = d.kind === 'emi' ? 'EMI · ' : d.kind === 'sip' ? 'Add money · ' : d.kind === 'int' ? (d.dir === 'given' ? 'Interest to get · ' : 'Interest · ') : '';
    var btn = d.kind === 'sip' ? 'Add' : d.kind === 'int' && d.dir === 'given' ? 'Got it' : d.kind === 'bill' ? 'Paid' : 'Pay';
    return '<div class="row"><span class="disc xs" style="background:var(' + (late ? '--blush' : PIC_BG[picture] || '--sky') + ')">' + img3d(picture, 22) + '</span>' +
      '<div class="grow"><b class="t-sm">' + esc(d.name) + '</b><small' + (late ? ' class="neg"' : '') + '>' + esc(what + dueText(d, now)) + '</small></div>' +
      '<b class="num t-sm">' + money.format(d.amount) + '</b><button type="button" class="pay' + (late || d.kind === 'emi' ? '' : ' soft') + '" data-due="' + i + '">' + btn + '</button></div>';
  }).join('') + '</div>';
}

// Notes and lists the assistant keeps (ai.js save_note): note ops, synced to the sheet's Notes tab like entries (only on the phone
// while no sheet is connected). Tick items, copy, share, add a finished list as an expense, or ✕ to remove. The same markup shows in
// the assistant's card, and these handlers serve both.
function notes(v) { return (v || view()).notes.slice().sort(function (a, b) { return Date.parse(b.dateTime) - Date.parse(a.dateTime); }); }
function noteText(n) { return [n.title, n.text].concat(n.items.map(function (i) { return (i.done ? '☑ ' : '☐ ') + i.t; })).filter(Boolean).join('\n'); }
function notesHtml(list) {
  return list.map(function (n) {
    var all = n.items.length && n.items.every(function (i) { return i.done; });
    return '<div class="card nt" data-nt="' + esc(n.id) + '"><h2><span class="grow">' + esc(n.title) + '</span>' +
      [['copy', 'copy', 'Copy'], ['share', 'share', 'Share'], ['del', 'x', 'Remove']].map(function (a) { return '<button type="button" class="rbtn xs" data-nt-act="' + a[0] + '" aria-label="' + a[2] + '">' + icon(a[1], 'sm') + '</button>'; }).join('') + '</h2>' +
      (n.text ? '<p class="t-sm">' + esc(n.text) + '</p>' : '') +
      n.items.map(function (it, i) { return '<label class="nti"><input type="checkbox" data-nti="' + i + '"' + (it.done ? ' checked' : '') + '><span>' + esc(it.t) + '</span></label>'; }).join('') +
      (all ? '<button type="button" class="pay" data-nt-act="exp">Add as expense</button>' : '') + '</div>';
  }).join('');
}
function noteAct(btn, act) {
  var box = btn.closest('[data-nt]'), n = findById(notes(), box.dataset.nt);
  if (!n) return;
  if (act === 'copy' && navigator.clipboard) navigator.clipboard.writeText(noteText(n)).then(function () { var h = btn.innerHTML; btn.innerHTML = icon('check', 'sm'); setTimeout(function () { btn.innerHTML = h; }, 1500); }); // a toast hides behind the assistant
  else if (act === 'share') shareText(noteText(n));
  else if (act === 'exp') openSheet({ mode: 'add', type: 'Expense', category: matchName(view().cats.Expense, n.category || n.title) || '' }, { note: n.title });
  else if (act === 'del' && !queue('note', 'delete', n.id)) { box.remove(); render(); trySync(); }
}

function renderHome(v) {
  var now = new Date(), s = summarize(v.rows, 'month', now, 0, v.cats), w = waiting(), p = planOf(v, now);
  $('#notes').innerHTML = notesHtml(notes(v));
  $('#glance').innerHTML = glanceHtml(v, p, now, s);
  $('#heroIn').textContent = compact(s.income); // three side by side on a phone: ₹13.5K (the labels say it in full)
  $('#heroOut').textContent = compact(s.expense);
  var owed = summarizeLoans(loansOf(v, 'borrowed'), v.repays, null, null, now).owed;
  $('#heroPend').textContent = compact(owed);
  $('[data-new="Pending"]').setAttribute('aria-label', 'Add pending. ' + money.format(owed) + ' still to pay');
  $('[data-new="Income"]').setAttribute('aria-label', 'Add income. ' + money.format(s.income) + ' this month');
  $('[data-new="Expense"]').setAttribute('aria-label', 'Add expense. ' + money.format(s.expense) + ' this month');
  state.again2 = frequent(v.rows, now, 4);
  $('#again').innerHTML = state.again2.length ? '<div class="clbl">Add again</div><div class="chips" style="margin-top:12px">' + state.again2.map(function (g, i) {
    return '<button type="button" class="chip card" data-again="' + i + '">' + img(g.category, 18) + esc(g.note || g.category) + (g.amount ? ' ' + money.format(g.amount) : '') + '</button>';
  }).join('') + '</div>' : '';
  var week = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8); // up to 7 days ahead (and anything overdue)
  state.due = dueItems(v.loans, v.repays, v.settings, now).filter(function (d) { return d.date < week; }).slice(0, 3);
  $('#due').innerHTML = dueHtml(state.due, now);
  var rows = recentEntries(v.rows, wide.matches ? HOME_LATEST_WIDE : HOME_LATEST); // a wide screen has room for more
  $('#recent').innerHTML = rows.length ? byDay(rows, w) : emptyRow('No entries yet', 'Tap Expenses or Income above to add the first one');
}

// History: every entry, filtered by search, period, category and who added it. Every one can be changed.
function renderHistory(v) {
  var f = state.f, w = waiting(), years = {}, who = {}, inSum = 0, outSum = 0;
  var all = filterEntries(v.rows, f), shown = all.slice(0, HISTORY_SHOW), on = !!(f.q || f.year || f.month !== '' || f.cat || f.who);
  years[new Date().getFullYear()] = {};
  v.rows.forEach(function (e) { var d = new Date(e.dateTime); (years[d.getFullYear()] = years[d.getFullYear()] || {})[d.getMonth()] = true; if (e.by) who[e.by] = true; });
  all.forEach(function (e) { if (e.type === 'Income') inSum += e.amount; else outSum += e.amount; });

  function opt(key, val, label, cls, picture) {
    var cur = key === 'when' ? f.year + '-' + f.month : String(f[key]);
    return '<button type="button" class="opt' + (cls ? ' ' + cls : '') + '" data-f="' + key + '" data-v="' + esc(val) + '" aria-pressed="' + (cur === String(val)) + '">' + (picture || '') + esc(label) + '</button>';
  }
  function fbtn(id, label, active) {
    $(id).className = 'fbtn' + (active ? ' on' : '');
    $(id).innerHTML = '<span>' + label + '</span>' + icon('caret-right', 'sm dda');
  }
  var catLabel = !f.cat ? 'Category' : f.cat === 'Income' ? 'All income' : f.cat === 'Expense' ? 'All expenses' : esc(f.cat.slice(f.cat.indexOf('-') + 1));
  fbtn('#fWhen', !f.year ? 'All time' : f.month !== '' ? MONTHS[f.month] + ' ' + f.year : f.year, f.year);
  fbtn('#fCat', catLabel, f.cat);
  fbtn('#fWho', f.who ? esc(f.who) : 'Everyone', f.who);
  $('#whoBox').hidden = !Object.keys(who).length && !f.who;
  $('#filters').classList.toggle('two', $('#whoBox').hidden);
  $('#ddWhen').innerHTML = opt('when', '-', 'All time', 'txt full') + Object.keys(years).sort().reverse().map(function (y) {
    return '<h4>' + y + '</h4>' + opt('when', y + '-', 'All of ' + y, 'txt full') + MONTHS.map(function (m, i) { return years[y][i] ? opt('when', y + '-' + i, m, 'txt') : ''; }).join('');
  }).join('');
  $('#ddCat').innerHTML = opt('cat', '', 'Everything', 'txt full') + opt('cat', 'Income', 'All income', 'txt') + opt('cat', 'Expense', 'All expenses', 'txt') +
    ['Income', 'Expense'].map(function (type) {
      return '<h4>' + (type === 'Income' ? 'Income' : 'Expenses') + '</h4>' + v.cats[type].map(function (c) {
        return opt('cat', type + '-' + c, c, '', '<span class="disc xs" style="background:var(' + discOf(type, c) + ')">' + img(c, 24) + '</span>');
      }).join('');
    }).join('');
  $('#ddWho').innerHTML = opt('who', '', 'Everyone', 'txt full') + Object.keys(who).sort().map(function (n) { return opt('who', n, n, 'txt full'); }).join('');

  $('#qClear').hidden = !f.q;
  $('#hClear').hidden = !on;
  $('#hSum').innerHTML = all.length ? all.length + (all.length === 1 ? ' entry' : ' entries') +
    (inSum ? ' · <span class="pos">+' + esc(money.format(round2(inSum))) + '</span>' : '') + (outSum ? ' · −' + esc(money.format(round2(outSum))) : '') : '';
  $('#historyList').innerHTML = shown.length ? byDay(shown, w)
    : on ? emptyRow('No matches', 'Try another search or clear the filters') : emptyRow('Nothing yet', 'Entries you add show up here');
  $('#hFoot').innerHTML = all.length > shown.length ? 'Showing the newest ' + HISTORY_SHOW + ' of ' + all.length + '. Use the filters to find older ones.' : '';
}

// Share: the entries History shows, as a spreadsheet (CSV) file; where the phone can't share a file, it is downloaded.
function shareHistory() {
  // A reason starting with = + - @ would run as a formula in Excel or Sheets: a ' keeps it text (as safeText in Code.gs).
  var all = filterEntries(view().rows, state.f), q = function (x) { var t = String(x == null ? '' : x); return '"' + (typeof x === 'string' && /^[=+\-@]/.test(t) ? "'" : '') + t.replace(/"/g, '""') + '"'; };
  var csv = ['Date,Type,Category,Amount,Reason,Added by'].concat(all.map(function (e) {
    var d = new Date(e.dateTime);
    return [monthKey(d) + '-' + pad2(d.getDate()), e.type, e.category, e.amount, e.note, e.by].map(q).join(',');
  })).join('\n');
  var name = sheetOf(P).name.replace(/[^\w ]+/g, '').trim() + ' entries.csv', file = new File([csv], name, { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(function () {});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

// ---- Money: Loans, Given and Investments
function rateText(l) { return l.dir === 'invested' ? 'about ' + l.interest + '% a ' + l.per + (l.compound ? '' : ', same each month') : l.interest + '% a ' + l.per; }
function annual(l) { return l.interest > 0 ? (l.per === 'year' ? l.interest : l.interest * 12) : 0; }
// About how many EMIs are left (reducing balance), or null when the EMI doesn't cover the interest.
function emisLeft(l, emi) {
  var r = l.interest > 0 ? l.interest / (l.per === 'year' ? 1200 : 100) : 0;
  if (!r) return Math.ceil(l.owed / emi);
  return emi > l.owed * r ? Math.ceil(-Math.log(1 - r * l.owed / emi) / Math.log(1 + r)) : null;
}
function loanCard(l, w, T, x, now) {
  var dir = l.dir, ym = monthKey(now), paidNow = l.repays.some(function (r) { return monthKey(new Date(r.dateTime)) === ym && r.amount > 0; });
  var addedNow = l.repays.some(function (r) { return monthKey(new Date(r.dateTime)) === ym && r.amount < 0; });
  var type = x.type && INVEST[x.type], picture = dir === 'invested' ? (x.goal ? 'diya' : { fd: 'bank', rd: 'bank', liquid: 'bag', sip: 'up', ppf: 'lock', gold: 'gem', lic: 'shield', chit: 'hand' }[x.type] || 'up') : dir === 'borrowed' && x.cat ? pic(x.cat) : T.pic;
  var info = dir === 'borrowed' && x.cat ? [x.cat] : [];
  if (dir === 'invested') info.push((type ? type.name + ' · ' : '') + rateText(l));
  else if (l.interest) info.push(rateText(l) + (l.monthly ? ', about ' + money.format(Math.round(l.monthly)) + ' a month' : ''));
  else info.push('No interest');
  if (x.emi) info.push('EMI ' + money.format(x.emi) + (x.day ? ' on the ' + ordinal(x.day) : ''));
  if (x.sip) info.push(money.format(x.sip) + ' a month' + (x.day ? ' on the ' + ordinal(x.day) : ''));
  var amount = dir === 'invested' ? money.format(Math.round(l.owed)) : esc(money.format(l.owed)) + T.left2;
  var bar = '', lines = [], box = '';
  if (dir === 'invested' && x.goal) {
    var share = Math.min(1, l.owed / x.goal), short = goalShort(l.owed, x, now);
    bar = '<span class="bar"><i style="width:' + (share * 100).toFixed(1) + '%;background:var(--butter-d)"></i></span>';
    lines.push(Math.round(share * 100) + '% of the ' + money.format(x.goal) + ' goal' + (x.goalBy ? ' by ' + monthYear(dayIn(x.goalBy, 1)) : '') + ' · ' + (short ? money.format(short) + ' short at this pace' : 'on track'));
  } else if (dir !== 'invested') {
    bar = '<span class="bar"><i style="width:' + (l.amount ? Math.min(100, l.repaid / l.amount * 100) : 0) + '%;background:var(--mint-d)"></i></span>';
    lines.push(T.paid + money.format(l.repaid) + ' of ' + money.format(l.amount));
    if (x.emi && !l.done) { var n = emisLeft(l, x.emi); lines.push(n ? 'about ' + n + ' EMIs left · ends ' + monthYear(inMonths(now, n - (paidNow ? 0 : 1))) : 'the EMI doesn\'t cover the interest'); }
    if (x.emi && !l.done) box = '<div class="box">' + MONTHS[now.getMonth()] + ' EMI ' + (paidNow ? '✓ paid' : 'not paid yet') + '</div>';
    else if (l.interest && !l.done) box = '<div class="box">' + MONTHS[now.getMonth()] + ' interest ' + (x.paid >= ym ? '✓ ' + (dir === 'given' ? 'received' : 'paid') : (dir === 'given' ? 'not received yet' : 'not paid yet')) + '</div>';
  } else {
    lines.push('Put in ' + money.format(l.principal) + (x.sip ? ' · ' + MONTHS[now.getMonth()] + (addedNow ? ' added ✓' : ' not added yet') : ''));
  }
  if (dir === 'invested' && type && type.liquid) lines.push('<span class="pill ok">' + img3d('shield', 14) + 'Counts as safety net</span>');
  var acts = [];
  if (!l.done || dir === 'invested') {
    if (dir === 'borrowed') { if (l.interest && !x.emi) acts.push(['int', 'Pay interest']); acts.push(['back', x.emi ? 'Pay extra' : 'Pay back']); if (x.emi) acts.push(['emi', 'Pay EMI']); }
    else if (dir === 'given') { acts.push(['back', 'Got back']); if (l.interest) acts.push(['int', 'Got interest']); }
    else { acts.push(['back', 'Withdraw']); acts.push(['add', 'Add money']); }
  }
  return '<div class="lcard' + (l.done ? ' ldone' : '') + '">' +
    '<button type="button" class="lhead" data-loan-edit="' + esc(l.id) + '"><span class="disc s" style="background:var(' + (PIC_BG[picture] || T.color) + ')">' + img3d(picture, 26) + '</span>' +
    '<div class="grow">' + (x.star && !l.done && dir === 'borrowed' ? '<span class="star">★ Pay first</span>' : '') + '<div class="what" style="font-weight:600">' + esc(l.reason) + '</div><small>' + esc(info.join(' · ')) + '</small>' + (stamp(l) ? '<small class="stamp">' + esc(stamp(l)) + '</small>' : '') +
    (w[l.id] ? '<small style="color:var(--ink-2)">' + icon('clock-countdown', 'sm') + 'Waiting to sync</small>' : '') + '</div>' +
    '<span class="pill ' + (l.done && dir !== 'invested' ? 'ok' : x.goal ? 'warn' : T.pill) + ' num" style="font-weight:600">' + (l.done && dir !== 'invested' ? icon('check', 'sm') + T.done : amount) + '</span></button>' +
    bar + lines.map(function (t) { return '<div class="lfoot"><span>' + (/^<span/.test(t) ? t : esc(t)) + '</span></div>'; }).join('') + box +
    (acts.length ? '<div class="acts">' + acts.map(function (a, i) { return '<button type="button" class="pay' + (i === acts.length - 1 ? '' : ' soft') + '" data-pay="' + esc(l.id) + '" data-kind="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>' : '') +
    (l.repays.length ? '<details><summary>' + l.repays.length + ' ' + T.payments[l.repays.length === 1 ? 0 : 1] + '</summary>' +
      l.repays.map(function (r) {
        return '<div class="rp"><span class="grow">' + esc(day.format(new Date(r.dateTime))) + (r.amount < 0 ? ', added' : '') + (stamp(r) ? ' · ' + esc(stamp(r)) : '') + (w[r.id] ? ', waiting to sync' : '') + '</span><b class="num" style="font-weight:600">' + esc(money.format(Math.abs(r.amount))) + '</b>' +
          '<button type="button" data-del-repay="' + esc(r.id) + '" aria-label="Delete this payment">' + icon('trash', 'sm') + '</button></div>';
      }).join('') + '</details>' : '') + '</div>';
}
function ordinal(n) { return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); }

function renderLoans(v) {
  var dir = tabDir(), T = LOAN_TEXT[dir], now = new Date(), L = summarizeLoans(loansOf(v, dir), v.repays, null, null, now), w = waiting(), set = v.settings;
  var open = L.loans.filter(function (l) { return !l.done; });
  document.querySelectorAll('#moneySeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(MONEY_TABS[b.dataset.tab] === dir)); });
  var rows = [], sub = '';
  if (dir === 'borrowed') {
    var emi = open.reduce(function (s, l) { return s + ((set.loans[l.id] || {}).emi || 0); }, 0);
    if (open.length) { var p = planOf(v, now); sub = p.focus === 'debt' ? (p.pace ? 'Debt-free ≈ ' + monthYear(inMonths(now, p.pace)) : 'Not paid off at today\'s pace') : ''; }
    if (emi) rows.push(['EMIs', 'Every month', money.format(emi) + '/mo']);
    if (L.monthlyInterest) rows.push(['Interest', 'On what is still owed, an expense', '≈ ' + money.format(Math.round(L.monthlyInterest)) + '/mo']);
    rows.push(['Borrowed', 'All loans', money.format(L.borrowed)], ['Paid back', 'So far', money.format(L.repaid)]);
  } else if (dir === 'given') {
    rows.push(['Given', 'All money given', money.format(L.borrowed)], ['Got back', 'So far', money.format(L.repaid)]);
    if (L.monthlyInterest) rows.push(['Interest coming', 'Each month, on what is still to get', '≈ ' + money.format(Math.round(L.monthlyInterest)) + '/mo']);
  } else {
    var put = open.reduce(function (s, l) { return s + l.principal; }, 0), r = periodRange('month', now), grow = L.monthlyInterest + cashFlow(loansOf(v, 'invested'), v.repays, r.start, r.end, set.loans).invested;
    sub = (grow >= 0 ? '▲ ' : '▼ ') + money.format(Math.abs(Math.round(grow))) + ' this month';
    rows.push(['Put in', 'What went in, less withdrawals', money.format(Math.round(put))], ['Growth so far', 'At the expected returns', '≈ ' + money.format(Math.round(L.owed - put))]);
    if (L.monthlyInterest) rows.push(['Growth this month', 'At the expected returns', '≈ ' + money.format(Math.round(L.monthlyInterest))]);
  }
  $('#loanSummary').style.background = 'var(' + T.color + ')';
  $('#loanSummary').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div class="soft t-sm" id="loanLeftLabel">' + T.left + '</div>' +
    '<div class="big num" id="loanOwed">' + money.format(dir === 'invested' ? Math.round(L.owed) : L.owed) + '</div>' + (sub ? '<div class="soft t-sm">' + esc(sub) + '</div>' : '') + '</div>' + img3d(T.pic, 64) + '</div>' +
    '<div class="inlist">' + rows.map(function (x) { return '<div class="row"><div class="grow"><b class="t-sm">' + x[0] + '</b><small>' + x[1] + '</small></div><b class="num">' + x[2] + '</b></div>'; }).join('') + '</div>';
  $('#addLoanText').textContent = T.add;
  $('#loanListTitle').textContent = T.list;
  $('#loanFoot').textContent = T.foot;
  $('#loanCount').textContent = L.loans.length ? open.length + ' open' + (L.loans.length > open.length ? ', ' + (L.loans.length - open.length) + ' ' + T.done.toLowerCase() : '') : '';
  $('#loanList').innerHTML = L.loans.length
    ? L.loans.map(function (l) { return loanCard(l, w, T, set.loans[l.id] || {}, now); }).join('')
    : emptyRow(T.none[0], T.none[1], T.pic);
}

// ---- Insights
// The lines are drawn stretched to the card (no text inside the SVG, so nothing scales or overlaps); the goal line, its label and
// the month ticks are HTML on top. sets: [{v: values by month, dashed}], o: {fill, goal, goalText, label, at(i) → date, or ticks: labels}.
function lineSvg(sets, o) {
  var W = 300, H = 100, n = Math.max.apply(null, sets.map(function (s) { return s.v.length - 1; })) || 1;
  var hi = Math.max.apply(null, [].concat.apply([(o.goal || 0) * 1.1, 1], sets.map(function (s) { return s.v; })));
  var x = function (i) { return i / n * W; }, y = function (v) { return H - Math.max(0, v) / hi * (H - 4); };
  var path = function (v) { return v.map(function (val, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val).toFixed(1); }).join(' '); };
  var a = sets[0].v, svg = '<path d="' + path(a) + ' L' + x(a.length - 1).toFixed(1) + ' ' + H + ' L0 ' + H + ' Z" fill="var(' + o.fill + ')" opacity=".4"/>';
  sets.slice().reverse().forEach(function (s) { svg += '<path d="' + path(s.v) + '" fill="none" stroke="var(--ink)" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-width="' + (s.dashed ? '1.5" stroke-dasharray="3 4" opacity=".55' : '2.2') + '"/>'; });
  var ticks = (o.ticks || [0, Math.round(n / 3), Math.round(2 * n / 3), n].map(function (i) { return MONTHS[o.at(i).getMonth()] + ' ’' + String(o.at(i).getFullYear()).slice(2); }))
    .map(function (t) { return '<span>' + t + '</span>'; }).join('');
  return '<div class="chart"><div class="plot"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(o.label) + '">' + svg + '</svg>' +
    (o.goal ? '<span class="gline" style="bottom:' + (o.goal / hi * (H - 4) / H * 100).toFixed(1) + '%"><b>' + esc(o.goalText) + '</b></span>' : '') + '</div><div class="cticks">' + ticks + '</div></div>';
}
// Worth month by month: `worth` growing at rate plus `monthly` growing at addRate, for n months.
function growLine(lt, monthly, n) {
  var out = [lt.worth], w = lt.worth, added = 0;
  for (var i = 1; i <= n; i++) { w *= 1 + lt.rate; added = added * (1 + lt.addRate) + monthly; out.push(w + added); }
  return out;
}

function noteHtml(n, prevLabel) {
  var t;
  if (n.kind === 'safety') t = n.aim === 1 ? ['shield', 'Build a ' + money.format(Math.max(1000, Math.round(n.need / 1000) * 1000)) + ' safety net first', 'Your savings cover about ' + spanText(n.months) + ' of expenses. One emergency could mean a new loan.']
    : ['shield', 'The safety net covers ' + spanText(n.months), 'Aim for 6 months (about ' + lakh(n.need) + ' more). ' + (n.inHand > 0 ? 'Move some of the ' + money.format(Math.round(n.inHand)) + ' in hand to an FD or a liquid fund.' : 'Put a little aside each month in an FD or RD.')];
  else if (n.kind === 'costly') t = ['rocket', n.name + ' costs ' + n.rate + '% a year', 'Savings earn about ' + n.earn + '%. After the safety net, extra money goes to this loan first.'];
  else if (n.kind === 'sooner') t = ['rocket', money.format(n.more) + ' more a month: debt-free ' + monthsText(n.months) + ' sooner', n.saved >= 100 ? 'And about ' + money.format(Math.round(n.saved / 100) * 100) + ' less interest.' : ''];
  else if (n.kind === 'emi') t = ['warn', 'EMIs take ' + pct(n.load) + ' of income', 'Keep them under 30–40%. Avoid a new loan until one ends.'];
  else if (n.kind === 'interest') t = ['fire', 'About ' + money.format(Math.round(n.amount)) + ' went on interest this year', 'Paying the costliest loan first cuts this.'];
  else if (n.kind === 'goal') t = ['diya', n.name + ' is ' + money.format(n.short) + ' short', n.by ? 'Add it before ' + monthYear(dayIn(n.by, 1)) + '.' : 'Add a little more each month.'];
  else if (n.kind === 'streak') t = ['party', 'Saving about ' + pct(n.rate) + ' of income, ' + monthsText(n.months) + ' in a row', n.rate >= 0.4 ? 'Far above the 20% to aim for.' : 'Above the 20% to aim for. Keep it going.'];
  else if (n.kind === 'safe') t = ['shield', 'The safety net covers ' + spanText(n.months), 'More than the ' + monthsText(n.aim) + ' to aim for, in FDs, RDs and liquid funds.'];
  else if (n.kind === 'ontrack') t = ['diya', n.name + ' is on track', n.by ? 'For ' + monthYear(dayIn(n.by, 1)) + '.' : ''];
  else if (n.kind === 'under') t = ['bag', money.format(n.left) + ' left of the everyday budget', 'About ' + money.format(n.perDay) + ' a day for the rest of the month.'];
  else if (n.kind === 'drop') t = [pic(n.cat), n.cat + ' is ' + money.format(round2(n.before - n.now)) + ' less than ' + prevLabel, money.format(n.now) + ' against ' + money.format(n.before) + '.'];
  else if (n.kind === 'worth') t = ['up', 'Net worth went up ' + lakh(n.up) + ' this month', 'Cash saved, investments and money lent, less what is owed.'];
  else if (n.kind === 'low') t = ['warn', n.rate < 0 ? 'Spent more than the income in ' + n.month : 'Saved only ' + pct(n.rate) + ' of income in ' + n.month, 'Aim for 20% or more.'];
  else if (n.kind === 'over') t = ['warn', n.cat + ' is ' + money.format(n.over) + ' over its budget', 'Budgets are set in Settings.'];
  else t = [pic(n.cat), n.cat + ' is ' + money.format(round2(n.now - n.before)) + ' more than ' + prevLabel, money.format(n.now) + ' against ' + money.format(n.before) + '.'];
  return '<div class="note">' + img3d(t[0], 30) + '<div><b>' + esc(t[1]) + '</b>' + (t[2] ? '<p>' + esc(t[2]) + '</p>' : '') + '</div></div>';
}

function renderInsights(v) {
  var now = new Date(), set = v.settings;
  var s = summarize(v.rows, state.view, state.date, 0, v.cats), r = periodRange(state.view, state.date), running = now >= r.start && now < r.end;
  document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); });
  $('#periodLabel').textContent = s.label;
  var dim = Math.round((r.end - r.start) / 864e5), gone = Math.min(dim, Math.floor((now - r.start) / 864e5) + 1);
  var last = new Date(r.end.getFullYear(), r.end.getMonth() - 1, 1);
  var first = v.rows.reduce(function (t, e) { var d = new Date(e.dateTime); return d < t ? d : t; }, now);
  $('#periodSub').innerHTML = state.view === 'all' ? esc('Since ' + monthYear(first)) : state.view === 'month' ? (running ? gone + ' of ' + dim + ' days' : '') : esc(monthYear(r.start) + ' – ' + monthYear(last) + (running ? ' · so far' : ''));
  $('#next').disabled = s.end > now;
  $('#prev').disabled = state.view === 'all';
  var ps = previousSpan(state.view, state.date, now), prev = totals(v.rows, ps.start, ps.end);
  var prevLabel = ps.partial ? (state.view === 'month' ? 'these days last month' : 'this time last year') : (state.view === 'month' ? 'last month' : 'last year');
  var rate = s.income > 0 ? s.savings / s.income : null, prate = prev.income > 0 ? prev.savings / prev.income : null, p = planOf(v, now);

  // Summary: saved, the savings rate, and against the same stretch of the period before
  var diff = prev.income || prev.expense ? round2(s.savings - prev.savings) : null;
  $('#insSummary').innerHTML = '<div class="pcard" style="background:var(--lavender)"><div class="hrow"><div class="grow"><div class="soft t-sm">' + (running ? 'Saved so far' : 'Saved') + '</div>' +
    '<div class="big num" id="sSaveBig">' + esc(plain(s.savings)) + '</div><div class="soft t-sm">' + (diff == null ? '&nbsp;' : (diff >= 0 ? '▲ ' : '▼ ') + esc(money.format(Math.abs(Math.round(diff)))) + (diff >= 0 ? ' more than ' : ' less than ') + prevLabel + (prate != null ? ' (' + pct(prate) + ' of income then)' : '')) + '</div></div>' +
    ring(rate, running && state.view === 'month' && p.savingsRate != null ? 'so far<br>usually ' + pct(p.savingsRate) : 'of income') + '</div>' +
    '<div class="stats"><div><span>Income</span><b class="num" id="sIn">' + money.format(s.income) + '</b></div><div><span>Spent</span><b class="num" id="sOut">' + money.format(s.expense) + '</b></div>' +
    '<div><span>Saved</span><b class="num" id="sSave">' + esc(plain(s.savings)) + '</b></div></div></div>';

  // Where the income went: spent, loans paid, invested, lent, and what is left in hand
  var cf = cashFlow(v.loans, v.repays, r.start, r.end, set.loans), inHand = round2(s.savings - cf.loansPaid - cf.invested - cf.lent + cf.borrowed);
  var parts = [['Spent', s.expense, '--blush-d'], ['Loans paid', cf.loansPaid, '--butter-d'], ['Invested', cf.invested, '--lavender-d'], ['Lent', cf.lent, '--sky-d'], [inHand < 0 ? 'Short' : 'In hand', Math.abs(inHand), inHand < 0 ? '--muted' : '--mint-d']]
    .filter(function (x) { return x[1] > 0; }), base = parts.reduce(function (t, x) { return t + x[1]; }, 0);
  $('#insSplit').innerHTML = s.income + cf.borrowed > 0 ? '<div class="card"><h2>Where the income went</h2><div class="split">' + parts.map(function (x) { return '<i style="width:' + (x[1] / base * 100).toFixed(2) + '%;background:var(' + x[2] + ')"></i>'; }).join('') + '</div>' +
    '<div class="leg" id="splitLeg">' + parts.map(function (x) { return '<div><i style="background:var(' + x[2] + ')"></i>' + x[0] + '<b class="num">' + money.format(x[1]) + '</b></div>'; }).join('') + '</div>' +
    '<p class="t-xs muted" style="margin-top:8px">Loans paid back and money invested come out of Saved; they are not expenses.' + (cf.borrowed ? ' Includes ' + money.format(cf.borrowed) + ' borrowed in this period.' : '') + '</p></div>' : '';

  // Things to notice: going well, and worth a look
  var b = budgetStatus(v.rows, set, v.cats, now), inv = p.inv.loans.filter(function (l) { return !l.done; }), liquid = 0, earn = 0;
  inv.forEach(function (l) { var x = set.loans[l.id] || {}; if (x.type && INVEST[x.type].liquid) { earn = Math.max(earn, annual(l)); liquid += l.owed; } });
  var borrowed = p.open || summarizeLoans(loansOf(v, 'borrowed'), v.repays, null, null, now).loans.filter(function (l) { return !l.done; }); // planOf has them when clearing loans
  var costly = borrowed.slice().sort(function (a, c) { return annual(c) - annual(a); })[0], emiMonthly = 0;
  borrowed.forEach(function (l) { var x = set.loans[l.id] || {}; emiMonthly += x.emi || l.monthly; });
  // Notes about the last few months and this one (streak, low, under, over, worth) show only on this month's Insights.
  var yr = periodRange('year', now), streak = 0, streakRate = 0, lastM = p.months[p.months.length - 1], thisMonth = running && state.view === 'month';
  for (var i = p.months.length - 1; thisMonth && i >= 0 && p.months[i].income > 0 && p.months[i].savings / p.months[i].income >= 0.2; i--) { streak++; streakRate += p.months[i].savings / p.months[i].income; }
  // Net worth's change this month. netWorth leaves out cash, so this month's cash in hand is added: putting cash into an FD
  // or a loan then moves nothing, and what is left is what was saved plus what the investments grew.
  var mr = periodRange('month', now), mcf = cashFlow(v.loans, v.repays, mr.start, mr.end, set.loans), nw = netWorth(v.loans, v.repays, now.getTime() + 1);
  var nwUp = Math.round(nw - netWorth(v.loans, v.repays, mr.start.getTime(), set.loans) + totals(v.rows, mr.start, mr.end).savings - mcf.loansPaid - mcf.invested - mcf.lent + mcf.borrowed);
  var ctx = { focus: p.focus, avgExpense: p.avgExpense, liquid: liquid, safety: p.avgExpense ? liquid / p.avgExpense : 0, inHand: running ? inHand : 0,
    costly: costly && annual(costly) ? { name: costly.reason, rate: annual(costly) } : null, earn: earn || 6.5, emiLoad: p.avgIncome ? emiMonthly / p.avgIncome : 0,
    interestYear: v.rows.filter(function (e) { var d = new Date(e.dateTime); return e.type === 'Expense' && matchName([LOAN_INTEREST], e.category) && d >= yr.start && d < yr.end; }).reduce(function (t, e) { return t + e.amount; }, 0),
    goals: inv.filter(function (l) { return (set.loans[l.id] || {}).goal; }).map(function (l) {
      var x = set.loans[l.id];
      return { name: l.reason, short: goalShort(l.owed, x, now), by: x.goalBy };
    }), streak: streak, streakRate: streak ? streakRate / streak : 0, over: thisMonth ? b.over : [], rise: biggestRise(s.spent, prev.spent, b.fixed), drop: biggestRise(s.spent, prev.spent, b.fixed, -1),
    low: thisMonth && lastM && lastM.income > 0 && lastM.savings / lastM.income < 0.1 ? { rate: lastM.savings / lastM.income, month: MONTHS[lastM.start.getMonth()] } : null,
    // under: something spent, and slower than the month is going (days gone = today's date; days in month = today + days left - 1)
    under: thisMonth && b.daily && b.daily.left > 0 && b.daily.spent > 0 && b.daily.spent <= b.daily.limit * now.getDate() / (now.getDate() + b.daily.days - 1) ? b.daily : null, worthUp: thisMonth ? nwUp : 0 };
  if (p.focus === 'debt' && p.pace) {
    var more = Math.max(500, Math.round(p.cash * 0.25 / 500) * 500), f2 = forecast(borrowedOnly(v.loans), v.repays, p.cash + more, now);
    if (f2.payoff) ctx.sooner = { more: more, months: p.pace - f2.payoff.months, saved: p.f.totalInterest - f2.totalInterest };
  }
  var notes = notesFor(ctx);
  var group = function (label, list) { return list.length ? '<div class="clbl" style="margin-top:6px">' + label + '</div>' + list.map(function (n) { return noteHtml(n, prevLabel); }).join('') : ''; };
  $('#insNotes').innerHTML = notes.good.length + notes.bad.length ? '<div class="card"><h2>Things to notice <span class="pill ' + (p.focus === 'debt' ? 'bad' : 'ok') + '">' + (p.focus === 'debt' ? 'Clear loans' : 'Grow savings') + '</span></h2>' +
    group('Going well', notes.good) + group('Worth a look', notes.bad) + '</div>' : '';

  // Spending by category: biggest first, with budgets and the change against the period before. Tap one for History.
  var cats = Object.keys(s.spent).filter(function (c) { return s.spent[c] > 0; }).sort(function (a, c) { return s.spent[c] - s.spent[a]; }), top = cats.length ? s.spent[cats[0]] : 1;
  $('#insCats').innerHTML = cats.length ? '<div class="card"><h2>Spending by category <span class="see">Tap for History</span></h2>' + cats.map(function (c) {
    var amt = s.spent[c], bud = state.view === 'month' ? set.budgets[c] : 0, was = prev.spent[c] || 0, d = round2(amt - was), note;
    if (bud && amt > bud) note = '<small class="neg" style="font-weight:600">' + money.format(round2(amt - bud)) + ' over budget</small>';
    else if (b.fixed[c]) note = '<small class="muted">bill</small>';
    else if (state.view === 'all') note = '';
    else if (!was) note = '<small class="muted">new</small>';
    else if (!d) note = '<small class="muted">same as ' + esc(prevLabel) + '</small>';
    else note = '<small class="' + (d > 0 ? 'neg' : 'pos') + '">' + (d > 0 ? '▲ ' : '▼ ') + money.format(Math.abs(d)) + (bud ? ' · ' + Math.round(amt / bud * 100) + '% of budget' : '') + '</small>';
    return '<button type="button" class="crow" data-catf="Expense-' + esc(c) + '">' + disc('Expense', c, 'xs', 22) + '<div class="grow"><div class="cn">' + esc(c) + ' <span class="muted">' + Math.round(amt / s.expense * 100) + '%</span></div>' +
      '<span class="bar thin"><i style="width:' + (amt / top * 100).toFixed(1) + '%' + (bud && amt > bud ? ';background:var(--blush-d)' : '') + '"></i></span></div><div class="ca"><b class="num">' + money.format(amt) + '</b>' + note + '</div></button>';
  }).join('') + '</div>' : '<div class="card"><h2>Spending by category</h2><p class="muted t-sm">No expenses in this period.</p></div>';

  // The last 6 complete months: saved each month, with the savings rate
  var ms = p.months, best = Math.max.apply(null, ms.map(function (m) { return m.savings; }).concat(1)), avg = p.n ? ms.reduce(function (t, m) { return t + m.savings; }, 0) / p.n : 0;
  $('#insTrend').innerHTML = p.n ? '<div class="card"><h2>Last 6 months <span class="see">Saved each month</span></h2><div class="trend">' +
    (avg > 0 ? '<span class="avg" style="bottom:' + (avg / best * 100).toFixed(1) + '%"></span>' : '') + ms.map(function (m) {
      var rr = m.income > 0 ? m.savings / m.income : null;
      return '<div class="c"><span>' + (rr == null ? '–' : pct(rr)) + '</span><i' + (rr != null && rr < 0.15 ? ' class="lo"' : '') + ' style="height:' + (Math.max(0, m.savings) / best * 100).toFixed(1) + '%"></i></div>';
    }).join('') + '</div><div class="ticks">' + ms.map(function (m) { return '<span>' + MONTHS[m.start.getMonth()] + '</span>'; }).join('') + '</div>' +
    '<p class="t-xs muted" style="margin-top:8px">Dashed: the average, ' + esc(plain(Math.round(avg))) + ' a month' + (p.savingsRate != null ? ' (' + pct(p.savingsRate) + ' of income)' : '') + '.</p></div>' : '';

  // The plan: Loan plan (clear loans) or Savings plan (grow savings)
  if (p.focus === 'debt') {
    var limit = Math.min(60, p.pace || 24), owedLine = [p.owed].concat(p.f.months.slice(0, limit).map(function (m) { return m.owed; }));
    var mid = p.chips.length > 1 ? p.chips[p.chips.length - 2] : null, sets = [{ v: owedLine }];
    if (mid && mid.need != null && p.pace) sets.push({ v: [p.owed].concat(forecast(borrowedOnly(v.loans), v.repays, mid.need, now).months.slice(0, limit).map(function (m) { return m.owed; })), dashed: true });
    var maxM = Math.max.apply(null, p.f.perLoan.map(function (l) { return l.months || 0; }).concat(1));
    $('#insPlan').innerHTML = '<div class="card" id="loanPlan"><h2>Loan plan <span class="see">Last ' + (p.n || 6) + ' months</span></h2><b style="font-size:19px;font-weight:600">' + (p.pace ? 'Debt-free by ' + monthYear(inMonths(now, p.pace)) : 'Not paid off at this pace') + '</b>' +
      '<div class="t-sm muted">' + money.format(p.owed) + ' owed today · ' + money.format(p.cash) + ' a month toward loans</div>' +
      lineSvg(sets, { fill: '--blush-d', label: 'Owed going down to nothing', at: function (i) { return inMonths(now, i); } }) +
      (sets.length > 1 ? '<p class="t-xs muted">Solid: your pace. Dotted: ' + money.format(mid.need) + ' a month, debt-free by ' + monthYear(inMonths(now, mid.months)) + '.</p>' : '') +
      '<div class="tl">' + p.f.perLoan.map(function (l, k) {
        return '<div class="tlr"><span>' + esc(l.reason) + '<small>' + (l.interest ? l.interest + '% a ' + l.per : 'no interest') + (k === 0 && l.months ? ' · first' : '') + '</small></span><span class="tlt"><i style="width:' + ((l.months || maxM) / maxM * 100).toFixed(1) + '%' + (l.interest ? '' : ';background:var(--peri-d)') + '"></i></span>' +
          '<b>' + (l.months ? MONTHS[l.date.getMonth()] + ' ’' + String(l.date.getFullYear()).slice(2) : '–') + '</b></div>';
      }).join('') + '</div>' + (p.pace && p.f.totalInterest ? '<div class="box">Interest still to pay at your pace: about <b>' + lakh(Math.round(p.f.totalInterest / 100) * 100) + '</b>. The costliest loan goes first unless one is starred.</div>' : '') + '</div>';
  } else {
    var lt = p.lt, g = p.g, n = Math.min(120, p.pace || (p.due ? p.due + 12 : 60)), mix = {}, total = 0, mid2 = p.chips.filter(function (c) { return c.months !== p.pace; })[0];
    inv.forEach(function (l) { var x = set.loans[l.id] || {}, k = x.type ? INVEST[x.type].name : 'Other'; mix[k] = (mix[k] || 0) + l.owed; total += l.owed; });
    var colors = ['--lavender-d', '--sky-d', '--butter-d', '--mint-d', '--peri-d', '--blush-d'], keys2 = Object.keys(mix).sort(function (a, c) { return mix[c] - mix[a]; });
    var gsets = [{ v: growLine(lt, lt.monthly, n) }];
    if (mid2 && mid2.need != null) gsets.push({ v: growLine(lt, mid2.need, Math.min(n, mid2.months)), dashed: true });
    var goals = inv.filter(function (l) { return (set.loans[l.id] || {}).goal; }), head;
    if (!lt.worth && !lt.monthly) head = 'No savings yet: add an FD, RD or SIP in Money';
    else if (!g) head = 'In ' + (n / 12) + ' years: about ' + lakh(gsets[0].v[n]);
    else if (p.pace === 0) head = lakh(g.target) + ' goal reached 🎉';
    else head = lakh(g.target) + (p.pace ? ' by ' + monthYear(inMonths(now, p.pace)) + ' at your pace' : ': not reached at this pace');
    $('#insPlan').innerHTML = '<div class="card" id="savePlan"><h2>Savings plan <span class="see">Expected returns</span></h2><b style="font-size:19px;font-weight:600">' + head + '</b>' +
      '<div class="t-sm muted">' + money.format(Math.round(lt.worth)) + (g && g.name ? ' in ' + esc(g.name) : ' now') + ' · ' + money.format(lt.monthly) + ' a month going in' + (g && g.by ? ' · goal date ' + monthYear(dayIn(g.by, 1)) : '') + '</div>' +
      (total ? '<div class="t-xs muted" style="margin-top:10px">What it is in</div><div class="split">' + keys2.map(function (k, i) { return '<i style="width:' + (mix[k] / total * 100).toFixed(2) + '%;background:var(' + colors[i % 6] + ')"></i>'; }).join('') + '</div>' +
        '<div class="leg">' + keys2.map(function (k, i) { return '<div><i style="background:var(' + colors[i % 6] + ')"></i>' + esc(k) + '<b class="num">' + Math.round(mix[k] / total * 100) + '%</b></div>'; }).join('') + '</div>' : '') +
      lineSvg(gsets, { fill: '--mint-d', goal: g ? g.target : 0, goalText: g ? lakh(g.target) + ' goal' : '', label: g ? 'Savings growing toward the goal' : 'Savings growing', at: function (i) { return inMonths(now, i); } }) +
      '<p class="t-xs muted">' + (gsets.length > 1 ? 'Solid: ' + money.format(lt.monthly) + ' a month. Dotted: ' + money.format(mid2.need) + ' a month, reaching it by ' + monthYear(inMonths(now, mid2.months)) + '. ' : '') + 'An estimate from the expected returns, not live prices.</p>' +
      (g ? '' : '<button type="button" class="btn soft" id="setGoal" style="margin-top:8px">' + icon('plus', 'sm') + 'Set a savings goal</button>') +
      (goals.length ? '<div style="margin-top:8px">' + goals.map(function (l) {
        var x = set.loans[l.id], gg = ctx.goals.filter(function (q) { return q.name === l.reason; })[0];
        return '<div class="row">' + img3d('diya', 30) + '<div class="grow"><b class="t-sm">' + esc(l.reason) + '</b><small>' + money.format(Math.round(l.owed)) + ' of ' + money.format(x.goal) + (x.goalBy ? ' · by ' + monthYear(dayIn(x.goalBy, 1)) : '') + '</small>' +
          '<span class="bar thin" style="margin-top:6px"><i style="width:' + Math.min(100, l.owed / x.goal * 100).toFixed(1) + '%;background:var(--butter-d)"></i></span></div>' +
          (gg.short ? '<span class="pill warn">' + money.format(gg.short) + ' short</span>' : '<span class="pill ok">On track</span>') + '</div>';
      }).join('') + '</div>' : '') + '</div>';
  }

  // Money health: savings rate, safety net, EMI load, net worth
  var aim = p.focus === 'debt' ? 1 : 6;
  var tile = function (bg, label, big, sub) { return '<div class="ht" style="background:var(' + bg + ')"><span>' + label + '</span><b class="num">' + big + '</b><small>' + sub + '</small></div>'; };
  $('#insHealth').innerHTML = p.n || v.loans.length ? '<div class="card"><h2>Money health</h2><div class="health">' +
    tile(p.savingsRate == null ? '--field' : p.savingsRate >= 0.2 ? '--mint' : p.savingsRate >= 0.1 ? '--butter' : '--blush', 'Savings rate', p.savingsRate == null ? '–' : pct(p.savingsRate), 'aim for 20%+' + (p.savingsRate >= 0.2 ? ' ✓' : '')) +
    tile(ctx.safety >= aim ? '--mint' : ctx.safety >= 1 ? '--butter' : '--blush', 'Safety net', spanText(ctx.safety), liquid ? 'FD, RD, savings · aim for ' + (aim === 1 ? '1 month first' : '6') : 'mark FDs and savings in Money') +
    tile(ctx.emiLoad < 0.3 ? '--mint' : ctx.emiLoad < 0.4 ? '--butter' : '--blush', 'EMI load', pct(ctx.emiLoad), 'of income · keep under 30%') +
    tile('--peri', 'Net worth', lakh(nw), (nwUp >= 0 ? '▲ ' : '▼ ') + lakh(Math.abs(nwUp)) + ' this month') + '</div></div>' : '';

  // Business profit: only for a category with both income and expenses (Dairy, a shop)
  var biz = v.cats.Income.filter(function (c) { return c !== 'Others' && v.cats.Expense.indexOf(c) >= 0; });
  $('#insBiz').innerHTML = biz.length ? '<div class="card"><h2>Business profit</h2>' + biz.map(function (c) {
    var val = s.net[c] || 0;
    return '<div class="row">' + img(c, 28) + '<div class="grow">' + esc(c) + '<small>Income minus expenses</small></div><span class="pill ' + (val > 0 ? 'ok' : val < 0 ? 'bad' : '') + '" style="font-weight:600">' + signed(val) + '</span></div>';
  }).join('') + '</div>' : '';
  $('#insShare').hidden = !s.entries.length;
}

// A WhatsApp message with the period's numbers and the plan.
function shareSummary() {
  var v = view(), now = new Date(), s = summarize(v.rows, state.view, state.date, 0, v.cats), p = planOf(v, now);
  var top = Object.keys(s.spent).filter(function (c) { return s.spent[c] > 0; }).sort(function (a, b) { return s.spent[b] - s.spent[a]; }).slice(0, 3);
  var text = [sheetOf(P).name + ' · ' + s.label,
    'Income ' + money.format(s.income) + ' · Spent ' + money.format(s.expense) + ' · Saved ' + plain(s.savings) + (s.income > 0 ? ' (' + pct(s.savings / s.income) + ')' : ''),
    top.length ? 'Most spent on: ' + top.map(function (c) { return c + ' ' + money.format(s.spent[c]); }).join(', ') : '',
    p.focus === 'debt' ? (p.pace ? 'Loans: ' + money.format(p.owed) + ' left, debt-free by ' + monthYear(inMonths(now, p.pace)) : 'Loans: ' + money.format(p.owed) + ' left')
      : 'Savings: about ' + lakh(p.worth) + (p.g && p.pace ? ', ' + lakh(p.goal) + ' by ' + monthYear(inMonths(now, p.pace)) : ''),
    '— Family Money'].filter(Boolean).join('\n');
  shareText(text);
}
function shareText(text) {
  if (navigator.share) return navigator.share({ text: text }).catch(function () {});
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

// ---- Settings
function sheetsHtml() {
  var list = sheets();
  return list.map(function (s) {
    var n = load(keys(s.p).ops, []).length;
    return '<div class="srow"><button type="button" class="opt" data-sheet="' + s.p + '" aria-pressed="' + (s.p === P) + '"><span class="disc xs" style="background:var(' + (SHEET_PICS[s.pic] || '--sky') + ')">' + img3d(s.pic, 24) + '</span>' +
      '<span class="grow"><span class="what">' + esc(s.name) + '</span>' + (n ? '<small>' + n + ' waiting to sync</small>' : '') + '</span></button>' +
      '<button type="button" class="rbtn xs" data-sren="' + s.p + '" aria-label="Rename ' + esc(s.name) + '">' + icon('pencil-simple', 'sm') + '</button>' +
      (list.length > 1 ? '<button type="button" class="rbtn xs" data-sdel="' + s.p + '" aria-label="Remove ' + esc(s.name) + '">' + icon('trash', 'sm') + '</button>' : '') + '</div>';
  }).join('') + '<button type="button" class="opt" id="addSheet"><span class="disc xs" style="background:var(--field)">' + icon('plus', 'sm') + '</span>Add a new sheet</button>';
}
// Budgets (Settings, and the sheet from Home's "Set a monthly budget"): one total for everyday spending, and one per category.
// Each field saves when it is left (the change listener below).
function budgetsHtml(v) {
  var set = v.settings, row = function (label, sub, attr, value, picture) {
    return '<div class="row">' + picture + '<div class="grow">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</div><input class="field num" inputmode="decimal" ' + attr + ' value="' + (value || '') + '" placeholder="₹ a month" aria-label="' + esc(label) + ' budget"></div>';
  };
  return row('Everyday spending', 'One total for every category without a bill', 'data-daily', set.daily, img3d('bag', 26)) +
    '<div class="clbl" style="margin-top:8px">Per category (optional)</div>' +
    v.cats.Expense.map(function (c) { return row(esc(c), '', 'data-budget="' + esc(c) + '"', set.budgets[c], img(c, 26)); }).join('') +
    '<p class="t-xs muted" style="padding-top:6px">Rent, fees and EMIs are bills, not budgets. A blank budget is none.</p>';
}
function segHtml(attr, cur, opts) {
  return '<div class="seg">' + opts.map(function (o) { return '<button type="button" data-' + attr + '="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + o[1] + '</button>'; }).join('') + '</div>';
}
function renderSettings(v) {
  var set = v.settings, now = new Date(), synced = load(K.synced, 0), me2 = sheetOf(P), auto = focusOf(v.loans, v.repays, newSettings(), now);
  var cfg = !!load(K.cfg, null) && !!load(K.settings, null); // settings need the updated script
  var invGoal = goalOf(Object.assign({}, set, { goal: 0 }), summarizeLoans(loansOf(v, 'invested'), v.repays, null, null, now).loans.filter(function (l) { return !l.done; }));
  var bills = Object.keys(set.bills).sort(function (a, b) { return set.bills[a].day - set.bills[b].day; });
  $('#setList').innerHTML =
    '<div class="card set"><div class="row"><span class="av" style="background:var(' + (SHEET_PICS[me2.pic] || '--sky') + ')">' + img3d(me2.pic, 30) + '</span><div class="grow"><b>' + esc(me2.name) + '</b><small>Google Sheet' + (synced ? ' · synced ' + clock.format(new Date(synced)) : '') + '</small></div>' +
      '<button type="button" class="rbtn xs" data-sren="' + P + '" aria-label="Rename">' + icon('pencil-simple', 'sm') + '</button></div>' +
      '<div class="row">' + img3d('wave', 26) + '<div class="grow">This phone is used by<small>Shown as "Added by" on entries</small></div><input class="field" id="meName" value="' + esc(me()) + '" placeholder="Your name" maxlength="30" style="width:130px;text-align:left" aria-label="Your name"></div></div>' +
    (cfg ? '' : '<div class="box">Budgets, bills and the focus are saved in the Google Sheet. Update its Apps Script (README: Updating Apps Script) to change them; until then they wait on this phone.</div>') +
    '<div class="card set"><h2>Focus</h2>' + segHtml('focus', set.focus, [['auto', 'Auto'], ['debt', 'Clear loans'], ['grow', 'Grow savings']]) +
      '<p class="t-xs muted" style="margin-top:8px">' + (set.focus === 'auto' ? 'Auto picked <b>' + (auto === 'debt' ? 'Clear loans' : 'Grow savings') + '</b>: ' + (auto === 'debt' ? 'more is owed than the savings are worth.' : 'the savings are worth more than what is owed.') : 'Home and Insights show this focus.') + '</p>' +
      '<div class="row" style="margin-top:6px">' + img3d('seed', 26) + '<div class="grow">Savings goal<small>' + (set.goal ? 'All investments count toward it' : invGoal ? 'None: Home follows ' + esc(invGoal.name) + '\'s goal' : 'None yet') + '</small></div><input class="field num" inputmode="decimal" id="goalIn" value="' + (set.goal || '') + '" placeholder="None" aria-label="Savings goal"></div></div>' +
    '<div class="card set"><h2>Budgets</h2>' + budgetsHtml(v) + '</div>' +
    '<div class="card"><h2>Bills &amp; reminders <button type="button" class="see" id="addBill">+ Add</button></h2>' + (bills.length ? bills.map(function (id) {
      var bl = set.bills[id];
      return '<button type="button" class="row" data-bill="' + esc(id) + '" style="width:100%;text-align:left">' + img(bl.category, 26) + '<div class="grow">' + esc(bl.name) + '<small>' + ordinal(bl.day) + (bl.every === 1 ? ' of every month' : ', every ' + (bl.every === 12 ? 'year' : bl.every + ' months')) + ' · next ' + day.format(dayIn(bl.next, bl.day)) + '</small></div>' +
        '<b class="num">' + money.format(bl.amount) + '</b>' + icon('pencil-simple', 'sm muted') + '</button>';
    }).join('') : '<p class="t-sm muted">Rent, school fees, electricity, LIC: add them here, or switch on "Repeat every month" when you add an expense.</p>') +
      '<p class="t-xs muted" style="padding-top:6px">EMIs and SIPs are set on their loan or investment in Money.</p></div>' +
    // The assistant (ai.js) uses the family's own Gemini key, kept on this phone only.
    '<div class="card set"><h2>Assistant</h2><div class="row">' + img3d('spark', 26) + '<div class="grow">Gemini key<small>Talk or type to add entries and ask about your money</small></div>' +
      '<input class="field" type="password" id="aiKey" value="' + esc(load('fm.gemini', '')) + '" placeholder="Paste key" autocomplete="off" style="width:130px;text-align:left" aria-label="Gemini key"></div>' +
      '<p class="t-xs muted" style="padding-top:6px">Get a free key at aistudio.google.com. It stays on this phone. What you ask, and the numbers needed to answer, go to Google; on the free tier Google may use them to improve its products.</p>' +
      (load('fm.gemini', '') ? '<label class="swrow" style="margin-top:8px"><div class="grow"><b>Sounds</b><small>When the assistant starts and stops listening</small></div><input type="checkbox" class="sw" id="aiSfx"' + (load('fm.sfx', true) ? ' checked' : '') + '></label>' : '') + '</div>' +
    '<div class="card"><h2>Theme</h2>' + segHtml('theme', load('fm.theme', 'auto'), [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) + '</div>' +
    '<div class="card"><h2>Sheets on this phone</h2><div style="display:grid;gap:2px">' + sheetsHtml() + '</div></div>' +
    '<button type="button" class="btn soft" data-tab="cats">' + icon('pencil-simple', 'sm') + 'Edit categories</button>' +
    '<button type="button" class="btn soft" id="shareMonth">' + icon('share', 'sm') + 'Share this month on WhatsApp</button>';
}

// The active sheet's picture and name: in the sidebar on a wide screen, in the Home header on a phone. Either opens the list of sheets.
function renderHead() {
  var phoneHome = state.tab === 'home' && !wide.matches, me2 = sheetOf(P);
  $('#avatar').hidden = !phoneHome;
  $('#backHome').hidden = !(state.tab === 'cats' || state.tab === 'settings');
  $('#setBtn').hidden = state.tab === 'settings';
  $('#aiBtn').hidden = !load('fm.gemini', ''); // the assistant's orb in the tab bar, once a Gemini key is saved in Settings
  $('#headTitle').textContent = phoneHome ? me2.name : TABS[state.tab][1];
  $('#sideName').textContent = me2.name;
  ['#avatar', '#sideAv'].forEach(function (s) { $(s).style.background = 'var(' + (SHEET_PICS[me2.pic] || '--sky') + ')'; $(s + ' img').src = 'assets/3d/' + me2.pic + '.png'; });
  if (phoneHome) {
    $('#headTitle').insertAdjacentHTML('beforeend', icon('caret-right', 'sm dda'));
    $('#headSub').innerHTML = 'Namaste' + (me() ? ' ' + esc(me()) : '') + ' <img class="e" src="assets/3d/wave.png" width="16" height="16" alt="">';
  }
  $('#ddSheets').innerHTML = '<h4>Sheets on this phone</h4>' + sheetsHtml() +
    '<button type="button" class="opt" data-tab="settings"><span class="disc xs" style="background:var(--field)">' + img3d('spark', 22) + '</span>Settings: budgets, bills, focus</button>' +
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
  var v = view(), what = type === 'Income' ? 'income' : 'expense';
  var n = name ? v.rows.filter(function (e) { return e.type === type && e.category === name; }).length : 0;
  function done(to) {
    var err = queue('cat', action, null, { type: type, name: action === 'add' ? to : name, to: to });
    if (err) return toast(err, true);
    toast(action === 'add' ? 'Added ' + to : action === 'delete' ? 'Deleted ' + name : 'Renamed to ' + to);
    render();
    trySync();
  }
  if (action === 'delete') {
    return ask({ title: 'Delete ' + name + '?', text: n ? 'Its ' + n + (n === 1 ? ' entry moves' : ' entries move') + ' to Others.' : '', ok: 'Delete', danger: true }).then(function (yes) { if (yes) done(''); });
  }
  ask({ title: action === 'add' ? 'Name of the new ' + what + ' category' : 'Rename ' + name + ' to', input: name || '', ok: action === 'add' ? 'Add' : 'Rename', check: function (to) {
    if (!checkCatName(to)) return 'Start with a letter, use at most 30 characters, and leave out " * ? ~ < > =';
    var hit = matchName(v.cats[type], to);
    return hit && action === 'add' ? 'There is already an ' + what + ' category called ' + hit + '.' : '';
  } }).then(function (to) {
    if (!to || to === name) return;
    var hit = matchName(v.cats[type], to);
    if (hit && hit !== name) {
      return ask({ title: hit + ' already exists', text: 'Move ' + (n === 1 ? 'the 1 ' + name + ' entry' : 'all ' + n + ' ' + name + ' entries') + ' into ' + hit + '?', ok: 'Move them' }).then(function (yes) { if (yes) done(to); });
    }
    done(to);
  });
}

function render() {
  var v = view();
  $('#setup').hidden = !!load(K.cfg, null) && state.error !== 'wrong key';
  renderHead();
  renderSync();
  ({ home: renderHome, history: renderHistory, cats: renderCats, settings: renderSettings, loans: renderLoans, given: renderLoans, invested: renderLoans, insights: renderInsights })[state.tab](v);
}

// ---- One bottom sheet for every form: amount (the phone's own number pad), category, reason, date, and the loan's options
function amountValue() { return Number(state.amt) || 0; }
function amountText(a) {
  var parts = a.split('.');
  return '₹' + (Number(parts[0]) || 0).toLocaleString('en-IN') + (parts.length > 1 ? '.' + parts[1] : '');
}
function numberOf(s) { var n = Number(String(s || '').replace(/[,₹\s]/g, '')); return n > 0 && isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function dayOf(s) { var n = Number(String(s || '').trim()); return n === Math.floor(n) && n >= 1 && n <= 31 ? n : 0; }

// Digits and one dot, at most 9 digits before it and 2 after. Commas typed as thousands separators are dropped.
function cleanAmount(v) {
  var parts = String(v).replace(/[^\d.]/g, '').split('.');
  return parts[0].replace(/^0+(?=\d)/, '').slice(0, 9) + (parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, 2) : '');
}

function payLabel(dir, kind) { return { emi: 'Pay EMI', back: dir === 'borrowed' ? 'Pay back' : dir === 'given' ? 'Got back' : 'Withdraw', int: dir === 'borrowed' ? 'Pay interest' : 'Got interest', add: 'Add money' }[kind]; }
// The EMI split: this month's interest on what is owed is an expense, the rest pays the loan back.
function emiSplit(l, amount) {
  var r = l.interest > 0 ? l.interest / (l.per === 'year' ? 1200 : 100) : 0, interest = round2(l.owed * r);
  return { interest: interest, principal: round2(Math.min(l.owed, amount - interest)) };
}
function renderAmount() {
  var txt = state.amt ? amountText(state.amt) : '', sh = state.sheet;
  if ($('#amount').value !== state.amt) $('#amount').value = state.amt;
  var T = LOAN_TEXT[sh.dir || 'borrowed'];
  var label = { add: 'Save', edit: 'Save changes', 'loan-add': T.save, 'loan-edit': 'Save changes', repay: payLabel(sh.dir, sh.pay), bill: sh.id ? 'Save bill' : 'Add bill' }[sh.mode];
  $('#saveText').textContent = amountValue() > 0 && (sh.mode === 'add' || sh.mode === 'loan-add' || sh.mode === 'repay') ? label + ' ' + txt : label;
  if (sh.mode === 'repay') renderPayInfo();
}
function renderPayInfo() {
  var sh = state.sheet, l = sh.loan, a = amountValue(), t;
  if (sh.pay === 'emi') { var s = emiSplit(l, a); t = a ? '<b>' + money.format(s.interest) + '</b> interest (an expense) + <b>' + money.format(Math.max(0, s.principal)) + '</b> paid back. ' + money.format(round2(l.owed - Math.max(0, s.principal))) + ' left after this.' : 'This month\'s interest is about ' + money.format(s.interest) + '.'; }
  else if (sh.pay === 'int') t = sh.dir === 'given' ? 'It goes into <b>Income › Interest</b>. It doesn\'t lower the ' + money.format(l.owed) + ' still to get.' : '<b>Interest is a cost.</b> It goes into Expenses › Loan interest and doesn\'t lower the ' + money.format(l.owed) + ' you owe.';
  else if (sh.pay === 'add') t = 'Adds to it, like this month\'s SIP. It isn\'t an expense: it comes out of what you saved.';
  else t = sh.dir === 'invested' ? 'Takes money out. Worth now is about ' + money.format(Math.round(l.owed)) + '.' : 'Lowers the ' + money.format(l.owed) + (sh.dir === 'given' ? ' still to get.' : ' you owe.');
  $('#payInfo').innerHTML = t;
  $('#payInfo').hidden = false;
}

// Category grid: one tap.
function renderCat() {
  var sh = state.sheet, cats = view().cats[sh.type] || [], pend = sh.mode === 'loan-add' || sh.mode === 'loan-edit';
  $('#catGrid').innerHTML = (pend ? '<button type="button" class="cg" data-cat="" aria-pressed="' + !sh.category + '"><span class="disc" style="background:var(--blush)">' + img3d('bank', 28) + '</span>Cash loan</button>' : '') + cats.map(function (c) {
    return '<button type="button" class="cg" data-cat="' + esc(c) + '" aria-pressed="' + (sh.category === c) + '"><span class="disc" style="background:var(' + discOf(sh.type, c) + ')">' + img(c, 28) + '</span>' + esc(c) + '</button>';
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

// Header of the sheet: picture, title and the coloured pill under it.
function sheetHeader(picture, bg, title, pillCls, pillHtml) {
  $('#sheetDisc').style.background = 'var(' + bg + ')';
  $('#sheetImg').src = 'assets/3d/' + picture + '.png';
  $('#sheetTitle').textContent = title;
  $('#sheetKind').className = 'pill ' + pillCls;
  $('#sheetKind').innerHTML = pillHtml;
}

function entryHeader() {
  var sh = state.sheet, isIn = sh.type === 'Income', c = sh.category;
  if (sh.mode === 'bill') return sheetHeader(c ? pic(c) : 'cal', c ? discOf('Expense', c) : '--butter', sh.id ? 'Edit bill' : 'New bill', 'warn', img3d('cal', 14) + 'Reminder in Due soon');
  sheetHeader(c ? pic(c) : isIn ? 'up' : 'wings', c ? discOf(sh.type, c) : isIn ? '--mint' : '--blush', c || (isIn ? 'New income' : 'New expense'), isIn ? 'ok' : 'bad',
    icon(isIn ? 'arrow-down-left' : 'arrow-up-right', 'sm') + (isIn ? 'Income' : 'Expense'));
}

function localInputValue(d) {
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Today (default), Yesterday, or a picked date and time. Editing shows the saved one, ready to change.
function setWhen(dateTime) {
  var sh = state.sheet;
  sh.day = 0;
  $('#when').value = localInputValue(dateTime ? new Date(dateTime) : new Date());
  $('#whenBox').hidden = !dateTime;
  renderDay();
}
function renderDay() {
  var picked = !$('#whenBox').hidden;
  document.querySelectorAll('#dateChips [data-day]').forEach(function (b) { b.setAttribute('aria-pressed', String(!picked && Number(b.dataset.day) === state.sheet.day)); });
  $('#changeWhen').setAttribute('aria-pressed', String(picked));
}
function renderQuick() {
  var sh = state.sheet, chips = [];
  if (sh.mode === 'repay') {
    var l = sh.loan, x = view().settings.loans[l.id] || {};
    if (sh.pay === 'back' && sh.dir !== 'invested') chips.unshift('<button type="button" class="chip dark" data-set="' + l.owed + '">Full ' + esc(money.format(l.owed)) + '</button>');
    if (sh.pay === 'int' && l.monthly) chips.unshift('<button type="button" class="chip dark" data-set="' + Math.round(l.monthly) + '">This month ' + esc(money.format(Math.round(l.monthly))) + '</button>');
    if (sh.pay === 'emi' && x.emi) chips = ['<button type="button" class="chip dark" data-set="' + x.emi + '">EMI ' + esc(money.format(x.emi)) + '</button>'];
    if (sh.pay === 'add' && x.sip) chips.unshift('<button type="button" class="chip dark" data-set="' + x.sip + '">This month ' + esc(money.format(x.sip)) + '</button>');
  }
  $('#quick').innerHTML = chips.join('');
  $('#quick').hidden = !chips.length;
}
function renderPaySeg() {
  var sh = state.sheet, l = sh.loan, x = view().settings.loans[l.id] || {}, kinds;
  if (sh.dir === 'borrowed') kinds = x.emi ? ['emi', 'back'] : ['back'].concat(l.interest > 0 ? ['int'] : []); // an EMI carries the interest
  else if (sh.dir === 'given') kinds = ['back'].concat(l.interest > 0 ? ['int'] : []);
  else kinds = ['add', 'back'];
  if (kinds.indexOf(sh.pay) < 0) sh.pay = kinds[0];
  $('#paySeg').hidden = kinds.length < 2;
  $('#paySeg').innerHTML = kinds.map(function (k) { return '<button type="button" data-paykind="' + k + '" aria-pressed="' + (k === sh.pay) + '">' + (k === 'emi' ? 'EMI' : payLabel(sh.dir, k)) + '</button>'; }).join('');
  var T = LOAN_TEXT[sh.dir];
  sheetHeader(sh.dir === 'invested' ? 'up' : T.pic, T.color, l.reason, T.pill, (sh.dir === 'invested' ? 'Worth about ' + money.format(Math.round(l.owed)) : esc(money.format(l.owed)) + T.left2));
}

function openSheet(sh, values) {
  values = values || {};
  state.sheet = sh;
  state.amt = values.amount ? String(Math.abs(values.amount)) : '';
  var mode = sh.mode, isEntry = mode === 'add' || mode === 'edit', isLoan = mode === 'loan-add' || mode === 'loan-edit', isPay = mode === 'repay', isBill = mode === 'bill', T = LOAN_TEXT[sh.dir || 'borrowed'];
  if (isEntry || isBill) entryHeader();
  else if (isLoan) sheetHeader(T.pic, T.color, mode === 'loan-add' ? T.newTitle : T.editTitle, T.pill, icon(T.kindIcon, 'sm') + T.kind);
  $('#paySeg').hidden = true;
  $('#payInfo').hidden = true;
  if (isPay) renderPaySeg();
  var pend = isLoan && (sh.dir || 'borrowed') === 'borrowed'; // a pending picks its expense category, or Cash loan
  if (pend) { sh.type = 'Expense'; sh.category = sh.category || ''; }
  $('#catGrid').hidden = !(isEntry || isBill || pend);
  if (isEntry || isBill || pend) renderCat();
  $('#noteBox').hidden = isPay;
  var words = isLoan ? [T.label, T.ph] : isBill ? ['Bill name', 'e.g. Rent, Electricity, LIC'] : ENTRY_NOTE[sh.type] || ['', ''];
  $('#noteLabel').textContent = words[0];
  $('#note').placeholder = words[1];
  $('#note').value = values.note || '';
  $('#deleteBtn').hidden = !(mode === 'edit' || mode === 'loan-edit' || (isBill && sh.id));
  $('#deleteText').textContent = mode === 'edit' ? 'Delete entry' : isBill ? 'Delete bill' : 'Delete';
  $('#err').textContent = '';
  $('#dateChips').hidden = isBill || mode === 'edit' || mode === 'loan-edit';
  setWhen(mode === 'edit' || mode === 'loan-edit' ? values.dateTime : null);
  $('#billBox').hidden = !isBill;
  if (isBill) { $('#billDay').value = values.day || ''; sh.every = values.every || 1; renderEvery(); }
  $('#loanOpts').hidden = !isLoan;
  if (isLoan) loanOpts(values);
  renderQuick();
  renderAmount();
  var by = values.by || (mode === 'add' ? me() : '');
  $('#byLine').textContent = isEntry ? (by ? 'Added by ' + by : mode === 'add' ? 'Put your name in Settings to show who added it' : '') : '';
  $('#sheet').showModal();
  lockPage(true);
  // New things start at the name (a payment, which has none, at the amount); editing keeps the keyboard down so the form stays visible.
  if (mode === 'edit' || mode === 'loan-edit' || (isBill && sh.id)) $('#saveBtn').focus();
  else if (!isPay && !$('#note').value) $('#note').focus();
  else $('#amount').focus();
}
function renderEvery() { document.querySelectorAll('#everySeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.every) === state.sheet.every)); }); }

// A loan's own options: interest for all three; EMI and "Pay this first" for a loan; type, SIP and goal for an investment.
function loanOpts(values) {
  var sh = state.sheet, T = LOAN_TEXT[sh.dir], x = values.x || {};
  $('#rate').value = values.interest || '';
  sh.per = values.per || T.per;
  sh.priority = values.priority || 'medium';
  sh.compound = values.compound !== false;
  sh.type = x.type || '';
  $('#typeBox').hidden = $('#compBox').hidden = $('#sipBox').hidden = $('#goalBox').hidden = sh.dir !== 'invested';
  // A pending is kept simple: no interest or "before this month" to fill in (one an old pending has stays as it was)
  $('#rateBox').hidden = $('#oldBox').hidden = sh.dir === 'borrowed';
  $('#sip').value = x.sip || '';
  $('#sipDay').value = sh.dir === 'invested' ? x.day || '' : '';
  $('#goal').value = x.goal || '';
  $('#goalBy').value = x.goalBy || '';
  $('#old').checked = !!x.old;
  $('#oldTitle').textContent = { borrowed: 'Owed before this month', given: 'Given before this month', invested: 'I already had this before' }[sh.dir];
  $('#oldText').textContent = sh.dir === 'invested' ? 'Not counted as money put in this month: its value today' : 'Not counted as this month\'s money';
  $('#rateLabel').textContent = T.rate;
  renderRate();
}

function renderRate() {
  var r = Number($('#rate').value.replace(',', '.')) || 0, sh = state.sheet;
  document.querySelectorAll('[data-per]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.per === sh.per)); });
  document.querySelectorAll('[data-comp]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.comp === 'compound') === sh.compound)); });
  $('#rateChips').innerHTML = LOAN_TEXT[sh.dir || 'borrowed'].rates.map(function (x) {
    return '<button type="button" class="chip" data-rate="' + x + '" aria-pressed="' + (x === r) + '">' + (x ? x + '%' : 'No interest') + '</button>';
  }).join('');
  $('#invTypes').innerHTML = Object.keys(INVEST).map(function (k) {
    return '<button type="button" class="chip" data-itype="' + k + '" aria-pressed="' + (k === sh.type) + '">' + esc(INVEST[k].name) + '</button>';
  }).join('');
}

function findById(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

function openEdit(id) {
  var e = findById(view().rows, id);
  if (e) openSheet({ mode: 'edit', type: e.type, category: e.category, id: e.id }, e);
}

function openLoanEdit(id) {
  var v = view(), l = findById(v.loans, id);
  if (l) openSheet({ mode: 'loan-edit', id: l.id, dir: loanDir(l), category: (v.settings.loans[l.id] || {}).cat || '' }, { amount: l.amount, note: l.reason, dateTime: l.dateTime, interest: l.interest, per: l.per, priority: l.priority, compound: l.compound, x: v.settings.loans[l.id] });
}

function openRepay(id, kind) {
  var v = view(), l = findById(summarizeLoans(v.loans, v.repays, null, null, new Date()).loans, id), x;
  if (!l) return;
  x = v.settings.loans[id] || {};
  kind = kind || (l.dir === 'borrowed' && x.emi ? 'emi' : l.dir === 'invested' ? 'add' : 'back');
  var amount = kind === 'emi' ? x.emi : kind === 'int' ? Math.round(l.monthly) : kind === 'add' ? x.sip : 0;
  openSheet({ mode: 'repay', loan: l, dir: l.dir, pay: kind }, { amount: amount });
}
function openBill(id) {
  var b = id && view().settings.bills[id];
  openSheet({ mode: 'bill', type: 'Expense', category: b ? b.category : '', id: id || '' }, b ? { amount: b.amount, note: b.name, day: b.day, every: b.every } : {});
}

function saveSheet(ev) {
  ev.preventDefault();
  var sh = state.sheet, amount = Math.round(amountValue() * 100) / 100, reason = $('#note').value.trim(), T = LOAN_TEXT[sh.dir || 'borrowed'];
  var err = function (t, el) { $('#err').textContent = t; if (el) el.focus(); };
  if ((sh.mode === 'add' || sh.mode === 'edit' || sh.mode === 'bill') && !sh.category) return err('Choose a category');
  if (!(amount > 0)) return err('Type the amount');
  if ((sh.mode === 'add' || sh.mode === 'edit') && !reason) return err(ENTRY_NOTE[sh.type][2], $('#note'));
  if ((sh.mode === 'loan-add' || sh.mode === 'loan-edit') && !reason) return err(T.need, $('#note'));
  if (sh.mode === 'bill' && !reason) return err('Give the bill a name', $('#note'));
  var dt = !$('#whenBox').hidden ? new Date($('#when').value) : new Date(Date.now() - (sh.day || 0) * 864e5);
  if (isNaN(dt)) return err('Pick a valid date and time');
  var when = dt.toISOString(), now = new Date().toISOString(), id = sh.id || crypto.randomUUID(), bad = '', msg, v = view();

  if (sh.mode === 'add' || sh.mode === 'edit') {
    var old = sh.mode === 'edit' ? findById(v.rows, id) : null, by = old ? old.by : me();
    var e = { id: id, dateTime: when, type: sh.type, category: sh.category, amount: amount, note: reason, createdAt: now };
    if (by) e.by = by;
    bad = validateEntry(e) || queue('entry', sh.mode === 'add' ? 'add' : 'update', id, e);
    if (!bad && sh.bill && v.settings.bills[sh.bill]) { var bl = v.settings.bills[sh.bill]; setOp('bill', Object.assign({}, bl, { next: addMonths(bl.next, bl.every) }), sh.bill); }
    msg = sh.mode === 'add' ? 'Saved ' + money.format(amount) : 'Changes saved';
  } else if (sh.mode === 'bill') {
    var billDay = dayOf($('#billDay').value), today = new Date();
    if (!billDay) return err('Type the day of the month it is due (1–31)', $('#billDay'));
    var prevBill = sh.id ? v.settings.bills[sh.id] : null;
    var next = prevBill ? prevBill.next : billDay >= today.getDate() ? monthKey(today) : addMonths(monthKey(today), 1);
    bad = setOp('bill', { name: reason.slice(0, 40), category: sh.category, amount: amount, day: billDay, every: sh.every || 1, next: next }, id);
    msg = sh.id ? 'Bill saved' : 'Bill added';
  } else if (sh.mode === 'repay') {
    var l = sh.loan, x = v.settings.loans[l.id] || {};
    if (sh.pay === 'back' && sh.dir !== 'invested' && amount > l.owed) return err('That is more than the ' + money.format(l.owed) + T.over);
    if (sh.pay === 'int') {
      var type = sh.dir === 'given' ? 'Income' : 'Expense', cat = ensureCat(type, sh.dir === 'given' ? INTEREST : LOAN_INTEREST), ie = { id: crypto.randomUUID(), dateTime: when, type: type, category: cat, amount: amount, note: l.reason, createdAt: now };
      if (me()) ie.by = me();
      bad = validateEntry(ie) || queue('entry', 'add', ie.id, ie);
      if (!bad && (!x.paid || x.paid < monthKey(dt))) setOp('loan', Object.assign({}, x, { paid: monthKey(dt) }), l.id);
      msg = (sh.dir === 'given' ? 'Interest received ' : 'Interest paid ') + money.format(amount);
    } else if (sh.pay === 'emi') {
      var split = emiSplit(l, amount);
      if (split.principal <= 0) return err('The EMI is less than this month\'s interest (' + money.format(split.interest) + ')');
      if (split.interest > 0) {
        var c2 = ensureCat('Expense', LOAN_INTEREST), ee = { id: crypto.randomUUID(), dateTime: when, type: 'Expense', category: c2, amount: split.interest, note: l.reason + ' (EMI interest)', createdAt: now };
        if (me()) ee.by = me();
        bad = validateEntry(ee) || queue('entry', 'add', ee.id, ee);
      }
      var rp = { id: id, loanId: l.id, dateTime: when, amount: split.principal, createdAt: now };
      bad = bad || validateRepay(rp) || queue('repay', 'add', id, rp);
      msg = 'EMI paid ' + money.format(amount);
    } else {
      var r = { id: id, loanId: l.id, dateTime: when, amount: sh.pay === 'add' ? -amount : amount, createdAt: now };
      // Paying back a pending with a category is also an expense in it, id '<payment id>-paid' (ids are unique across the sheet);
      // deleting the payment deletes it too.
      if (sh.dir === 'borrowed' && sh.pay === 'back' && x.cat) {
        var pe = { id: id + '-paid', dateTime: when, type: 'Expense', category: ensureCat('Expense', x.cat), amount: amount, note: l.reason + ' (pending paid)', createdAt: now };
        if (me()) pe.by = me();
        bad = validateEntry(pe) || queue('entry', 'add', pe.id, pe);
      }
      bad = bad || validateRepay(r) || queue('repay', 'add', id, r);
      msg = (sh.pay === 'add' ? 'Added ' : T.paid) + money.format(amount);
    }
  } else {
    var rateIn = $('#rate').value.trim().replace(',', '.').replace('%', ''), rate = rateIn === '' ? 0 : Number(rateIn);
    if (!(rate >= 0 && rate <= 100)) return err('Interest must be a number from 0 to 100', $('#rate'));
    var extras = {}, prev = v.settings.loans[id] || {};
    if (sh.dir === 'borrowed') {
      ['emi', 'day', 'star'].forEach(function (k) { if (prev[k]) extras[k] = prev[k]; }); // no longer asked; an old pending keeps them
      if (sh.category) extras.cat = sh.category;
    } else if (sh.dir === 'invested') {
      if ($('#sipDay').value.trim() && !dayOf($('#sipDay').value)) return err('The day is 1 to 31', $('#sipDay'));
      if (sh.type) extras.type = sh.type;
      if (numberOf($('#sip').value)) extras.sip = numberOf($('#sip').value);
      if (dayOf($('#sipDay').value)) extras.day = dayOf($('#sipDay').value);
      if (numberOf($('#goal').value)) extras.goal = numberOf($('#goal').value);
      if (/^\d{4}-\d{2}$/.test($('#goalBy').value)) extras.goalBy = $('#goalBy').value;
    } else if (prev.day) extras.day = prev.day;
    if (prev.paid) extras.paid = prev.paid;
    if ($('#old').checked) extras.old = true;
    var loan = { id: id, dateTime: when, reason: reason, amount: amount, interest: round2(rate), per: sh.per, priority: sh.priority, dir: sh.dir, createdAt: now };
    if (sh.dir === 'invested') loan.compound = sh.compound;
    bad = validateLoan(loan) || queue('loan', sh.mode === 'loan-add' ? 'add' : 'update', id, loan);
    if (!bad && JSON.stringify(extras) !== JSON.stringify(prev)) setOp('loan', Object.keys(extras).length ? extras : null, id);
    msg = sh.mode === 'loan-add' ? T.saved : 'Changes saved';
  }
  if (bad) return err(bad);
  $('#sheet').close();
  toast(msg);
  render();
  trySync();
}

function deleteFromSheet() {
  var sh = state.sheet, isLoan = sh.mode === 'loan-edit', T = LOAN_TEXT[sh.dir || 'borrowed'];
  var count = isLoan ? view().repays.filter(function (r) { return r.loanId === sh.id; }).length : 0;
  var q = sh.mode === 'bill' ? 'Delete this bill?' : isLoan ? 'Delete ' + T.what + (count ? ' and its ' + count + ' ' + T.payments[count === 1 ? 0 : 1] : '') + '?' : 'Delete this entry?';
  ask({ title: q, ok: 'Delete', danger: true }).then(function (yes) {
    if (!yes) return;
    var err = sh.mode === 'bill' ? setOp('bill', null, sh.id) : queue(isLoan ? 'loan' : 'entry', 'delete', sh.id);
    if (err) { $('#err').textContent = err; return; }
    $('#sheet').close();
    toast(sh.mode === 'bill' ? 'Bill deleted' : isLoan ? T.deleted : 'Entry deleted');
    render();
    trySync();
  });
}

function showTab(tab) {
  if (tab === 'money') { var v = view(); tab = state.out || (focusOf(v.loans, v.repays, v.settings, new Date()) === 'grow' && !loansOf(v, 'borrowed').length ? 'invested' : 'loans'); }
  state.tab = tab;
  if (MONEY_TABS[tab]) state.out = tab;
  document.querySelectorAll('.nav button[data-tab]').forEach(function (b) {
    // Settings and Categories open from Home
    var on = b.dataset.tab === tab || (b.dataset.tab === 'money' && !!MONEY_TABS[tab]) || (b.dataset.tab === 'home' && (tab === 'cats' || tab === 'settings'));
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    b.querySelector('use').setAttribute('href', '#i-' + TABS[b.dataset.tab][0] + (on ? '-fill' : ''));
  });
  ['home', 'history', 'cats', 'settings', 'loans', 'insights'].forEach(function (id) { $('#' + id).hidden = id !== (MONEY_TABS[tab] ? 'loans' : tab); });
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
// The name, then the amount; "done" on the number pad puts the keyboard away while a category is still to pick, else saves.
$('#note').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('#amount').focus(); } });
$('#amount').addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && !$('#catGrid').hidden && !state.sheet.category && state.sheet.mode !== 'loan-add' && state.sheet.mode !== 'loan-edit') { ev.preventDefault(); this.blur(); }
});
// Keep the field being typed in above the phone keyboard: only the sheet scrolls (scrollIntoView moved the whole page on iOS
// when the sheet had little room to scroll, as in Give money), the field going about 90px below the top of what is visible.
$('#sheet').addEventListener('focusin', function (ev) {
  if (ev.target.tagName !== 'INPUT') return;
  setTimeout(function () {
    var d = $('#sheet'), top = Math.max(window.visualViewport ? visualViewport.offsetTop : 0, d.getBoundingClientRect().top) + 90;
    d.scrollTo({ top: d.scrollTop + ev.target.getBoundingClientRect().top - top, behavior: 'smooth' });
  }, 300);
});
// With the keyboard up, the open sheet is fitted into what is left above it, so the sheet scrolls and not the page (iOS keeps
// dvh at the full screen, which left Give money's lower half under the keyboard with nothing of its own to scroll).
function fitSheet() {
  var vv = window.visualViewport, kb = vv ? innerHeight - vv.height - vv.offsetTop : 0;
  ['#sheet', '#ask'].forEach(function (id) {
    var d = $(id), on = d.open && kb > 80;
    d.style.maxHeight = on ? vv.height - 8 + 'px' : '';
    d.style.marginBottom = on ? kb + 'px' : '';
  });
}
if (window.visualViewport) ['resize', 'scroll'].forEach(function (e) { visualViewport.addEventListener(e, fitSheet); });
['#sheet', '#ask'].forEach(function (id) { $(id).addEventListener('close', function () { lockPage(false); fitSheet(); }); });

document.addEventListener('click', function (ev) {
  closeDDs(ev.target); // a tap outside an open dropdown closes it
  // On Home the sheet's name works like its picture: both open the list of sheets
  var t = !$('#avatar').hidden && ev.target.closest('#headText') ? $('#avatar') : ev.target.closest('button');
  if (!t) return;
  var d = t.dataset;
  if (d.new) openSheet(d.new === 'Pending' ? { mode: 'loan-add', dir: 'borrowed' } : { mode: 'add', type: d.new, category: '' });
  else if (t.hasAttribute('aria-controls')) {
    var open = t.getAttribute('aria-expanded') !== 'true';
    closeDDs();
    t.parentNode.appendChild(document.getElementById(t.getAttribute('aria-controls'))); // the sheets list has two buttons (header, sidebar): open it under this one
    toggleDD(t, open);
  }
  else if (d.f) {
    if (d.f === 'when') { state.f.year = d.v.split('-')[0]; state.f.month = d.v.split('-')[1]; } else state.f[d.f] = d.v;
    closeDDs(); renderHistory(view());
  }
  else if (d.catf) {
    var start = periodRange(state.view, state.date).start;
    state.f = { q: '', year: state.view === 'all' ? '' : String(start.getFullYear()), month: state.view === 'month' ? String(start.getMonth()) : '', cat: d.catf, who: '' };
    $('#q').value = '';
    showTab('history');
  }
  else if (t.id === 'hClear') { state.f = { q: '', year: '', month: '', cat: '', who: '' }; $('#q').value = ''; renderHistory(view()); }
  else if (t.id === 'qClear') { state.f.q = ''; $('#q').value = ''; renderHistory(view()); $('#q').focus(); }
  else if (t.id === 'hShare') shareHistory();
  else if (t.id === 'insShare' || t.id === 'shareMonth') shareSummary();
  else if (d.set) { state.amt = d.set; renderAmount(); }
  else if (t.hasAttribute('data-cat') && t.closest('#catGrid')) {
    var m0 = state.sheet.mode;
    state.sheet.category = d.cat; $('#err').textContent = ''; renderCat();
    if (m0 !== 'loan-add' && m0 !== 'loan-edit') entryHeader();
    if (!$('#noteBox').hidden && !$('#note').value.trim()) $('#note').focus(); else if (!state.amt) $('#amount').focus();
  }
  else if (d.paykind) { state.sheet.pay = d.paykind; var lx = view().settings.loans[state.sheet.loan.id] || {}, l2 = state.sheet.loan; state.amt = String(d.paykind === 'emi' ? lx.emi || '' : d.paykind === 'int' ? Math.round(l2.monthly) || '' : d.paykind === 'add' ? lx.sip || '' : ''); renderPaySeg(); renderQuick(); renderAmount(); }
  else if (t.hasAttribute('data-day')) { state.sheet.day = Number(d.day); $('#whenBox').hidden = true; renderDay(); }
  else if (t.id === 'changeWhen') { $('#whenBox').hidden = false; renderDay(); $('#when').focus(); }
  else if (d.every) { state.sheet.every = Number(d.every); renderEvery(); }
  else if (d.itype) { var it = INVEST[d.itype]; state.sheet.type = d.itype; $('#rate').value = it.rate; state.sheet.per = 'year'; state.sheet.compound = it.compound; renderRate(); }
  else if (d.edit) openEdit(d.edit);
  else if (d.loanEdit) openLoanEdit(d.loanEdit);
  else if (d.pay) openRepay(d.pay, d.kind);
  else if (d.due) {
    var it2 = state.due[Number(d.due)];
    if (it2.kind === 'bill') openSheet({ mode: 'add', type: 'Expense', category: it2.category, bill: it2.id }, { amount: it2.amount, note: it2.name });
    else openRepay(it2.id, { emi: 'emi', sip: 'add', int: 'int' }[it2.kind]);
  }
  else if (d.ntAct) noteAct(t, d.ntAct);
  else if (d.again) { var g = state.again2[Number(d.again)]; openSheet({ mode: 'add', type: g.type, category: g.category }, { amount: g.amount, note: g.note }); }
  else if (d.delRepay) { ask({ title: 'Delete this payment?', ok: 'Delete', danger: true }).then(function (yes) { if (yes) { queue('repay', 'delete', d.delRepay); if (findById(view().rows, d.delRepay + '-paid')) queue('entry', 'delete', d.delRepay + '-paid'); toast('Payment deleted'); render(); trySync(); } }); }
  else if (d.sheet) { if (d.sheet !== P) useSheet(d.sheet); else closeDDs(); }
  else if (d.sren) renameSheet(d.sren);
  else if (d.sdel) removeSheet(d.sdel);
  else if (t.id === 'addSheet') { ask({ title: 'Name for the new sheet', input: 'Sheet ' + (sheets().length + 1), ok: 'Add' }).then(function (name) { if (name) useSheet(addSheet(name.slice(0, 40))); }); }
  else if (t.id === 'editCats') { closeDDs(); showTab('cats'); }
  else if (d.cadd) editCat('add', d.cadd);
  else if (d.cren) editCat('rename', d.ctype, d.cren);
  else if (d.cdel) editCat('delete', d.ctype, d.cdel);
  else if (d.focus) { if (!setOp('focus', d.focus)) { render(); trySync(); } }
  else if (d.theme) { save('fm.theme', d.theme); if (d.theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = d.theme; render(); }
  else if (t.id === 'addBill') openBill('');
  else if (t.id === 'setBudget') ask({ title: 'Monthly budgets', html: budgetsHtml(view()), ok: 'Done', text: 'Everyday spending is one total for every category without a bill: Home shows what is left to spend each day. ' +
    'A category can also have its own limit: Insights warns when it goes over. Leave blank for none.' }).then(function () { render(); });
  else if (t.id === 'setGoal') askSetting('goal', 'Savings goal', 'All your investments count toward it. Change it any time in Settings.', view().settings.goal, 'Goal saved');
  else if (d.bill) openBill(d.bill);
  else if (d.tab) { closeDDs(); showTab(d.tab); }
  else if (d.per) { state.sheet.per = d.per; renderRate(); }
  else if (d.comp) { state.sheet.compound = d.comp === 'compound'; renderRate(); }
  else if (t.hasAttribute('data-rate')) { $('#rate').value = d.rate === '0' ? '' : d.rate; renderRate(); }
  else if (d.view) { state.view = d.view; state.date = new Date(); render(); }
  else if (t.id === 'prev' || t.id === 'next') { state.date = shiftPeriod(state.view, state.date, t.id === 'prev' ? -1 : 1); render(); }
  else if (t.id === 'addLoan') openSheet({ mode: 'loan-add', dir: tabDir() });
  else if (t.id === 'backHome') showTab(state.tab === 'cats' ? 'settings' : 'home');
  else if (t.id === 'deleteBtn') deleteFromSheet();
  else if (t.id === 'cancel') $('#sheet').close();
  else if (t.id === 'askCancel') answer(null);
  else if (t.id === 'syncBtn') trySync();
});

// Settings: typed values are saved when the field is left (or Enter on a phone keyboard).
document.addEventListener('change', function (ev) {
  var t = ev.target;
  if (t.id === 'meName') { save('fm.me', t.value.trim().slice(0, 30)); toast('Saved'); render(); }
  else if (t.id === 'aiKey') { save('fm.gemini', t.value.trim()); toast(t.value.trim() ? 'Assistant on: tap Ask' : 'Assistant off'); render(); }
  else if (t.id === 'goalIn') { if (!setOp('goal', numberOf(t.value))) { toast('Goal saved'); render(); trySync(); } }
  else if (t.hasAttribute('data-daily')) { if (!setOp('daily', numberOf(t.value))) { toast('Budget saved'); trySync(); } }
  else if (t.hasAttribute('data-nti')) { var n = findById(notes(), t.closest('[data-nt]').dataset.nt); if (n) { n.items[Number(t.dataset.nti)].done = t.checked; if (!queue('note', 'update', n.id, n)) { render(); trySync(); } } }
  else if (t.id === 'aiSfx') { save('fm.sfx', t.checked); toast(t.checked ? 'Sounds on' : 'Sounds off'); }
  else if (t.hasAttribute('data-budget')) { if (!setOp('budget', numberOf(t.value), t.dataset.budget)) { toast('Budget saved'); trySync(); } }
});
$('#askForm').addEventListener('submit', function (ev) { ev.preventDefault(); answer(true); });
$('#ask').addEventListener('cancel', function (ev) { ev.preventDefault(); answer(null); });
$('#rate').addEventListener('input', renderRate);
$('#q').addEventListener('input', function () { state.f.q = this.value; renderHistory(view()); });
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('#sheet').open && !$('#ask').open) closeDDs(); });
$('#note').addEventListener('input', function () { $('#err').textContent = ''; });
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
