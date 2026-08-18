// Domain model factories with validation.
// Each factory normalizes input, validates required fields, and returns a frozen object.
// Throws a descriptive Error on invalid input so ingestion can capture the reason.

import {
  ContraCogsModel, CONTRA_COGS_MODEL_VALUES,
  InvoiceStatus, INVOICE_STATUS_VALUES,
  FulfilmentStatus, FULFILMENT_STATUS_VALUES,
  ResolutionOption, RESOLUTION_OPTION_VALUES,
  CreditNoteStatus, CREDIT_NOTE_STATUS_VALUES,
  DeliveryStatus, DELIVERY_STATUS_VALUES,
  isEnumValue,
} from './enums.js';

// ---- validation helpers ---------------------------------------------------

function req(obj, field, ctx) {
  const v = obj[field];
  if (v === undefined || v === null || v === '') {
    throw new Error(`${ctx}: missing required field "${field}"`);
  }
  return v;
}

function num(obj, field, ctx, { min = -Infinity } = {}) {
  const v = obj[field];
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`${ctx}: field "${field}" must be a number (got ${JSON.stringify(v)})`);
  }
  if (v < min) throw new Error(`${ctx}: field "${field}" must be >= ${min} (got ${v})`);
  return v;
}

function optNum(obj, field, ctx, opts) {
  return obj[field] === undefined || obj[field] === null || obj[field] === ''
    ? null
    : num(obj, field, ctx, opts);
}

function oneOf(obj, field, values, ctx) {
  const v = req(obj, field, ctx);
  if (!isEnumValue(values, v)) {
    throw new Error(`${ctx}: field "${field}" must be one of ${values.join('|')} (got "${v}")`);
  }
  return v;
}

// ---- source documents -----------------------------------------------------

export function createInvoiceLine(input, ctx = 'InvoiceLine') {
  return Object.freeze({
    stockId: req(input, 'stockId', ctx),
    description: input.description ?? '',
    qtyInvoiced: num(input, 'qtyInvoiced', ctx, { min: 0 }),
    unitPriceStandard: num(input, 'unitPriceStandard', ctx, { min: 0 }),
    unitPriceNet: optNum(input, 'unitPriceNet', ctx, { min: 0 }), // Model A only
    targetStorage: input.targetStorage ?? null,
  });
}

export function createInvoice(input) {
  const ctx = `Invoice(${input?.invoiceNumber ?? '?'})`;
  const lines = Array.isArray(input.lines) ? input.lines.map((l) => createInvoiceLine(l, ctx)) : [];
  if (lines.length === 0) throw new Error(`${ctx}: must have at least one line`);
  return Object.freeze({
    invoiceNumber: req(input, 'invoiceNumber', ctx),
    type: input.type ?? 'final', // proforma | final
    distributorId: req(input, 'distributorId', ctx),
    contraCogsModel: oneOf(input, 'contraCogsModel', CONTRA_COGS_MODEL_VALUES, ctx),
    poReference: input.poReference ?? null,
    invoiceDate: input.invoiceDate ?? null,
    shipDate: input.shipDate ?? null,
    incoterms: input.incoterms ?? null,
    currency: input.currency ?? null,
    discountTiers: Array.isArray(input.discountTiers) ? Object.freeze([...input.discountTiers]) : [],
    totalValueStandard: num(input, 'totalValueStandard', ctx, { min: 0 }),
    status: input.status ? oneOf(input, 'status', INVOICE_STATUS_VALUES, ctx) : InvoiceStatus.RECEIVED,
    sourceFile: input.sourceFile ?? null,
    lines,
  });
}

