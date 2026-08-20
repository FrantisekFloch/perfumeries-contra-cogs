// Governance & approval workflow (Req 7, 6). One Finance_Approver reviews a full
// document, then approves or rejects. Export/injection is blocked unless APPROVED.
// Every transition appends an immutable audit entry.

import { ChargeStatus } from './enums.js';
import { auditEntry } from './audit.js';

/**
 * Assemble the full review document a Finance_Approver sees (Req 7.2).
 * Pulls together the variance calc, reconstructed volume + corrections, the
 * contributing source events (with provenance), the agreement clause, and the
 * audit trace.
 */
export function buildReviewDocument({ charge, agreement, reconstruction, contributingRecords = [] }) {
  const volumeForScope = (reconstruction?.volumes ?? []).filter(
    (v) => (v.scopeKey === charge.scopeKey) && (v.period === charge.period || charge.period === `${new Date().getFullYear()}`),
  );
  return {
    chargeId: charge.chargeId,
    supplier: { id: agreement.supplierId, name: agreement.supplierName },
    agreementId: agreement.agreementId,
    scopeKey: charge.scopeKey,
    period: charge.period,
    calculation: {
      structure: charge.structure, basis: charge.basis, tierApplied: charge.tierApplied,
      entitledCcogs: charge.entitledCcogs, claimedCcogs: charge.claimedCcogs,
      variance: charge.variance, currency: charge.currency, eurEquivalent: charge.eurEquivalent,
    },
    reconstructedVolume: volumeForScope.length ? volumeForScope : (reconstruction?.volumes ?? []),
    corrections: reconstruction?.corrections ?? [],
    contributingRecords,
    clause: charge.clauseRef,
    provenance: agreement.provenance,
    auditTrace: charge.auditTrace,
    status: charge.status,
  };
}

/** Approve a charge (Req 7.3). Returns the updated charge (new object). */
export function approveCharge(charge, { approver, now, note = '' } = {}) {
  if (!approver) throw new Error('approval: approver is required');
  if (charge.status !== ChargeStatus.PENDING_APPROVAL) {
    throw new Error(`approval: only PENDING_APPROVAL charges can be approved (is ${charge.status})`);
  }
  const entry = auditEntry({ actor: approver, action: 'APPROVED', details: { chargeId: charge.chargeId, note } }, now);
  return { ...charge, status: ChargeStatus.APPROVED, auditTrace: [...charge.auditTrace, entry] };
}

/** Reject a charge with a reason (Req 7.4). */
export function rejectCharge(charge, { approver, reason, now } = {}) {
  if (!approver) throw new Error('approval: approver is required');
  if (!reason) throw new Error('approval: rejection requires a reason');
  if (charge.status !== ChargeStatus.PENDING_APPROVAL) {
    throw new Error(`approval: only PENDING_APPROVAL charges can be rejected (is ${charge.status})`);
  }
  const entry = auditEntry({ actor: approver, action: 'REJECTED', details: { chargeId: charge.chargeId, reason } }, now);
  return { ...charge, status: ChargeStatus.REJECTED, auditTrace: [...charge.auditTrace, entry] };
}

/** Guard used by export/injection (Req 7.5 / 8.4). */
export function isExportable(charge) {
  return charge.status === ChargeStatus.APPROVED;
}
