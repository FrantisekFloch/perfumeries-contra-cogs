import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlySeries, addMonths, forecast } from '../src/lib/forecast.js';

const view = (over) => ({
  month: '2026-01', valueAtRisk: 100, contra: { recognizedContra: 50 },
  timing: { splitDebits: [{ period: '2026-01', amount: 200 }, { period: '2026-02', amount: 300 }] },
  ...over,
});

test('monthlySeries aggregates risk, debits and contra by month', () => {
  const s = monthlySeries([view(), view({ month: '2026-02', valueAtRisk: 40, contra: { recognizedContra: 10 }, timing: { splitDebits: [] } })]);
  assert.deepEqual(s.months, ['2026-01', '2026-02']);
  assert.equal(s.risk[0], 100);
  assert.equal(s.risk[1], 40);
  assert.equal(s.debits[0], 200); // only the first view has split debits
  assert.equal(s.debits[1], 300);
});

test('addMonths rolls over the year boundary', () => {
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', 1), '2026-02');
});

test('forecast projects a rising trend forward', () => {
  const fc = forecast(['2026-01', '2026-02', '2026-03'], [100, 200, 300], 3);
  assert.deepEqual(fc.months, ['2026-04', '2026-05', '2026-06']);
  assert.ok(fc.values[0] > 300); // continues upward
  assert.ok(fc.values[2] > fc.values[0]);
});

test('forecast handles a single data point (flat projection) and clamps at 0', () => {
  const fc = forecast(['2026-05'], [80], 2);
  assert.deepEqual(fc.values, [80, 80]);
  const down = forecast(['2026-01', '2026-02', '2026-03'], [300, 150, 0], 2);
  assert.ok(down.values.every((v) => v >= 0));
});
