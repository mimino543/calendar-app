const assert = require('assert');
const fs = require('fs');
const path = require('path');

const APP_JS = path.join(__dirname, '..', 'apps', 'web', 'public', 'calendar-app', 'app.js');
const src = fs.readFileSync(APP_JS, 'utf8');

const loadApp = () => {
  const module = { exports: {} };
  new Function('module', 'exports', src)(module, module.exports);
  return module.exports;
};

const {
  buildMonth, buildWeek, toKey, dateToKey, parseKey, keyToDate,
  addDaysKey, addMonthsKey, addYearsKey, minutesOf, timeOf,
  sortEvents, formatLong, formatShort, repeatLabel, repeatOccurrences,
  eventOccurrences, defaultCalendars, CALENDAR_COLORS, STORAGE_KEY, CALENDARS_KEY, THEME_KEY
} = loadApp();
const {
  pad2, unfoldIcs, parseIcsLine, icsUnescape, parseIcsDateTime, parseIcsDurationMs, parseIcsRrule, parseIcs
} = loadApp();

assert.strictEqual(STORAGE_KEY, 'calendar.events.v2');
assert.strictEqual(typeof CALENDARS_KEY, 'string');
assert.strictEqual(typeof THEME_KEY, 'string');

// buildMonth: weeks start on Monday. February 2021 (Feb 1 2021 was a Monday, grid starts Feb 1).
const feb = buildMonth(2021, 1);
assert.strictEqual(feb.length, 42);
assert.strictEqual(feb[0].key, '2021-02-01');
assert.strictEqual(feb[0].inMonth, true);
assert.strictEqual(feb[27].key, '2021-02-28');
assert.strictEqual(feb[27].inMonth, true);
assert.strictEqual(feb[28].key, '2021-03-01');
assert.strictEqual(feb[28].inMonth, false);

// buildMonth: April 2023 (Apr 1 2023 was a Saturday, grid starts Monday Mar 27).
const apr = buildMonth(2023, 3);
assert.strictEqual(apr[0].key, '2023-03-27');
assert.strictEqual(apr[0].inMonth, false);
assert.strictEqual(apr[5].key, '2023-04-01');
assert.strictEqual(apr[5].inMonth, true);
assert.strictEqual(apr[34].key, '2023-04-30');
assert.strictEqual(apr[35].key, '2023-05-01');

// buildMonth: June 2025 starts on a Sunday, so the Monday-first grid starts May 26.
const jun = buildMonth(2025, 5);
assert.strictEqual(jun[0].key, '2025-05-26');
assert.strictEqual(jun[6].key, '2025-06-01');
assert.strictEqual(jun[35].key, '2025-06-30');
assert.strictEqual(jun[36].key, '2025-07-01');

// buildWeek: anchored to the Monday on/before the given day.
const wk = buildWeek('2025-06-18');
assert.strictEqual(wk.length, 7);
assert.strictEqual(wk[0].key, '2025-06-16');
assert.strictEqual(wk[6].key, '2025-06-22');
assert.strictEqual(buildWeek('2025-06-15')[0].key, '2025-06-09', 'a Sunday belongs to the week that started the previous Monday');
assert.strictEqual(buildWeek('2025-06-16')[0].key, '2025-06-16', 'a Monday starts its own week');

// Key helpers.
assert.strictEqual(toKey(2025, 11, 5), '2025-12-05');
assert.deepStrictEqual(parseKey('2025-12-05'), { y: 2025, m: 11, d: 5 });
assert.strictEqual(dateToKey(new Date(2025, 0, 9)), '2025-01-09');
assert.strictEqual(formatLong('2025-06-15'), 'Sunday, June 15, 2025');
assert.strictEqual(formatShort('2025-06-15'), 'Jun 15');
assert.deepStrictEqual(
  { y: keyToDate('2025-06-15').getFullYear(), m: keyToDate('2025-06-15').getMonth(), d: keyToDate('2025-06-15').getDate() },
  { y: 2025, m: 5, d: 15 }
);

// Date arithmetic.
assert.strictEqual(addDaysKey('2025-12-31', 1), '2026-01-01');
assert.strictEqual(addDaysKey('2025-03-01', -1), '2025-02-28');
assert.strictEqual(addMonthsKey('2025-01-31', 1), '2025-02-28');
assert.strictEqual(addMonthsKey('2024-01-31', 1), '2024-02-29');
assert.strictEqual(addYearsKey('2024-02-29', 1), '2025-02-28');
assert.strictEqual(addMonthsKey('2025-06-15', -7), '2024-11-15');

// Time helpers.
assert.strictEqual(minutesOf('09:30'), 570);
assert.strictEqual(minutesOf(''), null);
assert.strictEqual(timeOf(570), '09:30');
assert.strictEqual(timeOf(1500), '01:00');
assert.strictEqual(timeOf(-30), '23:30');

