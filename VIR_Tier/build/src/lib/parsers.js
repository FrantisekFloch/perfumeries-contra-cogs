// Document parsers with provenance (Req 1, 3, 11). Each parser is defensive:
// callers wrap per-file so one bad file doesn't stop the batch (see ingest).
//
// Formats (demo):
//   Agreement    -> XML  (rich, nested tiers/currencies/countries/clauses)
//   Purchase     -> CSV
//   Receipt      -> CSV  (carries optional vat_tax_point_date)
//   Leakage event-> CSV
//   Claimed CCOGS-> CSV
// Serializers exist for round-trip tests + the sample generator.

import { parseXml, child, children, childText, attr, encodeXml } from './xml.js';
import { parseCsv, serializeCsv } from './csv.js';
import {
  createAgreement, createPurchase, createReceipt, createLeakageEvent, createClaimedCcogs,
  createCcogsEngineOutput, createInvoice, createDeliveryNote,
} from './models.js';

// ---- Agreement (XML) -----------------------------------------------------
export function parseAgreementXml(text, provenance = null) {
  const root = parseXml(text);
  if (root.tag !== 'agreement') throw new Error(`parseAgreementXml: root must be <agreement>, got <${root.tag}>`);

  const tiersNode = child(root, 'tiers');
  const tiers = tiersNode
    ? children(tiersNode, 'tier').map((t) => ({ threshold: Number(attr(t, 'threshold')), rate: Number(attr(t, 'rate')) }))
    : [];

  const currenciesNode = child(root, 'currencies');
  const currencies = currenciesNode ? children(currenciesNode, 'currency').map((c) => c.text) : [];

  const countriesNode = child(root, 'countries');
  const countries = countriesNode ? children(countriesNode, 'country').map((c) => c.text) : [];

  const clausesNode = child(root, 'clauses');
  const clauseRefs = {};
  if (clausesNode) for (const c of children(clausesNode, 'clause')) clauseRefs[attr(c, 'key')] = c.text;

  const skuSetNode = child(root, 'skuSet');
  const skuSet = skuSetNode ? children(skuSetNode, 'sku').map((s) => s.text) : [];
  const engNode = child(root, 'engineConfiguredSkus');
  const engineConfiguredSkus = engNode ? children(engNode, 'sku').map((s) => s.text) : skuSet.slice();

  return createAgreement({
    agreementId: childText(root, 'agreementId'),
    supplierId: childText(root, 'supplierId'),
    supplierName: childText(root, 'supplierName'),
    contractRef: childText(root, 'contractRef') || null,
    rebateStructure: childText(root, 'rebateStructure') || null,
    basis: childText(root, 'basis') || null,
    period: childText(root, 'period') || null,
    scope: childText(root, 'scope') || null,
    retrospectiveReach: childText(root, 'retrospectiveReach') || null,
    tierMeasure: childText(root, 'tierMeasure') || null,
    windowType: childText(root, 'windowType') || null,
    tiers, currencies, countries, clauseRefs, skuSet, engineConfiguredSkus,
    effectiveFrom: childText(root, 'effectiveFrom') || null,
    effectiveTo: childText(root, 'effectiveTo') || null,
    signatory: childText(root, 'signatory') || null,
    signatoryTitle: childText(root, 'signatoryTitle') || null,
    signedDate: childText(root, 'signedDate') || null,
    governingLaw: childText(root, 'governingLaw') || null,
    provenance,
  });
}

