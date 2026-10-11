// A fake Google Sheet running the real apps-script/Code.gs + src/shared.js. Used by sync.test.js and e2e.test.js.
// Each tab is a grid (tab.rows[r][c], 0-based) of values; formulas are kept as their "=..." text.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const FORMATTING = ['setNumberFormat', 'setFontWeight', 'setFontSize', 'merge', 'setBackground', 'setFontColor', 'setHorizontalAlignment', 'setWrap',
  'setBorder', 'clearFormat', 'setFontStyle', 'setVerticalAlignment', 'setBackgrounds'];

function fakeSheet(name) {
  const sh = {
    name, rows: [], notes: [], hidden: false, hiddenCols: [], bandings: [],
    getName() { return this.name; },
    setName(n) { this.name = n; return this; },
    hideSheet() { this.hidden = true; return this; },
    hideColumns(c) { if (!this.hiddenCols.includes(c)) this.hiddenCols.push(c); },
    setColumnWidth() {}, setFrozenRows() {}, setHiddenGridlines() {}, setTabColor() {}, setRowHeight() {},
    getBandings() { return this.bandings.slice(); },
    getLastRow() { for (let r = this.rows.length; r > 0; r--) if ((this.rows[r - 1] || []).some(v => v !== '' && v != null)) return r; return 0; },
    getRange(row, col, n = 1, w = 1) {
      const self = this, range = {
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, j) => { const v = (self.rows[row - 1 + i] || [])[col - 1 + j]; return v == null ? '' : v; })),
        getValue: () => range.getValues()[0][0],
        getNotes: () => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, j) => (self.notes[row - 1 + i] || [])[col - 1 + j] || '')),
        setNotes(v) { v.forEach((r, i) => { const dst = self.notes[row - 1 + i] || (self.notes[row - 1 + i] = []); r.forEach((x, j) => { dst[col - 1 + j] = x; }); }); return range; },
        setValues(v) {
          if (v.length !== n || v.some(r => r.length !== w)) throw new Error(`setValues: ${v.length}x${v[0] && v[0].length} into ${n}x${w}`);
          v.forEach((r, i) => { const dst = self.rows[row - 1 + i] || (self.rows[row - 1 + i] = []); r.forEach((x, j) => { dst[col - 1 + j] = x; }); });
          return range;
        },
        setValue(x) { return range.setValues([[x]]); },
        setFormulas(v) { return range.setValues(v); },
        // Like Sheets: alternating colours may not overlap ones already there.
        applyRowBanding() {
          const box = { row, col, n, w };
          if (self.bandings.some(b => b.row < row + n && row < b.row + b.n && b.col < col + w && col < b.col + b.w)) throw new Error('banding overlaps another');
          const b = { ...box, remove() { self.bandings.splice(self.bandings.indexOf(b), 1); } };
          ['setHeaderRowColor', 'setFirstRowColor', 'setSecondRowColor', 'setFooterRowColor'].forEach(f => { b[f] = () => b; });
          self.bandings.push(b);
          return b;
        }
      };
      FORMATTING.forEach(f => { range[f] = () => range; });
      return range;
    }
  };
  return sh;
}

function fakeSpreadsheet() {
  const tabs = [];
  return {
    tabs,
    getSheets: () => tabs.slice(),
    getSheetByName: n => tabs.find(t => t.name === n) || null,
    insertSheet(n, index) { const t = fakeSheet(n); tabs.splice(index == null ? tabs.length : index, 0, t); return t; },
    deleteSheet(t) { tabs.splice(tabs.indexOf(t), 1); },
    getName: () => 'Family Money',
    getSpreadsheetTimeZone: () => 'Asia/Kolkata'
  };
}

// Only the patterns Code.gs uses.
function formatDate(date, tz, fmt) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
  if (fmt !== 'yyyy-MM') throw new Error('formatDate: ' + fmt);
  return p.year + '-' + p.month;
}

function createBackend() {
  const ss = fakeSpreadsheet(), props = {};
  let uuid = 0;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => 'uuid-' + String(++uuid).padStart(4, '0'), formatDate },
    Logger: { log() {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Date, JSON, Number, String, Array, Math, Object, isNaN, isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(root + '/src/shared.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(root + '/apps-script/Code.gs', 'utf8'), ctx);

  const tab = n => ss.getSheetByName(n);
  // What a person sees in month m (0-11) of a year tab: [Date, Category, Income, Expense, Reason, Id] rows.
  const month = (year, m) => {
    const t = tab(String(year)), c = m * ctx.M_STEP;
    if (!t) return [];
    return t.rows.slice(ctx.M_FIRST - 1).map(r => Array.from({ length: ctx.M_COLS }, (_, j) => r[c + j] == null ? '' : r[c + j])).filter(r => r.some(v => v !== ''));
  };
  // Types a row by hand at the bottom of a month table.
  const typeRow = (year, m, cells) => {
    const t = tab(String(year)), c = m * ctx.M_STEP;
    let r = ctx.M_FIRST - 1;
    while (t.rows[r] && t.rows[r].slice(c, c + ctx.M_COLS).some(v => v !== '' && v != null)) r++;
    const dst = t.rows[r] || (t.rows[r] = []);
    cells.forEach((v, j) => { dst[c + j] = v; });
  };
  // Every entry, as the app reads it back.
  const entries = () => ctx.loadAll(ss).rows;
  return { ctx, ss, props, tab, month, typeRow, entries, doPost: contents => ctx.doPost({ postData: { contents } }) };
}

module.exports = { createBackend };