// sortEvents: by date, then start time, then title; input not mutated.
const sorted = sortEvents([
  { date: '2025-06-02', start: '10:00', title: 'b' },
  { date: '2025-06-01', start: '', title: 'a' },
  { date: '2025-06-01', start: '09:00', title: 'c' }
]);
assert.deepStrictEqual(sorted.map(e => e.title), ['c', 'a', 'b']);
const input = [{ date: '2025-06-01', start: '', title: 'x' }];
sortEvents(input);
assert.strictEqual(input.length, 1);

// Recurrence.
const daily = { date: '2025-06-01', repeat: { freq: 'daily', interval: 2, until: '' } };
assert.deepStrictEqual(
  repeatOccurrences(daily, '2025-06-01', '2025-06-10'),
  ['2025-06-01', '2025-06-03', '2025-06-05', '2025-06-07', '2025-06-09']
);
const dailyUntil = { date: '2025-06-01', repeat: { freq: 'daily', interval: 2, until: '2025-06-05' } };
assert.deepStrictEqual(
  repeatOccurrences(dailyUntil, '2025-06-01', '2025-06-30'),
  ['2025-06-01', '2025-06-03', '2025-06-05']
);
const weekly = { date: '2025-06-04', repeat: { freq: 'weekly', interval: 1, until: '' } };
assert.deepStrictEqual(
  repeatOccurrences(weekly, '2025-06-01', '2025-06-30'),
  ['2025-06-04', '2025-06-11', '2025-06-18', '2025-06-25']
);
const monthly = { date: '2025-01-31', repeat: { freq: 'monthly', interval: 1, until: '' } };
assert.deepStrictEqual(
  repeatOccurrences(monthly, '2025-01-01', '2025-04-30'),
  ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']
);
const yearly = { date: '2024-02-29', repeat: { freq: 'yearly', interval: 1, until: '' } };
assert.deepStrictEqual(
  repeatOccurrences(yearly, '2024-01-01', '2027-12-31'),
  ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']
);
const single = { date: '2025-06-10', repeat: { freq: 'none', interval: 1, until: '' } };
assert.deepStrictEqual(repeatOccurrences(single, '2025-06-01', '2025-06-30'), ['2025-06-10']);
assert.deepStrictEqual(repeatOccurrences(single, '2025-07-01', '2025-07-31'), []);

// Occurrence expansion with times.
const occ = eventOccurrences(
  { date: '2025-06-10', start: '09:00', end: '10:30', allDay: false, repeat: { freq: 'none' } },
  '2025-06-01', '2025-06-30'
);
assert.strictEqual(occ.length, 1);
assert.strictEqual(occ[0].startMin, 540);
assert.strictEqual(occ[0].endMin, 630);
assert.strictEqual(occ[0].allDay, false);
const allDayOcc = eventOccurrences(
  { date: '2025-06-10', start: '', end: '', allDay: true, repeat: { freq: 'none' } },
  '2025-06-01', '2025-06-30'
);
assert.deepStrictEqual([allDayOcc[0].startMin, allDayOcc[0].endMin, allDayOcc[0].allDay], [0, 1440, true]);
const badEnd = eventOccurrences(
  { date: '2025-06-10', start: '09:00', end: '08:00', allDay: false, repeat: { freq: 'none' } },
  '2025-06-01', '2025-06-30'
);
assert.strictEqual(badEnd[0].endMin, 600);

// Labels.
assert.strictEqual(repeatLabel({ freq: 'none' }), 'Does not repeat');
assert.strictEqual(repeatLabel({ freq: 'weekly', interval: 2, until: '' }), 'Every 2 weeks');
assert.strictEqual(repeatLabel({ freq: 'daily', interval: 1, until: '2025-12-31' }), 'Daily until 2025-12-31');
assert.strictEqual(repeatLabel(null), 'Does not repeat');

// Default calendars.
const cals = defaultCalendars();
assert.strictEqual(cals.length, 3);
assert.deepStrictEqual(cals.map(c => c.id), ['personal', 'work', 'family']);
assert.ok(cals.every(c => c.color && c.visible === true));

