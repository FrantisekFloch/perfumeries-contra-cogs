// Analytics / view-model layer. Turns stored documents into per-invoice views and
// role-specific selections for the Storage, Accounting, and Finance dashboards.
// Pure functions (no DOM) so they can be unit-tested.

import { analyzeInvoice } from './gap.js';
import { analyzeTiming } from './timing.js';
import { InvoiceStatus } from './enums.js';

const CLOSED = new Set([InvoiceStatus.FULLY_MATCHED, InvoiceStatus.PAID, InvoiceStatus.ARCHIVED]);

/** Build an enriched view for one invoice. */
export function buildInvoiceView(invoice, goodsReceipts, deliveryNotes = [], opts = {}) {
  const receipts = goodsReceipts.filter((g) => g.invoiceNumber === invoice.invoiceNumber);
  const { match, gaps, contra } = analyzeInvoice(invoice, receipts, deliveryNotes);
  const timing = analyzeTiming(invoice, receipts, match, opts);

  const storages = new Set();
  match.lines.forEach((l) => {
    Object.keys(l.byStorage).forEach((s) => storages.add(s));
    (l.expectedStorages || []).forEach((s) => storages.add(s));
  });

  return {
    invoiceNumber: invoice.invoiceNumber,
    distributorId: invoice.distributorId,
    model: invoice.contraCogsModel,
    status: invoice.status,
    invoicedQty: invoice.lines.reduce((s, l) => s + l.qtyInvoiced, 0),
    receivedQty: match.lines.reduce((s, l) => s + l.received, 0),
    missingQty: match.lines.reduce((s, l) => s + l.missingQty, 0),
    valueAtRisk: Number(gaps.reduce((s, g) => s + g.valueAtRisk, 0).toFixed(2)),
    storages: [...storages],
    contra,
    timing,
    gaps,
    match,
  };
}

export function buildPortfolio(invoices, goodsReceipts, deliveryNotes = [], opts = {}) {
  return invoices.map((inv) => buildInvoiceView(inv, goodsReceipts, deliveryNotes, opts));
}

// ---- role selectors -------------------------------------------------------

function touchesStorage(view, storageId) {
  return !storageId || view.storages.includes(storageId);
}

/** Storage view: on-way, pending delivery, aged pending, and a period trend. */
export function storageView(portfolio, { storageId = null } = {}) {
  const scoped = portfolio.filter((v) => touchesStorage(v, storageId));
  const onWay = scoped.filter((v) => v.status === InvoiceStatus.IN_TRANSIT_PENDING);
  const pendingDelivery = scoped.filter((v) => v.status === InvoiceStatus.PARTIALLY_RECEIVED);
  const agedPending = scoped
    .filter((v) => v.timing.ginr)
    .map((v) => ({ invoiceNumber: v.invoiceNumber, value: v.timing.ginr.value, ageDays: v.timing.ginr.ageDays }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const trend = {};
  scoped.forEach((v) => v.timing.splitDebits.forEach((d) => { trend[d.period] = (trend[d.period] || 0) + d.amount; }));
  const trendByPeriod = Object.entries(trend).sort(([a], [b]) => a.localeCompare(b)).map(([period, amount]) => ({ period, amount: Number(amount.toFixed(2)) }));

  return { storageId, onWay, pendingDelivery, agedPending, trendByPeriod, count: scoped.length };
}

/** Accounting view: closed invoices + summary of not-fully-closed and open. */
export function accountingView(portfolio) {
  const closed = portfolio.filter((v) => CLOSED.has(v.status));
  const open = portfolio.filter((v) => !CLOSED.has(v.status));
  return {
    closed,
    open,
    summary: {
      closedCount: closed.length,
      openCount: open.length,
      openValueAtRisk: Number(open.reduce((s, v) => s + v.valueAtRisk, 0).toFixed(2)),
    },
  };
}

/** Finance view: high-level portfolio summary + storages with pending issues. */
export function financeView(portfolio) {
  const byStatus = {};
  portfolio.forEach((v) => { byStatus[v.status] = (byStatus[v.status] || 0) + 1; });

  const storagesWithIssues = {};
  portfolio.forEach((v) => {
    if (v.missingQty > 0) {
      // attribute the shortfall to storages that under-delivered vs expected is complex;
      // for the summary we flag every storage the troubled invoice touches.
      v.storages.forEach((s) => {
        if (!storagesWithIssues[s]) storagesWithIssues[s] = { storageId: s, invoices: [], valueAtRisk: 0 };
        storagesWithIssues[s].invoices.push(v.invoiceNumber);
        storagesWithIssues[s].valueAtRisk += v.valueAtRisk;
      });
    }
  });

  return {
    totals: {
      invoices: portfolio.length,
      totalValueAtRisk: Number(portfolio.reduce((s, v) => s + v.valueAtRisk, 0).toFixed(2)),
      totalPendingCredit: Number(portfolio.reduce((s, v) => s + (v.contra.pendingCredit || 0), 0).toFixed(2)),
    },
    byStatus,
    storagesWithIssues: Object.values(storagesWithIssues)
      .map((s) => ({ ...s, valueAtRisk: Number(s.valueAtRisk.toFixed(2)) }))
      .sort((a, b) => b.valueAtRisk - a.valueAtRisk),
  };
}
