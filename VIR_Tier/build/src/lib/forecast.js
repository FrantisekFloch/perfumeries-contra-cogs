// Forecast / accrual — Phase A (FACTS ONLY, no prediction). (Competitive gap #6)
//
// Commercial rebate tools (Enable, IMA360) lead with "what am I on track to earn
// this period" BEFORE period-close. The rest of this tool is strictly
// retrospective (leakage already happened -> reclaim it). This module adds a
// forward-looking, period-to-date READ WITHOUT touching the cent-exact
// retrospective numbers: it reports the qualifying volume achieved so far, the
// gap to the next rebate tier, and how much of the contract window has elapsed.
//
// Deliberately NOT a projection: no run-rate extrapolation, no predicted EUR.
// Everything here is a stated fact ("achieved X of Y to next tier; Z days left"),
// so it can never be confused with the audited recovery figures.
//
// Kept as its OWN module so the isolation is structural.

import { resolveTier } from './rebate.js';

// days between two ISO dates (a - b), or null if either missing/invalid
function daysBetween(aIso, bIso) {
  if (!aIso || !bIso) return null;
  const a = Date.parse(aIso), b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * Build the period-to-date forecast read across all agreements.
 * @param {object} args
 *   - consolidated: state.consolidated (byAgreement map)
 *   - reconstructions: state.reconstructions (already computed; PTD volume source)
 *   - asOfDate: ISO date string to measure the window against (default: today)
 * @returns {object} { rows[], totals } where each row is one agreement:
 *   { agreementId, supplierName, windowType, ptdVolume, basis,
 *     currentTierPct, nextThreshold, gapToNext, atTopTier,
 *     windowFrom, windowTo, daysElapsed, daysTotal, daysRemaining, pctElapsed,
 *     flag: 'on_track' | 'at_risk' | 'complete' }
 */
export function buildForecast({ consolidated, reconstructions = [], asOfDate = null } = {}) {
  const asOf = asOfDate || new Date().toISOString().slice(0, 10);
  const recByAgr = new Map(reconstructions.map((r) => [r.agreementId, r]));
  const rows = [];

  if (consolidated && consolidated.byAgreement) {
    for (const [agreementId, g] of consolidated.byAgreement) {
      const agreement = g.agreement;
      if (!agreement) continue;
      const tiers = [...(agreement.tiers || [])].sort((x, y) => x.threshold - y.threshold);

      // period-to-date qualifying volume = sum of this agreement's reconstructed
      // volumes we already have (the "as of now" achieved volume).
      const rec = recByAgr.get(agreementId);
      const ptdVolume = rec ? (rec.volumes || []).reduce((s, v) => s + (v.volume || v.qualifyingVolume || 0), 0) : 0;

      // current tier + gap to the next threshold
      const { index, tier } = resolveTier(tiers, ptdVolume);
      const currentTierPct = tier ? tier.rate * 100 : 0;
      const nextTier = index + 1 < tiers.length ? tiers[index + 1] : null;
      const atTopTier = !nextTier;
      const nextThreshold = nextTier ? nextTier.threshold : null;
      const gapToNext = nextTier ? Math.max(0, nextThreshold - ptdVolume) : 0;

      // window elapsed / remaining
      const windowFrom = agreement.effectiveFrom || null;
      const windowTo = agreement.effectiveTo || null;
      const daysTotal = daysBetween(windowTo, windowFrom);
      const daysElapsed = daysBetween(asOf, windowFrom);
      const daysRemaining = (daysTotal != null && daysElapsed != null) ? Math.max(0, daysTotal - daysElapsed) : null;
      const pctElapsed = (daysTotal && daysElapsed != null && daysTotal > 0) ? Math.min(100, Math.max(0, Math.round((daysElapsed / daysTotal) * 100))) : null;

      // fact-based flag (NOT a prediction): at top tier => complete; a gap remains
      // with more than half the window gone => at_risk; otherwise on_track.
      let flag = 'on_track';
      if (atTopTier) flag = 'complete';
      else if (pctElapsed != null && pctElapsed >= 50 && gapToNext > 0) flag = 'at_risk';

      // ---- Phase B: run-rate PROJECTION (clearly separated from the facts) ----
      // Straight-line extrapolation of the current pace to the end of the window.
      // This IS a prediction — labelled as such in the UI and never mixed with
      // the audited recovery figures.
      let projectedVolume = null, projectedReachesNext = null, projectedTierPct = null;
      if (!atTopTier && daysElapsed != null && daysTotal && daysElapsed > 0 && daysTotal > 0) {
        const frac = Math.min(1, daysElapsed / daysTotal);
        if (frac > 0) {
          projectedVolume = Math.round(ptdVolume / frac);
          projectedReachesNext = nextThreshold != null ? projectedVolume >= nextThreshold : null;
          const pt = resolveTier(tiers, projectedVolume).tier;
          projectedTierPct = pt ? pt.rate * 100 : 0;
        }
      }

      rows.push({
        agreementId,
        supplierName: agreement.supplierName || agreement.supplierId || agreementId,
        windowType: agreement.windowType || null,
        basis: agreement.basis || null,
        ptdVolume,
        currentTierPct,
        nextThreshold,
        gapToNext,
        atTopTier,
        windowFrom, windowTo,
        daysElapsed, daysTotal, daysRemaining, pctElapsed,
        flag,
        // projection (Phase B)
        projectedVolume, projectedReachesNext, projectedTierPct,
      });
    }
  }

  rows.sort((a, b) => (b.gapToNext - a.gapToNext) || (a.pctElapsed || 0) - (b.pctElapsed || 0));
  const totals = {
    count: rows.length,
    atRisk: rows.filter((r) => r.flag === 'at_risk').length,
    onTrack: rows.filter((r) => r.flag === 'on_track').length,
    complete: rows.filter((r) => r.flag === 'complete').length,
    asOf,
  };
  return { rows, totals };
}