// Color preset: exactly 20 unique valid hex colors, and defaults come from it.
assert.strictEqual(CALENDAR_COLORS.length, 20);
assert.strictEqual(new Set(CALENDAR_COLORS).size, 20, 'preset colors are unique');
assert.ok(CALENDAR_COLORS.every(c => /^#[0-9a-f]{6}$/i.test(c)), 'preset colors are 6-digit hex');
assert.ok(cals.every(c => CALENDAR_COLORS.indexOf(c.color) !== -1), 'default calendars use preset colors');

// Dark theme must set color-scheme so native date/time picker icons stay visible.
const CSS = path.join(__dirname, '..', 'apps', 'web', 'public', 'calendar-app', 'styles.css');
const css = fs.readFileSync(CSS, 'utf8');
assert.ok(/:root\s*\{[^}]*color-scheme:\s*dark/.test(css), 'dark theme sets color-scheme: dark');
assert.ok(/:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/.test(css), 'light theme sets color-scheme: light');

// The color palette popover must float above the main calendar and modals.
const zIndex = sel => {
  const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*z-index:\\s*(\\d+)'));
  return m ? +m[1] : null;
};
assert.ok(zIndex('.cal-color-pop') !== null && zIndex('.cal-color-pop') > (zIndex('.modal') || 0),
  'color palette has a higher z-index than modals');
assert.ok(/\.cal-color-pop\s*\{[^}]*position:\s*fixed/.test(css), 'color palette uses fixed positioning so it is not clipped by the sidebar');
const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'public', 'calendar-app', 'index.html'), 'utf8');
const asideBlock = /<aside class="sidebar">[\s\S]*?<\/aside>/.exec(html);
assert.ok(asideBlock && asideBlock[0].indexOf('calColorPop') === -1 && /<div id="calColorPop"/.test(html),
  'color palette is a direct child of body, outside the scrollable sidebar, so it always floats above the calendar');

// In light mode the sidebar stays dark.
assert.ok(/:root\[data-theme="light"\]\s+\.sidebar\s*\{[^}]*background:\s*#1e1d29/.test(css),
  'light theme keeps the sidebar dark');

// In light mode the top bar is dark too, matching the sidebar.
assert.ok(/:root\[data-theme="light"\]\s+\.topbar\s*\{[^}]*--panel:\s*#1e1d29/.test(css),
  'light theme keeps the top bar dark');

// Mini calendar: today is a filled chip so it stays readable on the dark sidebar.
assert.ok(/\.mm-cell\.today\s*\{[^}]*background:\s*var\(--accent\)[^}]*color:\s*#fff/.test(css),
  'mini-calendar today uses a filled chip for contrast');

// Week highlight in the mini calendar is one continuous box across the whole week row.
assert.ok(/\.mm-cell\.in-week\s*\{[^}]*margin:\s*0 -1px/.test(css),
  'week cells close the grid gaps so the highlight is continuous');
assert.ok(/\.mm-cell\.in-week:nth-child\(7n\+1\)\s*\{[^}]*border-radius:\s*6px 0 0 6px/.test(css)
  && /\.mm-cell\.in-week:nth-child\(7n\)\s*\{[^}]*border-radius:\s*0 6px 6px 0/.test(css),
  'week box draws only the outer edges with rounded ends');

// Week/day header: the selected date is a small filled circle around the number.
const numRule = css.match(/\.wg-day-h \.wg-num\s*\{([^}]*)\}/);
assert.ok(numRule && /border-radius:\s*50%/.test(numRule[1]) && /width:\s*30px/.test(numRule[1]),
  'week/day header number renders as a small circle');
const selRule = css.match(/\.wg-day-h\.selected \.wg-num\s*\{([^}]*)\}/);
assert.ok(selRule && /outline:\s*2px solid var\(--accent\)/.test(selRule[1]) && !/background:\s*var\(--accent\)/.test(selRule[1]),
  'selected day is drawn as a ring so it differs from the filled today circle');
const todayRule = css.match(/\.wg-day-h\.today \.wg-num\s*\{([^}]*)\}/);
assert.ok(todayRule && /background:\s*var\(--today\)/.test(todayRule[1]), 'today keeps its filled circle');

// The sidebar never scrolls; everything in it stays visible.
assert.ok(/\.sidebar\s*\{[^}]*overflow:\s*hidden/.test(css), 'sidebar does not scroll');

// The URL status line fades out instead of lingering.
assert.ok(/\.cal-url-status\s*\{[^}]*transition:[^}]*opacity/.test(css)
  && /\.cal-url-status\.fade\s*\{[^}]*opacity:\s*0/.test(css),
  'url status text has a fade-out transition');

// ICS parsing: line unfolding and content-line splitting.
assert.deepStrictEqual(unfoldIcs('A:1\r\nB:2\r\n long\tline\rC:3\n'), ['A:1', 'B:2long\tline', 'C:3', '']);
assert.deepStrictEqual(unfoldIcs('SUMMARY:x\r\n y'), ['SUMMARY:xy'], 'unfolding removes the leading whitespace char');
assert.deepStrictEqual(parseIcsLine('DTSTART;TZID="America/New_York":20260115T090000'),
  { name: 'DTSTART', params: { TZID: 'America/New_York' }, value: '20260115T090000' });
