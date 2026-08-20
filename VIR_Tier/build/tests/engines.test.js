import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reconstructVolume } from '../src/lib/reconstruction.js';
import { computeEntitled, computeEntitledWithReach, resolveTier } from '../src/lib/rebate.js';
import { buildVariance, __resetChargeSeqForTests } from '../src/lib/variance.js';
import { createAgreement, createReceipt, createLeakageEvent, createPurchase } from '../src/lib/models.js';
import { RebateStructure, Basis, Period, Scope, RetrospectiveReach, LeakageDriver } from '../src/lib/enums.js';

function panEuAgreement(overrides = {}) {
  return createAgreement({
    agreementId: 'AGR-1', supplierId: 'SUP-1', supplierName: 'Maison Aroma',
    rebateStructure: RebateStructure.RETROSPECTIVE_TIERED,
    basis: Basis.UNITS, period: Period.YEAR, scope: Scope.PAN_EU,
    currencies: ['EUR'], countries: ['SK', 'PL', 'CZ'],
    tiers: [{ threshold: 0, rate: 0.01 }, { threshold: 5000, rate: 0.015 }, { threshold: 10000, rate: 0.02 }],
    clauseRefs: { tier: 'Clause 4.2 — volume tiers' },
    provenance: 'agreements/AGR-1.xml',
    ...overrides,
  });
}

// ---- reconstruction: pan-EU aggregation (the key capability) ----
test('pan-EU aggregation combines SK/PL/CZ into one qualifying volume', () => {
  const agreement = panEuAgreement();
  const receipts = [
    createReceipt({ receiptId: 'R-SK', agreementId: 'AGR-1', country: 'SK', stockId: 'S1', qtyReceived: 4000, receiptDate: '2026-03-01' }),
    createReceipt({ receiptId: 'R-PL', agreementId: 'AGR-1', country: 'PL', stockId: 'S1', qtyReceived: 4000, receiptDate: '2026-05-01' }),
    createReceipt({ receiptId: 'R-CZ', agreementId: 'AGR-1', country: 'CZ', stockId: 'S1', qtyReceived: 4000, receiptDate: '2026-07-01' }),
  ];
  const rec = reconstructVolume({ agreement, receipts });
  assert.equal(rec.volumes.length, 1); // one pan-EU bucket for the year
  assert.equal(rec.volumes[0].scopeKey, 'PAN_EU');
  assert.equal(rec.volumes[0].qualifyingVolume, 12000); // crosses the 10000 tier
});

test('per-country keeps volumes separate (each below top tier)', () => {
  const agreement = panEuAgreement({ scope: Scope.PER_COUNTRY });
  const receipts = [
    createReceipt({ receiptId: 'R-SK', agreementId: 'AGR-1', country: 'SK', stockId: 'S1', qtyReceived: 4000, receiptDate: '2026-03-01' }),
    createReceipt({ receiptId: 'R-PL', agreementId: 'AGR-1', country: 'PL', stockId: 'S1', qtyReceived: 4000, receiptDate: '2026-05-01' }),
  ];
  const rec = reconstructVolume({ agreement, receipts });
  assert.equal(rec.volumes.length, 2);
  assert.deepEqual(rec.volumes.map((v) => v.qualifyingVolume).sort(), [4000, 4000]);
});

// ---- reconstruction: leakage drivers restore volume ----
test('return rejection adds units back to qualifying volume', () => {
  const agreement = panEuAgreement();
  const receipts = [createReceipt({ receiptId: 'R1', agreementId: 'AGR-1', country: 'SK', stockId: 'S1', qtyReceived: 9900, receiptDate: '2026-02-01' })];
  const events = [createLeakageEvent({ eventId: 'E1', type: LeakageDriver.RETURN_REJECTION, agreementId: 'AGR-1', country: 'SK', stockId: 'S1', qty: 100, eventDate: '2026-02-15' })];
  const rec = reconstructVolume({ agreement, receipts, events });
  assert.equal(rec.volumes[0].qualifyingVolume, 10000); // 9900 + 100 rejected-return crosses 10000
  const corr = rec.corrections.find((c) => c.driver === LeakageDriver.RETURN_REJECTION);
  assert.equal(corr.volumeDelta, 100);
});

test('overage shipment includes retained extra units', () => {
  const agreement = panEuAgreement();
  const receipts = [createReceipt({ receiptId: 'R1', agreementId: 'AGR-1', country: 'PL', stockId: 'S1', qtyReceived: 5000, receiptDate: '2026-02-01' })];
  const events = [createLeakageEvent({ eventId: 'E1', type: LeakageDriver.OVERAGE_SHIPMENT, agreementId: 'AGR-1', country: 'PL', stockId: 'S1', qty: 250, eventDate: '2026-02-01' })];
  const rec = reconstructVolume({ agreement, receipts, events });
  assert.equal(rec.volumes[0].qualifyingVolume, 5250);
});

