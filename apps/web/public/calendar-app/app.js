(function () {
  'use strict';

  var STORAGE_KEY = 'calendar.events.v1';

  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WEEKDAYS_LONG = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function toKey(y, m, d) {
    return y + '-' + pad2(m + 1) + '-' + pad2(d);
  }

  function dateToKey(date) {
    return toKey(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseKey(key) {
    var p = key.split('-');
    return { y: +p[0], m: +p[1] - 1, d: +p[2] };
  }

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

  function sortEvents(list) {
    return list.slice().sort(function (a, b) {
      var ta = a.time || '99:99';
      var tb = b.time || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return 0;
    });
  }

  function formatLong(key) {
    var p = parseKey(key);
    var d = new Date(p.y, p.m, p.d);
    return WEEKDAYS_LONG[d.getDay()] + ', ' + MONTHS[p.m] + ' ' + p.d + ', ' + p.y;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      STORAGE_KEY: STORAGE_KEY,
      buildMonth: buildMonth,
      toKey: toKey,
      dateToKey: dateToKey,
      parseKey: parseKey,
      sortEvents: sortEvents,
      formatLong: formatLong
    };
    return;
  }

  var now = new Date();
  var view = { year: now.getFullYear(), month: now.getMonth() };
  var selectedKey = dateToKey(now);
  var events = load();

  var els = {
    prevBtn: document.getElementById('prevBtn'),
    todayBtn: document.getElementById('todayBtn'),
    nextBtn: document.getElementById('nextBtn'),
    monthTitle: document.getElementById('monthTitle'),
    grid: document.getElementById('grid'),
    agendaDate: document.getElementById('agendaDate'),
    eventForm: document.getElementById('eventForm'),
    titleInput: document.getElementById('titleInput'),
    timeInput: document.getElementById('timeInput'),
    agendaList: document.getElementById('agendaList')
  };

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
    }
  }

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function eventsOn(key) {
    return sortEvents(events[key] || []);
  }

  function addEvent(key, title, time) {
    title = (title || '').trim();
    if (!title) return false;
    if (!events[key]) events[key] = [];
    events[key].push({ id: uid(), title: title, time: time || '' });
    save();
    return true;
  }

  function deleteEvent(key, id) {
    if (!events[key]) return;
    events[key] = events[key].filter(function (e) { return e.id !== id; });
    if (!events[key].length) delete events[key];
    save();
  }

  function select(key) {
    selectedKey = key;
    render();
  }

  function shiftMonth(delta) {
    var d = new Date(view.year, view.month + delta, 1);
    view.year = d.getFullYear();
    view.month = d.getMonth();
    render();
  }

  function render() {
    els.monthTitle.textContent = MONTHS[view.month] + ' ' + view.year;
    var today = dateToKey(new Date());
    var cells = buildMonth(view.year, view.month);

    els.grid.innerHTML = '';
    WEEKDAYS.forEach(function (w) {
      var h = document.createElement('div');
      h.className = 'weekday';
      h.textContent = w;
      els.grid.appendChild(h);
    });

    cells.forEach(function (cell) {
      var div = document.createElement('div');
      div.className = 'day'
        + (cell.inMonth ? '' : ' outside')
        + (cell.key === today ? ' today' : '')
        + (cell.key === selectedKey ? ' selected' : '');
      div.dataset.key = cell.key;

      var num = document.createElement('span');
      num.className = 'day-num';
      num.textContent = cell.date.getDate();
      div.appendChild(num);

      var list = eventsOn(cell.key);
      list.slice(0, 3).forEach(function (ev) {
        var chip = document.createElement('div');
        chip.className = 'event';
        chip.textContent = (ev.time ? ev.time + ' ' : '') + ev.title;
        div.appendChild(chip);
      });
      if (list.length > 3) {
        var more = document.createElement('div');
        more.className = 'more';
        more.textContent = '+' + (list.length - 3) + ' more';
        div.appendChild(more);
      }

      div.addEventListener('click', function () { select(cell.key); });
      els.grid.appendChild(div);
    });

    renderAgenda();
  }

  function renderAgenda() {
    els.agendaDate.textContent = formatLong(selectedKey);
    var list = eventsOn(selectedKey);
    els.agendaList.innerHTML = '';

    if (!list.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No events yet.';
      els.agendaList.appendChild(empty);
      return;
    }

    list.forEach(function (ev) {
      var li = document.createElement('li');

      var time = document.createElement('span');
      time.className = 'ev-time';
      time.textContent = ev.time || 'All day';

      var title = document.createElement('span');
      title.className = 'ev-title';
      title.textContent = ev.title;

      var del = document.createElement('button');
      del.className = 'ev-del';
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete event');
      del.addEventListener('click', function () {
        deleteEvent(selectedKey, ev.id);
        render();
      });

      li.appendChild(time);
      li.appendChild(title);
      li.appendChild(del);
      els.agendaList.appendChild(li);
    });
  }

  els.prevBtn.addEventListener('click', function () { shiftMonth(-1); });
  els.nextBtn.addEventListener('click', function () { shiftMonth(1); });
  els.todayBtn.addEventListener('click', function () {
    var n = new Date();
    view.year = n.getFullYear();
    view.month = n.getMonth();
    select(dateToKey(n));
  });

  els.eventForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = addEvent(selectedKey, els.titleInput.value, els.timeInput.value);
    if (ok) {
      els.titleInput.value = '';
      els.timeInput.value = '';
      els.titleInput.focus();
      render();
    }
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') shiftMonth(-1);
    else if (e.key === 'ArrowRight') shiftMonth(1);
  });

  render();
})();
