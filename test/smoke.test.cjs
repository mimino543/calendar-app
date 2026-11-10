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
const { STORAGE_KEY, CALENDARS_KEY, THEME_KEY, dateToKey, repeatOccurrences } = loadApp();

function makeEl() {
  const el = {
    children: [],
    className: '',
    textContent: '',
    dataset: {},
    style: {},
    value: '',
    checked: false,
    hidden: false,
    disabled: false,
    type: '',
    title: '',
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

const ids = [
  'viewLabel', 'prevBtn', 'todayBtn', 'nextBtn', 'newEventBtn', 'themeToggle',
  'viewMonth', 'viewWeek', 'viewDay', 'viewAgenda',
  'miniMonth', 'calendarList', 'newCalName', 'newCalColor', 'addCalBtn', 'mainView',
  'eventModal', 'evModalTitle', 'eventForm', 'evTitle', 'evCalendar', 'evCalDot', 'evDate',
  'evAllDay', 'evStart', 'evEnd', 'evLocation', 'evNotes', 'evReminder',
  'evRepeat', 'evRepeatInterval', 'evRepeatUntil', 'evDelete', 'evCancel',
  'detailModal', 'detBody', 'detEdit', 'detDelete', 'detClose'
];
const els = {};
ids.forEach(id => { els[id] = makeEl(); });

const store = {};
const documentElement = makeEl();
const sandbox = {
  document: {
    getElementById: id => els[id],
    createElement: () => makeEl(),
    addEventListener: () => {},
    documentElement
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  crypto: webcrypto,
  console
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

function findAll(node, cls, out) {
  out = out || [];
  (node.children || []).forEach(c => {
    if (c.className && c.className.split(' ').indexOf(cls) !== -1) out.push(c);
    findAll(c, cls, out);
  });
  return out;
}
function texts(node, out) {
  out = out || [];
  if (node.textContent) out.push(node.textContent);
  (node.children || []).forEach(c => texts(c, out));
  return out;
}

const now = new Date();
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const today = dateToKey(now);
const labelNow = MONTHS[now.getMonth()] + ' ' + now.getFullYear();

assert.strictEqual(els.viewLabel.textContent, labelNow, 'month label on load');
assert.strictEqual(els.mainView.children[0].className, 'month-grid');
assert.strictEqual(els.mainView.children[0].children.length, 7 + 42, 'month grid renders 7 headers + 42 cells');
assert.strictEqual(els.calendarList.children.length, 3, 'three default calendars listed');
assert.strictEqual(els.miniMonth.children.length, 2, 'mini month head + grid');
assert.strictEqual(els.viewMonth.className, 'view-btn active');

els.viewWeek._handlers.click();
assert.strictEqual(els.mainView.children[0].className, 'week-wrap', 'week view renders');
assert.ok(els.viewLabel.textContent.indexOf('–') !== -1, 'week label shows a range');
assert.strictEqual(els.viewWeek.className, 'view-btn active');

els.viewMonth._handlers.click();
assert.strictEqual(els.mainView.children[0].className, 'month-grid');

const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
els.nextBtn._handlers.click();
assert.strictEqual(els.viewLabel.textContent, MONTHS[next.getMonth()] + ' ' + next.getFullYear(), 'next month');
els.prevBtn._handlers.click();
assert.strictEqual(els.viewLabel.textContent, labelNow, 'back to current month');
els.nextBtn._handlers.click();
els.todayBtn._handlers.click();
assert.strictEqual(els.viewLabel.textContent, labelNow, 'today button returns to current month');

els.newEventBtn._handlers.click();
assert.strictEqual(els.eventModal.hidden, false, 'event modal opens');
assert.strictEqual(els.evModalTitle.textContent, 'New event');
assert.strictEqual(els.evDate.value, today, 'new event defaults to selected day');
assert.strictEqual(els.evCalendar.children.length, 3, 'calendar options rebuilt');
assert.strictEqual(els.evCalendar.children[0].textContent, 'Personal', 'option text is the plain name');
assert.strictEqual(els.evCalDot.style.background, '#6d5ae0', 'dot shows the selected calendar color');

els.evTitle.value = 'Team sync';
els.evStart.value = '09:00';
els.evEnd.value = '10:00';
els.evRepeat.value = 'weekly';
els.eventForm._handlers.submit({ preventDefault() {} });
assert.strictEqual(els.eventModal.hidden, true, 'modal closes after save');

let saved = JSON.parse(store[STORAGE_KEY]);
assert.strictEqual(saved.length, 1);
assert.strictEqual(saved[0].title, 'Team sync');
assert.strictEqual(saved[0].start, '09:00');
assert.strictEqual(saved[0].end, '10:00');
assert.strictEqual(saved[0].repeat.freq, 'weekly');
assert.strictEqual(saved[0].date, today);

const chip = findAll(els.mainView, 'chip').find(c => c.textContent.indexOf('Team sync') !== -1);
assert.ok(chip, 'event chip rendered in month grid');

chip._handlers.click({ stopPropagation() {} });
assert.strictEqual(els.detailModal.hidden, false, 'detail modal opens from chip');
const detText = texts(els.detBody).join(' ');
assert.ok(detText.indexOf('Team sync') !== -1, 'detail shows title');
assert.ok(detText.indexOf('Weekly') !== -1, 'detail shows recurrence');

els.detDelete._handlers.click();
saved = JSON.parse(store[STORAGE_KEY]);
assert.strictEqual(saved.length, 0, 'event deleted');
assert.strictEqual(els.detailModal.hidden, true, 'detail modal closes after delete');

els.newCalName.value = 'Trips';
els.newCalColor.value = '#ff0000';
els.addCalBtn._handlers.click();
assert.strictEqual(els.calendarList.children.length, 4, 'calendar added to sidebar');
let cals = JSON.parse(store[CALENDARS_KEY]);
assert.strictEqual(cals.length, 4);
assert.strictEqual(cals[3].name, 'Trips');
assert.strictEqual(cals[3].color, '#ff0000');
const tripsId = cals[3].id;

els.newEventBtn._handlers.click();
assert.strictEqual(els.evCalendar.children.length, 4, 'event modal lists the new calendar');
els.evCalendar.value = tripsId;
els.evCalendar._handlers.change();
assert.strictEqual(els.evCalDot.style.background, '#ff0000', 'dot follows the selected calendar');
els.evCancel._handlers.click();

const row0 = els.calendarList.children[0];
const swatch = row0.children[0];
swatch.value = '#123456';
swatch._handlers.change();
cals = JSON.parse(store[CALENDARS_KEY]);
assert.strictEqual(cals[0].color, '#123456', 'recolor persisted');

const tripsRow = els.calendarList.children[3];
const delBtn = tripsRow.children[3];
assert.strictEqual(delBtn.className, 'cal-del');
delBtn._handlers.click();
assert.strictEqual(els.calendarList.children.length, 3, 'calendar deleted from sidebar');
cals = JSON.parse(store[CALENDARS_KEY]);
assert.strictEqual(cals.length, 3);
assert.ok(!cals.some(c => c.id === tripsId), 'deleted calendar gone from storage');

els.newEventBtn._handlers.click();
els.evTitle.value = 'Day off';
els.evAllDay.checked = true;
els.evAllDay._handlers.change();
assert.strictEqual(els.evStart.disabled, true, 'time fields disabled for all-day');
els.eventForm._handlers.submit({ preventDefault() {} });
saved = JSON.parse(store[STORAGE_KEY]);
assert.strictEqual(saved.length, 1);
assert.strictEqual(saved[0].allDay, true);
assert.strictEqual(saved[0].start, '');

els.viewAgenda._handlers.click();
assert.strictEqual(els.mainView.children[0].className, 'agenda-wrap', 'agenda view renders');
assert.ok(findAll(els.mainView, 'ag-row').length >= 1, 'agenda lists the all-day event');

els.themeToggle._handlers.click();
assert.strictEqual(documentElement.dataset.theme, 'light', 'theme toggles to light');
assert.strictEqual(store[THEME_KEY], '"light"', 'theme persisted');

assert.deepStrictEqual(
  repeatOccurrences({ date: '2025-06-02', repeat: { freq: 'weekly', interval: 1, until: '' } }, '2025-06-01', '2025-06-30'),
  ['2025-06-02', '2025-06-09', '2025-06-16', '2025-06-23', '2025-06-30']
);

console.log('Smoke test passed');
