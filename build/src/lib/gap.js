// Gap engine. Detects contra COGS gaps on missing units, allocates the header
// discount proportionally by line value, and values gaps under Model A vs Model B.
// Invariants: tier is derived from INVOICED qty; contra amount from RECEIVED qty
// (kept separate); allocated discount sums to the header total; Model B credit
// stays Pending until the full volume/period condition clears.

import { ContraCogsModel, CreditNoteStatus } from './enums.js';
import { createGap } from './models.js';
import { matchInvoice } from './matching.js';

/** Resolve the tier percentage for a quantity. maxQty null = open-ended top tier. */
export function resolveTier(discountTiers, qty) {
  for (const t of discountTiers) {
    const min = t.minQty ?? 0;
    const max = t.maxQty; // null = no upper bound
    if (qty >= min && (max === null || max === undefined || qty <= max)) return t.pct ?? 0;
  }
  return null;
}

export const totalInvoicedQty = (invoice) => invoice.lines.reduce((s, l) => s + l.qtyInvoiced, 0);
export const lineValue = (l) => l.unitPriceStandard * l.qtyInvoiced;
export const totalInvoicedValue = (invoice) => invoice.lines.reduce((s, l) => s + lineValue(l), 0);

/** Header discount total = totalValueStandard * tier%(from invoiced qty). */
export function headerDiscountTotal(invoice) {
  const pct = resolveTier(invoice.discountTiers, totalInvoicedQty(invoice));
  return pct == null ? 0 : (invoice.totalValueStandard * pct) / 100;
}

/**
 * Allocate the header discount to each line proportionally by line value.
 * Property 5: the sum of allocations equals the header discount total.
 */
export function allocateDiscount(invoice) {
  const total = headerDiscountTotal(invoice);
  const totVal = totalInvoicedValue(invoice) || 1;
  return invoice.lines.map((l) => {
    const lv = lineValue(l);
    return { stockId: l.stockId, lineValue: lv, allocated: total * (lv / totVal), perUnit: (total * (lv / totVal)) / (l.qtyInvoiced || 1) };
  });
}

/** Per-unit net price for a line under the active model. */
function netUnitPrice(invoice, line, alloc) {
  if (invoice.contraCogsModel === ContraCogsModel.A && line.unitPriceNet != null) return line.unitPriceNet;
  return line.unitPriceStandard - alloc.perUnit; // Model B (or A without explicit net): standard minus allocated discount
}

/**
 * Build gaps for an invoice given its match result. One gap per short line,
 * valued at the net value of the missing units.
 */
export function gapsForInvoice(invoice, matchResult) {
  const allocs = allocateDiscount(invoice);
  const gaps = [];
  matchResult.lines.forEach((ml, i) => {
    if (ml.missingQty > 0) {
      const line = invoice.lines[i];
      const alloc = allocs[i];
      const netUnit = netUnitPrice(invoice, line, alloc);
      gaps.push(createGap({
        gapId: `${invoice.invoiceNumber}:${ml.stockId}`,
        invoiceNumber: invoice.invoiceNumber,
        stockId: ml.stockId,
        missingQty: ml.missingQty,
        valueAtRisk: Number((netUnit * ml.missingQty).toFixed(2)),
      }));
    }
  });
  return gaps;
}

/**
 * Contra COGS recognition summary for an invoice.
 * - tierPct: from INVOICED qty (Property 4)
 * - headerDiscountTotal: full contra if fully delivered
 * - recognizedContra: on DELIVERED value (received capped at invoiced)
 * - Model B: creditStatus stays Pending until fully delivered (Property 10)
 */
export function computeContra(invoice, matchResult) {
  const invoicedQty = totalInvoicedQty(invoice);
  const tierPct = resolveTier(invoice.discountTiers, invoicedQty);
  const discountTotal = headerDiscountTotal(invoice);

  const deliveredValue = matchResult.lines.reduce((s, ml, i) => {
    const line = invoice.lines[i];
    const delivered = Math.min(ml.received, line.qtyInvoiced); // don't let over-delivery inflate
    return s + line.unitPriceStandard * delivered;
  }, 0);

  const recognizedContra = tierPct == null ? 0 : Number(((deliveredValue * tierPct) / 100).toFixed(2));

  const isModelB = invoice.contraCogsModel === ContraCogsModel.B;
  const creditStatus = isModelB
    ? (matchResult.fullyMatched ? CreditNoteStatus.CLEARED : CreditNoteStatus.PENDING)
    : null;
  const pendingCredit = isModelB && !matchResult.fullyMatched ? recognizedContra : 0;

  return {
    invoiceNumber: invoice.invoiceNumber,
    model: invoice.contraCogsModel,
    tierPct,
    headerDiscountTotal: Number(discountTotal.toFixed(2)),
    deliveredValue: Number(deliveredValue.toFixed(2)),
    recognizedContra,
    creditStatus,
    pendingCredit,
    fullyMatched: matchResult.fullyMatched,
  };
}

/** Convenience: match + gaps + contra for one invoice. */
export function analyzeInvoice(invoice, goodsReceipts, deliveryNotes = []) {
  const match = matchInvoice(invoice, goodsReceipts, deliveryNotes);
  return { match, gaps: gapsForInvoice(invoice, match), contra: computeContra(invoice, match) };
}
