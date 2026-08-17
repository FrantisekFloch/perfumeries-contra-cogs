// Matching engine. Joins invoice lines to goods receipts on (invoiceNumber, stockId),
// aggregates received quantity across all storages/dates (no double counting), and
// computes per-line and per-invoice fulfilment. Delivery notes (target storage codes)
// are used to note the storages a line was expected at.

import { FulfilmentStatus } from './enums.js';

export function receiptKey(invoiceNumber, stockId) { return `${invoiceNumber}|${stockId}`; }

/**
 * Aggregate goods receipts per (invoiceNumber, stockId).
 * Returns Map<key, { invoiceNumber, stockId, totalReceived, byStorage, count }>.
 */
export function aggregateReceipts(goodsReceipts) {
  const map = new Map();
  for (const g of goodsReceipts) {
    const k = receiptKey(g.invoiceNumber, g.stockId);
    if (!map.has(k)) map.set(k, { invoiceNumber: g.invoiceNumber, stockId: g.stockId, totalReceived: 0, byStorage: {}, count: 0 });
    const agg = map.get(k);
    agg.totalReceived += g.qtyReceived;
    agg.byStorage[g.storageId] = (agg.byStorage[g.storageId] || 0) + g.qtyReceived;
    agg.count += 1;
  }
  return map;
}

export function lineFulfilment(qtyInvoiced, received) {
  if (received === qtyInvoiced) return FulfilmentStatus.FULLY_DELIVERED;
  return received < qtyInvoiced ? FulfilmentStatus.SHORT : FulfilmentStatus.OVER;
}

/** Expected storages for a line, from delivery notes referencing this invoice + stock. */
function expectedStorages(deliveryNotes, invoiceNumber, stockId) {
  const set = new Set();
  for (const dn of deliveryNotes) {
    if (dn.invoiceNumber && dn.invoiceNumber !== invoiceNumber) continue;
    if (dn.lines.some((l) => l.stockId === stockId)) set.add(dn.targetStorageId);
  }
  return [...set];
}

/**
 * Match a single invoice against receipts (Map from aggregateReceipts, or raw array).
 * Optional deliveryNotes add per-line expectedStorages.
 */
export function matchInvoice(invoice, aggOrReceipts, deliveryNotes = []) {
  const agg = aggOrReceipts instanceof Map ? aggOrReceipts : aggregateReceipts(aggOrReceipts);
  const lines = invoice.lines.map((l) => {
    const a = agg.get(receiptKey(invoice.invoiceNumber, l.stockId));
    const received = a ? a.totalReceived : 0;
    return {
      stockId: l.stockId,
      qtyInvoiced: l.qtyInvoiced,
      received,
      missingQty: Math.max(0, l.qtyInvoiced - received),
      overQty: Math.max(0, received - l.qtyInvoiced),
      status: lineFulfilment(l.qtyInvoiced, received),
      byStorage: a ? { ...a.byStorage } : {},
      expectedStorages: expectedStorages(deliveryNotes, invoice.invoiceNumber, l.stockId),
    };
  });
  // "Fully matched" = no shortfall on any line (an over-delivery still counts as fulfilled).
  const fullyMatched = lines.length > 0 && lines.every((l) => l.received >= l.qtyInvoiced);
  const anyShort = lines.some((l) => l.status === FulfilmentStatus.SHORT);
  return { invoiceNumber: invoice.invoiceNumber, lines, fullyMatched, anyShort };
}

/** Match many invoices; aggregates receipts once. */
export function matchAll(invoices, goodsReceipts, deliveryNotes = []) {
  const agg = aggregateReceipts(goodsReceipts);
  return invoices.map((inv) => matchInvoice(inv, agg, deliveryNotes));
}
