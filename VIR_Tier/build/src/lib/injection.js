// Export + (simulated) billing injection (Req 8). Show-first is enforced by the
// UI; these functions perform the actions and require an APPROVED charge.
// Demo injection = state change to INJECTED + an exportable payload; a hook marks
// where a real billing post happens at the cloud stage.

import { ChargeStatus } from './enums.js';
import { auditEntry } from './audit.js';
import { isExportable } from './approval.js';
import { serializeCsv } from './csv.js';

/** Build the export payload (charge + audit trace) as a structured object. */
export function buildExportPayload(charge, reviewDocument = null) {
  return {
    documentType: 'SUPPLEMENTING_CHARGE',
    chargeId: charge.chargeId,
    agreementId: charge.agreementId,
    supplierId: charge.supplierId,
    scopeKey: charge.scopeKey,
    period: charge.period,
    amount: { value: charge.variance, currency: charge.currency, eurEquivalent: charge.eurEquivalent },
    basis: charge.basis,
    structure: charge.structure,
    tierApplied: charge.tierApplied,
    clause: charge.clauseRef,
    status: charge.status,
    auditTrace: charge.auditTrace,
    review: reviewDocument,
    exportedFormatVersion: 1,
  };
}

// ---- CSV exports (billing-ingestible; primary format) --------------------
// One flat row per charge for the billing system to ingest, plus a companion
// audit-trail CSV for evidence. CSV is what downstream billing/ERP consumes.

const CHARGE_CSV_HEADERS = [
  'chargeId', 'documentType', 'supplierId', 'agreementId', 'scopeKey', 'period',
  'entitledCcogs', 'claimedCcogs', 'variance', 'currency', 'eurEquivalent',
  'structure', 'basis', 'tierApplied', 'clause', 'status',
];

/** One-charge (or many) -> billing CSV. Accepts a charge or an array. */
export function chargesToCsv(chargesOrOne) {
  const list = Array.isArray(chargesOrOne) ? chargesOrOne : [chargesOrOne];
  const rows = list.map((c) => ({
    chargeId: c.chargeId, documentType: 'SUPPLEMENTING_CHARGE', supplierId: c.supplierId ?? '',
    agreementId: c.agreementId, scopeKey: c.scopeKey, period: c.period,
    entitledCcogs: c.entitledCcogs, claimedCcogs: c.claimedCcogs, variance: c.variance,
    currency: c.currency, eurEquivalent: c.eurEquivalent ?? '',
    structure: c.structure ?? '', basis: c.basis ?? '',
    tierApplied: c.tierApplied ?? '', clause: c.clauseRef ?? '', status: c.status,
  }));
  return serializeCsv(CHARGE_CSV_HEADERS, rows);
}

const AUDIT_CSV_HEADERS = ['chargeId', 'seq', 'timestamp', 'actor', 'action', 'details'];

/** Companion audit-trail CSV for one charge. */
export function auditToCsv(charge) {
  const rows = (charge.auditTrace || []).map((e) => ({
    chargeId: charge.chargeId, seq: e.seq, timestamp: e.timestamp, actor: e.actor,
    action: e.action, details: JSON.stringify(e.details ?? {}),
  }));
  return serializeCsv(AUDIT_CSV_HEADERS, rows);
}

/**
 * Export (Req 8.3). Primary artifact is CSV (billing-ingestible) + a companion
 * audit CSV. Returns { charge, csv, auditCsv, payload }.
 */
export function exportCharge(charge, { actor = 'system', now, reviewDocument = null } = {}) {
  if (!isExportable(charge)) throw new Error(`injection: cannot export a charge in status ${charge.status}`);
  const updatedTrace = [...charge.auditTrace, auditEntry({ actor, action: 'EXPORTED', details: { chargeId: charge.chargeId, format: 'CSV' } }, now)];
  const updated = { ...charge, status: ChargeStatus.EXPORTED, auditTrace: updatedTrace };
  return {
    charge: updated,
    csv: chargesToCsv(updated),
    auditCsv: auditToCsv(updated),
    payload: buildExportPayload(updated, reviewDocument),
  };
}

/**
 * Inject into billing (Req 8.4/8.5). Demo simulates the handoff: state → INJECTED
 * plus an exportable payload. `postFn` is the seam for a real billing post at the
 * cloud stage (defaults to a no-op simulation).
 */
export function injectCharge(charge, { actor = 'system', now, postFn = null, reviewDocument = null } = {}) {
  if (!isExportable(charge)) throw new Error(`injection: cannot inject a charge in status ${charge.status}`);
  const csv = chargesToCsv(charge);
  const payload = buildExportPayload(charge, reviewDocument);
  let handoff = { simulated: true, format: 'CSV' };
  if (typeof postFn === 'function') handoff = postFn(csv, payload) ?? { simulated: false };
  const entry = auditEntry({ actor, action: 'INJECTED', details: { chargeId: charge.chargeId, handoff } }, now);
  const updated = { ...charge, status: ChargeStatus.INJECTED, auditTrace: [...charge.auditTrace, entry] };
  return { charge: updated, csv, auditCsv: auditToCsv(updated), payload, handoff };
}
