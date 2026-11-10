(function () {
  'use strict';

  var STORAGE_KEY = 'calendar.events.v2';
  var CALENDARS_KEY = 'calendar.calendars.v1';
  var THEME_KEY = 'calendar.theme.v1';
  var LEGACY_KEY = 'calendar.events.v1';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var HOUR_H = 48;

  var REMINDERS = { '5': '5 minutes before', '15': '15 minutes before', '30': '30 minutes before', '60': '1 hour before', '1440': '1 day before' };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toKey(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }
  function dateToKey(date) { return toKey(date.getFullYear(), date.getMonth(), date.getDate()); }
  function parseKey(key) { var p = key.split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  function keyToDate(key) { var p = parseKey(key); return new Date(p.y, p.m, p.d); }
  function todayKey() { return dateToKey(new Date()); }
  function addDaysKey(key, n) { var d = keyToDate(key); d.setDate(d.getDate() + n); return dateToKey(d); }
  function addMonthsKey(key, n) {
    var p = parseKey(key);
    var first = new Date(p.y, p.m + n, 1);
    var dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return toKey(first.getFullYear(), first.getMonth(), Math.min(p.d, dim));
  }
  function addYearsKey(key, n) { return addMonthsKey(key, n * 12); }

  function buildMonth(year, month) {
    var first = new Date(year, month, 1);
    var start = new Date(year, month, 1 - first.getDay());
    var cells = [];
    for (var i = 0; i < 42; i++) {
      var dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({ date: dt, key: dateToKey(dt), inMonth: dt.getMonth() === month });
    }
    return cells;
  }

  function buildWeek(anchorKey) {
    var d = keyToDate(anchorKey);
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    var cells = [];
    for (var i = 0; i < 7; i++) {
      var dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({ date: dt, key: dateToKey(dt) });
    }
    return cells;
  }

  function minutesOf(t) {
    if (!t) return null;
    var p = t.split(':');
    return (+p[0]) * 60 + (+p[1]);
  }
  function timeOf(min) {
    min = ((min % 1440) + 1440) % 1440;
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }

  function sortEvents(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var ta = a.start || '99:99';
      var tb = b.start || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      var na = a.title || '';
      var nb = b.title || '';
      if (na !== nb) return na < nb ? -1 : 1;
      return 0;
    });
  }

  function formatLong(key) {
    var p = parseKey(key);
    var d = new Date(p.y, p.m, p.d);
    return WEEKDAYS_LONG[d.getDay()] + ', ' + MONTHS[p.m] + ' ' + p.d + ', ' + p.y;
  }
  function formatShort(key) {
    var p = parseKey(key);
    return MONTHS_SHORT[p.m] + ' ' + p.d;
  }

  function repeatLabel(rep) {
    if (!rep || !rep.freq || rep.freq === 'none') return 'Does not repeat';
    var n = Math.max(1, rep.interval || 1);
    var base = rep.freq === 'daily' ? (n === 1 ? 'Daily' : 'Every ' + n + ' days')
      : rep.freq === 'weekly' ? (n === 1 ? 'Weekly' : 'Every ' + n + ' weeks')
      : rep.freq === 'monthly' ? (n === 1 ? 'Monthly' : 'Every ' + n + ' months')
      : rep.freq === 'yearly' ? (n === 1 ? 'Yearly' : 'Every ' + n + ' years')
      : 'Does not repeat';
    return base + (rep.until ? ' until ' + rep.until : '');
  }

  function reminderLabel(v) { return REMINDERS[v] || v || 'None'; }

  function repeatOccurrences(ev, fromKey, toKey) {
    var rep = ev.repeat || { freq: 'none' };
    var freq = rep.freq || 'none';
    var interval = Math.max(1, rep.interval || 1);
    var until = rep.until || '';
    var out = [];
    if (freq === 'none') {
      if (ev.date >= fromKey && ev.date <= toKey) out.push(ev.date);
      return out;
    }
    var n = 0;
    var guard = 0;
    while (guard < 10000) {
      var cur;
      if (freq === 'daily') cur = addDaysKey(ev.date, n * interval);
      else if (freq === 'weekly') cur = addDaysKey(ev.date, n * interval * 7);
      else if (freq === 'monthly') cur = addMonthsKey(ev.date, n * interval);
      else if (freq === 'yearly') cur = addYearsKey(ev.date, n * interval);
      else break;
      if (cur > toKey) break;
      if (cur >= fromKey && (!until || cur <= until)) out.push(cur);
      if (until && cur >= until) break;
      n++;
      guard++;
    }
    return out;
  }

  function eventOccurrences(ev, fromKey, toKey) {
    return repeatOccurrences(ev, fromKey, toKey).map(function (key) {
      var s = ev.allDay ? 0 : (minutesOf(ev.start) || 0);
      var e = ev.allDay ? 1440 : (minutesOf(ev.end) || 0);
      if (e <= s) e = s + 60;
      return { key: key, startMin: s, endMin: e, allDay: !!ev.allDay, event: ev };
    });
  }

  var CALENDAR_COLORS = [
    '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#6d5ae0',
    '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688',
    '#2f9e6e', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b',
    '#ffc107', '#e8890c', '#ff5722', '#795548', '#607d8b'
  ];

  function defaultCalendars() {
    return [
      { id: 'personal', name: 'Personal', color: '#6d5ae0', visible: true },
      { id: 'work', name: 'Work', color: '#2f9e6e', visible: true },
      { id: 'family', name: 'Family', color: '#e8890c', visible: true }
    ];
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      STORAGE_KEY: STORAGE_KEY,
      CALENDARS_KEY: CALENDARS_KEY,
      THEME_KEY: THEME_KEY,
      LEGACY_KEY: LEGACY_KEY,
      HOUR_H: HOUR_H,
      pad2: pad2,
      toKey: toKey,
      dateToKey: dateToKey,
      parseKey: parseKey,
      keyToDate: keyToDate,
      todayKey: todayKey,
      addDaysKey: addDaysKey,
      addMonthsKey: addMonthsKey,
      addYearsKey: addYearsKey,
      buildMonth: buildMonth,
      buildWeek: buildWeek,
      minutesOf: minutesOf,
      timeOf: timeOf,
      sortEvents: sortEvents,
      formatLong: formatLong,
      formatShort: formatShort,
      repeatLabel: repeatLabel,
      reminderLabel: reminderLabel,
      repeatOccurrences: repeatOccurrences,
      eventOccurrences: eventOccurrences,
      defaultCalendars: defaultCalendars,
      CALENDAR_COLORS: CALENDAR_COLORS
    };
    return;
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  var events = loadJSON(STORAGE_KEY, []);
  var calendars = loadJSON(CALENDARS_KEY, null) || defaultCalendars();
  var theme = loadJSON(THEME_KEY, '') || 'dark';

  function migrateLegacy() {
    var raw = null;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var old = JSON.parse(raw);
      var changed = false;
      Object.keys(old || {}).forEach(function (k) {
        (old[k] || []).forEach(function (o) {
          var start = o.time || '';
          events.push({
            id: o.id || uid(),
            title: o.title || 'Event',
            calendarId: 'personal',
            date: k,
            start: start,
            end: start ? timeOf(minutesOf(start) + 60) : '',
            allDay: !start,
            location: '',
            notes: '',
            reminder: '',
            repeat: { freq: 'none', interval: 1, until: '' }
          });
          changed = true;
        });
      });
      if (changed) saveJSON(STORAGE_KEY, events);
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}
  }

  var today = todayKey();
  var state = { view: 'month', cursor: today, selected: today, editing: null };
  var pendingColor = '#6d5ae0';
  var paletteTarget = null;

  var els = {
    viewLabel: document.getElementById('viewLabel'),
    prevBtn: document.getElementById('prevBtn'),
    todayBtn: document.getElementById('todayBtn'),
    nextBtn: document.getElementById('nextBtn'),
    newEventBtn: document.getElementById('newEventBtn'),
    themeToggle: document.getElementById('themeToggle'),
    viewMonth: document.getElementById('viewMonth'),
    viewWeek: document.getElementById('viewWeek'),
    viewDay: document.getElementById('viewDay'),
    viewAgenda: document.getElementById('viewAgenda'),
    miniMonth: document.getElementById('miniMonth'),
    calendarList: document.getElementById('calendarList'),
    newCalName: document.getElementById('newCalName'),
    newCalColorBtn: document.getElementById('newCalColorBtn'),
    calColorPop: document.getElementById('calColorPop'),
    calColorGrid: document.getElementById('calColorGrid'),
    addCalBtn: document.getElementById('addCalBtn'),
    mainView: document.getElementById('mainView'),
    eventModal: document.getElementById('eventModal'),
    evModalTitle: document.getElementById('evModalTitle'),
    eventForm: document.getElementById('eventForm'),
    evTitle: document.getElementById('evTitle'),
    evCalendar: document.getElementById('evCalendar'),
    evCalDot: document.getElementById('evCalDot'),
    evDate: document.getElementById('evDate'),
    evAllDay: document.getElementById('evAllDay'),
    evStart: document.getElementById('evStart'),
    evEnd: document.getElementById('evEnd'),
    evLocation: document.getElementById('evLocation'),
    evNotes: document.getElementById('evNotes'),
    evReminder: document.getElementById('evReminder'),
    evRepeat: document.getElementById('evRepeat'),
    evRepeatInterval: document.getElementById('evRepeatInterval'),
    evRepeatUntil: document.getElementById('evRepeatUntil'),
    evDelete: document.getElementById('evDelete'),
    evCancel: document.getElementById('evCancel'),
    detailModal: document.getElementById('detailModal'),
    detBody: document.getElementById('detBody'),
    detEdit: document.getElementById('detEdit'),
    detDelete: document.getElementById('detDelete'),
    detClose: document.getElementById('detClose')
  };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function calendarById(id) {
    for (var i = 0; i < calendars.length; i++) if (calendars[i].id === id) return calendars[i];
    return calendars[0];
  }
  function colorOf(ev) { var c = calendarById(ev.calendarId); return c ? c.color : '#6d5ae0'; }
  function isVisible(ev) { var c = calendarById(ev.calendarId); return !c || c.visible !== false; }

  function occurrencesBetween(fromKey, toKey) {
    var out = [];
    events.forEach(function (ev) {
      if (!isVisible(ev)) return;
      eventOccurrences(ev, fromKey, toKey).forEach(function (occ) { out.push(occ); });
    });
    out.sort(function (a, b) {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startMin - b.startMin;
    });
    return out;
  }

  function sortOccs(list) {
    return list.slice().sort(function (a, b) {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startMin - b.startMin;
    });
  }

  function layoutDay(occs) {
    var sorted = occs.slice().sort(function (a, b) {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return b.endMin - a.endMin;
    });
    var clusters = [];
    sorted.forEach(function (o) {
      var cl = null;
      for (var i = 0; i < clusters.length; i++) {
        if (clusters[i].end > o.startMin) { cl = clusters[i]; break; }
      }
      if (!cl) { cl = { end: 0, items: [] }; clusters.push(cl); }
      cl.end = Math.max(cl.end, o.endMin);
      cl.items.push(o);
    });
    clusters.forEach(function (cl) {
      var colEnds = [];
      cl.items.forEach(function (o) {
        var col = 0;
        while (col < colEnds.length && colEnds[col] > o.startMin) col++;
        if (col === colEnds.length) colEnds.push(0);
        colEnds[col] = o.endMin;
        o._col = col;
      });
      var n = Math.max(1, colEnds.length);
      cl.items.forEach(function (o) {
        o.leftPct = (o._col / n) * 100;
        o.widthPct = 100 / n;
      });
    });
    return sorted;
  }

  function periodLabel() {
    var c = state.cursor;
    if (state.view === 'month') {
      var p = parseKey(c);
      return MONTHS[p.m] + ' ' + p.y;
    }
    if (state.view === 'day') return formatLong(c);
    if (state.view === 'week') {
      var w = buildWeek(c);
      var a = w[0].key;
      var b = w[6].key;
      var pa = parseKey(a);
      var pb = parseKey(b);
      if (pa.y === pb.y && pa.m === pb.m) return formatShort(a) + ' – ' + pad2(pb.d) + ', ' + pb.y;
      if (pa.y === pb.y) return formatShort(a) + ' – ' + formatShort(b) + ', ' + pb.y;
      return formatShort(a) + ', ' + pa.y + ' – ' + formatShort(b) + ', ' + pb.y;
    }
    return 'Agenda';
  }

  function render() {
    els.viewLabel.textContent = periodLabel();
    var map = { month: els.viewMonth, week: els.viewWeek, day: els.viewDay, agenda: els.viewAgenda };
    Object.keys(map).forEach(function (v) {
      map[v].className = 'view-btn' + (state.view === v ? ' active' : '');
    });
    renderMini();
    renderCalendars();
    renderMain();
  }

  function renderMini() {
    var p = parseKey(state.cursor);
    els.miniMonth.innerHTML = '';
    var head = el('div', 'mm-head');
    head.appendChild(el('span', 'mm-title', MONTHS[p.m] + ' ' + p.y));
    els.miniMonth.appendChild(head);
    var grid = el('div', 'mm-grid');
    WEEKDAYS.forEach(function (w) { grid.appendChild(el('div', 'mm-wd', w)); });
    buildMonth(p.y, p.m).forEach(function (cell) {
      var c = el('div', 'mm-cell'
        + (cell.inMonth ? '' : ' outside')
        + (cell.key === today ? ' today' : '')
        + (cell.key === state.selected ? ' selected' : ''));
      c.textContent = String(cell.date.getDate());
      c.dataset.key = cell.key;
      c.addEventListener('click', function () {
        state.cursor = cell.key;
        state.selected = cell.key;
        render();
      });
      grid.appendChild(c);
    });
    els.miniMonth.appendChild(grid);
  }

  function renderCalendars() {
    els.calendarList.innerHTML = '';
    calendars.forEach(function (c, i) {
      var row = el('div', 'cal-item');
      var swatch = el('button', 'cal-swatch');
      swatch.type = 'button';
      swatch.style.background = c.color;
      swatch.title = 'Change color';
      swatch.setAttribute('aria-label', 'Change color of ' + c.name);
      swatch.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        togglePalette({ mode: 'cal', id: c.id }, swatch);
      });
      var name = el('span', 'cal-name', c.name);
      var toggle = el('input');
      toggle.type = 'checkbox';
      toggle.checked = c.visible !== false;
      toggle.title = 'Show/hide';
      toggle.addEventListener('change', function () {
        calendars[i].visible = toggle.checked;
        saveJSON(CALENDARS_KEY, calendars);
        render();
      });
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(toggle);
      if (calendars.length > 1) {
        var del = el('button', 'cal-del', '×');
        del.type = 'button';
        del.title = 'Delete calendar';
        del.addEventListener('click', function () { deleteCalendar(c.id); });
        row.appendChild(del);
      }
      els.calendarList.appendChild(row);
    });
  }

  function addCalendar() {
    var name = (els.newCalName.value || '').trim();
    if (!name) return;
    calendars.push({ id: uid(), name: name, color: pendingColor, visible: true });
    els.newCalName.value = '';
    saveJSON(CALENDARS_KEY, calendars);
    render();
  }

  function deleteCalendar(id) {
    if (calendars.length <= 1) return;
    var remaining = calendars.filter(function (c) { return c.id !== id; });
    var target = calendarById(id);
    if (typeof confirm === 'function') {
      if (!confirm('Delete calendar "' + (target ? target.name : id) + '"? Its events will move to "' + remaining[0].name + '".')) return;
    }
    calendars = remaining;
    var fallback = calendars[0].id;
    events.forEach(function (ev) { if (ev.calendarId === id) ev.calendarId = fallback; });
    saveJSON(CALENDARS_KEY, calendars);
    saveJSON(STORAGE_KEY, events);
    render();
  }

  function togglePalette(target, anchor) {
    if (!els.calColorPop.hidden && paletteTarget && paletteTarget.mode === target.mode && paletteTarget.id === target.id) {
      closePalette();
    } else {
      openPalette(target, anchor);
    }
  }

  function openPalette(target, anchor) {
    paletteTarget = target;
    renderPalette();
    els.calColorPop.hidden = false;
    if (anchor && typeof anchor.offsetTop === 'number') {
      els.calColorPop.style.top = (anchor.offsetTop + (anchor.offsetHeight || 24) + 6) + 'px';
      els.calColorPop.style.left = Math.max(0, anchor.offsetLeft || 0) + 'px';
    }
  }

  function closePalette() {
    els.calColorPop.hidden = true;
    paletteTarget = null;
  }

  function renderPalette() {
    els.calColorGrid.innerHTML = '';
    var current = paletteTarget && paletteTarget.mode === 'cal'
      ? (calendarById(paletteTarget.id) || {}).color
      : pendingColor;
    CALENDAR_COLORS.forEach(function (color) {
      var s = el('button', 'pal-swatch' + (color === current ? ' selected' : ''));
      s.type = 'button';
      s.style.background = color;
      s.title = color;
      s.setAttribute('aria-label', 'Color ' + color);
      s.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        applyPaletteColor(color);
      });
      els.calColorGrid.appendChild(s);
    });
  }

  function applyPaletteColor(color) {
    if (!paletteTarget) { closePalette(); return; }
    if (paletteTarget.mode === 'cal') {
      var c = calendarById(paletteTarget.id);
      if (c) {
        c.color = color;
        saveJSON(CALENDARS_KEY, calendars);
      }
      closePalette();
      render();
    } else {
      pendingColor = color;
      els.newCalColorBtn.style.background = color;
      closePalette();
    }
  }

  function renderMain() {
    els.mainView.innerHTML = '';
    if (state.view === 'month') renderMonthView();
    else if (state.view === 'week') renderTimeView(buildWeek(state.cursor));
    else if (state.view === 'day') renderTimeView([{ date: keyToDate(state.cursor), key: state.cursor }]);
    else renderAgendaView();
  }

  function renderMonthView() {
    var p = parseKey(state.cursor);
    var cells = buildMonth(p.y, p.m);
    var byKey = {};
    occurrencesBetween(cells[0].key, cells[41].key).forEach(function (o) {
      (byKey[o.key] = byKey[o.key] || []).push(o);
    });
    var wrap = el('div', 'month-grid');
    WEEKDAYS.forEach(function (w) { wrap.appendChild(el('div', 'weekday-h', w)); });
    cells.forEach(function (cell) {
      var c = el('div', 'm-cell'
        + (cell.inMonth ? '' : ' outside')
        + (cell.key === today ? ' today' : '')
        + (cell.key === state.selected ? ' selected' : ''));
      c.dataset.key = cell.key;
      c.appendChild(el('span', 'dnum', String(cell.date.getDate())));
      var list = sortOccs(byKey[cell.key] || []);
      list.slice(0, 3).forEach(function (o) {
        var chip = el('div', 'chip', (o.allDay ? '' : timeOf(o.startMin) + ' ') + o.event.title);
        chip.style.background = colorOf(o.event);
        chip.addEventListener('click', function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          openDetail(o.event);
        });
        c.appendChild(chip);
      });
      if (list.length > 3) c.appendChild(el('div', 'more', '+' + (list.length - 3) + ' more'));
      c.addEventListener('click', function () {
        state.selected = cell.key;
        state.cursor = cell.key;
        state.view = 'day';
        render();
      });
      wrap.appendChild(c);
    });
    els.mainView.appendChild(wrap);
  }

  function renderTimeView(days) {
    var byKey = {};
    occurrencesBetween(days[0].key, days[days.length - 1].key).forEach(function (o) {
      (byKey[o.key] = byKey[o.key] || []).push(o);
    });
    var wrap = el('div', 'week-wrap');
    var cols = '56px repeat(' + days.length + ', 1fr)';

    var head = el('div', 'wg-head');
    head.style.gridTemplateColumns = cols;
    head.appendChild(el('div', 'wg-corner'));
    days.forEach(function (d) {
      var h = el('div', 'wg-day-h'
        + (d.key === today ? ' today' : '')
        + (d.key === state.selected ? ' selected' : ''));
      h.appendChild(el('div', 'wg-wd', WEEKDAYS[d.date.getDay()]));
      h.appendChild(el('div', 'wg-num', String(d.date.getDate())));
      h.addEventListener('click', function () {
        state.cursor = d.key;
        state.selected = d.key;
        if (state.view === 'week') state.view = 'day';
        render();
      });
      head.appendChild(h);
    });
    wrap.appendChild(head);

    var ad = el('div', 'wg-allday');
    ad.style.gridTemplateColumns = cols;
    ad.appendChild(el('div', 'wg-corner'));
    days.forEach(function (d) {
      var cell = el('div', 'wg-allday-cell');
      sortOccs(byKey[d.key] || []).filter(function (o) { return o.allDay; }).forEach(function (o) {
        var chip = el('div', 'chip', o.event.title);
        chip.style.background = colorOf(o.event);
        chip.addEventListener('click', function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          openDetail(o.event);
        });
        cell.appendChild(chip);
      });
      ad.appendChild(cell);
    });
    wrap.appendChild(ad);

    var body = el('div', 'wg-body');
    var times = el('div', 'wg-times');
    for (var h = 0; h < 24; h++) {
      times.appendChild(el('div', 'wg-hour', (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? ' AM' : ' PM')));
    }
    body.appendChild(times);

    var colsEl = el('div', 'wg-cols');
    colsEl.style.gridTemplateColumns = 'repeat(' + days.length + ', 1fr)';
    days.forEach(function (d) {
      var col = el('div', 'wg-col');
      col.dataset.key = d.key;
      col.style.height = (24 * HOUR_H) + 'px';
      for (var hh = 0; hh < 24; hh++) {
        (function (hour) {
          var s = el('div', 'wg-slot');
          s.addEventListener('click', function (e) {
            var rect = col.getBoundingClientRect ? col.getBoundingClientRect() : { top: 0 };
            var y = (e && typeof e.clientY === 'number' ? e.clientY : hour * HOUR_H) - rect.top;
            var h2 = Math.min(23, Math.max(0, Math.floor(y / HOUR_H)));
            openEventModal({ date: d.key, start: timeOf(h2 * 60), end: timeOf((h2 + 1) * 60) });
          });
          col.appendChild(s);
        })(hh);
      }
      layoutDay((byKey[d.key] || []).filter(function (o) { return !o.allDay; })).forEach(function (o) {
        var b = el('div', 'ev-block', timeOf(o.startMin) + ' – ' + timeOf(o.endMin) + ' ' + o.event.title);
        b.style.background = colorOf(o.event);
        b.style.top = (o.startMin / 60 * HOUR_H) + 'px';
        b.style.height = Math.max(20, (o.endMin - o.startMin) / 60 * HOUR_H - 2) + 'px';
        b.style.left = 'calc(' + o.leftPct + '% + 2px)';
        b.style.width = 'calc(' + o.widthPct + '% - 4px)';
        b.addEventListener('click', function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          openDetail(o.event);
        });
        col.appendChild(b);
      });
      if (d.key === today) {
        var now = new Date();
        var line = el('div', 'now-line');
        line.style.top = ((now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_H) + 'px';
        col.appendChild(line);
      }
      colsEl.appendChild(col);
    });
    body.appendChild(colsEl);
    wrap.appendChild(body);
    els.mainView.appendChild(wrap);
  }

  function renderAgendaView() {
    var from = state.cursor < today ? today : state.cursor;
    var to = addDaysKey(from, 60);
    var occs = occurrencesBetween(from, to);
    var wrap = el('div', 'agenda-wrap');
    if (!occs.length) wrap.appendChild(el('div', 'agenda-empty', 'No upcoming events.'));
    var lastKey = '';
    occs.forEach(function (o) {
      if (o.key !== lastKey) {
        lastKey = o.key;
        wrap.appendChild(el('div', 'ag-day', formatLong(o.key)));
      }
      var row = el('div', 'ag-row');
      row.appendChild(el('span', 'ag-time', o.allDay ? 'All day' : timeOf(o.startMin) + ' – ' + timeOf(o.endMin)));
      var dot = el('span', 'cal-dot');
      dot.style.background = colorOf(o.event);
      row.appendChild(dot);
      row.appendChild(el('span', 'ag-title', o.event.title));
      row.appendChild(el('span', 'ag-cal', calendarById(o.event.calendarId).name));
      row.addEventListener('click', function () { openDetail(o.event); });
      wrap.appendChild(row);
    });
    els.mainView.appendChild(wrap);
  }

  function rebuildCalendarOptions(selectedId) {
    els.evCalendar.innerHTML = '';
    calendars.forEach(function (c) {
      var o = el('option', '', c.name);
      o.value = c.id;
      o.style.color = c.color;
      els.evCalendar.appendChild(o);
    });
    els.evCalendar.value = selectedId || (calendars[0] && calendars[0].id);
    updateCalDot();
  }

  function updateCalDot() {
    var c = calendarById(els.evCalendar.value);
    if (c) els.evCalDot.style.background = c.color;
  }

  function updateTimeFields() {
    var d = !!els.evAllDay.checked;
    els.evStart.disabled = d;
    els.evEnd.disabled = d;
  }

  function openEventModal(defaults, existing) {
    state.editing = existing || null;
    defaults = defaults || {};
    els.evModalTitle.textContent = existing ? 'Edit event' : 'New event';
    els.evTitle.value = existing ? existing.title : (defaults.title || '');
    els.evDate.value = existing ? existing.date : (defaults.date || state.selected);
    els.evAllDay.checked = existing ? !!existing.allDay : !!defaults.allDay;
    els.evStart.value = existing ? existing.start : (defaults.start || '09:00');
    els.evEnd.value = existing ? existing.end : (defaults.end || '10:00');
    els.evLocation.value = existing ? (existing.location || '') : '';
    els.evNotes.value = existing ? (existing.notes || '') : '';
    els.evReminder.value = existing ? (existing.reminder || '') : '';
    var rep = existing ? existing.repeat : (defaults.repeat || { freq: 'none', interval: 1, until: '' });
    els.evRepeat.value = (rep && rep.freq) || 'none';
    els.evRepeatInterval.value = String(Math.max(1, (rep && rep.interval) || 1));
    els.evRepeatUntil.value = (rep && rep.until) || '';
    els.evDelete.style.display = existing ? '' : 'none';
    rebuildCalendarOptions(existing ? existing.calendarId : (defaults.calendarId || 'personal'));
    updateTimeFields();
    els.eventModal.hidden = false;
    if (els.evTitle.focus) els.evTitle.focus();
  }

  function closeModals() {
    els.eventModal.hidden = true;
    els.detailModal.hidden = true;
    state.editing = null;
  }

  function onSave(e) {
    if (e && e.preventDefault) e.preventDefault();
    var title = (els.evTitle.value || '').trim();
    if (!title) return;
    var allDay = !!els.evAllDay.checked;
    var start = allDay ? '' : (els.evStart.value || '09:00');
    var end = allDay ? '' : (els.evEnd.value || '');
    if (!allDay) {
      var s = minutesOf(start);
      var en = minutesOf(end);
      if (s == null) s = 9 * 60;
      if (en == null || en <= s) en = s + 60;
      start = timeOf(s);
      end = timeOf(en);
    }
    var freq = els.evRepeat.value || 'none';
    var rep = freq === 'none'
      ? { freq: 'none', interval: 1, until: '' }
      : { freq: freq, interval: Math.max(1, parseInt(els.evRepeatInterval.value, 10) || 1), until: els.evRepeatUntil.value || '' };
    var ev = {
      id: state.editing ? state.editing.id : uid(),
      title: title,
      calendarId: els.evCalendar.value || 'personal',
      date: els.evDate.value || state.selected,
      start: start,
      end: end,
      allDay: allDay,
      location: (els.evLocation.value || '').trim(),
      notes: (els.evNotes.value || '').trim(),
      reminder: els.evReminder.value || '',
      repeat: rep
    };
    var found = false;
    for (var k = 0; k < events.length; k++) {
      if (events[k].id === ev.id) { events[k] = ev; found = true; break; }
    }
    if (!found) events.push(ev);
    saveJSON(STORAGE_KEY, events);
    closeModals();
    render();
  }

  function deleteEvent(id) {
    events = events.filter(function (e) { return e.id !== id; });
    saveJSON(STORAGE_KEY, events);
    closeModals();
    render();
  }

  function openDetail(ev) {
    var c = calendarById(ev.calendarId);
    state.editing = ev;
    els.detBody.innerHTML = '';
    els.detBody.appendChild(el('h3', 'det-title', ev.title));
    var when = formatLong(ev.date) + (ev.allDay ? ' · All day' : ' · ' + (ev.start || '00:00') + ' – ' + (ev.end || ''));
    els.detBody.appendChild(el('div', 'det-row', when));
    els.detBody.appendChild(el('div', 'det-row', 'Calendar: ' + (c ? c.name : '')));
    els.detBody.appendChild(el('div', 'det-row', repeatLabel(ev.repeat)));
    els.detBody.appendChild(el('div', 'det-row', 'Reminder: ' + reminderLabel(ev.reminder)));
    if (ev.location) els.detBody.appendChild(el('div', 'det-row', 'Location: ' + ev.location));
    if (ev.notes) els.detBody.appendChild(el('div', 'det-row det-notes', ev.notes));
    els.detailModal.hidden = false;
  }

  function shiftPeriod(delta) {
    if (state.view === 'month') state.cursor = addMonthsKey(state.cursor, delta);
    else if (state.view === 'week') state.cursor = addDaysKey(state.cursor, 7 * delta);
    else if (state.view === 'day') state.cursor = addDaysKey(state.cursor, delta);
    else state.cursor = addDaysKey(state.cursor, 30 * delta);
    state.selected = state.cursor;
    render();
  }

  function setView(v) { state.view = v; render(); }

  function goToday() {
    var t = todayKey();
    state.cursor = t;
    state.selected = t;
    render();
  }

  function applyTheme(t) {
    theme = t;
    document.documentElement.dataset.theme = t;
    els.themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
    saveJSON(THEME_KEY, t);
  }

  els.prevBtn.addEventListener('click', function () { shiftPeriod(-1); });
  els.nextBtn.addEventListener('click', function () { shiftPeriod(1); });
  els.todayBtn.addEventListener('click', goToday);
  els.newEventBtn.addEventListener('click', function () {
    openEventModal({ date: state.selected, start: '09:00', end: '10:00' });
  });
  els.themeToggle.addEventListener('click', function () { applyTheme(theme === 'dark' ? 'light' : 'dark'); });
  els.viewMonth.addEventListener('click', function () { setView('month'); });
  els.viewWeek.addEventListener('click', function () { setView('week'); });
  els.viewDay.addEventListener('click', function () { setView('day'); });
  els.viewAgenda.addEventListener('click', function () { setView('agenda'); });
  els.eventForm.addEventListener('submit', onSave);
  els.evAllDay.addEventListener('change', updateTimeFields);
  els.evCalendar.addEventListener('change', updateCalDot);
  els.addCalBtn.addEventListener('click', addCalendar);
  els.newCalColorBtn.addEventListener('click', function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    togglePalette({ mode: 'new' }, els.newCalColorBtn);
  });
  document.addEventListener('click', function (e) {
    if (els.calColorPop.hidden) return;
    var t = e && e.target;
    if (t && typeof els.calColorPop.contains === 'function' && els.calColorPop.contains(t)) return;
    closePalette();
  });
  els.newCalName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      addCalendar();
    }
  });
  els.evCancel.addEventListener('click', closeModals);
  els.evDelete.addEventListener('click', function () { if (state.editing) deleteEvent(state.editing.id); });
  els.detEdit.addEventListener('click', function () {
    var ev = state.editing;
    closeModals();
    if (ev) openEventModal(null, ev);
  });
  els.detDelete.addEventListener('click', function () { if (state.editing) deleteEvent(state.editing.id); });
  els.detClose.addEventListener('click', closeModals);
  els.eventModal.addEventListener('click', function (e) { if (e.target === els.eventModal) closeModals(); });
  els.detailModal.addEventListener('click', function (e) { if (e.target === els.detailModal) closeModals(); });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') { closeModals(); closePalette(); return; }
    if (e.key === 'ArrowLeft') shiftPeriod(-1);
    else if (e.key === 'ArrowRight') shiftPeriod(1);
  });

  migrateLegacy();
  applyTheme(theme);
  els.newCalColorBtn.style.background = pendingColor;
  render();
})();
