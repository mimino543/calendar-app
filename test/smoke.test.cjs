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
  'miniMonth', 'calendarList', 'newCalName', 'newCalColorBtn', 'calColorPop', 'calColorGrid', 'addCalBtn', 'mainView',
  'newCalUrl', 'addCalUrlBtn', 'calUrlStatus',
  'eventModal', 'evModalTitle', 'eventForm', 'evTitle', 'evCalendar', 'evCalDot', 'evDate',
  'evAllDay', 'evStart', 'evEnd', 'evLocation', 'evNotes', 'evReminder',
  'evRepeat', 'evRepeatInterval', 'evRepeatUntil', 'evDelete', 'evCancel',
  'detailModal', 'detBody', 'detEdit', 'detDelete', 'detClose',
  'calDelModal', 'calDelText', 'calDelConfirm', 'calDelCancel'
];
const els = {};
ids.forEach(id => { els[id] = makeEl(); });

const store = {};
const documentElement = makeEl();
let fetchImpl = () => Promise.reject(new Error('fetch not stubbed'));
const sandbox = {
  fetch: (...args) => fetchImpl(...args),
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
assert.strictEqual(findAll(els.miniMonth, 'in-week').length, 7, 'week view highlights the selected week in the mini calendar');

els.viewMonth._handlers.click();
assert.strictEqual(els.mainView.children[0].className, 'month-grid');
assert.strictEqual(findAll(els.miniMonth, 'in-week').length, 0, 'month view clears the week highlight');

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
els.newCalColorBtn._handlers.click();
assert.strictEqual(els.calColorPop.hidden, false, 'color palette opens');
const palSwatches = findAll(els.calColorGrid, 'pal-swatch');
assert.strictEqual(palSwatches.length, 20, 'palette offers 20 preset colors');
const redSwatch = palSwatches.filter(s => s.title === '#f44336')[0];
assert.ok(redSwatch, 'palette contains #f44336');
redSwatch._handlers.click();
assert.strictEqual(els.calColorPop.hidden, true, 'palette closes after picking a color');
assert.strictEqual(els.newCalColorBtn.style.background, '#f44336', 'color button shows the picked color');
els.addCalBtn._handlers.click();
assert.strictEqual(els.calendarList.children.length, 4, 'calendar added to sidebar');
let cals = JSON.parse(store[CALENDARS_KEY]);
assert.strictEqual(cals.length, 4);
assert.strictEqual(cals[3].name, 'Trips');
assert.strictEqual(cals[3].color, '#f44336');
const tripsId = cals[3].id;

els.newEventBtn._handlers.click();
assert.strictEqual(els.evCalendar.children.length, 4, 'event modal lists the new calendar');
els.evCalendar.value = tripsId;
els.evCalendar._handlers.change();
assert.strictEqual(els.evCalDot.style.background, '#f44336', 'dot follows the selected calendar');
els.evCancel._handlers.click();

const row0 = els.calendarList.children[0];
const swatch = row0.children[0];
assert.strictEqual(swatch.className, 'cal-swatch', 'row starts with a color swatch button');
swatch._handlers.click();
assert.strictEqual(els.calColorPop.hidden, false, 'palette opens to recolor a calendar');
const blueSwatch = findAll(els.calColorGrid, 'pal-swatch').filter(s => s.title === '#2196f3')[0];
assert.ok(blueSwatch, 'palette contains #2196f3');
blueSwatch._handlers.click();
assert.strictEqual(els.calColorPop.hidden, true, 'palette closes after recolor');
cals = JSON.parse(store[CALENDARS_KEY]);
assert.strictEqual(cals[0].color, '#2196f3', 'recolor persisted');

const tripsRow = els.calendarList.children[3];
const delBtn = tripsRow.children[3];
assert.strictEqual(delBtn.className, 'cal-del');
delBtn._handlers.click();
assert.strictEqual(els.calDelModal.hidden, false, 'delete confirmation popup opens');
assert.ok(els.calDelText.textContent.indexOf('Trips') !== -1, 'popup names the calendar to delete');
const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'public', 'calendar-app', 'index.html'), 'utf8');
assert.ok(/id="calDelConfirm"[^>]*class="[^"]*danger/.test(html), 'popup delete button uses the red danger style');
els.calDelCancel._handlers.click();
assert.strictEqual(els.calDelModal.hidden, true, 'cancel closes the popup');
cals = JSON.parse(store[CALENDARS_KEY]);
assert.strictEqual(cals.length, 4, 'cancel keeps the calendar');
delBtn._handlers.click();
els.calDelConfirm._handlers.click();
assert.strictEqual(els.calDelModal.hidden, true, 'popup closes after confirming');
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

