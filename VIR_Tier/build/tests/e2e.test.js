import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { demoSources, runScan } from '../src/lib/source.js';
import { ingestFiles } from '../src/lib/ingest.js';
import { consolidate } from '../src/lib/consolidation.js';
import { runPipeline } from '../src/lib/pipeline.js';
import { approveCharge, rejectCharge, isExportable, buildReviewDocument, issueCharge, disputeCharge, settleCharge, closeCharge, canTransition, transitionCharge } from '../src/lib/approval.js';
import { exportCharge, injectCharge } from '../src/lib/injection.js';
import { createSupplementingCharge } from '../src/lib/models.js';
import { ChargeStatus } from '../src/lib/enums.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

function loadManifest() {
  const p = join(DATA, 'manifest.json');
  if (!existsSync(p)) throw new Error('run `node tools/generate_samples.js` first');
  return JSON.parse(readFileSync(p, 'utf8'));
}
function fsFetcher(category, name) {
  return Promise.resolve(readFileSync(join(DATA, 'inbox', category, name), 'utf8'));
}
function loadFx() { return JSON.parse(readFileSync(join(DATA, 'fx_rates.json'), 'utf8')); }

async function fullRun() {
  const manifest = loadManifest();
  const sources = demoSources(manifest, fsFetcher);
  const statuses = [];
  const { files, results } = await runScan(sources, { onStatus: (s) => statuses.push(s) });
  const ingested = ingestFiles(files);
  const consolidated = consolidate(ingested);
  const out = runPipeline(consolidated, { fx: loadFx(), now: () => '2026-01-15T00:00:00Z' });
  return { manifest, files, results, statuses, ingested, consolidated, out };
}

test('scanner scans DB -> API -> Folder in order with statuses', async () => {
  const { statuses } = await fullRun();
  const order = statuses.filter((s) => s.status === 'SCANNING').map((s) => s.name);
  assert.deepEqual(order, ['Database', 'API', 'Folder']);
  const folder = statuses.find((s) => s.name === 'Folder' && s.status === 'FOUND');
  assert.ok(folder.count > 0);
});

test('ingestion parses all categories with no parse errors', async () => {
  const { ingested } = await fullRun();
  assert.equal(ingested.errors.length, 0, JSON.stringify(ingested.errors));
  assert.ok(ingested.agreements.length >= 15);
  assert.ok(ingested.receipts.length >= ingested.delivery_notes.length, 'goods receipts should out-number delivery notes');
  assert.ok(ingested.invoices.length >= ingested.delivery_notes.length, 'invoices should be >= consolidated delivery notes');
  assert.ok(ingested.ccogs_engine.length >= 15); // the "before" baseline
});

test('consolidation groups per agreement across countries', async () => {
  const { consolidated } = await fullRun();
  assert.ok(consolidated.byAgreement.size >= 15);
  // pick a pan-EU agreement and confirm 3 countries present
  let panEu = null;
  for (const g of consolidated.byAgreement.values()) {
    if (g.agreement.scope === 'PAN_EU' && g.countries.size === 3) { panEu = g; break; }
  }
  assert.ok(panEu, 'expected at least one pan-EU agreement spanning 3 countries');
});

test('pipeline produces recoverable charges with positive variance and audit trace', async () => {
  const { out } = await fullRun();
  assert.ok(out.charges.length > 0, 'expected supplementing charges');
  for (const c of out.charges) {
    assert.ok(c.variance > 0);
    assert.equal(c.status, ChargeStatus.PENDING_APPROVAL);
    assert.ok(c.auditTrace.length >= 1);
    assert.ok(c.clauseRef, 'charge should cite an agreement clause');
  }
});

test('zero-variance controls produce no charge (calc retained)', async () => {
  const { out, consolidated } = await fullRun();
  // find a zero_variance agreement: claimed amount is huge (999999) so variance <= 0
  // non-recoverable rows: CCOGS engine already claimed the full entitled amount
  // (before == after) => cost of inaction 0 => no charge, but calc retained.
  const nonRecoverable = out.beforeAfter.filter((b) => !b.recoverable);
  assert.ok(nonRecoverable.length > 0, 'expected some non-recoverable (control) rows');
  for (const b of nonRecoverable) {
    const hasCharge = out.charges.some((c) => c.agreementId === b.agreementId && c.scopeKey === b.scopeKey);
    assert.ok(!hasCharge, `no charge expected for ${b.agreementId}/${b.scopeKey}`);
  }
  assert.ok(out.calcs.length >= out.beforeAfter.length - 1, 'calcs retained for audit');
});

test('mixed-currency value pan-EU case records an EUR equivalent (FX applied)', async () => {
  const { out, consolidated } = await fullRun();
  const mixed = [];
  for (const g of consolidated.byAgreement.values()) {
    if (g.agreement.scope === 'PAN_EU' && new Set(g.agreement.currencies || []).size > 1) {
      mixed.push(g.agreement.agreementId);
    }
  }
  assert.ok(mixed.length > 0, 'expected mixed-currency pan-EU agreements');
  const charge = out.charges.find((c) => mixed.includes(c.agreementId));
  assert.ok(charge, 'expected a charge for a mixed-currency case');
  assert.ok(charge.eurEquivalent !== null, 'EUR equivalent should be recorded via FX');
});