export function createDeliveryNote(input) {
  const ctx = `DeliveryNote(${input?.deliveryNoteId ?? '?'})`;
  const lines = Array.isArray(input.lines)
    ? input.lines.map((l, i) => Object.freeze({
        stockId: req(l, 'stockId', `${ctx}.line[${i}]`),
        qtyShipped: num(l, 'qtyShipped', `${ctx}.line[${i}]`, { min: 0 }),
      }))
    : [];
  return Object.freeze({
    deliveryNoteId: req(input, 'deliveryNoteId', ctx),
    invoiceNumber: input.invoiceNumber ?? null,
    targetStorageId: req(input, 'targetStorageId', ctx),
    shipDate: input.shipDate ?? null,
    // Optional logistics status for this leg (OnTime | Delayed | Rerouted | Lost).
    // Defaults to OnTime; expectedDate is the ETA for a delayed/rerouted leg.
    deliveryStatus: input.deliveryStatus
      ? oneOf(input, 'deliveryStatus', DELIVERY_STATUS_VALUES, ctx)
      : DeliveryStatus.ON_TIME,
    expectedDate: input.expectedDate ?? null,
    sourceFile: input.sourceFile ?? null,
    lines,
  });
}

export function createGoodsReceipt(input) {
  const ctx = 'GoodsReceipt';
  return Object.freeze({
    invoiceNumber: req(input, 'invoiceNumber', ctx),
    stockId: req(input, 'stockId', ctx),
    storageId: req(input, 'storageId', ctx),
    qtyReceived: num(input, 'qtyReceived', ctx, { min: 0 }),
    receiptDatetime: req(input, 'receiptDatetime', ctx),
    recadvRef: input.recadvRef ?? null,
    sourceFile: input.sourceFile ?? null,
  });
}

export function createCreditNote(input) {
  const ctx = `CreditNote(${input?.creditNoteId ?? '?'})`;
  return Object.freeze({
    creditNoteId: req(input, 'creditNoteId', ctx),
    distributorId: req(input, 'distributorId', ctx),
    period: req(input, 'period', ctx),
    invoiceRef: input.invoiceRef ?? null,
    basisQty: num(input, 'basisQty', ctx, { min: 0 }),
    basisValue: num(input, 'basisValue', ctx, { min: 0 }),
    tierApplied: optNum(input, 'tierApplied', ctx, { min: 0 }),
    amount: num(input, 'amount', ctx, { min: 0 }),
    status: input.status ? oneOf(input, 'status', CREDIT_NOTE_STATUS_VALUES, ctx) : CreditNoteStatus.PENDING,
    sourceFile: input.sourceFile ?? null,
  });
}

// ---- derived / operational models -----------------------------------------

export function createGap(input) {
  const ctx = `Gap(${input?.gapId ?? '?'})`;
  return Object.freeze({
    gapId: req(input, 'gapId', ctx),
    invoiceNumber: req(input, 'invoiceNumber', ctx),
    stockId: req(input, 'stockId', ctx),
    missingQty: num(input, 'missingQty', ctx, { min: 0 }),
    valueAtRisk: num(input, 'valueAtRisk', ctx, { min: 0 }),
    cause: input.cause ?? null,
    status: input.status ?? 'open',
    owner: input.owner ?? null,
  });
}

export function createGinrAccrual(input) {
  const ctx = 'GinrAccrual';
  return Object.freeze({
    invoiceNumber: req(input, 'invoiceNumber', ctx),
    period: req(input, 'period', ctx),
    value: num(input, 'value', ctx, { min: 0 }),
    ageDays: optNum(input, 'ageDays', ctx, { min: 0 }) ?? 0,
    owner: input.owner ?? null,
    flag: 'value missing — locate',
  });
}

export function createResolution(input) {
  const ctx = 'Resolution';
  return Object.freeze({
    gapId: req(input, 'gapId', ctx),
    option: oneOf(input, 'option', RESOLUTION_OPTION_VALUES, ctx),
    evidenceDocRef: input.evidenceDocRef ?? null,
    approver: input.approver ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}

export function createAuditEntry(input) {
  const ctx = 'AuditEntry';
  return Object.freeze({
    entityId: req(input, 'entityId', ctx),
    actor: req(input, 'actor', ctx),
    timestamp: input.timestamp ?? new Date().toISOString(),
    change: req(input, 'change', ctx),
    evidenceRef: input.evidenceRef ?? null,
  });
}

export function createSplitDebit(input) {
  const ctx = 'SplitDebit';
  return Object.freeze({
    invoiceNumber: req(input, 'invoiceNumber', ctx),
    period: req(input, 'period', ctx),
    amount: num(input, 'amount', ctx, { min: 0 }),
    date: input.date ?? null,
  });
}
