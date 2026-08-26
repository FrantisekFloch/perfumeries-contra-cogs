// Pipeline (Req: task 18 integration). Composes the engines end to end for a
// consolidated dataset and a set of UI selections, producing reconstructions,
// entitled CCOGS, variances, and supplementing charges with audit traces.
//
//   consolidate -> for each agreement:
//     reconstructVolume -> computeEntitled (per scopeKey/period, with reach + FX)
//       -> buildVariance -> charge (when > 0)

import { reconstructVolume } from './reconstruction.js';
import { computeEntitled, computeEntitledWithReach } from './rebate.js';
import { buildVariance } from './variance.js';
import { buildTrueUp } from './trueup.js';
import { fxRequired, toEur, money } from './money.js';
import { Scope, Basis, RetrospectiveReach } from './enums.js';

/**
 * Run the recovery pipeline over consolidated data.
 * @param {object} consolidated  result of consolidate()
 * @param {object} opts
 *   - selections: { basis, period, scope, rebateStructure, retrospectiveReach } overrides (optional)
 *   - fx: EUR-based FX table (required if any value+panEU+mixed case appears)
 *   - now: injectable clock
 * @returns {object} { reconstructions:[], charges:[], calcs:[], warnings:[] }
 */
export function runPipeline(consolidated, { selections = {}, fx = null, now } = {}) {
  const reconstructions = [];
  const charges = [];
  const calcs = [];
  const warnings = [];

  const beforeAfter = [];

  for (const group of consolidated.byAgreement.values()) {
    const { agreement, purchases, receipts, events, claimed, ccogsEngine = [] } = group;
    if (agreement.incompleteFields.length) {
      warnings.push({ agreementId: agreement.agreementId, reason: 'incomplete agreement config', missing: agreement.incompleteFields });
      continue;
    }

    const basis = selections.basis ?? agreement.basis;
    const period = selections.period ?? agreement.period;
    const scope = selections.scope ?? agreement.scope;

    const rec = reconstructVolume({ agreement, purchases, receipts, events, selections: { basis, period, scope } });
    reconstructions.push(rec);

    // The "before" baseline = what the CCOGS Engine actually claimed (preferred),
    // falling back to any claimed-CCOGS record. Indexed by scopeKey|period.
    const baseline = (ccogsEngine.length ? ccogsEngine : claimed);
    const claimIndex = new Map();
    for (const c of baseline) claimIndex.set(`${c.scopeKey}||${c.period}`, c);

    // Group reconstructed volumes into "claim contexts". Claims in the sample are
    // at the agreement period granularity (e.g., YEAR); we sum reconstructed
    // volume per scopeKey across sub-periods to align, then match to a claim.
    const byScope = new Map();
    for (const v of rec.volumes) {
      if (!byScope.has(v.scopeKey)) byScope.set(v.scopeKey, { scopeKey: v.scopeKey, total: 0, periods: {} });
      const s = byScope.get(v.scopeKey);
      s.total += v.qualifyingVolume;
      s.periods[v.period] = (s.periods[v.period] ?? 0) + v.qualifyingVolume;
    }

    for (const s of byScope.values()) {
      // Determine the claim to compare against (scopeKey + agreement-period key).
      const claimKeyCandidates = Object.keys(s.periods).map((p) => `${s.scopeKey}||${p}`);
      // also try a year-level claim (sample uses year)
      const yearKeys = [...new Set(Object.keys(s.periods).map((p) => `${s.scopeKey}||${p.slice(0, 4)}`))];
      let claim = null;
      for (const k of [...claimKeyCandidates, ...yearKeys]) { if (claimIndex.has(k)) { claim = claimIndex.get(k); break; } }
      // fallback: any baseline record for this scope
      if (!claim) claim = baseline.find((c) => c.scopeKey === s.scopeKey) ?? null;

      // Entitled: apply retrospective reach across periods if configured.
      const reach = selections.retrospectiveReach ?? agreement.retrospectiveReach ?? RetrospectiveReach.WITHIN_PERIOD;
      const periodKeys = Object.keys(s.periods).sort();
      const currentPeriod = periodKeys[periodKeys.length - 1] ?? `${new Date().getFullYear()}`;
      const currentVolume = reach === RetrospectiveReach.PRIOR_PERIODS ? (s.periods[currentPeriod] ?? 0) : s.total;
      const priorVolumes = {};
      if (reach === RetrospectiveReach.PRIOR_PERIODS) {
        for (const p of periodKeys.slice(0, -1)) priorVolumes[p] = s.periods[p];
      }

      let entitled, tierApplied;
      if (reach === RetrospectiveReach.PRIOR_PERIODS && periodKeys.length > 1) {
        const r = computeEntitledWithReach({ agreement, selections, currentPeriod, currentVolume, priorVolumes });
        entitled = r.total;
        tierApplied = null;
      } else {
        const r = computeEntitled(s.total, agreement, selections);
        entitled = r.entitled;
        tierApplied = r.tierApplied;
      }

      // Currency + optional FX to EUR. Required for value+pan-EU+mixed (aggregation),
      // and also produced whenever a pan-EU agreement carries mixed currencies so the
      // recovered amount can be shown/settled in EUR.
      const currency = (agreement.currencies && agreement.currencies[0]) || 'EUR';
      const currencies = agreement.currencies || [currency];
      const mixedPanEu = scope === Scope.PAN_EU && new Set(currencies).size > 1;
      let eurEquivalent = null;
      let fxSnapshot = null;   // { rate, asOf, base, source } stored on the charge for audit defensibility
      const needFx = fxRequired({ basis, scope, currencies }) || mixedPanEu;
      if (needFx) {
        if (!fx) warnings.push({ agreementId: agreement.agreementId, reason: 'FX required but no FX table provided' });
        else {
          const conv = toEur(money(entitled, currency === 'EUR' ? 'EUR' : currency), fx);
          eurEquivalent = conv.value;
          fxSnapshot = { rate: conv.fxRate, asOf: conv.fxAsOf, base: fx.base || 'EUR', source: fx.source || 'fx_rates', fromCurrency: currency };
        }
      }

      const claimedAmt = claim ? claim.amountClaimed : 0;
      const clauseRef = agreement.clauseRefs?.tier ?? null;
      const contributing = [
        ...receipts.filter((r) => scope === Scope.PAN_EU || r.country === s.scopeKey).map((r) => r.receiptId),
        ...events.map((e) => e.eventId),
      ];

      // Corrections (restored units) that belong to this scope — these are the
      // itemized causes of the True-Up. base volume = reconstructed − restored.
      const scopeCorrections = (rec.corrections || []).filter((c) =>
        (c.volumeDelta || 0) !== 0 && (scope === Scope.PAN_EU || c.scopeKey === s.scopeKey || c.country === s.scopeKey));
      const restoredForScope = scopeCorrections.reduce((a, c) => a + (c.volumeDelta || 0), 0);
      const baseVolume = Math.max(0, s.total - restoredForScope);

      // True-Up: itemized causes + cumulative tier delta. `entitled` (from the
      // rebate engine on the full reconstructed volume) is the value base × rate;
      // pass it as basisValue-equivalent by using entitled/rate — but simpler: the
      // rebate engine already produced `entitled` = valueBase × rateAfter, so we
      // hand buildTrueUp the reconstructed volume as valueBase proxy and let it
      // recompute consistently. For VALUE basis s.total IS value; for UNITS the
      // entitled already encodes rate×units so we align by passing basisValue.
      const rateAfter = tierApplied ? tierApplied.rate : (entitled && s.total ? entitled / s.total : 0);
      const basisValue = rateAfter > 0 ? entitled / rateAfter : s.total;

      const tu = buildTrueUp({
        agreement, scopeKey: s.scopeKey, period: currentPeriod, currency, eurEquivalent, fxSnapshot,
        baseVolume, engineClaimed: claimedAmt, reconstructedVolume: s.total, basisValue,
        corrections: scopeCorrections, contributingEvents: contributing, clauseRef, actor: 'system', now,
      });
      calcs.push(tu.calc);
      if (tu.charge) charges.push(tu.charge);

      const variance = tu.calc.variance;
      // Before/After + cost-of-inaction (the leakage left on the table).
      beforeAfter.push({
        agreementId: agreement.agreementId,
        supplierId: agreement.supplierId,
        supplierName: agreement.supplierName,
        scopeKey: s.scopeKey,
        period: currentPeriod,
        currency,
        before: {
          source: ccogsEngine.length ? 'CCOGS_ENGINE' : 'CLAIMED',
          engineVolume: claim && claim.engineVolume != null ? claim.engineVolume : baseVolume,
          tierApplied: claim && claim.tierApplied != null ? claim.tierApplied : null,
          claimed: claimedAmt,
          documentType: claim && claim.documentType ? claim.documentType : null,
        },
        after: {
          reconstructedVolume: s.total,
          tierApplied: tierApplied ? tierApplied.rate : null,
          entitled,
        },
        trueUp: { tierFromPct: tu.calc.rateBeforePct, tierToPct: tu.calc.rateAfterPct, lines: tu.lines, restoredUnits: tu.calc.restoredUnits },
        costOfInaction: variance > 0 ? variance : 0,   // what we lose if we do nothing
        recoverable: variance > 0,
        eurEquivalent,
      });
    }
  }

  return { reconstructions, charges, calcs, warnings, beforeAfter };
}
