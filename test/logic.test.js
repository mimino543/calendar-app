const assert = require('assert');
const { buildMonth, toKey, dateToKey, parseKey, sortEvents, formatLong } = require('../app.js');

// February 2021: Feb 1 2021 was a Monday, so the grid starts on Sunday Jan 31.
const feb = buildMonth(2021, 1);
assert.strictEqual(feb.length, 42);
assert.strictEqual(feb[0].key, '2021-01-31');
assert.strictEqual(feb[0].inMonth, false);
assert.strictEqual(feb[1].key, '2021-02-01');
assert.strictEqual(feb[1].inMonth, true);
assert.strictEqual(feb[28].key, '2021-02-28');
assert.strictEqual(feb[28].inMonth, true);
assert.strictEqual(feb[29].key, '2021-03-01');
assert.strictEqual(feb[29].inMonth, false);

// April 2023: Apr 1 2023 was a Saturday, grid starts on Sunday Mar 26.
const apr = buildMonth(2023, 3);
assert.strictEqual(apr[0].key, '2023-03-26');
assert.strictEqual(apr[6].key, '2023-04-01');
assert.strictEqual(apr[35].key, '2023-04-30');
assert.strictEqual(apr[36].key, '2023-05-01');
assert.strictEqual(apr[41].key, '2023-05-06');

// A month starting exactly on Sunday: June 2025 (Jun 1 2025 was a Sunday).
const jun = buildMonth(2025, 5);
assert.strictEqual(jun[0].key, '2025-06-01');
assert.strictEqual(jun[0].inMonth, true);
assert.strictEqual(jun[29].key, '2025-06-30');
assert.strictEqual(jun[30].key, '2025-07-01');

// Key helpers.
assert.strictEqual(toKey(2025, 11, 5), '2025-12-05');
assert.deepStrictEqual(parseKey('2025-12-05'), { y: 2025, m: 11, d: 5 });
assert.strictEqual(dateToKey(new Date(2025, 0, 9)), '2025-01-09');
assert.strictEqual(formatLong('2025-06-15'), 'Sunday, June 15, 2025');

// sortEvents: timed events first in time order, untimed last, stable otherwise.
const sorted = sortEvents([
  { id: 'a', title: 'no time', time: '' },
  { id: 'b', title: 'late', time: '18:00' },
  { id: 'c', title: 'early', time: '09:30' }
]);
assert.deepStrictEqual(sorted.map(e => e.id), ['c', 'b', 'a']);
const input = [{ id: 'x', title: 't', time: '' }];
sortEvents(input);
assert.strictEqual(input.length, 1, 'sortEvents must not mutate its input');

console.log('All tests passed');
