import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, serializeCsv } from '../src/lib/csv.js';
import { parseXml, childText } from '../src/lib/xml.js';
import { periodKey, controlPeriod, timingInfo } from '../src/lib/periods.js';
import { money, toEur, sumAmounts, fxRequired, isMixedCurrency } from '../src/lib/money.js';
import { auditEntry, AuditTrace, __resetAuditSeqForTests } from '../src/lib/audit.js';
import { StateStore, createMemoryBackend } from '../src/lib/store.js';
import {
  createAgreement, isAgreementComplete, createPurchase, createReceipt,
  createLeakageEvent, createClaimedCcogs, createSupplementingCharge,
} from '../src/lib/models.js';
import { Period, Basis, Scope, Currency, RebateStructure, LeakageDriver } from '../src/lib/enums.js';

// ---- reused primitives ----
test('csv round-trips quoted fields', () => {
  const csv = 'a,b\n"x,y","he said ""hi"""\n';
  const { rows } = parseCsv(csv);
  assert.equal(rows[0].a, 'x,y');
  assert.equal(rows[0].b, 'he said "hi"');
  const out = serializeCsv(['a', 'b'], rows);
  assert.equal(parseCsv(out).rows[0].a, 'x,y');
});

test('xml parses nested elements', () => {
  const root = parseXml('<agreement><id>A1</id></agreement>');
  assert.equal(childText(root, 'id'), 'A1');
});

// ---- periods / timing (Req 11) ----
test('periodKey buckets month/quarter/year', () => {
  assert.equal(periodKey('2026-03-15', Period.MONTH), '2026-03');
  assert.equal(periodKey('2026-03-15', Period.QUARTER), '2026-Q1');
  assert.equal(periodKey('2026-11-01', Period.QUARTER), '2026-Q4');
  assert.equal(periodKey('2026-03-15', Period.YEAR), '2026');
});

test('control period follows receipt date; VAT tax point optional + divergence flagged', () => {
  assert.equal(controlPeriod('2026-02-03', Period.MONTH), '2026-02');
  // no VAT data -> not assumed
  const a = timingInfo('2026-02-03', Period.MONTH, null);
  assert.equal(a.vatTaxPoint, null);
  assert.equal(a.divergence, false);
  // VAT tax point in a different (earlier) month -> divergence flagged
  const b = timingInfo('2026-02-03', Period.MONTH, '2026-01-20');
  assert.equal(b.controlPeriod, '2026-02');
  assert.equal(b.vatTaxPoint, '2026-01');
  assert.equal(b.divergence, true);
});

// ---- money / FX (Req 4) ----
test('money native sum when single currency; no FX', () => {
  const s = sumAmounts([money(100, 'EUR'), money(50, 'EUR')]);
  assert.equal(s.value, 150);
  assert.equal(s.converted, false);
});

test('mixed currency requires FX; consolidates to EUR and records rates', () => {
  const fx = { base: 'EUR', rates: { EUR: 1, CZK: 0.04, PLN: 0.23 }, asOf: '2026-01-01' };
  assert.throws(() => sumAmounts([money(100, 'EUR'), money(1000, 'CZK')]), /require an FX table/);
  const s = sumAmounts([money(100, 'EUR'), money(1000, 'CZK')], fx);
  assert.equal(s.converted, true);
  assert.equal(s.value, 140); // 100 + 1000*0.04
  assert.equal(s.ratesUsed.CZK, 0.04);
});

test('fxRequired only for value + pan-EU + mixed currencies', () => {
  assert.equal(fxRequired({ basis: Basis.VALUE, scope: Scope.PAN_EU, currencies: ['EUR', 'PLN'] }), true);
  assert.equal(fxRequired({ basis: Basis.VALUE, scope: Scope.PAN_EU, currencies: ['EUR', 'EUR'] }), false);
  assert.equal(fxRequired({ basis: Basis.UNITS, scope: Scope.PAN_EU, currencies: ['EUR', 'PLN'] }), false);
  assert.equal(isMixedCurrency(['EUR', 'PLN']), true);
});

test('toEur converts and tags rate', () => {
  const fx = { base: 'EUR', rates: { EUR: 1, PLN: 0.23 }, asOf: '2026-01-01' };
  const e = toEur(money(1000, 'PLN'), fx);
  assert.equal(e.value, 230);
  assert.equal(e.currency, 'EUR');
  assert.equal(e.fxRate, 0.23);
});

