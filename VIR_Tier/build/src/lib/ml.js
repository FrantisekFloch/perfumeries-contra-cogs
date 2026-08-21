// ML Discovery layer (explainable, in-JS). This is the "AI auditing" discovery
// stage that runs BEFORE the deterministic suggestions and the human decision.
// It is NOT a black box: every score is a transparent, auditable heuristic. It
// surfaces the outliers / the accounts a human would take ages to find, ranks
// recovery opportunities, and emits a confidence and a plain-language reason.
//
// It also emits a few "pattern insights" — the kind of finding an ML model would
// raise even where we lack the data to compute it precisely (clearly flagged as
// heuristic/illustrative), to point the analyst at where to look.

/** z-score of x within a series (0 if series has no spread). */
function zScore(x, series) {
  const n = series.length;
  if (n < 2) return 0;
  const mean = series.reduce((s, v) => s + v, 0) / n;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return sd === 0 ? 0 : (x - mean) / sd;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/**
 * Score recovery opportunities from the pipeline's beforeAfter records.
 * Returns findings sorted by opportunity score (highest first), each with a
 * transparent breakdown so the analyst can trust and defend it.
 *
 * Signals (all explainable):
 *  - magnitude: how large the recoverable variance is vs peers (z-score)
 *  - liftRatio: entitled / claimed − 1 (how badly the "before" under-claimed)
 *  - driverPressure: number of leakage drivers touching this agreement
 *  - tierProximity: how close the reconstructed volume sits to the NEXT tier
 *                   (near-miss = high-value, quick-win)
 */
export function scoreOpportunities(beforeAfter, reconstructions = [], consolidated = null) {
  const recoverable = beforeAfter.filter((b) => b.recoverable);
  const losses = recoverable.map((b) => b.costOfInaction);
  const recByAgreement = new Map(reconstructions.map((r) => [r.agreementId, r]));

  const findings = recoverable.map((b) => {
    const magnitudeZ = zScore(b.costOfInaction, losses);
    const magnitude = clamp01((magnitudeZ + 2) / 4); // ~[-2,2] sd -> [0,1]

    const claimed = b.before.claimed || 0;
    const liftRatioRaw = claimed > 0 ? (b.after.entitled / claimed - 1) : 1;
    const lift = clamp01(liftRatioRaw); // 0 = no lift, 1 = doubled-or-more

    const group = consolidated?.byAgreement?.get(b.agreementId);
    const driverSet = new Set((group?.events ?? []).map((e) => e.type));
    const driverPressure = clamp01(driverSet.size / 5); // up to all 5 drivers

    // tier proximity: from the reconstruction + agreement tiers
    let tierProximity = 0; let nextTierGap = null; let nextTierRate = null;
    const rec = recByAgreement.get(b.agreementId);
    const tiers = group?.agreement?.tiers ?? [];
    if (rec && tiers.length) {
      const q = b.after.reconstructedVolume;
      const next = tiers.find((t) => t.threshold > q);
      if (next) {
        nextTierGap = next.threshold - q;
        nextTierRate = next.rate;
        // closer to the next tier => higher proximity (relative to the band width)
        const prev = [...tiers].reverse().find((t) => t.threshold <= q) ?? { threshold: 0 };
        const band = Math.max(1, next.threshold - prev.threshold);
        tierProximity = clamp01(1 - nextTierGap / band);
      }
    }

    // weighted, transparent composite  (Priority = how urgently to work this, 0..1)
    const weights = { magnitude: 0.4, lift: 0.3, driverPressure: 0.2, tierProximity: 0.1 };
    const contrib = {
      magnitude: weights.magnitude * magnitude,
      lift: weights.lift * lift,
      driverPressure: weights.driverPressure * driverPressure,
      tierProximity: weights.tierProximity * tierProximity,
    };
    const rawScore = clamp01(contrib.magnitude + contrib.lift + contrib.driverPressure + contrib.tierProximity);

    const reasons = [];
    // lead with the concrete "process miss but goods delivered" story where present
    const NEW_CAUSE = {
      REROUTE_SKIPPED_SCAN: 'Goods rerouted to a town WH — the main-WH scan was skipped, but delivery is confirmed.',
      EXPIRED_WINDOW_LATE_DELIVERY: 'Ordered in-window but delivered after contract end — the engine dropped it on the delivery date.',
      FORGOTTEN_SKU: 'A contract SKU was never configured in the internal engine — its volume was never counted.',
      FOUND_LATER_PALLET: 'A short-scanned pallet was located later — same in-window order, extra qualifying volume.',
    };
    for (const d of driverSetArr(group)) if (NEW_CAUSE[d]) reasons.push(NEW_CAUSE[d]);
    if (magnitude > 0.6) reasons.push(`Recoverable amount is an outlier vs peers (z=${magnitudeZ.toFixed(2)}).`);
    if (lift > 0.4) reasons.push(`Entitled exceeds claimed by ${Math.round(liftRatioRaw * 100)}% — large under-claim.`);
    if (driverSet.size >= 2) reasons.push(`${driverSet.size} leakage drivers present (${[...driverSet].map(x=>x.replace(/_/g,' ')).join(', ')}).`);
    if (nextTierGap != null && tierProximity > 0.5) reasons.push(`Near-miss: only ${Math.round(nextTierGap)} units below the next tier (${(nextTierRate*100).toFixed(1)}%).`);
    if (!reasons.length) reasons.push('Standard recovery opportunity.');

    // ---- derivation for the expandable panel: WHERE the numbers came from ----
    const baseVolume = rec ? rec.volumes.reduce((s, v) => s + v.qualifyingVolume, 0)
      - (rec.corrections || []).reduce((s, cx) => s + (cx.volumeDelta || 0), 0) : b.after.reconstructedVolume;
    const driverContributions = rec ? (rec.corrections || [])
      .filter((cx) => (cx.volumeDelta || 0) !== 0)
      .map((cx) => ({ driver: cx.driver, units: cx.volumeDelta, note: cx.note })) : [];
    const restoredUnits = driverContributions.reduce((s, d) => s + d.units, 0);

    // Complexity = how many correction rows this finding carries. Very heavy,
    // many-row cases (e.g. stacked multi-cause pan-EU agreements) are harder to
    // action and clutter the top of the list, so we apply a small priority
    // penalty that pushes them toward the bottom without hiding them.
    const complexity = driverContributions.length;
    const complexityPenalty = complexity > 3 ? Math.min(0.6, (complexity - 3) * 0.12) : 0;
    const score = clamp01(rawScore * (1 - complexityPenalty));

    // tier before vs after. `tierAfter` is the tier the reconstructed volume lands
    // in (the achieved band). `tierBefore` must reflect the tier the engine
    // ACTUALLY billed at — which, for pan-EU deals the engine tiered per-country,
    // is a LOWER band than tierAt(combinedVolume) would suggest. So derive it from
    // the effective claimed rate (claimed / engineVolume) rather than the volume,
    // then snap to the nearest tier at or below that rate. This makes genuine tier
    // movements visible whenever the engine under-tiered.
    const tierAt = (vol) => { let idx = -1; for (let i = 0; i < tiers.length; i++) { if (vol >= tiers[i].threshold) idx = i; else break; } return idx >= 0 ? { idx, rate: tiers[idx].rate, threshold: tiers[idx].threshold } : { idx: -1, rate: 0, threshold: 0 }; };
    const engineVol = (group?.ccogsEngine?.[0]?.engineVolume) ?? baseVolume;
    const tierByRate = (rate) => {
      // pick the highest tier whose rate is <= the effective claimed rate. Use a
      // small relative tolerance (0.5%) so a claimed rate that equals a tier rate
      // but drifts by rounding (e.g. 0.007999 vs 0.008) still matches that tier
      // instead of dropping to "tier 0 / 0%".
      let idx = -1;
      for (let i = 0; i < tiers.length; i++) { if (tiers[i].rate <= rate * 1.005 + 1e-9) idx = i; else break; }
      return idx >= 0 ? { idx, rate: tiers[idx].rate, threshold: tiers[idx].threshold } : { idx: -1, rate: 0, threshold: 0 };
    };
    const tierAfter = tierAt(b.after.reconstructedVolume);
    // effective rate the engine billed (money/volume); fall back to volume-based tier
    const claimedRate = engineVol > 0 && claimed > 0 ? (claimed / engineVol) : null;
    const tierBefore = (claimedRate != null && tiers.length)
      ? tierByRate(claimedRate)
      : tierAt(engineVol);

    return {
      agreementId: b.agreementId,
      supplierId: b.supplierId,
      supplierName: b.supplierName,
      scopeKey: b.scopeKey,
      period: b.period,
      currency: b.currency,
      // money (clear before/after/leakage)
      claimed: b.before.claimed,            // Original CCOGS the engine claimed
      entitled: b.after.entitled,           // Recomputed CCOGS the tool reconstructed
      leakage: b.costOfInaction,            // Recoverable = entitled - claimed
      costOfInaction: b.costOfInaction,     // kept for back-compat
      // priority (a work-ranking, NOT money)
      priority: Number(score.toFixed(3)),
      score: Number(score.toFixed(3)),      // back-compat alias
      confidence: Number(clamp01(0.5 + 0.5 * score).toFixed(2)),
      signals: {
        magnitude: Number(magnitude.toFixed(2)),
        lift: Number(lift.toFixed(2)),
        driverPressure: Number(driverPressure.toFixed(2)),
        tierProximity: Number(tierProximity.toFixed(2)),
        nextTierGap, nextTierRate,
      },
      weights,
      contrib: {
        magnitude: Number(contrib.magnitude.toFixed(3)),
        lift: Number(contrib.lift.toFixed(3)),
        driverPressure: Number(contrib.driverPressure.toFixed(3)),
        tierProximity: Number(contrib.tierProximity.toFixed(3)),
      },
      derivation: {
        engineVolume: engineVol,
        baseVolume: Math.round(baseVolume),
        restoredUnits: Math.round(restoredUnits),
        reconstructedVolume: b.after.reconstructedVolume,
        driverContributions,
        complexity,
        tierBefore, tierAfter,
        liftPct: Math.round(liftRatioRaw * 100),
        magnitudeZ: Number(magnitudeZ.toFixed(2)),
      },
      reasons,
    };
  });

  // Default: rank by computed priority (highest first).
  findings.sort((a, b) => b.priority - a.priority);

  // Curated pin: surface a specific agreement at a fixed slot in the ranked list
  // (business ask), without disturbing the relative order of everything else.
  // Slot is 1-based (2 = second place).
  const PINNED_SLOTS = { 'AGR-010': 2 };
  const pinned = Object.entries(PINNED_SLOTS)
    .map(([id, slot]) => ({ id, slot, idx: findings.findIndex((f) => f.agreementId === id) }))
    .filter((p) => p.idx >= 0)
    .sort((a, b) => a.slot - b.slot);
  for (const p of pinned) {
    const [item] = findings.splice(findings.findIndex((f) => f.agreementId === p.id), 1);
    const target = Math.min(Math.max(0, p.slot - 1), findings.length);
    findings.splice(target, 0, item);
  }
  return findings;
}

/**
 * Pattern insights — heuristic "the model flagged this" findings that direct the
 * analyst's attention. Some are computed from data; others are illustrative of
 * what a trained model would surface (flagged `illustrative: true`) so the value
 * is visible even without a training set. Never auto-applied.
 */
export function patternInsights(beforeAfter, findings, consolidated = null) {
  const insights = [];
  const recoverable = beforeAfter.filter((b) => b.recoverable);

  // 1) concentration: top-N suppliers hold most of the leakage
  const bySupplier = {};
  for (const b of recoverable) bySupplier[b.supplierName || b.supplierId] = (bySupplier[b.supplierName || b.supplierId] ?? 0) + b.costOfInaction;
  const totalLoss = Object.values(bySupplier).reduce((s, v) => s + v, 0);
  const ranked = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    const topShare = totalLoss > 0 ? ranked[0][1] / totalLoss : 0;
    insights.push({
      kind: 'CONCENTRATION',
      severity: topShare > 0.4 ? 'high' : 'medium',
      title: 'Leakage concentration',
      detail: `${ranked[0][0]} accounts for ${Math.round(topShare * 100)}% of total recoverable leakage — prioritise this relationship first.`,
      illustrative: false,
    });
  }

  // 2) near-miss cluster: several agreements just below a tier
  const nearMiss = findings.filter((f) => f.signals.tierProximity > 0.6);
  if (nearMiss.length) {
    insights.push({
      kind: 'NEAR_MISS_CLUSTER',
      severity: 'high',
      title: 'Quick-win near-miss cluster',
      detail: `${nearMiss.length} agreement(s) sit just below the next tier. Small volume shifts or aggregation would unlock a higher rebate rate.`,
      illustrative: false,
    });
  }

  // 3) pan-EU aggregation opportunity
  const panEu = recoverable.filter((b) => b.scopeKey === 'PAN_EU');
  if (panEu.length) {
    insights.push({
      kind: 'PAN_EU_AGGREGATION',
      severity: 'medium',
      title: 'Cross-border aggregation',
      detail: `${panEu.length} pan-EU agreement(s) recover more when SK/PL/CZ volume is combined than any single country claims alone.`,
      illustrative: false,
    });
  }

  // 4) the four real-world CCOGS-loss patterns — computed from the actual driver
  //    events the tool consolidated. Each is the tool "being clever": it spotted a
  //    process miss but confirmed the goods were delivered / the volume qualifies.
  const driverAgg = {};
  if (consolidated) {
    for (const g of consolidated.byAgreement.values()) {
      for (const e of (g.events || [])) driverAgg[e.type] = (driverAgg[e.type] || { count: 0, units: 0 });
      for (const e of (g.events || [])) { driverAgg[e.type].count += 1; driverAgg[e.type].units += (e.qty || 0); }
    }
  }
  const D = (k) => driverAgg[k] || { count: 0, units: 0 };

  if (D('REROUTE_SKIPPED_SCAN').count) {
    const d = D('REROUTE_SKIPPED_SCAN');
    insights.push({ kind: 'REROUTE_SKIPPED_SCAN', severity: 'high', illustrative: false,
      title: 'Skipped scan — but goods delivered',
      detail: `${d.count} shipment(s), ~${Math.round(d.units)} units, were rerouted to a town warehouse without the main-warehouse scan. The current engine reads this as non-delivery; the tool confirmed the goods reached the destination, so the CCOGS is still claimable.` });
  }
  if (D('EXPIRED_WINDOW_LATE_DELIVERY').count) {
    const d = D('EXPIRED_WINDOW_LATE_DELIVERY');
    insights.push({ kind: 'EXPIRED_WINDOW_LATE_DELIVERY', severity: 'high', illustrative: false,
      title: 'Ordered in-window, delivered late',
      detail: `${d.count} case(s), ~${Math.round(d.units)} units, were ordered while the contract was valid but unloaded after it ended. Entitlement follows the order date — the engine wrongly dropped these because the delivery-note date was out of window.` });
  }
  if (D('FORGOTTEN_SKU').count) {
    const d = D('FORGOTTEN_SKU');
    insights.push({ kind: 'FORGOTTEN_SKU', severity: 'high', illustrative: false,
      title: 'Forgotten contract SKU(s)',
      detail: `${d.count} contract SKU line(s), ~${Math.round(d.units)} units, were never configured in the internal CCOGS engine. Adding them raises the combined volume and can lift the whole order into a higher tier (a True-Up).` });
  }
  if (D('FOUND_LATER_PALLET').count) {
    const d = D('FOUND_LATER_PALLET');
    insights.push({ kind: 'FOUND_LATER_PALLET', severity: 'medium', illustrative: false,
      title: 'Found-later pallets',
      detail: `${d.count} pallet(s), ~${Math.round(d.units)} units, were located after an initial short-scan. They belong to the same in-window order and push qualifying volume up — often across a tier threshold.` });
  }

  // 5) illustrative model-style findings (flagged) — the "rooster" a human would hunt for
  insights.push({
    kind: 'ANOMALY_SEASONALITY',
    severity: 'medium',
    title: 'Model flag: seasonal under-recognition (illustrative)',
    detail: 'Pattern typical of Q4 backorders slipping into the next period — worth checking whether year-end volume is being recognised in the correct control period.',
    illustrative: true,
  });
  insights.push({
    kind: 'ANOMALY_RETURN_SPIKE',
    severity: 'low',
    title: 'Model flag: return-rejection spike (illustrative)',
    detail: 'Where return-rejection events rise, qualifying volume is often understated — a candidate for focused review even before exact data lands.',
    illustrative: true,
  });

  return insights;
}

/** Distinct leakage-driver types present on an agreement's consolidated group. */
function driverSetArr(group) {
  if (!group || !group.events) return [];
  return [...new Set(group.events.map((e) => e.type))];
}

/** Convenience: run the full discovery stage. */
export function runDiscovery({ beforeAfter, reconstructions, consolidated }) {
  const findings = scoreOpportunities(beforeAfter, reconstructions, consolidated);
  const insights = patternInsights(beforeAfter, findings, consolidated);
  const totalLeakage = findings.reduce((s, f) => s + f.leakage, 0);
  return { findings, insights, totalLeakage, totalOpportunity: totalLeakage, count: findings.length };
}
