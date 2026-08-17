// Inventory audit sub-module (logic). Produces monthly per-invoice audit detail:
// delivered vs invoiced, contra COGS status (applied/pending/cleared), receipts by
// storage with dates, linked delivery/credit notes, provenance, and audit history.
// Exportable per month or per invoice. Pure functions (no DOM).

import { buildInvoiceView } from './analytics.js';
import { periodOf } from './timing.js';
import { ContraCogsModel, CreditNoteStatus } from './enums.js';

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

/** Full audit detail for one invoice. */
export function invoiceDetail(invoice, { goodsReceipts, deliveryNotes = [], creditNotes = [], auditLog = [] }) {
  const view = buildInvoiceView(invoice, goodsReceipts, deliveryNotes, {});
  const mine = goodsReceipts.filter((g) => g.invoiceNumber === invoice.invoiceNumber);

  const byStorage = {};
  mine.forEach((g) => {
    if (!byStorage[g.storageId]) byStorage[g.storageId] = { storageId: g.storageId, qty: 0, receipts: [] };
    byStorage[g.storageId].qty += g.qtyReceived;
    byStorage[g.storageId].receipts.push({ qty: g.qtyReceived, datetime: g.receiptDatetime, recadvRef: g.recadvRef, sourceFile: g.sourceFile });
  });

  return {
    invoiceNumber: invoice.invoiceNumber,
    distributorId: invoice.distributorId,
    model: invoice.contraCogsModel,
    status: invoice.status,
    invoicedQty: view.invoicedQty,
    receivedQty: view.receivedQty,
    missingQty: view.missingQty,
    contraStatus: contraStatus(view),
    recognizedContra: view.contra.recognizedContra,
    pendingCredit: view.contra.pendingCredit,
    receiptsByStorage: Object.values(byStorage),
    deliveryNotes: deliveryNotes
      .filter((d) => d.invoiceNumber === invoice.invoiceNumber)
      .map((d) => ({ deliveryNoteId: d.deliveryNoteId, targetStorageId: d.targetStorageId, sourceFile: d.sourceFile })),
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
