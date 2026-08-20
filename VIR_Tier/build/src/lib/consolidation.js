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

  return { bySupplier, byAgreement, incompleteAgreements, errors: [] };
}

/** Convenience: pull one agreement's consolidated group. */
export function groupFor(consolidated, agreementId) {
  return consolidated.byAgreement.get(agreementId) ?? null;
}