assert.strictEqual(parseIcsLine('no colon here'), null);
assert.strictEqual(icsUnescape('a\\,b\\\\c\\;d\\ne'), 'a,b\\c;d\ne');

// ICS date/time values: floating, UTC, and all-day forms.
assert.deepStrictEqual(parseIcsDateTime('20260115T093000'), { date: '2026-01-15', time: '09:30', allDay: false });
assert.deepStrictEqual(parseIcsDateTime('20260115'), { date: '2026-01-15', time: '', allDay: true });
const utc = parseIcsDateTime('20260115T093000Z');
const utcLocal = new Date(Date.UTC(2026, 0, 15, 9, 30, 0));
assert.strictEqual(utc.date, dateToKey(utcLocal), 'UTC value converts to the local date');
assert.strictEqual(utc.time, pad2(utcLocal.getHours()) + ':' + pad2(utcLocal.getMinutes()), 'UTC value converts to the local time');
assert.strictEqual(utc.allDay, false);
assert.strictEqual(parseIcsDateTime('nope'), null);
assert.strictEqual(parseIcsDateTime('20261340T000000'), null);

// Durations and recurrence rules.
assert.strictEqual(parseIcsDurationMs('PT1H30M'), 90 * 60000);
assert.strictEqual(parseIcsDurationMs('P1DT2H'), 26 * 3600000);
assert.strictEqual(parseIcsDurationMs('P1W'), 7 * 24 * 3600000);
assert.strictEqual(parseIcsDurationMs('P'), null);
assert.deepStrictEqual(parseIcsRrule('FREQ=WEEKLY;INTERVAL=2;UNTIL=20260630'),
  { freq: 'weekly', interval: 2, until: '2026-06-30' });
assert.deepStrictEqual(parseIcsRrule('FREQ=DAILY;UNTIL=20260603T000000Z'),
  { freq: 'daily', interval: 1, until: dateToKey(new Date(Date.UTC(2026, 5, 3, 0, 0, 0))) });
assert.deepStrictEqual(parseIcsRrule('FREQ=HOURLY;COUNT=3'), { freq: 'none', interval: 1, until: '' });
assert.deepStrictEqual(parseIcsRrule(''), { freq: 'none', interval: 1, until: '' });

// Full VCALENDAR parse: recurrence, all-day, duration, cancelled, folded lines, escaping.
const ics = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:Team Events',
  'BEGIN:VEVENT',
  'UID:evt-1@example.com',
  'SUMMARY:Standup\\, daily',
  'DTSTART:20260601T090000',
  'DTEND:20260601T093000',
  'RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260603',
  'LOCATION:Room 1',
  'DESCRIPTION:Line one\\nLine two',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-2@example.com',
  'SUMMARY:Release day',
  'DTSTART;VALUE=DATE:20260605',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-3@example.com',
  'SUMMARY:Focus time',
  'DTSTART:20260610T140000',
  'DURATION:PT1H30M',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-4@example.com',
  'SUMMARY:Cancelled thing',
  'DTSTART:20260611T100000',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-5@example.com',
  'SUMMARY:Folded summary that is',
  '  very long',
  'DTSTART:20260612T080000',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');
const parsed = parseIcs(ics);
assert.strictEqual(parsed.name, 'Team Events');
assert.strictEqual(parsed.events.length, 4, 'cancelled event is skipped');
const e1 = parsed.events[0];
assert.deepStrictEqual(e1, {
  uid: 'evt-1@example.com',
  title: 'Standup, daily',
  date: '2026-06-01',
  start: '09:00',
  end: '09:30',
  allDay: false,
  location: 'Room 1',
  notes: 'Line one\nLine two',
  reminder: '',
  repeat: { freq: 'daily', interval: 1, until: '2026-06-03' }
});
const e2 = parsed.events[1];
assert.deepStrictEqual([e2.allDay, e2.date, e2.start, e2.end, e2.repeat.freq], [true, '2026-06-05', '', '', 'none']);
const e3 = parsed.events[2];
assert.deepStrictEqual([e3.date, e3.start, e3.end], ['2026-06-10', '14:00', '15:30'], 'DURATION extends the end time');
const e5 = parsed.events[3];
assert.strictEqual(e5.title, 'Folded summary that is very long', 'continuation lines are unfolded');
assert.strictEqual(e5.end, '09:00', 'missing end defaults to one hour after start');
assert.strictEqual(parseIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n').events.length, 0);
assert.strictEqual(parseIcs('BEGIN:VEVENT\r\nSUMMARY:No start\r\nEND:VEVENT').events.length, 0, 'event without DTSTART is skipped');

console.log('All logic tests passed');
