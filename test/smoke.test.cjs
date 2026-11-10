const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const APP_JS = path.join(__dirname, '..', 'apps', 'web', 'public', 'calendar-app', 'app.js');
const src = fs.readFileSync(APP_JS, 'utf8');

const loadApp = () => {
  const module = { exports: {} };
  new Function('module', 'exports', src)(module, module.exports);
  return module.exports;
};
const { STORAGE_KEY, buildMonth, dateToKey } = loadApp();

function makeEl() {
  const el = {
    children: [],
    className: '',
    textContent: '',
    dataset: {},
    value: '',
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { (this._handlers = this._handlers || {})[type] = fn; },
    setAttribute() {},
    focus() {}
  };
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: v => { html = v; if (v === '') el.children.length = 0; }
  });
  return el;
}

const ids = ['prevBtn', 'todayBtn', 'nextBtn', 'monthTitle', 'grid', 'agendaDate', 'eventForm', 'titleInput', 'timeInput', 'agendaList'];
const els = {};
ids.forEach(id => { els[id] = makeEl(); });

const store = {};
const sandbox = {
  document: {
    getElementById: id => els[id],
    createElement: () => makeEl(),
    addEventListener: () => {}
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  },
  crypto: webcrypto,
  console
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const now = new Date();
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

assert.strictEqual(els.monthTitle.textContent, MONTHS[now.getMonth()] + ' ' + now.getFullYear());
assert.strictEqual(els.grid.children.length, 7 + 42, '7 weekday headers + 42 day cells');
assert.strictEqual(els.grid.children[0].className, 'weekday');

const today = dateToKey(now);
const todayCell = els.grid.children.slice(7).find(c => c.dataset.key === today);
assert.ok(todayCell, 'today cell exists');
assert.ok(todayCell.className.includes('today'), 'today is highlighted');
assert.ok(todayCell.className.includes('selected'), 'today is selected by default');
assert.ok(els.agendaDate.textContent.includes(MONTHS[now.getMonth()]), 'agenda shows today');
assert.strictEqual(els.agendaList.children.length, 1);
assert.strictEqual(els.agendaList.children[0].className, 'empty');

els.titleInput.value = 'Team sync';
els.timeInput.value = '09:30';
els.eventForm._handlers.submit({ preventDefault() {} });

const saved = JSON.parse(store[STORAGE_KEY]);
assert.strictEqual(saved[today].length, 1);
assert.strictEqual(saved[today][0].title, 'Team sync');
assert.strictEqual(saved[today][0].time, '09:30');
assert.strictEqual(els.titleInput.value, '', 'form clears after add');

const cellAfterAdd = els.grid.children.slice(7).find(c => c.dataset.key === today);
const chip = cellAfterAdd.children.find(c => c.className === 'event');
assert.ok(chip, 'event chip rendered on the day cell');
assert.strictEqual(chip.textContent, '09:30 Team sync');

assert.strictEqual(els.agendaList.children.length, 1, 'agenda lists the event');
assert.strictEqual(els.agendaList.children[0].children[1].textContent, 'Team sync');

const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
els.nextBtn._handlers.click();
assert.strictEqual(els.monthTitle.textContent, MONTHS[next.getMonth()] + ' ' + next.getFullYear(), 'next month');
els.prevBtn._handlers.click();
assert.strictEqual(els.monthTitle.textContent, MONTHS[now.getMonth()] + ' ' + now.getFullYear(), 'back to current month');

const delBtn = els.agendaList.children[0].children[2];
assert.strictEqual(delBtn.className, 'ev-del');
delBtn._handlers.click();
assert.ok(!(today in JSON.parse(store[STORAGE_KEY])), 'event removed from storage');
assert.strictEqual(els.agendaList.children[0].className, 'empty', 'agenda back to empty state');

assert.strictEqual(buildMonth(now.getFullYear(), now.getMonth()).length, 42);

console.log('Smoke test passed');
