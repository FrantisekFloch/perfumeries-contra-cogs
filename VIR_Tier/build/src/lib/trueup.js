// CCOGS True-Up builder.
// A True-Up is the debit note the buyer issues to the supplier for the CCOGS
// delta = what SHOULD have been claimed − what WAS claimed. It ITEMIZES each
// cause (found pallet, forgotten SKU, late delivery, reroute) as a line, but the
// HEADLINE variance is the CUMULATIVE tier movement (e.g. 1% -> 2%).
//
// Modelling: the engine measured a base volume at a "before" tier. Each cause
// restores units, lifting the combined volume — which can cross tier thresholds.
// Because tiers are retrospective (achieved rate applies to the ENTIRE volume),
// the cumulative delta is (rateAfter − rateBefore) × totalQualifyingVolume, and
// we attribute a share of that to each cause by the units it restored.

import { ChargeStatus, RebateStructure } from './enums.js';
import { createSupplementingCharge } from './models.js';
import { auditEntry } from './audit.js';
import { round2 } from './money.js';
import { resolveTier } from './rebate.js';

let TU_SEQ = 0;
export function __resetTrueUpSeqForTests() { TU_SEQ = 0; }

/** Rate at a volume for the agreement's structure (retrospective => achieved band rate). */
function rateAt(agreement, volume) {
  const tiers = agreement.tiers || [];
  if (!tiers.length) return 0;
  if (agreement.rebateStructure === RebateStructure.FLAT_PERCENTAGE
    || agreement.rebateStructure === RebateStructure.PER_UNIT) return tiers[0].rate;
  const { tier } = resolveTier(tiers, volume);
  return tier ? tier.rate : 0;
}
function tierIndexAt(agreement, volume) {
  const { index } = resolveTier(agreement.tiers || [], volume);
  return index;
}

/**
 * Build a True-Up from before/after volumes and the driver corrections.
 * @param {object} args
 *  - agreement, scopeKey, period, currency, eurEquivalent
 *  - baseVolume:  volume the engine saw (before)
 *  - engineClaimed: CCOGS the engine actually claimed (money, before)
 *  - reconstructedVolume: true qualifying volume (after)
 *  - basisValue: monetary base the rebate % applies to (for VALUE basis this is
 *      the reconstructed value; for UNITS/WEIGHT the caller passes the value base
 *      so % → money). If omitted, falls back to reconstructedVolume (units≈value).
 *  - corrections: [{ driver, volumeDelta, note }] the reconstruction produced
 *  - now, actor
 * @returns {object} { charge|null, calc }
 */