(async () => {
  const flush = () => new Promise(r => setImmediate(r));
  const ymd = today.replace(/-/g, '');
  const ICS = [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:Team Events',
    'BEGIN:VEVENT',
    'UID:evt-1@example.com',
    'SUMMARY:Standup',
    'DTSTART:20260601T090000',
    'DTEND:20260601T093000',
    'RRULE:FREQ=DAILY;UNTIL=20260603',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-2@example.com',
    'SUMMARY:Release day',
    'DTSTART;VALUE=DATE:20260605',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-3@example.com',
    'SUMMARY:Url ping',
    'DTSTART:' + ymd + 'T090000',
    'DTEND:' + ymd + 'T093000',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  let requestedUrl = null;
  fetchImpl = (u) => {
    requestedUrl = u;
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(ICS) });
  };

  els.newCalUrl.value = 'https://cal.example.com/team.ics';
  els.addCalUrlBtn._handlers.click();
  assert.strictEqual(els.calUrlStatus.hidden, false, 'status shows while loading');
  await flush(); await flush(); await flush();
  assert.strictEqual(requestedUrl, 'https://cal.example.com/team.ics', 'feed URL was fetched');
  let cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals.length, 4, 'url calendar added to storage');
  const urlCal = cals[3];
  assert.strictEqual(urlCal.url, 'https://cal.example.com/team.ics');
  assert.strictEqual(urlCal.name, 'Team Events', 'calendar name comes from X-WR-CALNAME');
  assert.strictEqual(urlCal.color, '#f44336', 'url calendar uses the pending color');
  assert.strictEqual(els.newCalUrl.value, '', 'url input cleared after add');
  assert.ok(els.calUrlStatus.textContent.indexOf('3 events') !== -1, 'status reports imported event count');
  assert.strictEqual(els.calendarList.children.length, 4, 'url calendar listed in sidebar');
  let evs = JSON.parse(store[STORAGE_KEY]);
  assert.strictEqual(evs.length, 4, 'previous event plus three imported');
  const imported = evs.filter(e => e.calendarId === urlCal.id);
  assert.strictEqual(imported.length, 3);
  assert.strictEqual(imported[0].title, 'Standup');
  assert.strictEqual(imported[0].repeat.freq, 'daily');
  assert.strictEqual(imported[0].repeat.until, '2026-06-03');
  assert.strictEqual(imported[1].allDay, true);
  assert.strictEqual(imported[1].date, '2026-06-05');

  const urlRow = els.calendarList.children[3];
  const refreshBtn = urlRow.children[3];
  assert.strictEqual(refreshBtn.className, 'cal-refresh', 'url calendar row has a refresh button');
  refreshBtn._handlers.click({ stopPropagation() {} });
  await flush(); await flush(); await flush();
  assert.ok(els.calUrlStatus.textContent.indexOf('Refreshed') !== -1, 'refresh announces the result');
  evs = JSON.parse(store[STORAGE_KEY]);
  assert.strictEqual(evs.filter(e => e.calendarId === urlCal.id).length, 3, 'refresh replaces events instead of duplicating them');

  els.newEventBtn._handlers.click();
  assert.strictEqual(els.evCalendar.children.length, 3, 'url calendar is not offered for new events');
  els.evCancel._handlers.click();

  const pingRow = findAll(els.mainView, 'ag-row').find(r => texts(r).join(' ').indexOf('Url ping') !== -1);
  assert.ok(pingRow, 'imported event renders in the agenda');
  pingRow._handlers.click();
  assert.strictEqual(els.detailModal.hidden, false, 'detail modal opens for imported event');
  assert.strictEqual(els.detEdit.style.display, 'none', 'edit hidden for url-sourced event');
  assert.strictEqual(els.detDelete.style.display, 'none', 'delete hidden for url-sourced event');
  els.detClose._handlers.click();

  const delBtn = urlRow.children[4];
  assert.strictEqual(delBtn.className, 'cal-del');
  delBtn._handlers.click();
  assert.strictEqual(els.calDelModal.hidden, false, 'delete confirmation opens');
  assert.ok(els.calDelText.textContent.indexOf('Unsubscribe') !== -1, 'url calendar uses unsubscribe wording');
  assert.ok(els.calDelText.textContent.indexOf('3 events') !== -1, 'popup counts the events that will be removed');
  els.calDelConfirm._handlers.click();
  cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals.length, 3, 'url calendar removed');
  evs = JSON.parse(store[STORAGE_KEY]);
  assert.strictEqual(evs.length, 1, 'imported events removed with the calendar');
  assert.strictEqual(evs[0].title, 'Day off', 'local events untouched');

  els.newCalUrl.value = 'not-a-url';
  els.addCalUrlBtn._handlers.click();
  assert.strictEqual(els.calUrlStatus.hidden, false);
  assert.strictEqual(els.calUrlStatus.className, 'cal-url-status error', 'invalid URL shows an error');
  cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals.length, 3, 'invalid URL adds nothing');

  fetchImpl = () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('nope') });
  els.newCalUrl.value = 'https://cal.example.com/missing.ics';
  els.addCalUrlBtn._handlers.click();
  await flush(); await flush(); await flush();
  assert.strictEqual(els.calUrlStatus.className, 'cal-url-status error', 'failed fetch shows an error');
  assert.ok(els.calUrlStatus.textContent.indexOf('HTTP 404') !== -1, 'error includes the HTTP status');
  cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals.length, 3, 'failed fetch adds no calendar');

  // Inline rename: click the name, edit, Enter commits.
  const nameEl = els.calendarList.children[0].children[1];
  assert.strictEqual(nameEl.className, 'cal-name');
  nameEl._handlers.click({ stopPropagation() {} });
  const nameInput = els.calendarList.children[0].children[1];
  assert.strictEqual(nameInput.className, 'cal-name-input', 'clicking a calendar name opens an inline input');
  assert.strictEqual(nameInput.value, 'Personal');
  nameInput.value = 'Home';
  nameInput._handlers.keydown({ key: 'Enter', preventDefault() {} });
  cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals[0].name, 'Home', 'rename persisted to storage');
  assert.strictEqual(els.calendarList.children[0].children[1].textContent, 'Home', 'sidebar shows the new name');

  // Blur commits too; Escape cancels.
  els.calendarList.children[0].children[1]._handlers.click({ stopPropagation() {} });
  const input2 = els.calendarList.children[0].children[1];
  input2.value = 'Home 2';
  input2._handlers.blur();
  cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals[0].name, 'Home 2', 'blur commits the rename');
  els.calendarList.children[0].children[1]._handlers.click({ stopPropagation() {} });
  const input3 = els.calendarList.children[0].children[1];
  input3.value = 'Nope';
  input3._handlers.keydown({ key: 'Escape', preventDefault() {} });
  cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals[0].name, 'Home 2', 'escape cancels the rename');
  assert.strictEqual(els.calendarList.children[0].children[1].className, 'cal-name', 'input closes after escape');

  // Empty rename keeps the old name.
  els.calendarList.children[0].children[1]._handlers.click({ stopPropagation() {} });
  const input4 = els.calendarList.children[0].children[1];
  input4.value = '   ';
  input4._handlers.keydown({ key: 'Enter', preventDefault() {} });
  cals = JSON.parse(store[CALENDARS_KEY]);
  assert.strictEqual(cals[0].name, 'Home 2', 'blank name is rejected');

  console.log('Smoke test passed');
})().catch(e => { console.error(e); process.exit(1); });
