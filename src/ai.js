// The assistant (optional): talk or type to add entries and ask about the money, through Gemini Live with the family's own key
// (Settings, saved on this phone only as fm.gemini). The model never saves anything itself: an add_ call opens a card the user
// checks and saves, through the same checks and queue() as the app's own form. Numbers come from shared.js, never from the model.
// One function scope, so nothing here clashes with app.js; it uses app.js and shared.js functions directly.
(function () {
  var URL_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
  var MODEL = 'gemini-3.8-live';
  function key() { return load('fm.gemini', ''); }
  function data() { var v = view(); v.cats = v.cats || CATEGORIES; return v; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseDay(s, after) { var d = s ? new Date(s + 'T00:00:00') : null; if (d && after) d.setDate(d.getDate() + 1); return d && !isNaN(d) ? d : null; }
  function num(s) { return Number(String(s == null ? '' : s).replace(/,/g, '')); }
  var dm = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

  // ---- Tools. Reads run the app's own maths (the model never adds numbers up); writes wait for the user's Save.
  var DECLS = [
    { name: 'add_entry', description: 'Prepare a new income or expense. The user sees it on a card and must tap Save.',
      parameters: { type: 'OBJECT', properties: { type: { type: 'STRING', enum: ['Income', 'Expense'] }, category: { type: 'STRING', description: 'One of the existing categories for that type' },
        amount: { type: 'NUMBER', description: 'Rupees' }, note: { type: 'STRING', description: 'Short reason, in the user\'s words' }, date: { type: 'STRING', description: 'YYYY-MM-DD, default today' } }, required: ['type', 'amount'] } },
    { name: 'add_bill', description: 'Prepare a repeating bill (rent, electricity, LIC...). The user must tap Save.',
      parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, category: { type: 'STRING', description: 'An expense category' }, amount: { type: 'NUMBER' },
        day: { type: 'INTEGER', description: 'Day of the month it is due, 1-31' }, every: { type: 'INTEGER', description: 'Every how many months: 1, 3, 6 or 12' } }, required: ['name', 'amount'] } },
    { name: 'add_loan', description: 'Prepare money borrowed or owed (pending), given (lent to someone), or invested (FD, RD, SIP, gold...). The user must tap Save.',
      parameters: { type: 'OBJECT', properties: { dir: { type: 'STRING', enum: DIRS }, reason: { type: 'STRING', description: 'Who or what, e.g. "Ramesh" or "SBI FD"' }, amount: { type: 'NUMBER' },
        interest: { type: 'NUMBER', description: 'Percent' }, per: { type: 'STRING', enum: ['month', 'year'] } }, required: ['dir', 'reason', 'amount'] } },
    { name: 'query_entries', description: 'Totals and the latest matching entries from the history. Use for any question about past income or spending.',
      parameters: { type: 'OBJECT', properties: { type: { type: 'STRING', enum: ['Income', 'Expense'] }, category: { type: 'STRING' },
        from: { type: 'STRING', description: 'YYYY-MM-DD, inclusive' }, to: { type: 'STRING', description: 'YYYY-MM-DD, inclusive' }, text: { type: 'STRING', description: 'Words to find in notes' } } } },
    { name: 'overview', description: 'This month vs last month, spending by category, budgets and money left to spend, bills, loans, investments, net worth, average monthly saving.' }
  ];
  var BUSY = { query_entries: 'Checking your history…', overview: 'Looking at your month…', add_entry: 'Preparing it…', add_bill: 'Preparing it…', add_loan: 'Preparing it…' };
  var TOOLS = {
    query_entries: function (a) {
      var v = data(), cats = v.cats;
      var type = a.type || (a.category && !matchName(cats.Expense, a.category) && matchName(cats.Income, a.category) ? 'Income' : 'Expense');
      var cat = a.category ? matchName(cats[type], a.category) : '';
      if (a.category && !cat) return { error: 'There is no category called ' + a.category, categories: cats };
      var from = parseDay(a.from) || new Date(2000, 0, 1), to = parseDay(a.to, true) || new Date(2100, 0, 1);
      var list = filterEntries(v.rows, { cat: cat ? type + '-' + cat : a.type || '', q: a.text }).filter(function (e) { var d = new Date(e.dateTime); return d >= from && d < to; });
      var t = totals(list, from, to);
      return { category: cat || undefined, income: t.income, expense: t.expense, saved: t.savings, spentByCategory: t.spent, count: list.length,
        latest: list.slice(0, 20).map(function (e) { return { date: ymd(new Date(e.dateTime)), type: e.type, category: e.category, amount: e.amount, note: e.note }; }) };
    },
    overview: function () {
      var v = data(), now = new Date(), y = now.getFullYear(), m = now.getMonth(), b = budgetStatus(v.rows, v.settings, v.cats, now);
      return { thisMonth: totals(v.rows, new Date(y, m, 1), new Date(y, m + 1, 1)), lastMonth: totals(v.rows, new Date(y, m - 1, 1), new Date(y, m, 1)),
        leftToSpend: b.daily, overBudget: b.over, budgets: v.settings.budgets, bills: Object.keys(v.settings.bills).map(function (id) { return v.settings.bills[id]; }),
        loansAndInvestments: summarizeLoans(v.loans, v.repays, null, null, now).loans.map(function (l) { return { name: l.reason, kind: l.dir, amount: l.amount, owedOrWorthNow: l.owed, interest: l.interest + '% per ' + l.per, done: l.done }; }),
        netWorth: netWorth(v.loans, v.repays, Date.now()), avgMonthlySavingLast3Months: savingRate(v.rows, now, 3).perMonth };
    },
    add_entry: function (a) { return confirmCard('add_entry', a); },
    add_bill: function (a) { return confirmCard('add_bill', a); },
    add_loan: function (a) { return confirmCard('add_loan', a); }
  };

  // ---- Words that blur in one by one (headline, the user's words, the answer in the card). Streaming text only adds words.
  function setWords(el, text) {
    if (el._fading) { el._next = text; return; }
    var words = text.trim() ? text.trim().split(/\s+/) : [], sp = el._w || (el._w = []), start = sp.length;
    while (sp.length > words.length) { var s = sp.pop(); if (s.nextSibling) s.nextSibling.remove(); s.remove(); }
    words.forEach(function (word, i) {
      if (i < sp.length) { if (sp[i].textContent !== word) sp[i].textContent = word; return; }
      var n = document.createElement('span');
      n.className = 'ai-w';
      n.style.setProperty('--i', Math.min(i - start, 18));
      n.textContent = word;
      el.appendChild(n);
      el.appendChild(document.createTextNode(' '));
      sp.push(n);
    });
    if (el.id === 'aiBig') el.className = 'ai-big' + (text.length > 150 ? ' ai-longer' : text.length > 60 ? ' ai-long' : '');
  }
  function fadeTo(el, text) {
    if (!el._w || !el._w.length) { el._fading = false; setWords(el, text); return; }
    el._next = text;
    if (el._fading) return;
    el._fading = true;
    el.classList.add('ai-fading');
    setTimeout(function () { el._fading = false; el.classList.remove('ai-fading'); el._w = []; el.textContent = ''; setWords(el, el._next); }, 260);
  }

  // ---- Screen state
  var lastAsk = '', userNew = true, aiText = '', aiOn = null, newTurn = true, lastRead = null, readTimer = 0, pending = null, noteTimer;
  function greet() {
    fadeTo($('#aiHi'), 'Hello' + (me() ? ' ' + me() : ''));
    fadeTo($('#aiBig'), 'How can I help you today?');
    $('#aiSugg').classList.remove('ai-gone');
    aiOn = null;
  }
  function busy(t) { $('#aiBusy').textContent = t; $('#aiPill').classList.add('ai-busy'); }
  function unbusy() { $('#aiPill').classList.remove('ai-busy'); }
  function note(t) { var n = $('#aiNote'); n.textContent = t; n.classList.add('ai-on'); clearTimeout(noteTimer); noteTimer = setTimeout(function () { n.classList.remove('ai-on'); }, 4000); }
  function fail(e) { note(e.message || String(e)); unbusy(); }
  function cardOn() { return $('#aiCard').classList.contains('ai-on'); }
  function userSaid(text, fresh) {
    if (fresh) {
      lastAsk = '';
      if (cardOn() && !pending) closeCard(true);
      $('#aiSugg').classList.add('ai-gone');
      fadeTo($('#aiBig'), '');
      aiOn = null;
    }
    lastAsk += text;
    if (fresh) fadeTo($('#aiHi'), lastAsk); else setWords($('#aiHi'), lastAsk);
  }
  // The AI's words go to the card while it is open, else to the headline. Moving place carries the turn's words over.
  function aiSaid(chunk) {
    if (readTimer) openRead();
    if (newTurn) { newTurn = false; aiText = ''; aiOn = null; }
    aiText += chunk;
    unbusy();
    var el = cardOn() ? $('#aiAns') : $('#aiBig');
    if (el !== aiOn) { aiOn = el; fadeTo(el, aiText); } else setWords(el, aiText);
  }

  // ---- The glass card: rises out of the pill
  function openCard() {
    if (!cardOn()) { $('#aiAns')._w = []; $('#aiAns').textContent = ''; aiOn = null; }
    $('#aiAsk').textContent = lastAsk;
    $('#aiAsk').hidden = !lastAsk;
    $('#aiCard').classList.add('ai-on');
    $('#aiPill').classList.add('ai-hide');
    unbusy();
  }
  function closeCard(quiet) {
    if (pending) pending.done({ saved: false, reason: 'The user cancelled' });
    clearTimeout(readTimer); readTimer = 0;
    $('#aiCard').classList.remove('ai-on');
    $('#aiPill').classList.remove('ai-hide');
    setTimeout(function () { if (!cardOn()) { $('#aiMain').innerHTML = ''; $('#aiFoot').innerHTML = ''; } }, 600);
    if (quiet) return;
    aiOn = null;
    if (!newTurn && aiText) aiSaid(''); else greet();
  }
  function disc(name, big) { return '<span class="ai-disc' + (big ? ' ai-l' : '') + '">' + img3d(name, big ? 42 : 26) + '</span>'; }
  function tiles(list) { return '<div class="ai-tiles">' + list.map(function (t) { return '<div class="ai-tile"><small>' + t[0] + '</small><b>' + (typeof t[1] === 'number' ? compact(t[1]) : t[1]) + '</b></div>'; }).join('') + '</div>'; }
  function bar(label, amount, of, over) {
    return '<div class="ai-bar"><span>' + esc(label) + '</span><span>' + money.format(amount) + '</span><div class="ai-trk' + (over ? ' ai-over' : '') + '"><i style="--w:' + Math.max(3, Math.min(100, of ? amount / of * 100 : 0)) + '%"></i></div></div>';
  }
  function dayText(s) { var t = ymd(new Date()), y = ymd(new Date(Date.now() - 864e5)), d = parseDay(s); return (s === t ? 'Today · ' : s === y ? 'Yesterday · ' : '') + (d ? dm.format(d) : s); }
  function entryRows(list) {
    return '<div class="ai-rows">' + list.map(function (e) {
      var inc = e.type === 'Income';
      return '<div class="ai-r">' + disc(pic(e.category)) + '<div class="ai-g"><b>' + esc(e.note || e.category) + '</b><small>' + (e.note && e.note !== e.category ? esc(e.category) + ' · ' : '') + dayText(e.date) + '</small></div>' +
        '<span class="ai-a' + (inc ? ' ai-pos' : '') + '">' + (inc ? '+' : '') + money.format(e.amount) + '</span></div>';
    }).join('') + '</div>';
  }
  function describe(a, cat) {
    var what = cat || (a.type === 'Income' ? 'Income' : a.type === 'Expense' ? 'Spending' : 'Everything'), f = parseDay(a.from), t = parseDay(a.to);
    return what + (a.text ? ' · “' + a.text + '”' : '') + ' · ' + (f && t ? dm.format(f) + ' – ' + dm.format(t) : f ? 'since ' + dm.format(f) : t ? 'until ' + dm.format(t) : 'all time');
  }
  // A read tool's answer, drawn from its result: the numbers on screen are the app's, not the model's.
  function openRead() {
    clearTimeout(readTimer); readTimer = 0;
    var x = lastRead, r = x.res, h = '';
    if (r.error) h = '<p class="ai-muted">' + esc(r.error) + '</p>';
    else if (x.name === 'query_entries') {
      h += '<p class="ai-h">' + esc(describe(x.args, r.category)) + '</p>' + tiles([['Spent', r.expense], ['Got', r.income], ['Entries', String(r.count)]]);
      var cs = Object.keys(r.spentByCategory).sort(function (a, b) { return r.spentByCategory[b] - r.spentByCategory[a]; }).slice(0, 5);
      if (cs.length > 1) h += '<p class="ai-h">Where it went</p>' + cs.map(function (c) { return bar(c, r.spentByCategory[c], r.spentByCategory[cs[0]]); }).join('');
      if (r.latest.length) h += '<p class="ai-h">Latest</p>' + entryRows(r.latest.slice(0, 5));
    } else {
      var m = r.thisMonth, L = r.leftToSpend;
      h += '<p class="ai-h">This month</p>' + tiles([['Got', m.income], ['Spent', m.expense], ['Saved', m.savings]]);
      if (L) h += '<p class="ai-h">Left to spend</p>' + bar(money.format(Math.max(0, L.left)) + ' left of ' + money.format(L.limit), L.spent, L.limit, L.left < 0) +
        '<p class="ai-muted">' + (L.left > 0 ? 'About ' + money.format(L.perDay) + ' a day for ' + L.days + ' days' : 'Over the monthly budget') + '</p>';
      if (r.overBudget.length) h += '<div class="ai-pills">' + r.overBudget.map(function (o) { return '<span class="ai-tag ai-bad">' + esc(o.cat) + ' ' + money.format(o.over) + ' over</span>'; }).join('') + '</div>';
      var ls = r.loansAndInvestments.filter(function (l) { return !l.done; });
      if (ls.length) h += '<p class="ai-h">Loans and savings</p><div class="ai-rows">' + ls.map(function (l) {
        return '<div class="ai-r">' + disc(LOAN_TEXT[l.kind].pic) + '<div class="ai-g"><b>' + esc(l.name) + '</b><small>' + KINDS[l.kind] + ' · ' + esc(l.interest) + '</small></div><span class="ai-a">' + money.format(l.owedOrWorthNow) + '</span></div>';
      }).join('') + '</div>';
      h += '<p class="ai-h">Net worth</p>' + tiles([['Today', r.netWorth], ['Saves a month', r.avgMonthlySavingLast3Months], ['Saved last month', r.lastMonth.savings]]);
    }
    $('#aiMain').innerHTML = h;
    $('#aiFoot').innerHTML = '';
    openCard();
  }

  // ---- The confirm card: prefilled from the model's call, editable, saved only by the user's tap.
  var KINDS = { borrowed: 'Pending', given: 'Given', invested: 'Invested' };
  var REPEATS = [[1, 'Monthly'], [3, '3 months'], [6, '6 months'], [12, 'Yearly']]; // the only ones validateSet allows
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  function confirmCard(name, a) {
    var cats = data().cats, x;
    if (name === 'add_entry') { var type = a.type === 'Income' ? 'Income' : 'Expense'; x = { type: type, category: matchName(cats[type], a.category) || '', amount: a.amount || '', note: a.note || '', date: parseDay(a.date) ? a.date : ymd(new Date()) }; }
    else if (name === 'add_bill') x = { name: a.name || '', category: matchName(cats.Expense, a.category) || '', amount: a.amount || '', day: a.day || '', every: [1, 3, 6, 12].indexOf(Number(a.every)) >= 0 ? Number(a.every) : 1 };
    else x = { dir: KINDS[a.dir] ? a.dir : 'borrowed', reason: a.reason || '', amount: a.amount || '', interest: a.interest || '', per: a.per === 'year' ? 'year' : 'month' };
    if (pending) pending.done({ saved: false, reason: 'Replaced by a newer version' }); // "make it 35k": the card updates in place
    return new Promise(function (done) {
      pending = { name: name, v: x, done: function (r) { pending = null; done(r); } };
      $('#aiMain').innerHTML = '<div class="ai-pv" id="aiPv"><div id="aiPvh"></div><label class="ai-amt"><span>₹</span><input id="aiAmt" inputmode="decimal" placeholder="0" aria-label="Amount"></label></div>' +
        '<div id="aiFlds"></div><p class="ai-err" id="aiErr" role="alert"></p>';
      $('#aiFoot').innerHTML = '<button class="ai-save" id="aiSave" type="button"></button><button class="ai-ghost" id="aiCancel" type="button">Cancel</button>';
      $('#aiAmt').value = grouped(x.amount);
      fitAmount();
      drawConfirm();
      openCard();
      fadeTo($('#aiAns'), 'Check it, change anything, then tap Save.'); // the model waits for the tap, so it says nothing yet
    });
  }
  function grouped(v) { var n = num(v); return n > 0 ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v || ''); }
  function fitAmount() { $('#aiAmt').style.width = (Math.max(1, $('#aiAmt').value.length) + .4) + 'ch'; }
  function drawConfirm(headOnly) {
    var x = pending.v, n = pending.name, cats = data().cats, h, p, title, tag, sub;
    if (n === 'add_entry') {
      p = pic(x.category || 'Others'); title = x.category || 'Pick a category'; sub = dayText(x.date);
      tag = '<span class="ai-tag' + (x.type === 'Income' ? '' : ' ai-bad') + '">' + x.type + '</span>';
      var t = ymd(new Date()), y = ymd(new Date(Date.now() - 864e5)), other = x.date !== t && x.date !== y;
      h = seg('type', [['Expense', 'Expense'], ['Income', 'Income']], x.type) + field('Category', chips(cats[x.type], x.category)) + field('Note', input('note', 'What was it for?', x.note)) +
        field('When', '<div class="ai-row2">' + seg('date', [[t, 'Today'], [y, 'Yesterday']], x.date) + '<input class="ai-in" type="date" data-in="date" max="' + t + '" value="' + (other ? x.date : '') + '" aria-label="Pick a date"></div>');
    } else if (n === 'add_bill') {
      p = pic(x.category || x.name || 'Bills'); title = x.name || 'New bill'; sub = REPEATS.filter(function (e) { return e[0] === x.every; })[0][1] + (x.day ? ' · due on day ' + x.day : '');
      tag = '<span class="ai-tag ai-warn">Bill</span>';
      h = field('Bill name', input('name', 'e.g. Rent, Electricity, LIC', x.name)) + field('Category', chips(cats.Expense, x.category)) +
        field('Due on day', input('day', '1–31', x.day, 'numeric')) + field('Repeats', seg('every', REPEATS, x.every));
    } else {
      var T = LOAN_TEXT[x.dir];
      p = T.pic; title = x.reason || T.newTitle; sub = num(x.interest) > 0 ? x.interest + '% a ' + x.per : 'No interest';
      tag = '<span class="ai-tag' + (x.dir === 'borrowed' ? ' ai-bad' : '') + '">' + KINDS[x.dir] + '</span>';
      h = seg('dir', Object.keys(KINDS).map(function (k) { return [k, KINDS[k]]; }), x.dir) + field(T.label, input('reason', T.ph, x.reason)) +
        field('Interest % (optional)', '<div class="ai-row2">' + input('interest', '0', x.interest, 'decimal') + seg('per', [['month', 'a month'], ['year', 'a year']], x.per) + '</div>');
    }
    $('#aiPvh').innerHTML = disc(p, true) + '<div class="ai-what">' + esc(title) + tag + '</div><div class="ai-when">' + esc(sub) + '</div>';
    var amt = num(x.amount);
    $('#aiSave').textContent = 'Save' + (amt > 0 ? ' ' + money.format(amt) : '');
    if (headOnly) return; // typing: leave the inputs alone so the keyboard and caret stay put
    $('#aiFlds').innerHTML = h;
    var sel = $('#aiFlds .ai-cat[aria-pressed=true]');
    if (sel) sel.parentNode.scrollLeft = sel.offsetLeft - sel.parentNode.clientWidth / 2 + sel.offsetWidth / 2;
  }
  function seg(k, opts, cur) { return '<div class="ai-seg">' + opts.map(function (o) { return '<button type="button" data-k="' + k + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(o[0]) === String(cur)) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function chips(list, cur) { return '<div class="ai-cats">' + list.map(function (c) { return '<button type="button" class="ai-cat" data-k="category" data-v="' + esc(c) + '" aria-pressed="' + (c === cur) + '">' + img(c, 26) + esc(c) + '</button>'; }).join('') + '</div>'; }
  function input(k, ph, val, mode) { return '<input class="ai-in" data-in="' + k + '" placeholder="' + esc(ph) + '" value="' + esc(val) + '"' + (mode ? ' inputmode="' + mode + '"' : '') + ' autocomplete="off">'; }
  function field(label, html) { return '<div class="ai-f"><label>' + esc(label) + '</label>' + html + '</div>'; }

  // Saving: the same checks and calls as the app's own form (saveSheet in app.js), then render and sync like it.
  function saveConfirm() {
    var p = pending, x = p.v, amount = Math.round(num(x.amount) * 100) / 100, now = new Date(), id = crypto.randomUUID(), bad, final;
    var stop = function (t) { $('#aiErr').textContent = t; };
    if (!(amount > 0)) return stop('Type the amount');
    if (p.name === 'add_entry') {
      if (!x.category) return stop('Pick a category');
      var dt = x.date === ymd(now) ? now : new Date(x.date + 'T12:00:00');
      if (isNaN(dt) || dt > now) return stop('Pick a valid date');
      var e = { id: id, dateTime: dt.toISOString(), type: x.type, category: x.category, amount: amount, note: x.note.trim(), createdAt: now.toISOString() };
      if (me()) e.by = me();
      bad = validateEntry(e) || queue('entry', 'add', id, e);
      final = { type: x.type, category: x.category, amount: amount, note: e.note, date: x.date };
    } else if (p.name === 'add_bill') {
      var d = parseInt(x.day, 10);
      if (!x.name.trim()) return stop('Give the bill a name');
      if (!x.category) return stop('Pick a category');
      if (!(d >= 1 && d <= 31)) return stop('Type the day of the month it is due (1–31)');
      final = { name: x.name.trim().slice(0, 40), category: x.category, amount: amount, day: d, every: x.every, next: d >= now.getDate() ? monthKey(now) : addMonths(monthKey(now), 1) };
      bad = setOp('bill', final, id);
    } else {
      var T = LOAN_TEXT[x.dir], rate = String(x.interest).trim() === '' ? 0 : num(x.interest);
      if (!x.reason.trim()) return stop(T.need);
      if (!(rate >= 0 && rate <= 100)) return stop('Interest must be a number from 0 to 100');
      var loan = { id: id, dateTime: now.toISOString(), reason: x.reason.trim(), amount: amount, interest: round2(rate), per: x.per, priority: 'medium', dir: x.dir, createdAt: now.toISOString() };
      if (x.dir === 'invested') loan.compound = true;
      bad = validateLoan(loan) || queue('loan', 'add', id, loan);
      final = { kind: KINDS[x.dir], reason: loan.reason, amount: amount, interest: loan.interest, per: x.per };
    }
    if (bad) return stop(bad);
    render();
    trySync();
    $('#aiSave').classList.add('ai-done');
    $('#aiSave').innerHTML = CHECK + 'Saved';
    $('#aiPv').classList.add('ai-ok');
    $('#aiCancel').disabled = true;
    p.done({ saved: true, final: final });
    setTimeout(function () { if (cardOn() && !pending) closeCard(); }, 1100);
  }

  // ---- Gemini Live over a WebSocket
  // Mic samples -> 16-bit PCM in ~100 ms chunks (an AudioWorklet frame is only 128 samples).
  var WORKLET = 'class P extends AudioWorkletProcessor{constructor(){super();this.b=new Int16Array(1600);this.n=0}' +
    'process(i){var c=i[0]&&i[0][0];if(c)for(var k=0;k<c.length;k++){var s=Math.max(-1,Math.min(1,c[k]));this.b[this.n++]=s<0?s*32768:s*32767;' +
    'if(this.n===this.b.length){this.port.postMessage(this.b.slice().buffer);this.n=0}}return true}}registerProcessor("pcm",P)';
  var ws = null, ready = null, inCtx, outCtx, outGain, outAn, micAn, workletLoaded = false, mic = null, micNode = null, micSrc = null;
  var playing = [], playAt = 0, voiceTurn = false, idleTimer;

  function systemPrompt() {
    var c = data().cats;
    return ['You are the voice assistant inside "Family Money", a family income and expense app in India (rupees, ₹).',
      'Today is ' + new Date().toDateString() + '.' + (me() ? ' You are talking with ' + me() + '.' : ''),
      'Income categories: ' + c.Income.join(', ') + '. Expense categories: ' + c.Expense.join(', ') + '.',
      'Reply in the language the user speaks (English, Hindi or Hinglish), in one or two short sentences. The screen shows the details, so do not read out long lists.',
      'To add an income, expense, bill, loan or investment, call the matching add_ tool. The user checks it on a card and taps Save. Only say it was saved when the result has saved:true.',
      'For any question about the user\'s money, call query_entries or overview first. Never guess numbers and never add them up yourself; use the totals the tools return.',
      'Amounts: 30k = 30000, 1.5 lakh = 150000. Pick the closest existing category, or Others when nothing fits.'].join('\n');
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); touch(); }
  // A Live session counts against the free quota while it is open, so a quiet one is closed.
  function touch() { clearTimeout(idleTimer); idleTimer = setTimeout(function () { if (!mic && !playing.length && !pending) hangUp(); }, 60000); }

  function connect() {
    if (ready) return ready;
    if (!navigator.onLine) return Promise.reject(new Error('You are offline: the assistant needs the internet'));
    ready = new Promise(function (ok, no) {
      ws = new WebSocket(URL_WS + encodeURIComponent(key()));
      ws.onopen = function () {
        send({ setup: { model: 'models/' + MODEL, generationConfig: { responseModalities: ['AUDIO'] }, systemInstruction: { parts: [{ text: systemPrompt() }] },
          tools: [{ functionDeclarations: DECLS }], inputAudioTranscription: {}, outputAudioTranscription: {} } });
      };
      ws.onmessage = function (ev) { (typeof ev.data === 'string' ? Promise.resolve(ev.data) : ev.data.text()).then(function (t) { onMessage(JSON.parse(t), ok); }); };
      ws.onclose = function (ev) {
        var why = ev.reason || (ev.code === 1000 ? '' : 'could not connect (' + ev.code + ')');
        no(new Error(why || 'Closed'));
        if (ws && why) note(/api key/i.test(why) ? 'That Gemini key did not work. Check it in Settings.' : 'Assistant: ' + why);
        ws = null; ready = null; stopMic(); stopPlayback(); unbusy();
      };
    });
    return ready;
  }
  function hangUp() { stopMic(); stopPlayback(); if (ws) { var s = ws; ws = null; s.close(1000); } ready = null; unbusy(); }

  function onMessage(m, ok) {
    touch();
    if (m.setupComplete) return ok();
    if (m.toolCall) runTools(m.toolCall.functionCalls || []);
    var s = m.serverContent;
    if (!s) return;
    if (s.interrupted) stopPlayback();
    if (s.inputTranscription && s.inputTranscription.text) { voiceTurn = true; userSaid(s.inputTranscription.text, userNew); userNew = false; }
    if (s.outputTranscription && s.outputTranscription.text) aiSaid(s.outputTranscription.text);
    ((s.modelTurn && s.modelTurn.parts) || []).forEach(function (p) { if (p.inlineData && voiceTurn) play(p.inlineData.data); }); // typed turns stay silent
    if (s.turnComplete) { newTurn = true; userNew = true; unbusy(); }
  }
  // Calls run one after another (a confirm card waits for the user), then all answers go back together.
  function runTools(calls) {
    if (calls[0]) busy(BUSY[calls[0].name] || 'Thinking…');
    calls.reduce(function (p, c) {
      return p.then(function (out) {
        var r;
        try { r = TOOLS[c.name] ? TOOLS[c.name](c.args || {}) : { error: 'Unknown tool' }; } catch (e) { r = { error: e.message }; }
        return Promise.resolve(r).then(function (res) {
          if (c.name === 'query_entries' || c.name === 'overview') lastRead = { name: c.name, args: c.args || {}, res: res };
          out.push({ id: c.id, name: c.name, response: res });
          return out;
        });
      });
    }, Promise.resolve([])).then(function (out) {
      send({ toolResponse: { functionResponses: out } });
      if (lastRead && out.some(function (o) { return o.name === lastRead.name; })) {
        if (cardOn() && !pending) openRead(); // a follow-up question updates the card in place
        else if (!pending) { fadeTo($('#aiBig'), 'Here’s what I found'); aiOn = null; clearTimeout(readTimer); readTimer = setTimeout(openRead, 700); }
      }
    });
  }

  // ---- Audio. Made inside a tap, which iOS requires.
  function audioOn() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!outCtx) {
      outCtx = new AC();
      inCtx = new AC({ sampleRate: 16000 });
      outGain = outCtx.createGain(); outAn = outCtx.createAnalyser(); outAn.fftSize = 512;
      outGain.connect(outAn); outAn.connect(outCtx.destination);
      micAn = inCtx.createAnalyser(); micAn.fftSize = 512;
    }
    outCtx.resume(); inCtx.resume();
  }
  function startMic() {
    if (!inCtx || !navigator.mediaDevices) return Promise.reject(new Error('This browser cannot use the microphone here. Type instead.'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then(function (stream) {
      mic = stream;
      return (workletLoaded ? Promise.resolve() : inCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))).then(function () {
        workletLoaded = true;
        micNode = new AudioWorkletNode(inCtx, 'pcm');
        // The real rate goes along, so a browser that ignores sampleRate:16000 still works (Gemini resamples).
        micNode.port.onmessage = function (e) { send({ realtimeInput: { audio: { data: b64(e.data), mimeType: 'audio/pcm;rate=' + inCtx.sampleRate } } }); };
        micSrc = inCtx.createMediaStreamSource(stream);
        micSrc.connect(micNode); micSrc.connect(micAn);
        micNode.connect(inCtx.destination); // silent; some browsers only run a node that is connected
        voiceTurn = true;
        $('#aiPill').classList.add('ai-live');
        $('#aiText').placeholder = 'Listening…';
      });
    }, function () { throw new Error('Allow the microphone to talk, or type instead'); });
  }
  function stopMic() {
    if (!mic) return;
    mic.getTracks().forEach(function (t) { t.stop(); });
    if (micSrc) micSrc.disconnect();
    if (micNode) micNode.disconnect();
    mic = micNode = micSrc = null;
    send({ realtimeInput: { audioStreamEnd: true } });
    $('#aiPill').classList.remove('ai-live');
    $('#aiText').placeholder = 'Ask anything…';
  }
  function b64(buf) { var s = '', u = new Uint8Array(buf); for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  // Gemini sends 24 kHz 16-bit PCM chunks; play them back to back.
  function play(data64) {
    if (!outCtx) return;
    var u = Uint8Array.from(atob(data64), function (c) { return c.charCodeAt(0); }), pcm = new Int16Array(u.buffer);
    var buf = outCtx.createBuffer(1, pcm.length, 24000), ch = buf.getChannelData(0);
    for (var i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    var src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(outGain);
    playAt = Math.max(playAt, outCtx.currentTime);
    src.start(playAt);
    playAt += buf.duration;
    playing.push(src);
    src.onended = function () { var i = playing.indexOf(src); if (i >= 0) playing.splice(i, 1); };
  }
  function stopPlayback() { playing.slice().forEach(function (s) { try { s.stop(); } catch (e) {} }); playing = []; playAt = 0; }
  var tbuf = new Float32Array(512);
  function rms(an) { if (!an) return 0; an.getFloatTimeDomainData(tbuf); for (var s = 0, i = 0; i < tbuf.length; i++) s += tbuf[i] * tbuf[i]; return Math.sqrt(s / tbuf.length); }

  // ---- The orb: glass sphere with a sloshing liquid of light, a bright crest where it ends, silk sheets, a rim that glows where the
  // liquid touches it, and a halo. uLevel: voice level 0-1 (swells and brightens); uThink: 0-1 while working (fills with light).
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes; uniform float uTime, uLevel, uThink;',
    'float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
    'float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
    ' return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
    '  mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'mat3 rot(vec3 a){float cx=cos(a.x),sx=sin(a.x),cy=cos(a.y),sy=sin(a.y),cz=cos(a.z),sz=sin(a.z);',
    ' return mat3(cy*cz,cy*sz,-sy, sx*sy*cz-cx*sz,sx*sy*sz+cx*cz,sx*cy, cx*sy*cz+sx*sz,cx*sy*sz-sx*cz,cx*cy);}',
    // a glowing sheet through the sphere: a gently bent plane, seen as a bright swoosh that fades along its length
    'float sheet(vec3 q,vec3 n,vec3 b,float t,float w){float s=dot(q,n)+.28*sin(dot(q,b)*2.2+t);return exp(-abs(s)*w)*smoothstep(-.35,.75,dot(q,cross(n,b)));}',
    'void main(){',
    ' vec2 p=(gl_FragCoord.xy-.5*uRes)/(.5*min(uRes.x,uRes.y))/.6;', // the sphere is 60% of the canvas; the rest is halo
    ' float r=length(p), e=uLevel, k=uThink, t=uTime;',
    ' float side=dot(normalize(p+1e-5),normalize(vec2(.55,-.45)));', // light from the lower right
    ' float o=max(r-1.,0.);',
    ' vec3 halo=vec3(.08,.3,1.)*(.26+.45*e+.25*k)*(.75+.6*side)*exp(-o*2.8)/(1.+o*3.);',
    ' vec3 col=halo;',
    ' if(r<1.){',
    '  float z=sqrt(1.-r*r); vec3 n=vec3(p,z);',
    '  mat3 M=rot(vec3(.6+.35*sin(t*.19),t*.3,.4*sin(t*.13)));',
    '  vec3 q=M*n, qi=M*vec3(p,z*.85);',
    '  float warp=noise(qi*1.1+vec3(0.,t*.18,0.))-.5+.5*(noise(qi*2.2-vec3(t*.12))-.5);', // the liquid: one smooth, slowly sloshing surface
    '  float d=dot(qi,normalize(vec3(.5,.75,.3)))+.6*warp;',
    '  float th=.22-.9*k-.3*e;',
    '  float inside=smoothstep(th-.03,th+.06,d);',
    '  float rimness=pow(1.-z,1.3);',
    '  float fold=pow(1.-abs(sin((noise(qi*1.3+vec3(t*.1,0.,0.))*1.5+d)*2.2+t*.35)),4.);', // silky streaks inside the liquid
    '  vec3 liquid=mix(vec3(.02,.1,.55),vec3(.16,.5,1.)*1.25,pow(rimness,.8))*(.75+.5*fold);',
    '  col=vec3(.002,.006,.026)+vec3(.015,.04,.13)*noise(qi*2.6+t*.1)*(1.-inside);', // dark glass, faint smoke
    '  col+=inside*liquid;',
    '  col+=exp(-abs(d-th)*45.)*vec3(.5,.8,1.)*(.15+1.3*rimness)*(1.+e);', // bright crest where the liquid ends
    '  float s1=sheet(q,normalize(vec3(.3,1.,.2)),normalize(vec3(1.,0.,.4)),t*.5,48.);',
    '  float s2=sheet(q,normalize(vec3(-.8,.3,.5)),normalize(vec3(.2,.9,-.3)),t*.4+2.,56.);',
    '  col+=(s1+.8*s2)*vec3(.5,.72,1.)*(.35+1.6*rimness)*(.6+.8*inside)*(1.+.8*e);',
    '  float fr=pow(1.-z,4.)+.8*exp(-(1.-r)*70.);', // rim: bright where the liquid touches it, a thin violet-blue line on the dark side
    '  col+=fr*mix(mix(vec3(.45,.25,.95),vec3(.25,.45,1.),smoothstep(-.5,.5,p.x-p.y)),vec3(.4,.68,1.)*1.6,inside)*(.9+.6*e+.4*k);',
    '  col=mix(halo,col,smoothstep(1.,.985,r));',
    ' }',
    ' col=1.-exp(-col*1.9);',
    ' gl_FragColor=vec4(col,1.);',
    '}'].join('\n');
  var orbEl = $('#aiOrb'), gl = null, uni = {}, raf = 0, lastTs = 0, T = 0, lvl = 0, thk = 0, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setupGL() {
    if (gl || orbEl.tagName !== 'CANVAS') return;
    try {
      gl = orbEl.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
      var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      ['uRes', 'uTime', 'uLevel', 'uThink'].forEach(function (u) { uni[u] = gl.getUniformLocation(prog, u); });
    } catch (e) { // no WebGL: a CSS sphere instead
      gl = null;
      var d = document.createElement('div');
      d.id = 'aiOrb'; d.className = 'ai-cssorb';
      orbEl.replaceWith(d);
      orbEl = d;
    }
  }
  function startOrb() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(tick); } }
  function tick(ts) {
    raf = 0;
    if (!$('#ai').open || document.hidden) return;
    raf = requestAnimationFrame(tick);
    var dt = lastTs ? Math.min(.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    var target = Math.max(mic ? rms(micAn) : 0, playing.length ? rms(outAn) : 0);
    lvl += (Math.min(1, target * 4) - lvl) * .2;
    thk += (($('#aiPill').classList.contains('ai-busy') ? 1 : 0) - thk) * .04;
    T += dt * (reduce ? .3 : 1) * (1 + thk * 1.6 + lvl * 1.2);
    orbEl.style.setProperty('--s', 1 + lvl * .07);
    $('#aiWave').style.setProperty('--l', mic ? lvl : 0);
    if (!gl) return;
    var px = Math.round(orbEl.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
    if (orbEl.width !== px) { orbEl.width = orbEl.height = px; gl.viewport(0, 0, px, px); }
    gl.uniform2f(uni.uRes, px, px);
    gl.uniform1f(uni.uTime, T);
    gl.uniform1f(uni.uLevel, lvl);
    gl.uniform1f(uni.uThink, thk);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- Open, close, ask. The assistant is a modal dialog: the app behind is inert, Esc closes the card first, then it.
  // iOS: the keyboard shrinks the visible area but not the dialog, so it is fitted to what is visible.
  function fitAI() { var vv = window.visualViewport; if (vv && $('#ai').open) $('#ai').style.height = vv.height + 'px'; }
  function openAI() {
    var ai = $('#ai'), b = $('#aiBtn').getBoundingClientRect();
    ai.style.setProperty('--ox', (b.left + b.width / 2) + 'px');
    ai.style.setProperty('--oy', (b.top + b.height / 2) + 'px');
    setupGL();
    ai.showModal();
    lockPage(true);
    fitAI();
    requestAnimationFrame(function () { requestAnimationFrame(function () { ai.classList.add('ai-on'); }); });
    greet();
    startOrb();
    audioOn(); // inside the tap (iOS)
    connect().catch(fail); // early, so the first answer is quick
  }
  function closeAI() {
    var ai = $('#ai');
    if (cardOn()) closeCard(true);
    hangUp();
    ai.classList.remove('ai-on');
    setTimeout(function () { if (!ai.classList.contains('ai-on')) { ai.close(); lockPage(false); } }, 350);
  }
  function askAI(t) {
    t = t.trim();
    if (!t) return;
    voiceTurn = false;
    stopPlayback();
    userSaid(t, true);
    userNew = true; newTurn = true;
    busy('Thinking…');
    connect().then(function () { send({ realtimeInput: { text: t } }); }).catch(fail);
  }

  $('#aiBtn').addEventListener('click', openAI);
  $('#aiClose').addEventListener('click', closeAI);
  $('#ai').addEventListener('cancel', function (e) { e.preventDefault(); if (cardOn()) closeCard(); else closeAI(); });
  $('#aiPill').addEventListener('submit', function (e) { e.preventDefault(); var t = $('#aiText').value; $('#aiText').value = ''; askAI(t); });
  $('#aiSugg').addEventListener('click', function (e) { var c = e.target.closest('.ai-chip'); if (c) askAI(c.textContent); });
  $('#aiWave').addEventListener('click', function () { if (mic) return stopMic(); audioOn(); connect().then(startMic).catch(fail); });
  $('#aiCard').addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]');
    if (b && pending) {
      var x = pending.v, k = b.dataset.k;
      x[k] = k === 'every' ? Number(b.dataset.v) : b.dataset.v;
      if (k === 'type' && data().cats[x.type].indexOf(x.category) < 0) x.category = '';
      $('#aiErr').textContent = '';
      drawConfirm();
    } else if (e.target.closest('#aiSave') && pending) saveConfirm();
    else if (e.target.closest('#aiCancel, .ai-grab')) closeCard();
  });
  $('#aiCard').addEventListener('input', function (e) {
    var el = e.target;
    if (!pending) return;
    if (el.id === 'aiAmt') { el.value = el.value.replace(/[^\d.,]/g, ''); pending.v.amount = el.value; fitAmount(); }
    else if (el.dataset.in && el.dataset.in !== 'date') pending.v[el.dataset.in] = el.value;
    else return;
    $('#aiErr').textContent = '';
    drawConfirm(true);
  });
  $('#aiCard').addEventListener('focusout', function (e) { if (e.target.id === 'aiAmt') { e.target.value = grouped(e.target.value); fitAmount(); } });
  $('#aiCard').addEventListener('change', function (e) { if (pending && e.target.dataset.in === 'date' && e.target.value) { pending.v.date = e.target.value; drawConfirm(); } });
  document.addEventListener('visibilitychange', function () { if ($('#ai').open) startOrb(); });
  window.addEventListener('offline', hangUp);
  if (window.visualViewport) visualViewport.addEventListener('resize', fitAI);
})();
