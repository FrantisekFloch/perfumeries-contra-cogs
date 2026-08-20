// Variance + Supplementing_Charge builder (Req 5).
// variance = Entitled_CCOGS − Claimed_CCOGS. A positive variance is recoverable
// and produces a Supplementing_Charge (PENDING_APPROVAL) with a full audit trace
// linking charge -> variance calc -> reconstructed volume -> events -> clause.

import { ChargeStatus } from './enums.js';
import { createSupplementingCharge } from './models.js';
import { auditEntry } from './audit.js';
import { round2 } from './money.js';

let CHARGE_SEQ = 0;
export function __resetChargeSeqForTests() { CHARGE_SEQ = 0; }

/**
 * Build a variance result (always) and a charge (only when variance > 0).
 * @param {object} args
 *  - agreement
 *  - scopeKey, period
 *  - entitled: number (entitled CCOGS)
 *  - claimed: number (claimed CCOGS)
 *  - currency, eurEquivalent (optional)
 *  - tierApplied, structure, basis
 *  - contributingEvents: string[] evidence refs (event/receipt ids)
 *  - clauseRef
 *  - actor, now (injectable)
 * @returns {object} { variance, charge|null, calc }
 */
export function buildVariance(args) {
  const {
    agreement, scopeKey, period, entitled, claimed,
    currency, eurEquivalent = null, tierApplied = null, structure = null, basis = null,
    contributingEvents = [], clauseRef = null, actor = 'system', now,
  } = args;

  const variance = round2(entitled - claimed);
  const calc = {
    agreementId: agreement.agreementId, scopeKey, period,
    entitledCcogs: round2(entitled), claimedCcogs: round2(claimed), variance,
    currency, structure, basis, tierApplied,
  };

  if (variance <= 0) {
    // Req 5.3 — record calc, no charge.
    return { variance, charge: null, calc };
  }

  const chargeId = `SC-${agreement.agreementId}-${period}-${String(++CHARGE_SEQ).padStart(3, '0')}`;
  const entry = auditEntry({
    actor, action: 'CHARGE_GENERATED',
    details: { chargeId, ...calc },
    evidenceRefs: [agreement.provenance, clauseRef, ...contributingEvents].filter(Boolean),
  }, now);

  const charge = createSupplementingCharge({
    chargeId, agreementId: agreement.agreementId, supplierId: agreement.supplierId,
    scopeKey, period,
    entitledCcogs: round2(entitled), claimedCcogs: round2(claimed), variance,
    currency, eurEquivalent,
    tierApplied: tierApplied ? JSON.stringify(tierApplied) : null,
    structure, basis, clauseRef,
    status: ChargeStatus.PENDING_APPROVAL,
    auditTrace: [entry],
  });

  return { variance, charge, calc };
}
