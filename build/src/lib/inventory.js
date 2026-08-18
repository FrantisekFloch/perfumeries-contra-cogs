// Inventory audit sub-module (logic). Produces monthly per-invoice audit detail:
// delivered vs invoiced, contra COGS status (applied/pending/cleared), receipts by
// storage with dates, linked delivery/credit notes, provenance, and audit history.
// Exportable per month or per invoice. Pure functions (no DOM).

import { buildInvoiceView } from './analytics.js';
import { periodOf } from './timing.js';
import { ContraCogsModel, CreditNoteStatus, DeliveryStatus } from './enums.js';

/** Contra status label for audit display. */
export function contraStatus(view) {
  if (view.model === ContraCogsModel.A) return 'Applied';
  return view.contra.creditStatus === CreditNoteStatus.CLEARED ? 'Cleared' : 'Pending';
}

/** Months an invoice is active in (invoice date + any receipt periods). */
export function invoiceMonths(invoice, goodsReceipts) {
  const months = new Set();
  const p = periodOf(invoice.invoiceDate);
  if (p) months.add(p);
  goodsReceipts
    .filter((g) => g.invoiceNumber === invoice.invoiceNumber)
    .forEach((g) => { const m = periodOf(g.receiptDatetime); if (m) months.add(m); });
  return [...months];
}

/** All months present across the portfolio (sorted). */
export function inventoryMonths(invoices, goodsReceipts) {
  const set = new Set();
  invoices.forEach((inv) => invoiceMonths(inv, goodsReceipts).forEach((m) => set.add(m)));
  return [...set].sort();
}

/**
 * Per-intended-storage received situation for one invoice, comparing the EXPECTED
 * quantity for each storage (from the delivery-note lines) against what was actually
 * RECEIVED (from goods receipts). Only the storages the invoice ships to are included.
 * Each entry carries expected/received/missing plus a chip situation:
 *   received (green, full)   · short (yellow, partial) · pending (red, nothing yet)
 *   rerouted (yellow)        · delayed (amber)         · lost (red)
 */
export function receivedSituation(invoice, { goodsReceipts, deliveryNotes = [] }) {
  const notes = deliveryNotes.filter((d) => d.invoiceNumber === invoice.invoiceNumber);
  const receipts = goodsReceipts.filter((g) => g.invoiceNumber === invoice.invoiceNumber);
  const receivedBy = {};
  receipts.forEach((g) => { receivedBy[g.storageId] = (receivedBy[g.storageId] || 0) + g.qtyReceived; });

  const rank = (s) => ({ [DeliveryStatus.LOST]: 3, [DeliveryStatus.REROUTED]: 2, [DeliveryStatus.DELAYED]: 1, [DeliveryStatus.ON_TIME]: 0 }[s] ?? 0);

  // Group by intended storage: sum expected qty from delivery-note lines; keep the
  // worst logistics flag + an ETA if any leg to this storage has one.
  const byStorage = new Map();
  for (const n of notes) {
    const cur = byStorage.get(n.targetStorageId)
      || { storageId: n.targetStorageId, expected: 0, status: DeliveryStatus.ON_TIME, expectedDate: null };
    cur.expected += (n.lines || []).reduce((s, l) => s + (l.qtyShipped || 0), 0);
    if (rank(n.deliveryStatus) > rank(cur.status)) { cur.status = n.deliveryStatus; cur.expectedDate = n.expectedDate || cur.expectedDate; }
    else if (!cur.expectedDate && n.expectedDate) cur.expectedDate = n.expectedDate;
    byStorage.set(n.targetStorageId, cur);
  }

  return [...byStorage.values()].map((s) => {
    const received = receivedBy[s.storageId] || 0;
    const missing = Math.max(0, s.expected - received);
    const over = Math.max(0, received - s.expected); // received more than planned here
    let situation;
    if (s.status === DeliveryStatus.LOST) situation = 'lost';
    else if (over > 0) situation = 'over';                                            // over-delivery → yellow (shortfall likely elsewhere)
    else if (received >= s.expected && s.expected > 0) situation = 'received';         // full → green
    else if (received > 0) situation = 'short';                                        // partial → yellow
    else if (s.status === DeliveryStatus.REROUTED) situation = 'rerouted';
    else if (s.status === DeliveryStatus.DELAYED) situation = 'delayed';
    else situation = 'pending';                                                        // nothing yet → red
    return {
      storageId: s.storageId, situation,
      expected: s.expected, received, missing, over,
      expectedDate: s.expectedDate, deliveryStatus: s.status,
    };
  }).sort((a, b) => a.storageId.localeCompare(b.storageId));
}