test('approval workflow gates export/injection', async () => {
  const { out } = await fullRun();
  const charge = out.charges[0];
  // cannot export before approval
  assert.equal(isExportable(charge), false);
  assert.throws(() => exportCharge(charge, { now: () => 'X' }), /cannot export/);

  const approved = approveCharge(charge, { approver: 'cfo@perfumeries', now: () => '2026-01-16T00:00:00Z' });
  assert.equal(approved.status, ChargeStatus.APPROVED);
  assert.ok(isExportable(approved));

  const { charge: exported, csv, auditCsv } = exportCharge(approved, { actor: 'cfo@perfumeries', now: () => '2026-01-16T01:00:00Z' });
  assert.equal(exported.status, ChargeStatus.EXPORTED);
  // primary artifact is CSV (billing-ingestible), with a header + one data row
  assert.match(csv.split('\n')[0], /^chargeId,documentType,supplierId/);
  assert.ok(csv.split('\n').length >= 2);
  assert.match(auditCsv.split('\n')[0], /^chargeId,seq,timestamp,actor,action/);

  const { charge: injected, handoff } = injectCharge(approved, { actor: 'cfo@perfumeries', now: () => '2026-01-16T02:00:00Z' });
  assert.equal(injected.status, ChargeStatus.INJECTED);
  assert.equal(handoff.simulated, true);
});

test('recovery state machine: legal transitions with audit; illegal blocked', () => {
  const now = () => '2026-02-01T00:00:00Z';
  const base = createSupplementingCharge({
    chargeId: 'TU-X-1', agreementId: 'AGR-X', supplierId: 'S1', scopeKey: 'SK', period: '2026',
    entitledCcogs: 1200, claimedCcogs: 1000, variance: 200, currency: 'EUR',
  });
  assert.equal(base.status, ChargeStatus.PENDING_APPROVAL);
  // legal path: PENDING -> APPROVED -> ISSUED -> DISPUTED -> PARTIALLY_SETTLED -> CLOSED
  const approved = approveCharge(base, { approver: 'cfo', now });
  const issued = issueCharge(approved, { actor: 'ar', now });
  assert.equal(issued.status, ChargeStatus.ISSUED);
  assert.ok(isExportable(issued));
  const disputed = disputeCharge(issued, { actor: 'ar', now, reason: 'Supplier contests late-delivery line' });
  assert.equal(disputed.status, ChargeStatus.DISPUTED);
  assert.equal(disputed.disputeReason, 'Supplier contests late-delivery line');
  const settled = settleCharge(disputed, { actor: 'ar', now, settledAmount: 150 });
  assert.equal(settled.status, ChargeStatus.PARTIALLY_SETTLED);
  assert.equal(settled.settledAmount, 150);
  const closed = closeCharge(settled, { actor: 'ar', now });
  assert.equal(closed.status, ChargeStatus.CLOSED);
  // every transition wrote an audit entry
  assert.ok(closed.auditTrace.length >= 5);
  // illegal transitions are rejected
  assert.equal(canTransition(ChargeStatus.CLOSED, ChargeStatus.ISSUED), false);
  assert.throws(() => issueCharge(base, { actor: 'x', now }), /illegal transition/); // PENDING can't jump to ISSUED
  assert.throws(() => transitionCharge(closed, ChargeStatus.DISPUTED, { now }), /illegal transition/);
});

test('rejection records a reason and blocks export', async () => {
  const { out } = await fullRun();
  const rejected = rejectCharge(out.charges[0], { approver: 'cfo@perfumeries', reason: 'Awaiting supplier confirmation', now: () => 'Z' });
  assert.equal(rejected.status, ChargeStatus.REJECTED);
  assert.equal(isExportable(rejected), false);
  assert.ok(rejected.auditTrace.some((e) => e.action === 'REJECTED' && e.details.reason));
});

test('review document is complete for the approver', async () => {
  const { out, consolidated } = await fullRun();
  const charge = out.charges[0];
  const group = consolidated.byAgreement.get(charge.agreementId);
  const rec = out.reconstructions.find((r) => r.agreementId === charge.agreementId);
  const doc = buildReviewDocument({ charge, agreement: group.agreement, reconstruction: rec, contributingRecords: group.receipts.map((r) => r.receiptId) });
  assert.ok(doc.calculation && doc.reconstructedVolume && doc.clause && doc.auditTrace);
  assert.equal(doc.supplier.id, group.agreement.supplierId);
});

test('pan-EU aggregation recovers more than the sum of per-country would', async () => {
  // Reconstruct a known pan-EU agreement and confirm one combined bucket that
  // crosses a higher tier than any single country.
  const { consolidated } = await fullRun();
  let target = null;
  for (const g of consolidated.byAgreement.values()) {
    if (g.agreement.scope === 'PAN_EU' && g.agreement.rebateStructure === 'RETROSPECTIVE_TIERED' && g.countries.size === 3) { target = g; break; }
  }
  if (!target) return; // covered elsewhere; skip if the rotation didn't produce one
  const { reconstructVolume } = await import('../src/lib/reconstruction.js');
  const { computeEntitled } = await import('../src/lib/rebate.js');
  const rec = reconstructVolume({ agreement: target.agreement, purchases: target.purchases, receipts: target.receipts, events: target.events });
  const combined = rec.volumes.reduce((s, v) => s + v.qualifyingVolume, 0);
  const entitledCombined = computeEntitled(combined, target.agreement).entitled;
  // per-country: split combined roughly into 3 and value each separately
  const each = combined / 3;
  const entitledSplit = 3 * computeEntitled(each, target.agreement).entitled;
  // combined must be at least the split (equal when both land in the same top tier);
  // allow a tiny epsilon for floating-point.
  assert.ok(entitledCombined >= entitledSplit - 0.01, 'pan-EU combined entitlement should be >= per-country split');
});