export function serializeAgreementXml(a) {
  const tiers = a.tiers.map((t) => `    <tier threshold="${t.threshold}" rate="${t.rate}"/>`).join('\n');
  const currencies = a.currencies.map((c) => `    <currency>${c}</currency>`).join('\n');
  const countries = a.countries.map((c) => `    <country>${c}</country>`).join('\n');
  const clauses = Object.entries(a.clauseRefs || {}).map(([k, v]) => `    <clause key="${encodeXml(k)}">${encodeXml(v)}</clause>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<agreement>
  <agreementId>${encodeXml(a.agreementId)}</agreementId>
  <supplierId>${encodeXml(a.supplierId)}</supplierId>
  <supplierName>${encodeXml(a.supplierName ?? '')}</supplierName>
  <rebateStructure>${a.rebateStructure ?? ''}</rebateStructure>
  <basis>${a.basis ?? ''}</basis>
  <period>${a.period ?? ''}</period>
  <scope>${a.scope ?? ''}</scope>
  <retrospectiveReach>${a.retrospectiveReach ?? ''}</retrospectiveReach>
  <tierMeasure>${a.tierMeasure ?? ''}</tierMeasure>
  <windowType>${a.windowType ?? ''}</windowType>
  <contractRef>${encodeXml(a.contractRef ?? '')}</contractRef>
  <effectiveFrom>${a.effectiveFrom ?? ''}</effectiveFrom>
  <effectiveTo>${a.effectiveTo ?? ''}</effectiveTo>
  <signatory>${encodeXml(a.signatory ?? '')}</signatory>
  <signatoryTitle>${encodeXml(a.signatoryTitle ?? '')}</signatoryTitle>
  <signedDate>${a.signedDate ?? ''}</signedDate>
  <governingLaw>${encodeXml(a.governingLaw ?? '')}</governingLaw>
  <tiers>
${tiers}
  </tiers>
  <skuSet>
${(a.skuSet || []).map((s) => `    <sku>${encodeXml(s)}</sku>`).join('\n')}
  </skuSet>
  <engineConfiguredSkus>
${(a.engineConfiguredSkus || []).map((s) => `    <sku>${encodeXml(s)}</sku>`).join('\n')}
  </engineConfiguredSkus>
  <currencies>
${currencies}
  </currencies>
  <countries>
${countries}
  </countries>
  <clauses>
${clauses}
  </clauses>
</agreement>
`;
}

// ---- Agreement (CSV) — bulk import alternative to XML --------------------
// One row per agreement. Multi-value fields are pipe-joined; tiers are encoded
// as "threshold:rate;threshold:rate"; clauses as "key=value;key=value".
// This lets a spreadsheet-driven team load hundreds of agreements at once.
const AGREEMENT_CSV_HEADERS = [
  'agreementId', 'supplierId', 'supplierName', 'contractRef', 'rebateStructure', 'basis', 'period', 'scope',
  'retrospectiveReach', 'tierMeasure', 'windowType', 'effectiveFrom', 'effectiveTo',
  'signatory', 'signatoryTitle', 'signedDate', 'governingLaw',
  'tiers', 'currencies', 'countries', 'skuSet', 'engineConfiguredSkus', 'clauses',
];
const splitList = (v) => (v ? String(v).split('|').map((s) => s.trim()).filter(Boolean) : []);
const parseTiersCell = (v) => (v ? String(v).split(';').map((s) => s.trim()).filter(Boolean).map((pair) => {
  const [th, rate] = pair.split(':');
  return { threshold: Number(th), rate: Number(rate) };
}) : []);
const parseClausesCell = (v) => {
  const out = {};
  if (v) for (const pair of String(v).split(';')) { const [k, val] = pair.split('='); if (k) out[k.trim()] = (val ?? '').trim(); }
  return out;
};
export function parseAgreementCsv(text, provenance = null) {
  const { rows } = parseCsv(text);
  return rows.map((r) => {
    const skuSet = splitList(r.skuSet);
    return createAgreement({
      agreementId: r.agreementId,
      supplierId: r.supplierId,
      supplierName: r.supplierName || null,
      contractRef: r.contractRef || null,
      rebateStructure: r.rebateStructure || null,
      basis: r.basis || null,
      period: r.period || null,
      scope: r.scope || null,
      retrospectiveReach: r.retrospectiveReach || null,
      tierMeasure: r.tierMeasure || null,
      windowType: r.windowType || null,
      effectiveFrom: r.effectiveFrom || null,
      effectiveTo: r.effectiveTo || null,
      signatory: r.signatory || null,
      signatoryTitle: r.signatoryTitle || null,
      signedDate: r.signedDate || null,
      governingLaw: r.governingLaw || null,
      tiers: parseTiersCell(r.tiers),
      currencies: splitList(r.currencies),
      countries: splitList(r.countries),
      skuSet,
      engineConfiguredSkus: r.engineConfiguredSkus ? splitList(r.engineConfiguredSkus) : skuSet.slice(),
      clauseRefs: parseClausesCell(r.clauses),
      provenance,
    });
  });
}
export function serializeAgreementCsv(agreements) {
  return serializeCsv(AGREEMENT_CSV_HEADERS, agreements.map((a) => ({
    agreementId: a.agreementId, supplierId: a.supplierId, supplierName: a.supplierName ?? '',
    contractRef: a.contractRef ?? '', rebateStructure: a.rebateStructure ?? '', basis: a.basis ?? '',
    period: a.period ?? '', scope: a.scope ?? '', retrospectiveReach: a.retrospectiveReach ?? '',
    tierMeasure: a.tierMeasure ?? '', windowType: a.windowType ?? '',
    effectiveFrom: a.effectiveFrom ?? '', effectiveTo: a.effectiveTo ?? '',
    signatory: a.signatory ?? '', signatoryTitle: a.signatoryTitle ?? '', signedDate: a.signedDate ?? '', governingLaw: a.governingLaw ?? '',
    tiers: (a.tiers || []).map((t) => `${t.threshold}:${t.rate}`).join(';'),
    currencies: (a.currencies || []).join('|'),
    countries: (a.countries || []).join('|'),
    skuSet: (a.skuSet || []).join('|'),
    engineConfiguredSkus: (a.engineConfiguredSkus || []).join('|'),
    clauses: Object.entries(a.clauseRefs || {}).map(([k, v]) => `${k}=${v}`).join(';'),
  })));
}

// ---- Purchase (CSV) ------------------------------------------------------
const PURCHASE_HEADERS = ['purchaseId', 'agreementId', 'supplierId', 'country', 'stockId', 'orderDate', 'qty', 'unitValue', 'weightPerUnit', 'currency'];
export function parsePurchaseCsv(text, provenance = null) {
  const { rows } = parseCsv(text);
  return rows.map((r) => createPurchase({ ...r, provenance }));
}
export function serializePurchaseCsv(purchases) {
  return serializeCsv(PURCHASE_HEADERS, purchases.map((p) => ({
    ...p, unitValue: p.unitValue ?? '', weightPerUnit: p.weightPerUnit ?? '', currency: p.currency ?? '',
  })));
}

// ---- Receipt (CSV) -------------------------------------------------------
const RECEIPT_HEADERS = ['receiptId', 'grnNumber', 'poRef', 'invoiceRef', 'deliveryNoteRef', 'purchaseId', 'agreementId', 'country', 'storageId', 'warehouseKind', 'reachedStep', 'scannedAtMain', 'stockId', 'qtyOrdered', 'qtyReceived', 'qtyAccepted', 'qtyRejected', 'condition', 'inspectedBy', 'orderDate', 'receiptDate', 'vatTaxPointDate'];
export function parseReceiptCsv(text, provenance = null) {
  const { rows } = parseCsv(text);
  return rows.map((r) => createReceipt({ ...r, vatTaxPointDate: r.vatTaxPointDate || null, provenance }));
}
export function serializeReceiptCsv(receipts) {
  const s = (v) => (v == null ? '' : v);
  return serializeCsv(RECEIPT_HEADERS, receipts.map((r) => ({
    ...r, grnNumber: s(r.grnNumber), poRef: s(r.poRef), invoiceRef: s(r.invoiceRef), deliveryNoteRef: s(r.deliveryNoteRef),
    purchaseId: s(r.purchaseId), storageId: s(r.storageId), warehouseKind: s(r.warehouseKind), reachedStep: s(r.reachedStep),
    scannedAtMain: r.scannedAtMain === false ? 'false' : 'true',
    qtyOrdered: s(r.qtyOrdered), qtyAccepted: s(r.qtyAccepted),
    qtyRejected: s(r.qtyRejected), condition: s(r.condition), inspectedBy: s(r.inspectedBy),
    orderDate: s(r.orderDate), vatTaxPointDate: s(r.vatTaxPointDate),
  })));
}

// ---- Leakage event (CSV) -------------------------------------------------
const EVENT_HEADERS = ['eventId', 'type', 'agreementId', 'supplierId', 'country', 'stockId', 'qty', 'refIds', 'eventDate', 'intendedDate', 'reason'];
export function parseEventCsv(text, provenance = null) {
  const { rows } = parseCsv(text);
  return rows.map((r) => createLeakageEvent({ ...r, provenance }));
}
export function serializeEventCsv(events) {
  return serializeCsv(EVENT_HEADERS, events.map((e) => ({
    ...e, supplierId: e.supplierId ?? '', stockId: e.stockId ?? '',
    refIds: Array.isArray(e.refIds) ? e.refIds.join('|') : (e.refIds ?? ''),
    eventDate: e.eventDate ?? '', intendedDate: e.intendedDate ?? '', reason: e.reason ?? '',
  })));
}

// ---- Claimed CCOGS (CSV) -------------------------------------------------
const CLAIMED_HEADERS = ['claimId', 'agreementId', 'supplierId', 'scopeKey', 'period', 'basis', 'amountClaimed', 'currency'];
export function parseClaimedCsv(text, provenance = null) {
  const { rows } = parseCsv(text);
  return rows.map((r) => createClaimedCcogs({ ...r, provenance }));
}
export function serializeClaimedCsv(claims) {
  return serializeCsv(CLAIMED_HEADERS, claims.map((c) => ({
    ...c, supplierId: c.supplierId ?? '', basis: c.basis ?? '',
  })));
}

// ---- Invoice (XML) — reuses the old tool's proven shape ------------------
export function parseInvoiceXml(text, provenance = null) {
  const root = parseXml(text);
  if (root.tag !== 'invoice') throw new Error(`parseInvoiceXml: root must be <invoice>, got <${root.tag}>`);
  const header = child(root, 'header') || root;
  const distributor = child(header, 'distributor');
  const discount = child(header, 'discount');
  const tiers = discount ? children(discount, 'tier').map((t) => ({ minQty: attr(t, 'minQty'), maxQty: attr(t, 'maxQty'), pct: attr(t, 'pct') })) : [];
  const linesNode = child(root, 'lines');
  const lines = linesNode ? children(linesNode, 'line').map((l) => ({
    stockId: childText(l, 'stockId'), description: childText(l, 'description'),
    qtyInvoiced: childText(l, 'qtyInvoiced'), unitPrice: childText(l, 'unitPriceStandard') || childText(l, 'unitPrice'),
    targetStorage: childText(l, 'targetStorage'),
  })) : [];
  return createInvoice({
    invoiceNumber: childText(header, 'invoiceNumber'),
    type: childText(header, 'type') || 'final',
    agreementId: childText(header, 'agreementId') || null,
    supplierId: distributor ? attr(distributor, 'id') : null,
    supplierName: distributor ? attr(distributor, 'name') : null,
    country: childText(header, 'country') || null,
    poReference: childText(header, 'poReference') || null,
    invoiceDate: childText(header, 'invoiceDate') || null,
    shipDate: childText(header, 'shipDate') || null,
    incoterms: childText(header, 'incoterms') || null,
    currency: childText(header, 'currency') || null,
    discountTiers: tiers,
    totalValue: childText(header, 'totalValueStandard') || childText(header, 'totalValue') || null,
    lines, provenance,
  });
}
export function serializeInvoiceXml(inv) {
  const tiers = inv.discountTiers.map((t) => `      <tier minQty="${t.minQty}" maxQty="${t.maxQty ?? ''}" pct="${t.pct}"/>`).join('\n');
  const lines = inv.lines.map((l) => `    <line>
      <stockId>${encodeXml(l.stockId)}</stockId>
      <description>${encodeXml(l.description ?? '')}</description>
      <qtyInvoiced>${l.qtyInvoiced}</qtyInvoiced>
      <unitPriceStandard>${l.unitPrice ?? ''}</unitPriceStandard>
      <targetStorage>${encodeXml(l.targetStorage ?? '')}</targetStorage>
    </line>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<invoice>
  <header>
    <invoiceNumber>${encodeXml(inv.invoiceNumber)}</invoiceNumber>
    <type>${inv.type}</type>
    <agreementId>${encodeXml(inv.agreementId ?? '')}</agreementId>
    <distributor id="${encodeXml(inv.supplierId ?? '')}" name="${encodeXml(inv.supplierName ?? '')}"/>
    <country>${inv.country ?? ''}</country>
    <poReference>${encodeXml(inv.poReference ?? '')}</poReference>
    <invoiceDate>${inv.invoiceDate ?? ''}</invoiceDate>
    <shipDate>${inv.shipDate ?? ''}</shipDate>
    <incoterms>${inv.incoterms ?? ''}</incoterms>
    <currency>${inv.currency ?? ''}</currency>
    <discount basis="total_volume">
${tiers}
    </discount>
    <totalValueStandard>${inv.totalValue ?? ''}</totalValueStandard>
  </header>
  <lines>
${lines}
  </lines>
</invoice>
`;
}

// ---- Delivery Note (XML) -------------------------------------------------
export function parseDeliveryNoteXml(text, provenance = null) {
  const root = parseXml(text);
  if (root.tag !== 'deliveryNote') throw new Error(`parseDeliveryNoteXml: root must be <deliveryNote>, got <${root.tag}>`);
  const linesNode = child(root, 'lines');
  const lines = linesNode ? children(linesNode, 'line').map((l) => ({ stockId: childText(l, 'stockId'), qtyShipped: childText(l, 'qtyShipped'), targetStorage: childText(l, 'targetStorage') || null, invoiceRef: childText(l, 'invoiceRef') || null })) : [];
  return createDeliveryNote({
    deliveryNoteId: childText(root, 'deliveryNoteId'),
    invoiceNumber: childText(root, 'invoiceNumber') || null,
    invoiceRefs: (childText(root, 'invoiceRefs') || '').split('|').filter(Boolean),
    agreementId: childText(root, 'agreementId') || null,
    targetStorageId: childText(root, 'targetStorageId'),
    country: childText(root, 'country') || null,
    shipDate: childText(root, 'shipDate') || null,
    deliveryStatus: childText(root, 'deliveryStatus') || null,
    expectedDate: childText(root, 'expectedDate') || null,
    lines, provenance,
  });
}
export function serializeDeliveryNoteXml(dn) {
  const lines = dn.lines.map((l) => `    <line><stockId>${encodeXml(l.stockId)}</stockId><qtyShipped>${l.qtyShipped}</qtyShipped><targetStorage>${encodeXml(l.targetStorage ?? '')}</targetStorage><invoiceRef>${encodeXml(l.invoiceRef ?? '')}</invoiceRef></line>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<deliveryNote>
  <deliveryNoteId>${encodeXml(dn.deliveryNoteId)}</deliveryNoteId>
  <invoiceNumber>${encodeXml(dn.invoiceNumber ?? '')}</invoiceNumber>
  <invoiceRefs>${encodeXml((dn.invoiceRefs || []).join('|'))}</invoiceRefs>
  <agreementId>${encodeXml(dn.agreementId ?? '')}</agreementId>
  <targetStorageId>${encodeXml(dn.targetStorageId)}</targetStorageId>
  <country>${dn.country ?? ''}</country>
  <shipDate>${dn.shipDate ?? ''}</shipDate>
  <deliveryStatus>${dn.deliveryStatus ?? ''}</deliveryStatus>
  <expectedDate>${dn.expectedDate ?? ''}</expectedDate>
  <lines>
${lines}
  </lines>
</deliveryNote>
`;
}

// ---- CCOGS Engine output (CSV) — the "before" ----------------------------
const ENGINE_HEADERS = ['outputId', 'agreementId', 'supplierId', 'scopeKey', 'period', 'basis', 'engineVolume', 'tierApplied', 'amountClaimed', 'currency', 'documentType', 'invoiceRefs', 'deliveryNoteRefs', 'receiptRefs', 'calcNote'];
export function parseCcogsEngineCsv(text, provenance = null) {
  const { rows } = parseCsv(text);
  return rows.map((r) => createCcogsEngineOutput({ ...r, provenance }));
}
export function serializeCcogsEngineCsv(rows) {
  const join = (v) => (Array.isArray(v) ? v.join('|') : (v ?? ''));
  return serializeCsv(ENGINE_HEADERS, rows.map((r) => ({
    ...r, supplierId: r.supplierId ?? '', basis: r.basis ?? '',
    engineVolume: r.engineVolume ?? '', tierApplied: r.tierApplied ?? '', documentType: r.documentType ?? 'CCOGS_INVOICE',
    invoiceRefs: join(r.invoiceRefs), deliveryNoteRefs: join(r.deliveryNoteRefs), receiptRefs: join(r.receiptRefs),
    calcNote: r.calcNote ?? '',
  })));
}

// ---- category dispatch (used by ingest) ----------------------------------
export const PARSERS = Object.freeze({
  // agreements accept BOTH XML (rich) and CSV (bulk spreadsheet); ingest picks by extension.
  agreements: { kind: 'xml', parse: parseAgreementXml, parseCsv: parseAgreementCsv },
  invoices: { kind: 'xml', parse: parseInvoiceXml },
  delivery_notes: { kind: 'xml', parse: parseDeliveryNoteXml },
  purchases: { kind: 'csv', parse: parsePurchaseCsv },
  receipts: { kind: 'csv', parse: parseReceiptCsv },
  events: { kind: 'csv', parse: parseEventCsv },
  claimed: { kind: 'csv', parse: parseClaimedCsv },
  ccogs_engine: { kind: 'csv', parse: parseCcogsEngineCsv },
});
