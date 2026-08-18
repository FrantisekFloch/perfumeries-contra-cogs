import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contraMissedOpportunity } from '../src/lib/insights.js';

// A minimal portfolio-view shape covering just what the selector reads.
const view = (over = {}) => ({
  invoiceNumber: 'INV-X', distributorId: 'DIST-1', status: 'PartiallyReceived',
  invoiceDate: '2026-08-05T00:00:00', missingQty: 100, valueAtRisk: 100,
  contra: { headerDiscountTotal: 200, recognizedContra: 120 }, // at-risk contra = 80
  ...over,
});

test('contraMissedOpportunity: deferrable = at-risk contra on open invoices with a this-month deadline', () => {
  // asOf Aug 2026; invoice Aug 5 + 21d SLA = Aug 26 → deadline is this month → counts.
  const opp = contraMissedOpportunity([view()], { asOf: '2026-08-18T00:00:00', slaDays: 21, annualCostOfCapital: 0.08 });
  assert.equal(opp.period, '2026-08');
  assert.equal(opp.deferrableContra, 80); // 200 - 120
  // material loss = 80 * (0.08 / 12) = 0.5333 -> 0.53
  assert.equal(opp.materialLoss, 0.53);
  assert.equal(opp.items.length, 1);
  assert.equal(opp.items[0].atRiskContra, 80);
});

test('contraMissedOpportunity: closed invoices and those with no at-risk contra are excluded', () => {
  const closed = view({ status: 'Paid' });
  const noRisk = view({ contra: { headerDiscountTotal: 200, recognizedContra: 200 } });
  const opp = contraMissedOpportunity([closed, noRisk], { asOf: '2026-08-18T00:00:00' });
  assert.equal(opp.deferrableContra, 0);
  assert.equal(opp.items.length, 0);
});

test('contraMissedOpportunity: deadline outside the current month is not a this-month opportunity', () => {
  // Invoice July 1 + 21d = July 22 → deadline in July, not August → excluded.
  const july = view({ invoiceDate: '2026-07-01T00:00:00' });
  const opp = contraMissedOpportunity([july], { asOf: '2026-08-18T00:00:00', slaDays: 21 });
  assert.equal(opp.deferrableContra, 0);
  assert.equal(opp.items.length, 0);
});

test('contraMissedOpportunity: material loss scales with cost of capital', () => {
  const opp = contraMissedOpportunity([view()], { asOf: '2026-08-18T00:00:00', annualCostOfCapital: 0.12 });
  // 80 * (0.12 / 12) = 0.80
  assert.equal(opp.materialLoss, 0.80);
});