// ---- audit (Req 6) ----
test('audit entries are frozen and append-only', () => {
  __resetAuditSeqForTests();
  const trace = new AuditTrace();
  const e1 = auditEntry({ actor: 'analyst', action: 'RECONSTRUCT', details: { d: 1 } }, () => '2026-01-01T00:00:00Z');
  trace.append(e1);
  assert.throws(() => { e1.details.d = 2; }, TypeError); // frozen
  const before = trace.entries.length;
  trace.append(auditEntry({ actor: 'analyst', action: 'RECOMPUTE' }, () => '2026-01-01T00:01:00Z'));
  assert.equal(trace.entries.length, before + 1);
  assert.equal(trace.entries[0].seq < trace.entries[1].seq, true);
});

// ---- store (Req 4/10) ----
test('store upserts keyed + appends list; charge status helper', () => {
  const s = new StateStore(createMemoryBackend());
  s.put('agreements', { agreementId: 'A1', x: 1 });
  s.put('agreements', { agreementId: 'A1', x: 2 }); // upsert
  assert.equal(s.get('agreements', 'A1').x, 2);
  s.put('charges', { chargeId: 'C1', status: 'PENDING_APPROVAL' });
  s.setChargeStatus('C1', 'APPROVED');
  assert.equal(s.get('charges', 'C1').status, 'APPROVED');
  s.appendAudit({ seq: 1 });
  assert.equal(s.auditLog().length, 1);
});

// ---- models ----
test('agreement flags incomplete required config (Req 1.6)', () => {
  const complete = createAgreement({
    agreementId: 'A1', supplierId: 'S1',
    rebateStructure: RebateStructure.RETROSPECTIVE_TIERED, basis: Basis.UNITS,
    period: Period.YEAR, scope: Scope.PAN_EU, currencies: ['EUR'],
    tiers: [{ threshold: 0, rate: 0.01 }, { threshold: 10000, rate: 0.02 }],
    countries: ['SK', 'PL', 'CZ'],
  });
  assert.equal(isAgreementComplete(complete), true);
  assert.equal(complete.tiers[0].threshold, 0);

  const incomplete = createAgreement({ agreementId: 'A2', supplierId: 'S2' });
  assert.equal(isAgreementComplete(incomplete), false);
  assert.ok(incomplete.incompleteFields.includes('tiers'));
  assert.ok(incomplete.incompleteFields.includes('rebateStructure'));
});

test('tiers are sorted by threshold', () => {
  const a = createAgreement({
    agreementId: 'A3', supplierId: 'S3', rebateStructure: RebateStructure.SLIDING_INCREMENTAL,
    basis: Basis.UNITS, period: Period.YEAR, scope: Scope.PER_COUNTRY, currencies: ['EUR'],
    tiers: [{ threshold: 10000, rate: 0.02 }, { threshold: 0, rate: 0.01 }, { threshold: 5000, rate: 0.015 }],
  });
  assert.deepEqual(a.tiers.map((t) => t.threshold), [0, 5000, 10000]);
});

test('receipt keeps vatTaxPoint null when absent', () => {
  const r = createReceipt({ receiptId: 'R1', agreementId: 'A1', country: 'SK', stockId: 'SKU1', qtyReceived: 100, receiptDate: '2026-02-01' });
  assert.equal(r.vatTaxPointDate, null);
});

test('purchase/event/claimed/charge factories validate', () => {
  const p = createPurchase({ purchaseId: 'P1', agreementId: 'A1', country: 'PL', stockId: 'SKU1', qty: 500, unitValue: 12.5, currency: 'PLN' });
  assert.equal(p.qty, 500);
  const ev = createLeakageEvent({ eventId: 'E1', type: LeakageDriver.RETURN_REJECTION, agreementId: 'A1', country: 'SK', qty: 100, refIds: 'R1|R2' });
  assert.deepEqual(ev.refIds, ['R1', 'R2']);
  const cl = createClaimedCcogs({ claimId: 'CL1', agreementId: 'A1', scopeKey: 'PAN_EU', period: '2026', amountClaimed: 1000, currency: 'EUR' });
  assert.equal(cl.amountClaimed, 1000);
  const ch = createSupplementingCharge({ chargeId: 'C1', agreementId: 'A1', scopeKey: 'PAN_EU', period: '2026', entitledCcogs: 1500, claimedCcogs: 1000, variance: 500, currency: 'EUR' });
  assert.equal(ch.status, 'PENDING_APPROVAL');
});
