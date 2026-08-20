// Rebate_Engine (Req 3). Pure functions — given qualifying volume + agreement
// config + selections, compute Entitled_CCOGS. No hard-coded tiers/rates/%.
// Supports the four structures and retrospective reach (within-period vs
// prior-periods reopening). Recompute is just re-invocation with new selections.

import { RebateStructure, RetrospectiveReach } from './enums.js';

/**
 * Resolve which tier a qualifying volume Q lands in (highest threshold <= Q).
 * Returns { index, tier } or { index: -1, tier: null } if below the first band.
 */
export function resolveTier(tiers, q) {
  let idx = -1;
  for (let i = 0; i < tiers.length; i++) {
    if (q >= tiers[i].threshold) idx = i; else break;
  }
  return { index: idx, tier: idx >= 0 ? tiers[idx] : null };
}

/**
 * Compute entitled CCOGS for a single (scopeKey, period) qualifying volume.
 * @param {number} q qualifying volume (already basis-weighted)
 * @param {object} agreement provides tiers + rebateStructure (unless overridden)
 * @param {object} selections optional { rebateStructure } override for what-if
 * @returns {object} { entitled, tierIndex, tierApplied, structure, breakdown[] }
 */
export function computeEntitled(q, agreement, selections = {}) {
  const structure = selections.rebateStructure ?? agreement.rebateStructure;
  const tiers = agreement.tiers ?? [];
  if (!structure) throw new Error('rebate: rebateStructure unresolved');

  switch (structure) {
    case RebateStructure.RETROSPECTIVE_TIERED: {
      // achieved tier's rate applies to the ENTIRE volume (Req 3.6)
      const { index, tier } = resolveTier(tiers, q);
      const rate = tier ? tier.rate : 0;
      return {
        entitled: roundRebate(q * rate), tierIndex: index, tierApplied: tier, structure,
        breakdown: [{ from: tier ? tier.threshold : 0, units: q, rate, amount: roundRebate(q * rate) }],
      };
    }
    case RebateStructure.SLIDING_INCREMENTAL: {
      // each band's rate applies only to units within that band (Req 3.7)
      let remaining = q;
      let entitled = 0;
      const breakdown = [];
      for (let i = 0; i < tiers.length && remaining > 0; i++) {
        const bandStart = tiers[i].threshold;
        const bandEnd = i + 1 < tiers.length ? tiers[i + 1].threshold : Infinity;
        if (q <= bandStart) break;
        const unitsInBand = Math.min(q, bandEnd) - bandStart;
        if (unitsInBand <= 0) continue;
        const amount = unitsInBand * tiers[i].rate;
        entitled += amount;
        breakdown.push({ from: bandStart, to: bandEnd === Infinity ? null : bandEnd, units: unitsInBand, rate: tiers[i].rate, amount: roundRebate(amount) });
        remaining -= unitsInBand;
      }
      const { index, tier } = resolveTier(tiers, q);
      return { entitled: roundRebate(entitled), tierIndex: index, tierApplied: tier, structure, breakdown };
    }
    case RebateStructure.FLAT_PERCENTAGE: {
      const rate = tiers.length ? tiers[0].rate : 0;
      return { entitled: roundRebate(q * rate), tierIndex: 0, tierApplied: tiers[0] ?? null, structure,
        breakdown: [{ units: q, rate, amount: roundRebate(q * rate) }] };
    }
    case RebateStructure.PER_UNIT: {
      const amountPerUnit = tiers.length ? tiers[0].rate : 0;
      return { entitled: roundRebate(q * amountPerUnit), tierIndex: 0, tierApplied: tiers[0] ?? null, structure,
        breakdown: [{ units: q, ratePerUnit: amountPerUnit, amount: roundRebate(q * amountPerUnit) }] };
    }
    default:
      throw new Error(`rebate: unknown structure "${structure}"`);
  }
}

/**
 * Retrospective reach (Req 3.9). Given the current period's volume plus a map of
 * prior closed periods -> qualifying volume, compute total entitled.
 *  - WITHIN_PERIOD: only the current period.
 *  - PRIOR_PERIODS: reopen priors, recompute each at the now-achieved config, sum.
 * Returns { total, perPeriod: [{period, q, entitled}] }.
 */
export function computeEntitledWithReach({ agreement, selections = {}, currentPeriod, currentVolume, priorVolumes = {} }) {
  const reach = selections.retrospectiveReach ?? agreement.retrospectiveReach ?? RetrospectiveReach.WITHIN_PERIOD;
  const perPeriod = [];
  const cur = computeEntitled(currentVolume, agreement, selections);
  perPeriod.push({ period: currentPeriod, q: currentVolume, entitled: cur.entitled, reopened: false });

  if (reach === RetrospectiveReach.PRIOR_PERIODS) {
    for (const [per, q] of Object.entries(priorVolumes)) {
      const e = computeEntitled(q, agreement, selections);
      perPeriod.push({ period: per, q, entitled: e.entitled, reopened: true });
    }
  }
  const total = roundRebate(perPeriod.reduce((s, p) => s + p.entitled, 0));
  return { total, perPeriod, reach };
}

function roundRebate(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
