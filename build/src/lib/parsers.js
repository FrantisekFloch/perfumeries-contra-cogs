// Document parsers + serializers for the four ingested types.
// Parse: source string -> domain model (with provenance). Serialize: model -> source string.
// The parse/serialize pair upholds the round-trip property (see tests).

import { parseXml, child, children, childText, attr, encodeXml } from './xml.js';
import { parseCsv, serializeCsv } from './csv.js';
import {
  createInvoice, createDeliveryNote, createGoodsReceipt, createCreditNote,
} from './models.js';

const toNum = (s) => {
  if (s === undefined || s === null || String(s).trim() === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

// ---- Invoice (XML) --------------------------------------------------------
// Returns { invoice, incomplete, missing, sourceFile }.
// Missing required data-driven config (model / tiers) is FLAGGED, not thrown (Req 2.6).
export function parseInvoiceXml(xmlStr, sourceFile = null) {
  const root = parseXml(xmlStr);
  if (root.tag !== 'invoice') throw new Error(`Invoice parse error: root <${root.tag}> is not <invoice>`);
  const header = child(root, 'header');
  if (!header) throw new Error('Invoice parse error: missing <header>');

  const distributor = child(header, 'distributor');
  const discount = child(header, 'discount');
  const discountTiers = discount
    ? children(discount, 'tier').map((t) => ({
        minQty: toNum(attr(t, 'minQty')),
        maxQty: toNum(attr(t, 'maxQty')), // '' -> null (open-ended top tier)
        pct: toNum(attr(t, 'pct')),
      }))
    : [];

  const model = childText(header, 'contraCogsModel') || null;

  const linesNode = child(root, 'lines');
  const lines = (linesNode ? children(linesNode, 'line') : []).map((l) => {
    const net = childText(l, 'unitPriceNet');
    const target = childText(l, 'targetStorage');
    return {
      stockId: childText(l, 'stockId'),
      description: childText(l, 'description'),
      qtyInvoiced: toNum(childText(l, 'qtyInvoiced')),
      unitPriceStandard: toNum(childText(l, 'unitPriceStandard')),
      unitPriceNet: net === '' ? undefined : toNum(net),
      targetStorage: target === '' ? null : target,
    };
  });

  const missing = [];
  if (!model) missing.push('contraCogsModel');
  if (discountTiers.length === 0) missing.push('discountTiers');

  const draft = {
    invoiceNumber: childText(header, 'invoiceNumber'),
    type: childText(header, 'type') || 'final',
    distributorId: attr(distributor, 'id'),
    contraCogsModel: model,
    poReference: childText(header, 'poReference') || null,
    invoiceDate: childText(header, 'invoiceDate') || null,
    shipDate: childText(header, 'shipDate') || null,
    incoterms: childText(header, 'incoterms') || null,
    currency: childText(header, 'currency') || null,
    discountTiers,
    totalValueStandard: toNum(childText(header, 'totalValueStandard')),
    sourceFile,
    lines,
  };

  // Build the model only when the required model field is present; otherwise flag incomplete.
  let invoice = null;
  if (model) invoice = createInvoice(draft);
  return { invoice, incomplete: missing.length > 0, missing, sourceFile, raw: draft };
}

export function serializeInvoiceXml(inv) {
  const tiers = inv.discountTiers
    .map((t) => `      <tier minQty="${t.minQty ?? ''}" maxQty="${t.maxQty ?? ''}" pct="${t.pct ?? ''}"/>`)
    .join('\n');
  const lines = inv.lines
    .map((l) => `    <line>
      <stockId>${encodeXml(l.stockId)}</stockId>
      <description>${encodeXml(l.description ?? '')}</description>
      <qtyInvoiced>${l.qtyInvoiced}</qtyInvoiced>
      <unitPriceStandard>${l.unitPriceStandard}</unitPriceStandard>
      <unitPriceNet>${l.unitPriceNet ?? ''}</unitPriceNet>
      <targetStorage>${encodeXml(l.targetStorage ?? '')}</targetStorage>
    </line>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<invoice>
  <header>
    <invoiceNumber>${encodeXml(inv.invoiceNumber)}</invoiceNumber>
    <type>${encodeXml(inv.type)}</type>
    <distributor id="${encodeXml(inv.distributorId)}"/>
    <contraCogsModel>${encodeXml(inv.contraCogsModel)}</contraCogsModel>
    <poReference>${encodeXml(inv.poReference ?? '')}</poReference>
    <invoiceDate>${encodeXml(inv.invoiceDate ?? '')}</invoiceDate>
    <shipDate>${encodeXml(inv.shipDate ?? '')}</shipDate>
    <incoterms>${encodeXml(inv.incoterms ?? '')}</incoterms>
    <currency>${encodeXml(inv.currency ?? '')}</currency>
    <discount basis="total_volume">
${tiers}
    </discount>
    <totalValueStandard>${inv.totalValueStandard}</totalValueStandard>
  </header>
  <lines>
${lines}
  </lines>
</invoice>
`;
}

// ---- Delivery Note (XML) --------------------------------------------------
export function parseDeliveryNoteXml(xmlStr, sourceFile = null) {
  const root = parseXml(xmlStr);
  if (root.tag !== 'deliveryNote') throw new Error(`DeliveryNote parse error: root <${root.tag}> is not <deliveryNote>`);
  const linesNode = child(root, 'lines');
  const lines = (linesNode ? children(linesNode, 'line') : []).map((l) => ({
    stockId: childText(l, 'stockId'),
    qtyShipped: toNum(childText(l, 'qtyShipped')),
  }));
  return createDeliveryNote({
    deliveryNoteId: childText(root, 'deliveryNoteId'),
    invoiceNumber: childText(root, 'invoiceNumber') || null,
    targetStorageId: childText(root, 'targetStorageId'),
    shipDate: childText(root, 'shipDate') || null,
    deliveryStatus: childText(root, 'deliveryStatus') || undefined,
    expectedDate: childText(root, 'expectedDate') || null,
    sourceFile,
    lines,
  });
}

export function serializeDeliveryNoteXml(dn) {
  const lines = dn.lines
    .map((l) => `    <line><stockId>${encodeXml(l.stockId)}</stockId><qtyShipped>${l.qtyShipped}</qtyShipped></line>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<deliveryNote>
  <deliveryNoteId>${encodeXml(dn.deliveryNoteId)}</deliveryNoteId>
  <invoiceNumber>${encodeXml(dn.invoiceNumber ?? '')}</invoiceNumber>
  <targetStorageId>${encodeXml(dn.targetStorageId)}</targetStorageId>
  <shipDate>${encodeXml(dn.shipDate ?? '')}</shipDate>
  <deliveryStatus>${encodeXml(dn.deliveryStatus ?? '')}</deliveryStatus>
  <expectedDate>${encodeXml(dn.expectedDate ?? '')}</expectedDate>
  <lines>
${lines}
  </lines>
</deliveryNote>
`;
}

// ---- Credit Note (XML, Model B) -------------------------------------------
export function parseCreditNoteXml(xmlStr, sourceFile = null) {
  const root = parseXml(xmlStr);
  if (root.tag !== 'creditNote') throw new Error(`CreditNote parse error: root <${root.tag}> is not <creditNote>`);
  const distributor = child(root, 'distributor');
  return createCreditNote({
    creditNoteId: childText(root, 'creditNoteId'),
    distributorId: attr(distributor, 'id'),
    period: childText(root, 'period'),
    invoiceRef: childText(root, 'invoiceRef') || null,
    basisQty: toNum(childText(root, 'basisQty')),
    basisValue: toNum(childText(root, 'basisValueStandard')),
    tierApplied: toNum(childText(root, 'tierApplied')),
    amount: toNum(childText(root, 'amount')),
    status: childText(root, 'status') || undefined,
    sourceFile,
  });
}

export function serializeCreditNoteXml(cn) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<creditNote>
  <creditNoteId>${encodeXml(cn.creditNoteId)}</creditNoteId>
  <distributor id="${encodeXml(cn.distributorId)}"/>
  <period>${encodeXml(cn.period)}</period>
  <invoiceRef>${encodeXml(cn.invoiceRef ?? '')}</invoiceRef>
  <basisQty>${cn.basisQty}</basisQty>
  <basisValueStandard>${cn.basisValue}</basisValueStandard>
  <tierApplied>${cn.tierApplied ?? ''}</tierApplied>
  <amount>${cn.amount}</amount>
  <status>${encodeXml(cn.status)}</status>
</creditNote>
`;
}

// ---- Goods Receipt / RECADV (CSV, row-level) ------------------------------
const RECADV_HEADERS = ['invoice_number', 'stock_id', 'storage_id', 'qty_received', 'receipt_datetime', 'recadv_ref'];

export function parseRecadvCsv(csvStr, sourceFile = null) {
  const { rows } = parseCsv(csvStr);
  return rows.map((r) => createGoodsReceipt({
    invoiceNumber: r.invoice_number,
    stockId: r.stock_id,
    storageId: r.storage_id,
    qtyReceived: toNum(r.qty_received),
    receiptDatetime: r.receipt_datetime,
    recadvRef: r.recadv_ref || null,
    sourceFile,
  }));
}

export function serializeRecadvCsv(receipts) {
  const rows = receipts.map((g) => ({
    invoice_number: g.invoiceNumber,
    stock_id: g.stockId,
    storage_id: g.storageId,
    qty_received: g.qtyReceived,
    receipt_datetime: g.receiptDatetime,
    recadv_ref: g.recadvRef ?? '',
  }));
  return serializeCsv(RECADV_HEADERS, rows);
}