export function buildTrueUp(args) {
  const {
    agreement, scopeKey, period, currency, eurEquivalent = null,
    baseVolume, engineClaimed, reconstructedVolume, basisValue = null,
    corrections = [], contributingEvents = [], clauseRef = null, actor = 'system', now,
  } = args;

  const rateBefore = rateAt(agreement, baseVolume);
  const rateAfter = rateAt(agreement, reconstructedVolume);
  const idxBefore = tierIndexAt(agreement, baseVolume);
  const idxAfter = tierIndexAt(agreement, reconstructedVolume);

  // Monetary base the % applies to. For VALUE basis the reconstructed volume IS
  // value; otherwise the caller supplies basisValue (value of the qualifying units).
  const valueBase = basisValue != null ? basisValue : reconstructedVolume;

  // Entitled = full reconstructed volume at the achieved (after) rate.
  const entitled = round2(valueBase * rateAfter);
  const claimed = round2(engineClaimed);
  const variance = round2(entitled - claimed);

  // Itemize causes as an EXACT decomposition of the variance (so the line-level
  // audit export reconciles to the headline to the cent — no small differences).
  //
  //   entitled = valueBase × rateAfter
  //            = (baseValue × rateAfter) + Σ(driverUnits × unitValue × rateAfter)
  //   variance = entitled − claimed
  //            = [baseValue × rateAfter − claimed]  (the "base uplift" line)
  //            + Σ(driverUnits × unitValue × rateAfter)  (one line per restored cause)
  //
  // The bracket is the base volume now repriced at the achieved (after) rate minus
  // what the engine actually claimed on it — this captures BOTH the retrospective
  // tier uplift on the base AND any under-claim on the base. The driver lines are
  // the never-counted restored units at the after rate. By construction these sum
  // to `variance`; we snap the base line to absorb any rounding drift last.
  const restored = corrections.reduce((s, c) => s + (c.volumeDelta || 0), 0);
  const unitValue = valueBase / Math.max(1, reconstructedVolume); // value per qualifying unit
  const lines = [];

  // 2) driver lines first (compute their exact rounded contributions)
  const driverLines = [];
  let driverSum = 0;
  for (const c of corrections) {
    if (!c.volumeDelta) continue;
    const deltaValue = round2(c.volumeDelta * unitValue * rateAfter);
    driverSum = round2(driverSum + deltaValue);
    driverLines.push({
      cause: causeLabel(c.driver),
      driver: c.driver,
      qty: Math.round(c.volumeDelta),
      fromPct: 0, toPct: round2(rateAfter * 100),
      deltaValue,
      note: c.note || '',
    });
  }

  // 1) base line = remainder so ALL lines sum EXACTLY to the variance. This equals
  // (baseValue × rateAfter − claimed) up to rounding; we take it as variance − driverSum.
  const baseLineValue = round2(variance - driverSum);
  if (Math.abs(baseLineValue) > 0.005 || driverLines.length === 0) {
    const upliftNote = rateAfter > rateBefore
      ? `Achieved tier lifted from ${(rateBefore * 100).toFixed(2)}% to ${(rateAfter * 100).toFixed(2)}% — retrospective on the base volume`
      : `Base volume repriced at ${(rateAfter * 100).toFixed(2)}% vs what the engine claimed`;
    lines.push({
      cause: (baseVolume > 0 || rateAfter > rateBefore) ? 'Tier uplift on already-received volume' : 'Entitlement not claimed by engine',
      driver: 'TIER_UPLIFT',
      qty: Math.round(baseVolume),
      fromPct: round2(rateBefore * 100), toPct: round2(rateAfter * 100),
      deltaValue: baseLineValue,
      note: upliftNote,
    });
  }
  lines.push(...driverLines);

  const calc = {
    agreementId: agreement.agreementId, scopeKey, period,
    baseVolume: Math.round(baseVolume), reconstructedVolume: Math.round(reconstructedVolume),
    restoredUnits: Math.round(restored),
    rateBeforePct: round2(rateBefore * 100), rateAfterPct: round2(rateAfter * 100),
    tierBefore: idxBefore, tierAfter: idxAfter,
    entitledCcogs: entitled, claimedCcogs: claimed, variance, currency,
  };

  if (variance <= 0.01) return { charge: null, calc, lines };

  const chargeId = `TU-${agreement.agreementId}-${period}-${String(++TU_SEQ).padStart(3, '0')}`;
  const entry = auditEntry({
    actor, action: 'TRUE_UP_GENERATED',
    details: { chargeId, ...calc, causes: lines.map((l) => l.driver) },
    evidenceRefs: [agreement.provenance, clauseRef, ...contributingEvents].filter(Boolean),
  }, now);

  const charge = createSupplementingCharge({
    chargeId, docType: 'CCOGS_TRUE_UP',
    agreementId: agreement.agreementId, supplierId: agreement.supplierId,
    scopeKey, period,
    entitledCcogs: entitled, claimedCcogs: claimed, variance,
    currency, eurEquivalent,
    tierFromPct: round2(rateBefore * 100), tierToPct: round2(rateAfter * 100),
    tierApplied: JSON.stringify({ from: rateBefore, to: rateAfter, tierBefore: idxBefore, tierAfter: idxAfter }),
    structure: agreement.rebateStructure, basis: agreement.basis,
    lines, clauseRef,
    status: ChargeStatus.PENDING_APPROVAL,
    auditTrace: [entry],
  });

  return { charge, calc, lines };
}

function causeLabel(driver) {
  const m = {
    EXPIRED_WINDOW_LATE_DELIVERY: 'Ordered in-window, delivered after contract end',
    FOUND_LATER_PALLET: 'Pallet located after initial short-scan',
    FORGOTTEN_SKU: 'Contract SKU missing from internal engine',
    REROUTE_SKIPPED_SCAN: 'Rerouted to town WH — main-WH scan skipped',
    RETURN_REJECTION: 'Rejected return kept in purchased volume',
    OVERAGE_SHIPMENT: 'Retained overage units',
    BACKORDERING: 'Backordered units in control period',
    LATE_SHIPMENT: 'Late shipment in control period',
    PAN_EU_SPLIT: 'Pan-EU cross-country aggregation',
    TIER_UPLIFT: 'Tier uplift on already-received volume',
  };
  return m[driver] || driver;
}
