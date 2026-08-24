// Consolidation_Engine (Req 1). Ingests parsed records, tags each with country,
// groups per supplier/agreement across all countries, retains provenance, and
// surfaces incomplete-agreement flags. Pure: takes already-parsed records.

import { isAgreementComplete } from './models.js';

/**
 * @param {object} data { agreements[], purchases[], receipts[], events[], claimed[] }
 * @returns {object} {
 *   bySupplier: Map(supplierId -> { supplierId, supplierName, agreements[] }),
 *   byAgreement: Map(agreementId -> { agreement, purchases[], receipts[], events[], claimed[], countries:Set }),
 *   incompleteAgreements: [{ agreementId, missing[] }],
 *   errors: []  // reserved; parse errors are collected upstream in ingest
 * }
 */
export function consolidate({ agreements = [], invoices = [], delivery_notes = [], purchases = [], receipts = [], events = [], claimed = [], ccogs_engine = [] }) {
  const byAgreement = new Map();

  for (const a of agreements) {
    byAgreement.set(a.agreementId, {
      agreement: a, invoices: [], deliveryNotes: [], purchases: [], receipts: [], events: [], claimed: [], ccogsEngine: [], countries: new Set(),
    });
  }

  const attach = (list, coll) => {
    for (const rec of list) {
      const g = byAgreement.get(rec.agreementId);
      if (!g) continue; // orphan record without an agreement; kept out (could be surfaced)
      g[coll].push(rec);
      if (rec.country) g.countries.add(rec.country);
    }
  };
  attach(invoices, 'invoices');
  attach(delivery_notes, 'deliveryNotes');
  attach(purchases, 'purchases');
  attach(receipts, 'receipts');
  attach(events, 'events');
  attach(claimed, 'claimed');
  attach(ccogs_engine, 'ccogsEngine');

  const bySupplier = new Map();
  for (const g of byAgreement.values()) {
    const sid = g.agreement.supplierId;
    if (!bySupplier.has(sid)) bySupplier.set(sid, { supplierId: sid, supplierName: g.agreement.supplierName, agreements: [] });
    bySupplier.get(sid).agreements.push(g.agreement.agreementId);
  }

  const incompleteAgreements = agreements
    .filter((a) => !isAgreementComplete(a))
    .map((a) => ({ agreementId: a.agreementId, missing: a.incompleteFields }));

  // ---- missing-invoice discrepancy surfacing ----------------------------------
  // Goods were received (delivery note + GRN) but the supplier invoice never
  // arrived, or was rejected by ERP as corrupt/incomplete — so the CCOGS engine
  // produced nothing. We detect this two ways and annotate each group:
  //   (a) an explicit MISSING_INVOICE leakage event on the agreement, or
  //   (b) receipts whose invoiceRef points at no ingested invoice (orphan receipts).
  // The result feeds the ML "manual check" finding and the loading-screen tile.
  const missingInvoices = [];
  for (const g of byAgreement.values()) {
    const invoiceNumbers = new Set(g.invoices.map((inv) => inv.invoiceNumber).filter(Boolean));
    const orphanReceipts = g.receipts.filter((r) => {
      const ref = r.invoiceRef;
      // A receipt is "uncovered" when it names no invoice OR names one we never ingested.
      return !ref || !invoiceNumbers.has(ref);
    });
    const missingEvents = g.events.filter((e) => e.type === 'MISSING_INVOICE');
    g.hasMissingInvoice = missingEvents.length > 0 || orphanReceipts.length > 0;
    g.missingInvoiceEvents = missingEvents;
    g.orphanReceipts = orphanReceipts;
    if (g.hasMissingInvoice) {
      const units = missingEvents.length
        ? missingEvents.reduce((s, e) => s + (e.qty || 0), 0)
        : orphanReceipts.reduce((s, r) => s + (r.qtyReceived || 0), 0);
      missingInvoices.push({
        agreementId: g.agreement.agreementId,
        supplierId: g.agreement.supplierId,
        supplierName: g.agreement.supplierName,
        reason: missingEvents[0]?.reason || null,   // 'NEVER_ARRIVED' | 'ERP_REJECTED' | null
        eventCount: missingEvents.length,
        orphanReceiptCount: orphanReceipts.length,
        units,
        receiptRefs: orphanReceipts.map((r) => r.receiptId),
      });
    }
  }

  return { bySupplier, byAgreement, incompleteAgreements, missingInvoices, errors: [] };
}

/** Convenience: pull one agreement's consolidated group. */
export function groupFor(consolidated, agreementId) {
  return consolidated.byAgreement.get(agreementId) ?? null;
}