/** Full audit detail for one invoice. */
export function invoiceDetail(invoice, { goodsReceipts, deliveryNotes = [], creditNotes = [], auditLog = [] }) {
  const view = buildInvoiceView(invoice, goodsReceipts, deliveryNotes, {});
  const mine = goodsReceipts.filter((g) => g.invoiceNumber === invoice.invoiceNumber);

  const situation = receivedSituation(invoice, { goodsReceipts, deliveryNotes });
  const expectedByStorage = {};
  situation.forEach((s) => { expectedByStorage[s.storageId] = s.expected; });

  // Storages-by-storage view: start from every intended storage (so short/missing
  // storages appear even with zero receipts), then fold in the actual receipts.
  const byStorage = {};
  situation.forEach((s) => {
    byStorage[s.storageId] = { storageId: s.storageId, expected: s.expected, qty: 0, missing: s.missing, receipts: [] };
  });
  mine.forEach((g) => {
    if (!byStorage[g.storageId]) byStorage[g.storageId] = { storageId: g.storageId, expected: expectedByStorage[g.storageId] || 0, qty: 0, missing: 0, over: 0, receipts: [] };
    byStorage[g.storageId].qty += g.qtyReceived;
    byStorage[g.storageId].receipts.push({ qty: g.qtyReceived, datetime: g.receiptDatetime, recadvRef: g.recadvRef, sourceFile: g.sourceFile });
  });
  // Recompute missing / over per storage after folding receipts in.
  Object.values(byStorage).forEach((b) => {
    b.missing = Math.max(0, (b.expected || 0) - b.qty);
    b.over = Math.max(0, b.qty - (b.expected || 0));
  });

  // Map each intended storage to its delivery-note source file (folded into the
  // Receipts-by-storage table as FYI, so the separate Delivery-notes block is dropped).
  const dnByStorage = {};
  deliveryNotes
    .filter((d) => d.invoiceNumber === invoice.invoiceNumber)
    .forEach((d) => { (dnByStorage[d.targetStorageId] ||= []).push(d.sourceFile || d.deliveryNoteId); });
  Object.values(byStorage).forEach((b) => { b.deliverySource = (dnByStorage[b.storageId] || []).join(', '); });

  // Monthly invoicing split (from the timing engine's split debits): the value of goods
  // actually received/invoiced per calendar month. When this spans >1 month it signals
  // the Contra COGS miss — the tier volume gets split across periods (FCF impact).
  const monthlySplit = (view.timing.splitDebits || []).map((d) => ({ period: d.period, amount: d.amount }));

  return {
    invoiceNumber: invoice.invoiceNumber,
    distributorId: invoice.distributorId,
    model: invoice.contraCogsModel,
    type: invoice.type,
    proformaDate: invoice.invoiceDate,
    status: invoice.status,
    invoicedQty: view.invoicedQty,
    receivedQty: view.receivedQty,
    missingQty: view.missingQty,
    overQty: Math.max(0, view.receivedQty - view.invoicedQty),
    contraStatus: contraStatus(view),
    recognizedContra: view.contra.recognizedContra,
    pendingCredit: view.contra.pendingCredit,
    monthlySplit,
    straddles: view.timing.straddles,
    receivedSituation: situation,
    receiptsByStorage: Object.values(byStorage),
    creditNotes: creditNotes
      .filter((c) => c.invoiceRef === invoice.invoiceNumber)
      .map((c) => ({ creditNoteId: c.creditNoteId, period: c.period, amount: c.amount, status: c.status, sourceFile: c.sourceFile })),
    provenance: { invoiceSourceFile: invoice.sourceFile ?? null },
    audit: auditLog.filter((a) => a.entityId === invoice.invoiceNumber),
  };
}

/** Per-invoice detail for every invoice active in `month`. */
export function monthlyInventory(invoices, ctx, { month }) {
  return invoices
    .filter((inv) => invoiceMonths(inv, ctx.goodsReceipts).includes(month))
    .map((inv) => invoiceDetail(inv, ctx));
}

/** Export helper (JSON string) for a month or a single invoice detail. */
export function exportInventory(data) {
  return JSON.stringify(data, null, 2);
}
