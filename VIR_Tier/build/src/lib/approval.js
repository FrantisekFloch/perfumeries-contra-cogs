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
  return charge.status === ChargeStatus.APPROVED || charge.status === ChargeStatus.ISSUED;
}

// ---- Recovery-workflow state machine ---------------------------------------
// A debit note is a negotiation, not a one-shot. Legal transitions:
//   PENDING_APPROVAL -> APPROVED | REJECTED
//   APPROVED         -> ISSUED
//   ISSUED           -> DISPUTED | PARTIALLY_SETTLED | CLOSED
//   DISPUTED         -> PARTIALLY_SETTLED | CLOSED
//   PARTIALLY_SETTLED-> CLOSED
// REJECTED and CLOSED are terminal.
export const ALLOWED_TRANSITIONS = Object.freeze({
  [ChargeStatus.PENDING_APPROVAL]: [ChargeStatus.APPROVED, ChargeStatus.REJECTED],
  [ChargeStatus.APPROVED]: [ChargeStatus.ISSUED],
  [ChargeStatus.ISSUED]: [ChargeStatus.DISPUTED, ChargeStatus.PARTIALLY_SETTLED, ChargeStatus.CLOSED],
  [ChargeStatus.DISPUTED]: [ChargeStatus.PARTIALLY_SETTLED, ChargeStatus.CLOSED],
  [ChargeStatus.PARTIALLY_SETTLED]: [ChargeStatus.CLOSED],
  [ChargeStatus.REJECTED]: [],
  [ChargeStatus.CLOSED]: [],
});

export function canTransition(from, to) {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/**
 * Generic audited transition. Validates the move against ALLOWED_TRANSITIONS,
 * appends an immutable audit entry, and returns a NEW charge object.
 * extra: optional fields merged onto the charge (e.g. settledAmount, disputeReason).
 */
export function transitionCharge(charge, to, { actor = 'system', now, note = '', extra = {} } = {}) {
  if (!canTransition(charge.status, to)) {
    throw new Error(`approval: illegal transition ${charge.status} -> ${to}`);
  }
  const entry = auditEntry({ actor, action: to, details: { chargeId: charge.chargeId, from: charge.status, to, note } }, now);
  return { ...charge, ...extra, status: to, auditTrace: [...charge.auditTrace, entry] };
}

/** Mark an approved charge as issued (debit note sent to supplier). */
export function issueCharge(charge, { actor, now, note = '' } = {}) {
  return transitionCharge(charge, ChargeStatus.ISSUED, { actor, now, note });
}

/** Supplier disputed the charge (records the reason on the charge). */
export function disputeCharge(charge, { actor, now, reason = '' } = {}) {
  return transitionCharge(charge, ChargeStatus.DISPUTED, { actor, now, note: reason, extra: { disputeReason: reason } });
}

/** Supplier accepted part of the claim (records the settled amount). */
export function settleCharge(charge, { actor, now, settledAmount = null, note = '' } = {}) {
  return transitionCharge(charge, ChargeStatus.PARTIALLY_SETTLED, { actor, now, note, extra: { settledAmount: settledAmount != null ? Number(settledAmount) : null } });
}

/** Close a charge (terminal — fully settled or written off). */
export function closeCharge(charge, { actor, now, settledAmount = null, note = '' } = {}) {
  const extra = settledAmount != null ? { settledAmount: Number(settledAmount) } : {};
  return transitionCharge(charge, ChargeStatus.CLOSED, { actor, now, note, extra });
}
