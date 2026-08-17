// Timing engine. Assigns receipts to calendar-month periods, detects invoices whose
// receipts straddle a period boundary, produces split debits per period, and carries
// unreceived value as a GINR accrual flagged "value missing — locate". The full
// liability is always retained (never netted down). FOB shipping point puts
// in-transit loss risk on the receiver.

import { createGinrAccrual, createSplitDebit } from './models.js';
import { netUnitPrices, netPayable } from './gap.js';
import { matchInvoice } from './matching.js';

/** Calendar-month period 'YYYY-MM' from a datetime string. */
export function periodOf(datetime) {
  const m = String(datetime).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Distinct periods present in a set of receipts (sorted). */
export function periodsOf(goodsReceipts) {
  return [...new Set(goodsReceipts.map((g) => periodOf(g.receiptDatetime)).filter(Boolean))].sort();
}

/** True if the receipts span more than one calendar month. */
export function straddles(goodsReceipts) {
  return periodsOf(goodsReceipts).length > 1;
}

/**
 * One split debit per period: net value of units received in that period.
 * Uses net unit prices (contra COGS already applied) per the invoice's model.
 */
export function splitDebits(invoice, goodsReceipts) {
  const net = netUnitPrices(invoice);
  const byPeriod = new Map();
  for (const g of goodsReceipts) {
    if (g.invoiceNumber !== invoice.invoiceNumber) continue;
    const p = periodOf(g.receiptDatetime);
    if (!byPeriod.has(p)) byPeriod.set(p, { amount: 0, date: g.receiptDatetime });
    const bucket = byPeriod.get(p);
    bucket.amount += (net[g.stockId] ?? g.qtyReceived * 0) * g.qtyReceived;
    if (g.receiptDatetime > bucket.date) bucket.date = g.receiptDatetime;
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, b]) => createSplitDebit({
      invoiceNumber: invoice.invoiceNumber,
      period,
      amount: Number(b.amount.toFixed(2)),
      date: b.date,
    }));
}

/** Days between two dates (whole days, >= 0). */
function daysBetween(fromDate, toDate) {
  const a = new Date(fromDate).getTime();
  const b = new Date(toDate).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * GINR accrual for unreceived value at period close. Returns null if fully matched.
 * Value = net value of missing units. Flagged "value missing — locate" with age + owner.
 */
export function ginrAccrual(invoice, matchResult, { period, owner = null, asOf = new Date().toISOString() } = {}) {
  if (matchResult.fullyMatched) return null;
  const net = netUnitPrices(invoice);
  let value = 0;
  matchResult.lines.forEach((ml) => { value += (net[ml.stockId] ?? 0) * ml.missingQty; });
  if (value <= 0) return null;
  const closePeriod = period || periodOf(asOf) || periodOf(invoice.invoiceDate) || '';
  return createGinrAccrual({
    invoiceNumber: invoice.invoiceNumber,
    period: closePeriod,
    value: Number(value.toFixed(2)),
    ageDays: daysBetween(invoice.invoiceDate || invoice.shipDate || asOf, asOf),
    owner,
  });
}

/** Who bears in-transit loss for unreceived value. */
export function inTransitRisk(invoice) {
  const terms = String(invoice.incoterms || '').toUpperCase();
  return terms.includes('SHIPPING_POINT') || terms.includes('EX_WORKS') ? 'receiver' : 'supplier';
}

/** Bundle the timing view for one invoice. */
export function analyzeTiming(invoice, goodsReceipts, matchResult, opts = {}) {
  const mine = goodsReceipts.filter((g) => g.invoiceNumber === invoice.invoiceNumber);
  const match = matchResult || matchInvoice(invoice, mine);
  return {
    invoiceNumber: invoice.invoiceNumber,
    periods: periodsOf(mine),
    straddles: straddles(mine),
    splitDebits: splitDebits(invoice, mine),
    ginr: ginrAccrual(invoice, match, opts),
    inTransitRisk: inTransitRisk(invoice),
    netPayableRetained: netPayable(invoice), // full liability retained regardless of receipts
  };
}