test('backorder/late counted in control period, flagged', () => {
  const agreement = panEuAgreement({ period: Period.MONTH });
  const events = [
    createLeakageEvent({ eventId: 'E-BO', type: LeakageDriver.BACKORDERING, agreementId: 'AGR-1', country: 'CZ', stockId: 'S1', qty: 300, eventDate: '2026-02-05', intendedDate: '2026-01-28' }),
    createLeakageEvent({ eventId: 'E-LATE', type: LeakageDriver.LATE_SHIPMENT, agreementId: 'AGR-1', country: 'CZ', stockId: 'S1', qty: 200, eventDate: '2026-02-10', intendedDate: '2026-01-30' }),
  ];
  const rec = reconstructVolume({ agreement, receipts: [], events });
  // both land in 2026-02 (control), not 2026-01 (intended)
  const feb = rec.volumes.find((v) => v.period === '2026-02');
  assert.equal(feb.qualifyingVolume, 500);
  assert.ok(rec.corrections.some((c) => c.driver === LeakageDriver.BACKORDERING && /control period 2026-02/.test(c.note)));
});

test('de-dup: same physical receipt not counted twice', () => {
  const agreement = panEuAgreement();
  const r = createReceipt({ receiptId: 'R1', purchaseId: 'P1', agreementId: 'AGR-1', country: 'SK', stockId: 'S1', qtyReceived: 1000, receiptDate: '2026-02-01' });
  const rec = reconstructVolume({ agreement, receipts: [r, { ...r }] });
  assert.equal(rec.volumes[0].qualifyingVolume, 1000);
});

test('value basis uses purchase unitValue', () => {
  const agreement = panEuAgreement({ basis: Basis.VALUE });
  const purchases = [createPurchase({ purchaseId: 'P1', agreementId: 'AGR-1', country: 'SK', stockId: 'S1', qty: 1000, unitValue: 10, currency: 'EUR' })];
  const receipts = [createReceipt({ receiptId: 'R1', purchaseId: 'P1', agreementId: 'AGR-1', country: 'SK', stockId: 'S1', qtyReceived: 1000, receiptDate: '2026-02-01' })];
  const rec = reconstructVolume({ agreement, purchases, receipts });
  assert.equal(rec.volumes[0].qualifyingVolume, 10000); // 1000 * 10
});

// ---- rebate math ----
test('resolveTier picks highest threshold <= Q incl. open top', () => {
  const tiers = [{ threshold: 0, rate: 0.01 }, { threshold: 5000, rate: 0.015 }, { threshold: 10000, rate: 0.02 }];
  assert.equal(resolveTier(tiers, 4000).tier.rate, 0.01);
  assert.equal(resolveTier(tiers, 5000).tier.rate, 0.015);
  assert.equal(resolveTier(tiers, 999999).tier.rate, 0.02);
});

test('retrospective tiered applies achieved rate to ENTIRE volume', () => {
  const agreement = panEuAgreement();
  const r = computeEntitled(12000, agreement);
  assert.equal(r.entitled, 240); // 12000 * 0.02
});

test('sliding incremental applies each band rate to its own units', () => {
  const agreement = panEuAgreement({ rebateStructure: RebateStructure.SLIDING_INCREMENTAL });
  const r = computeEntitled(12000, agreement);
  // 0-5000 @1% =50 ; 5000-10000 @1.5% =75 ; 10000-12000 @2% =40 => 165
  assert.equal(r.entitled, 165);
});

test('flat and per-unit', () => {
  const flat = panEuAgreement({ rebateStructure: RebateStructure.FLAT_PERCENTAGE, tiers: [{ threshold: 0, rate: 0.03 }] });
  assert.equal(computeEntitled(1000, flat).entitled, 30);
  const perUnit = panEuAgreement({ rebateStructure: RebateStructure.PER_UNIT, tiers: [{ threshold: 0, rate: 0.5 }] });
  assert.equal(computeEntitled(1000, perUnit).entitled, 500);
});

test('retrospective reach: prior-periods reopens and sums; within-period does not', () => {
  const agreement = panEuAgreement();
  const priors = { '2025': 8000 };
  const within = computeEntitledWithReach({ agreement, selections: { retrospectiveReach: RetrospectiveReach.WITHIN_PERIOD }, currentPeriod: '2026', currentVolume: 12000, priorVolumes: priors });
  assert.equal(within.perPeriod.length, 1);
  const prior = computeEntitledWithReach({ agreement, selections: { retrospectiveReach: RetrospectiveReach.PRIOR_PERIODS }, currentPeriod: '2026', currentVolume: 12000, priorVolumes: priors });
  assert.equal(prior.perPeriod.length, 2);
  // 12000@2%=240 + 8000@1.5%=120 => 360
  assert.equal(prior.total, 360);
});

// ---- variance + charge ----
test('positive variance yields a charge; non-positive yields none', () => {
  __resetChargeSeqForTests();
  const agreement = panEuAgreement();
  const pos = buildVariance({ agreement, scopeKey: 'PAN_EU', period: '2026', entitled: 240, claimed: 120, currency: 'EUR', contributingEvents: ['E1'], clauseRef: 'Clause 4.2', now: () => '2026-01-01T00:00:00Z' });
  assert.equal(pos.variance, 120);
  assert.ok(pos.charge);
  assert.equal(pos.charge.status, 'PENDING_APPROVAL');
  assert.equal(pos.charge.auditTrace.length, 1);

  const none = buildVariance({ agreement, scopeKey: 'PAN_EU', period: '2026', entitled: 100, claimed: 120, currency: 'EUR' });
  assert.equal(none.charge, null);
  assert.equal(none.variance, -20);
});
