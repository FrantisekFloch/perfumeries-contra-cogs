// Insights layer (v2). Pure selectors that turn the portfolio into control-tower &
// finance intelligence: exception feed, aging heatmap, SLA timers, contra waterfall,
// DPO/working-capital, margin erosion, tier progress, rebate-at-risk, what-if, digest,
// and data quality. No DOM. Built on the portfolio view models (analytics.js) + raw docs.

import { portfolioTotals } from './analytics.js';

// Module-unique helper names (avoid colliding with analytics.js / timing.js in the
// single-scope offline bundle).
const r2i = (n) => Number((n || 0).toFixed(2));
const CLOSED_I = new Set(['FullyMatched', 'Paid', 'Archived']);
const DAY_I = 86400000;
const daysBetweenI = (a, b) => {
  const x = new Date(a).getTime(); const y = new Date(b).getTime();
  return (Number.isNaN(x) || Number.isNaN(y)) ? 0 : Math.max(0, Math.round((y - x) / DAY_I));
};

/** #4 Predicted-disruption: an open, unreceived invoice past its expected window with no signal. */
export function predictLikelyLost(v, asOf = new Date().toISOString(), slaDays = 21) {
  if (CLOSED_I.has(v.status)) return false;
  if ((v.receivedQty || 0) > 0) return false; // something arrived → not "silent"
  const age = daysBetweenI(v.invoiceDate || asOf, asOf);
  return age > slaDays; // nothing received well past the expected window
}

/**
 * #2 Exception feed — impact-weighted list of what needs attention now.
 * Severity order: likely-lost > lost leg > over-delivery > partial/short > delayed > aged-pending.
 */
export function exceptionFeed(portfolio, { asOf = new Date().toISOString(), slaDays = 21 } = {}) {
  const out = [];
  portfolio.forEach((v) => {
    const sit = v.receivedSituation || [];
    const has = (s) => sit.some((x) => x.situation === s);
    const age = daysBetweenI(v.invoiceDate || asOf, asOf);
    const push = (type, sev) => out.push({
      type, severity: sev, invoiceNumber: v.invoiceNumber, distributorId: v.distributorId,
      valueAtRisk: v.valueAtRisk || 0, missingQty: v.missingQty || 0, ageDays: age, status: v.status,
    });
    if (predictLikelyLost(v, asOf, slaDays)) push('likelyLost', 5);
    else if (has('lost')) push('lost', 5);
    if ((v.overQty || 0) > 0 || has('over')) push('over', 3);
    if (!CLOSED_I.has(v.status) && v.missingQty > 0 && !has('lost')) push('short', 3);
    if (has('delayed') || has('rerouted')) push('delayed', 2);
    if (v.timing && v.timing.ginr && age > slaDays) push('aged', 2);
  });
  // de-dup by invoice+type, keep highest severity, sort by severity then € at risk
  const seen = new Set();
  return out
    .filter((e) => { const k = e.invoiceNumber + e.type; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.severity - a.severity || b.valueAtRisk - a.valueAtRisk);
}

/** #3 Aging heatmap — storage × age-bucket grid of open value at risk.
 *  Buckets are tight: real delivery delays are typically 10–20 days, so most open
 *  items sit in the low buckets with only a small tail beyond 20 days. */
export const AGE_BUCKETS = [[0, 5], [6, 10], [11, 20], [21, Infinity]];
export const AGE_LABELS = ['0–5', '6–10', '11–20', '20+'];
export function agingHeatmap(portfolio, { asOf = new Date().toISOString() } = {}) {
  const storages = [...new Set(portfolio.flatMap((v) => v.storages))].sort();
  const grid = {}; storages.forEach((s) => { grid[s] = AGE_BUCKETS.map(() => 0); });
  portfolio.forEach((v) => {
    if (CLOSED_I.has(v.status) || (v.missingQty || 0) <= 0) return;
    const age = daysBetweenI(v.invoiceDate || asOf, asOf);
    const bi = AGE_BUCKETS.findIndex(([lo, hi]) => age >= lo && age <= hi);
    if (bi < 0) return;
    v.storages.forEach((s) => { grid[s][bi] += v.valueAtRisk || 0; });
  });
  const rows = storages.map((s) => ({ storageId: s, buckets: grid[s].map(r2i), total: r2i(grid[s].reduce((a, b) => a + b, 0)) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.flatMap((row) => row.buckets));
  return { labels: AGE_LABELS, rows, max: r2i(max) };
}

/** #5 SLA countdown — days used vs. an SLA window per open invoice (breach flagged). */
export function slaTimers(portfolio, { asOf = new Date().toISOString(), slaDays = 21 } = {}) {
  return portfolio
    .filter((v) => !CLOSED_I.has(v.status) && (v.missingQty || 0) > 0)
    .map((v) => {
      const used = daysBetweenI(v.invoiceDate || asOf, asOf);
      return {
        invoiceNumber: v.invoiceNumber, distributorId: v.distributorId,
        used, sla: slaDays, remaining: slaDays - used, breached: used > slaDays,
        pct: Math.min(100, Math.round((used / slaDays) * 100)), valueAtRisk: v.valueAtRisk || 0,
      };
    })
    .sort((a, b) => a.remaining - b.remaining);
}

/** #6 Contra COGS waterfall — full potential → recognized → pending → at-risk/forfeited. */
export function contraWaterfall(portfolio) {
  const full = r2i(portfolio.reduce((s, v) => s + (v.contra.headerDiscountTotal || 0), 0));
  const recognized = r2i(portfolio.reduce((s, v) => s + (v.contra.recognizedContra || 0), 0));
  const pending = r2i(portfolio.reduce((s, v) => s + (v.contra.pendingCredit || 0), 0));
  // "at risk" = the slice of full contra tied to still-missing goods on open invoices.
  const atRisk = r2i(portfolio.reduce((s, v) => {
    if (CLOSED_I.has(v.status)) return s;
    const gap = Math.max(0, (v.contra.headerDiscountTotal || 0) - (v.contra.recognizedContra || 0));
    return s + gap;
  }, 0));
  return {
    steps: [
      { key: 'full', label: 'full', value: full, kind: 'base' },
      { key: 'recognized', label: 'recognized', value: recognized, kind: 'good' },
      { key: 'pending', label: 'pending', value: pending, kind: 'warn' },
      { key: 'atRisk', label: 'atRisk', value: atRisk, kind: 'bad' },
    ],
    full, recognized, pending, atRisk,
  };
}

/** #8 DPO / working-capital proxy tile. */
export function workingCapital(portfolio, { asOf = new Date().toISOString(), termsDays = 30 } = {}) {
  const tot = portfolioTotals(portfolio);
  const open = portfolio.filter((v) => !CLOSED_I.has(v.status));
  const avgAge = open.length ? Math.round(open.reduce((s, v) => s + daysBetweenI(v.invoiceDate || asOf, asOf), 0) / open.length) : 0;
  return {
    dpo: termsDays,                 // demo: standard payment terms
    avgOpenAgeDays: avgAge,         // how long open items have been sitting
    openInvoices: open.length,
    openValueAtRisk: tot.openValueAtRisk,
    pendingContra: tot.pendingContra, // cash locked until contra clears
    cashLocked: tot.pendingContra,
  };
}

/** #10 Margin-erosion — invoices where recognized contra trails the tier-eligible amount. */
export function marginErosion(portfolio) {
  const rows = portfolio.map((v) => {
    const eligible = v.contra.headerDiscountTotal || 0;
    const recognized = v.contra.recognizedContra || 0;
    return { invoiceNumber: v.invoiceNumber, distributorId: v.distributorId, eligible: r2i(eligible), recognized: r2i(recognized), erosion: r2i(Math.max(0, eligible - recognized)), status: v.status };
  }).filter((row) => row.erosion > 0.005)
    .sort((a, b) => b.erosion - a.erosion);
  const total = r2i(rows.reduce((s, row) => s + row.erosion, 0));
  return { rows, total };
}

/**
 * #12 Tier progress — per distributor, progress toward the next contra tier and the
 * extra rebate € unlocked by reaching it. Tiers inferred from each invoice's discountTiers.
 */
export function tierProgress(portfolio) {
  const by = {};
  portfolio.forEach((v) => {
    const tiers = v.discountTiers || [];
    if (!by[v.distributorId]) by[v.distributorId] = { distributorId: v.distributorId, model: v.model, receivedQty: 0, deliveredValue: 0, tiers };
    const b = by[v.distributorId];
    b.receivedQty += v.receivedQty || 0;
    b.deliveredValue += v.contra.deliveredValue || 0;
    if (tiers.length && !b.tiers.length) b.tiers = tiers;
  });
  return Object.values(by).map((b) => {
    const sorted = [...b.tiers].filter((t) => (t.pct || 0) > 0).sort((x, y) => (x.minQty || 0) - (y.minQty || 0));
    const qtyNow = b.receivedQty;
    let current = null; let next = null;
    for (const tier of sorted) { if (qtyNow >= (tier.minQty || 0)) current = tier; }
    next = sorted.find((tier) => (tier.minQty || 0) > qtyNow) || null;
    const curPct = current ? current.pct : 0;
    const nextPct = next ? next.pct : (current ? current.pct : 0);
    const toNext = next ? Math.max(0, (next.minQty || 0) - qtyNow) : 0;
    // approx extra rebate € from the incremental pct on the delivered value once next tier hit
    const avgUnit = qtyNow ? b.deliveredValue / qtyNow : 0;
    const extraRebate = next ? r2i((avgUnit * (next.minQty || 0)) * ((nextPct - curPct) / 100)) : 0;
    const floor = current ? (current.minQty || 0) : 0;
    const ceil = next ? (next.minQty || 0) : (floor || 1);
    const pct = next ? Math.min(100, Math.round(((qtyNow - floor) / Math.max(1, ceil - floor)) * 100)) : 100;
    return { distributorId: b.distributorId, model: b.model, receivedQty: qtyNow, currentPct: curPct, nextPct, toNextTier: toNext, extraRebate, pct };
  }).sort((a, b) => b.receivedQty - a.receivedQty);
}

/** #15 Rebate-at-risk register — every pending/at-risk contra with its blocking reason. */
export function rebateAtRisk(portfolio) {
  const reasonOf = (v) => {
    const sit = v.receivedSituation || [];
    if (sit.some((s) => s.situation === 'lost')) return 'lost';
    if ((v.timing && v.timing.straddles)) return 'splitMonth';
    if (v.missingQty > 0) return 'missingQty';
    return 'pending';
  };
  return portfolio
    .filter((v) => (v.contra.pendingCredit || 0) > 0 || (!CLOSED_I.has(v.status) && (v.contra.headerDiscountTotal || 0) - (v.contra.recognizedContra || 0) > 0.005))
    .map((v) => ({
      invoiceNumber: v.invoiceNumber, distributorId: v.distributorId,
      atRisk: r2i(Math.max(v.contra.pendingCredit || 0, (v.contra.headerDiscountTotal || 0) - (v.contra.recognizedContra || 0))),
      reason: reasonOf(v), missingQty: v.missingQty || 0, status: v.status,
    }))
    .sort((a, b) => b.atRisk - a.atRisk);
}

/**
 * #16 What-if contra simulator (pure). Given an invoice view and a hypothetical extra
 * delivered quantity, returns the new recognized contra + delta and whether it clears.
 */
export function whatIfContra(v, extraQty, invoice) {
  const tierPct = v.contra.tierPct || 0;
  const invoicedQty = v.invoicedQty || 0;
  const unit = invoicedQty ? (invoice ? invoice.totalValueStandard / invoicedQty : (v.contra.deliveredValue / Math.max(1, v.receivedQty))) : 0;
  const newReceived = Math.min(invoicedQty, (v.receivedQty || 0) + Math.max(0, extraQty));
  const newDeliveredValue = unit * newReceived;
  const newRecognized = r2i((newDeliveredValue * tierPct) / 100);
  const clears = newReceived >= invoicedQty;
  return {
    before: r2i(v.contra.recognizedContra || 0),
    after: newRecognized,
    delta: r2i(newRecognized - (v.contra.recognizedContra || 0)),
    clears, newReceived, invoicedQty,
  };
}

/** #24 Home digest — plain-language summary sentence(s). Returns a params object for i18n. */
export function homeDigest(portfolio) {
  const tot = portfolioTotals(portfolio);
  const partial = portfolio.filter((v) => v.status === 'PartiallyReceived').length;
  const transit = portfolio.filter((v) => v.status === 'InTransitPending').length;
  const over = portfolio.filter((v) => (v.receivedQty || 0) > (v.invoicedQty || 0)).length;
  const likelyLost = portfolio.filter((v) => predictLikelyLost(v)).length;
  return {
    invoices: tot.invoices, risk: tot.openValueAtRisk, recognized: tot.recognizedContra,
    pending: tot.pendingContra, partial, transit, over, likelyLost, fill: tot.fillRate,
  };
}

/** #25 Data quality — incomplete invoices, orphan receipts, notes without invoices. */
export function dataQuality({ invoices = [], goodsReceipts = [], deliveryNotes = [], creditNotes = [], incomplete = [] } = {}) {
  const invNums = new Set(invoices.map((i) => i.invoiceNumber));
  const orphanReceipts = goodsReceipts.filter((g) => g.invoiceNumber && !invNums.has(g.invoiceNumber)).length;
  const orphanNotes = deliveryNotes.filter((d) => d.invoiceNumber && !invNums.has(d.invoiceNumber)).length;
  const orphanCredits = creditNotes.filter((c) => c.invoiceRef && !invNums.has(c.invoiceRef)).length;
  const issues = [];
  if (incomplete.length) issues.push({ type: 'incomplete', count: incomplete.length });
  if (orphanReceipts) issues.push({ type: 'orphanReceipts', count: orphanReceipts });
  if (orphanNotes) issues.push({ type: 'orphanNotes', count: orphanNotes });
  if (orphanCredits) issues.push({ type: 'orphanCredits', count: orphanCredits });
  return { clean: issues.length === 0, issues, checked: invoices.length + goodsReceipts.length + deliveryNotes.length + creditNotes.length };
}
