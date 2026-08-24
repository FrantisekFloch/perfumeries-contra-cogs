// Domain factories + validators for VIR_Tier. Each factory validates required
// fields and returns a plain object (frozen where it represents immutable facts).

import {
  Country, Currency, RebateStructure, Basis, Period, Scope, RetrospectiveReach,
  LeakageDriver, ChargeStatus, TierMeasure, WindowType,
} from './enums.js';

function req(obj, field, ctx) {
  const v = obj[field];
  if (v === undefined || v === null || v === '') throw new Error(`${ctx}: missing required field "${field}"`);
  return v;
}
function oneOf(enumObj, value, field, ctx) {
  if (!Object.values(enumObj).includes(value)) throw new Error(`${ctx}: "${field}" has invalid value "${value}"`);
  return value;
}
function num(obj, field, ctx) {
  const v = Number(obj[field]);
  if (Number.isNaN(v)) throw new Error(`${ctx}: "${field}" must be numeric (got "${obj[field]}")`);
  return v;
}

// ---- Agreement -----------------------------------------------------------
// Required config that, when missing, marks the agreement incomplete (Req 1.6/3.8).
const AGREEMENT_REQUIRED = ['rebateStructure', 'basis', 'period', 'scope', 'currencies', 'tiers'];

export function createAgreement(raw) {
  const ctx = 'createAgreement';
  const agreementId = req(raw, 'agreementId', ctx);
  const supplierId = req(raw, 'supplierId', ctx);

  const incompleteFields = [];
  for (const f of AGREEMENT_REQUIRED) {
    const v = raw[f];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) incompleteFields.push(f);
  }

  // Validate enum-typed fields only when present (incomplete ones are flagged, not thrown).
  if (raw.rebateStructure) oneOf(RebateStructure, raw.rebateStructure, 'rebateStructure', ctx);
  if (raw.basis) oneOf(Basis, raw.basis, 'basis', ctx);
  if (raw.period) oneOf(Period, raw.period, 'period', ctx);
  if (raw.scope) oneOf(Scope, raw.scope, 'scope', ctx);
  if (raw.retrospectiveReach) oneOf(RetrospectiveReach, raw.retrospectiveReach, 'retrospectiveReach', ctx);

  const currencies = Array.isArray(raw.currencies) ? raw.currencies : [];
  for (const c of currencies) oneOf(Currency, c, 'currencies', ctx);

  const countries = Array.isArray(raw.countries) ? raw.countries : [];
  for (const c of countries) oneOf(Country, c, 'countries', ctx);

  // tiers: ordered [{ threshold, rate }]
  const tiers = Array.isArray(raw.tiers)
    ? raw.tiers.map((t, i) => ({ threshold: Number(t.threshold), rate: Number(t.rate),
        _ok: !Number.isNaN(Number(t.threshold)) && !Number.isNaN(Number(t.rate)) || (() => { throw new Error(`${ctx}: tier ${i} has non-numeric threshold/rate`); })() }))
        .map(({ threshold, rate }) => ({ threshold, rate }))
        .sort((a, b) => a.threshold - b.threshold)
    : [];

  if (raw.tierMeasure) oneOf(TierMeasure, raw.tierMeasure, 'tierMeasure', ctx);
  if (raw.windowType) oneOf(WindowType, raw.windowType, 'windowType', ctx);

  // Contract SKU set (= ASINs). Full set the contract covers; the internal CCOGS
  // engine may have been configured with only a subset (engineConfiguredSkus).
  const skuSet = Array.isArray(raw.skuSet) ? raw.skuSet.slice() : [];
  const engineConfiguredSkus = Array.isArray(raw.engineConfiguredSkus) ? raw.engineConfiguredSkus.slice() : skuSet.slice();

  return {
    agreementId, supplierId,
    supplierName: raw.supplierName ?? supplierId,
    contractRef: raw.contractRef ?? `CTR-${agreementId}`,
    rebateStructure: raw.rebateStructure ?? null,
    basis: raw.basis ?? null,
    period: raw.period ?? null,
    scope: raw.scope ?? null,
    retrospectiveReach: raw.retrospectiveReach ?? RetrospectiveReach.WITHIN_PERIOD,
    tiers,
    // tier measured on the combined SKU-set volume (default) or per individual SKU
    tierMeasure: raw.tierMeasure ?? TierMeasure.COMBINED,
    // SKU set + the (possibly smaller) set the internal engine actually tracked
    skuSet,
    engineConfiguredSkus,
    currencies,
    countries,
    // flexible validity window — eligibility keys off the ORDER/INVOICE date being
    // inside [effectiveFrom, effectiveTo]; delivery/unload may be later.
    windowType: raw.windowType ?? WindowType.YEAR,
    effectiveFrom: raw.effectiveFrom ?? null,
    effectiveTo: raw.effectiveTo ?? null,
    // legal/contract metadata (for the contract document view)
    signatory: raw.signatory ?? null,
    signatoryTitle: raw.signatoryTitle ?? null,
    signedDate: raw.signedDate ?? null,
    governingLaw: raw.governingLaw ?? null,
    clauseRefs: raw.clauseRefs ?? {},
    provenance: raw.provenance ?? null,
    incompleteFields,
  };
}

/** True when the internal engine was configured with fewer SKUs than the contract covers. */
export function hasForgottenSkus(agreement) {
  const full = new Set(agreement.skuSet || []);
  const cfg = new Set(agreement.engineConfiguredSkus || []);
  return [...full].some((s) => !cfg.has(s));
}
export function forgottenSkus(agreement) {
  const cfg = new Set(agreement.engineConfiguredSkus || []);
  return (agreement.skuSet || []).filter((s) => !cfg.has(s));
}

/** Eligibility by ORDER/INVOICE date inside the contract window (delivery may be later). */
export function orderDateInWindow(agreement, isoDate) {
  if (!isoDate || !agreement.effectiveFrom || !agreement.effectiveTo) return false;
  return isoDate >= agreement.effectiveFrom && isoDate <= agreement.effectiveTo;
}

export function isAgreementComplete(agreement) {
  return agreement.incompleteFields.length === 0;
}

// ---- Purchase ------------------------------------------------------------
export function createPurchase(raw) {
  const ctx = 'createPurchase';
  return {
    purchaseId: req(raw, 'purchaseId', ctx),
    agreementId: req(raw, 'agreementId', ctx),
    supplierId: raw.supplierId ?? null,
    country: oneOf(Country, req(raw, 'country', ctx), 'country', ctx),
    stockId: req(raw, 'stockId', ctx),
    orderDate: raw.orderDate ?? null,
    qty: num(raw, 'qty', ctx),
    unitValue: raw.unitValue != null && raw.unitValue !== '' ? Number(raw.unitValue) : null,
    weightPerUnit: raw.weightPerUnit != null && raw.weightPerUnit !== '' ? Number(raw.weightPerUnit) : null,
    currency: raw.currency ? oneOf(Currency, raw.currency, 'currency', ctx) : null,
    provenance: raw.provenance ?? null,
  };
}

// ---- Receipt -------------------------------------------------------------
export function createReceipt(raw) {
  const ctx = 'createReceipt';
  const asNum = (v) => (v == null || v === '' ? null : Number(v));
  return {
    receiptId: req(raw, 'receiptId', ctx),
    purchaseId: raw.purchaseId ?? null,
    agreementId: req(raw, 'agreementId', ctx),
    country: oneOf(Country, req(raw, 'country', ctx), 'country', ctx),
    stockId: req(raw, 'stockId', ctx),
    qtyReceived: num(raw, 'qtyReceived', ctx),
    receiptDate: req(raw, 'receiptDate', ctx),   // physical unload/scan date (may be after contract end)
    orderDate: raw.orderDate ?? null,            // order/invoice date — the eligibility anchor
    // vatTaxPoint is OPTIONAL — only present when supporting data exists (Req 11.3/11.4)
    vatTaxPointDate: raw.vatTaxPointDate ? raw.vatTaxPointDate : null,
    // ---- GRN (Goods Received Note) presentational fields ----
    grnNumber: raw.grnNumber ?? null,
    poRef: raw.poRef ?? null,
    invoiceRef: raw.invoiceRef ?? null,
    deliveryNoteRef: raw.deliveryNoteRef ?? null,
    storageId: raw.storageId ?? null,
    // warehouse node + journey progress
    warehouseKind: raw.warehouseKind ?? null,    // MAIN | TOWN
    reachedStep: raw.reachedStep ?? null,        // JourneyStep last reached
    scannedAtMain: raw.scannedAtMain != null ? (raw.scannedAtMain === true || raw.scannedAtMain === 'true') : true, // false => reroute skipped the main-WH scan
    qtyOrdered: asNum(raw.qtyOrdered),
    qtyAccepted: asNum(raw.qtyAccepted),
    qtyRejected: asNum(raw.qtyRejected),
    condition: raw.condition ?? null,       // Good | Damaged | Partial
    inspectedBy: raw.inspectedBy ?? null,
    provenance: raw.provenance ?? null,
  };
}

// ---- Leakage event -------------------------------------------------------
export function createLeakageEvent(raw) {
  const ctx = 'createLeakageEvent';
  return {
    eventId: req(raw, 'eventId', ctx),
    type: oneOf(LeakageDriver, req(raw, 'type', ctx), 'type', ctx),
    agreementId: req(raw, 'agreementId', ctx),
    supplierId: raw.supplierId ?? null,
    country: oneOf(Country, req(raw, 'country', ctx), 'country', ctx),
    stockId: raw.stockId ?? null,
    qty: num(raw, 'qty', ctx),
    refIds: Array.isArray(raw.refIds) ? raw.refIds : (raw.refIds ? String(raw.refIds).split('|').filter(Boolean) : []),
    eventDate: raw.eventDate ?? null,
    // For LATE_SHIPMENT / BACKORDERING: the intended (pre-slip) period date, if provided.
    intendedDate: raw.intendedDate ?? null,
    // For MISSING_INVOICE: why the invoice is absent ('NEVER_ARRIVED' | 'ERP_REJECTED').
    reason: raw.reason ?? null,
    provenance: raw.provenance ?? null,
  };
}

// ---- Claimed CCOGS -------------------------------------------------------
export function createClaimedCcogs(raw) {
  const ctx = 'createClaimedCcogs';
  return {
    claimId: req(raw, 'claimId', ctx),
    agreementId: req(raw, 'agreementId', ctx),
    supplierId: raw.supplierId ?? null,
    scopeKey: raw.scopeKey ?? (raw.country ?? 'PAN_EU'), // country code or PAN_EU
    period: req(raw, 'period', ctx),
    basis: raw.basis ? oneOf(Basis, raw.basis, 'basis', ctx) : null,
    amountClaimed: num(raw, 'amountClaimed', ctx),
    currency: oneOf(Currency, req(raw, 'currency', ctx), 'currency', ctx),
    provenance: raw.provenance ?? null,
  };
}

// ---- Invoice (supplier billing document) ---------------------------------
// Reuses the proven XML shape from the old tool (header + discount tiers + lines).
export function createInvoice(raw) {
  const ctx = 'createInvoice';
  return {
    invoiceNumber: req(raw, 'invoiceNumber', ctx),
    type: raw.type ?? 'final',                 // proforma | final
    agreementId: raw.agreementId ?? null,
    supplierId: raw.supplierId ?? null,
    supplierName: raw.supplierName ?? null,
    country: raw.country ? oneOf(Country, raw.country, 'country', ctx) : null,
    poReference: raw.poReference ?? null,
    invoiceDate: raw.invoiceDate ?? null,
    shipDate: raw.shipDate ?? null,
    incoterms: raw.incoterms ?? null,
    currency: raw.currency ? oneOf(Currency, raw.currency, 'currency', ctx) : null,
    discountTiers: Array.isArray(raw.discountTiers) ? raw.discountTiers.map((t) => ({
      minQty: Number(t.minQty), maxQty: t.maxQty == null || t.maxQty === '' ? null : Number(t.maxQty), pct: Number(t.pct),
    })) : [],
    totalValue: raw.totalValue != null && raw.totalValue !== '' ? Number(raw.totalValue) : null,
    lines: Array.isArray(raw.lines) ? raw.lines.map((l) => ({
      stockId: l.stockId, description: l.description ?? '', qtyInvoiced: Number(l.qtyInvoiced),
      unitPrice: l.unitPrice != null && l.unitPrice !== '' ? Number(l.unitPrice) : null,
      targetStorage: l.targetStorage || null,
    })) : [],
    provenance: raw.provenance ?? null,
  };
}

// ---- Delivery Note (dodací list) -----------------------------------------
export function createDeliveryNote(raw) {
  const ctx = 'createDeliveryNote';
  return {
    deliveryNoteId: req(raw, 'deliveryNoteId', ctx),
    invoiceNumber: raw.invoiceNumber ?? null,
    agreementId: raw.agreementId ?? null,
    targetStorageId: req(raw, 'targetStorageId', ctx),
    country: raw.country ? oneOf(Country, raw.country, 'country', ctx) : null,
    shipDate: raw.shipDate ?? null,
    deliveryStatus: raw.deliveryStatus ?? null,   // Received | Delayed | Rerouted | Lost
    expectedDate: raw.expectedDate ?? null,
    lines: Array.isArray(raw.lines) ? raw.lines.map((l) => ({ stockId: l.stockId, qtyShipped: Number(l.qtyShipped), targetStorage: l.targetStorage || null, invoiceRef: l.invoiceRef || null })) : [],
    invoiceRefs: Array.isArray(raw.invoiceRefs) ? raw.invoiceRefs : (raw.invoiceNumber ? [raw.invoiceNumber] : []),
    provenance: raw.provenance ?? null,
  };
}

// ---- CCOGS Engine output (the "BEFORE") ----------------------------------
// What the existing CCOGS Engine actually produced on INCOMPLETE data — the
// under-claim the tool audits against. Carries the engine's own view of the
// volume it saw and the tier it landed on, so the before/after is explainable.
export function createCcogsEngineOutput(raw) {
  const ctx = 'createCcogsEngineOutput';
  const splitRefs = (v) => (Array.isArray(v) ? v : (v ? String(v).split('|').filter(Boolean) : []));
  return {
    outputId: req(raw, 'outputId', ctx),
    agreementId: req(raw, 'agreementId', ctx),
    supplierId: raw.supplierId ?? null,
    scopeKey: raw.scopeKey ?? (raw.country ?? 'PAN_EU'),
    period: req(raw, 'period', ctx),
    basis: raw.basis ? oneOf(Basis, raw.basis, 'basis', ctx) : null,
    // the volume the engine counted (incomplete — missing the leakage-driver units)
    engineVolume: raw.engineVolume != null && raw.engineVolume !== '' ? Number(raw.engineVolume) : null,
    tierApplied: raw.tierApplied ?? null,          // e.g. "0.015"
    amountClaimed: num(raw, 'amountClaimed', ctx),  // the CCOGS it actually claimed
    currency: oneOf(Currency, req(raw, 'currency', ctx), 'currency', ctx),
    documentType: raw.documentType ?? 'CCOGS_INVOICE', // invoice or debit note
    // ---- linkage: everything from invoice -> contra calc bundled in this summary ----
    invoiceRefs: splitRefs(raw.invoiceRefs),
    deliveryNoteRefs: splitRefs(raw.deliveryNoteRefs),
    receiptRefs: splitRefs(raw.receiptRefs),
    // the engine's own calculation trail (human-readable), e.g. "8000 units @ 1.4% = 112.00"
    calcNote: raw.calcNote ?? null,
    provenance: raw.provenance ?? null,
  };
}

// ---- Supplementing charge / CCOGS True-Up --------------------------------
// A True-Up is a debit note the buyer issues to the supplier for the CCOGS delta
// (what should have been claimed vs what was). It ITEMIZES each cause as a line
// (found pallet, forgotten SKU, late delivery, reroute) but the headline variance
// is the CUMULATIVE delta (e.g. 1% -> 2%).
export function createSupplementingCharge(raw) {
  const ctx = 'createSupplementingCharge';
  return {
    chargeId: req(raw, 'chargeId', ctx),
    docType: raw.docType ?? 'CCOGS_TRUE_UP',   // CCOGS True-Up debit note
    agreementId: req(raw, 'agreementId', ctx),
    supplierId: raw.supplierId ?? null,
    scopeKey: req(raw, 'scopeKey', ctx),
    period: req(raw, 'period', ctx),
    entitledCcogs: num(raw, 'entitledCcogs', ctx),
    claimedCcogs: num(raw, 'claimedCcogs', ctx),
    variance: num(raw, 'variance', ctx),
    currency: oneOf(Currency, req(raw, 'currency', ctx), 'currency', ctx),
    eurEquivalent: raw.eurEquivalent != null ? Number(raw.eurEquivalent) : null,
    // headline tier movement, e.g. from 1.0% to 2.0%
    tierFromPct: raw.tierFromPct != null ? Number(raw.tierFromPct) : null,
    tierToPct: raw.tierToPct != null ? Number(raw.tierToPct) : null,
    tierApplied: raw.tierApplied ?? null,
    structure: raw.structure ?? null,
    basis: raw.basis ?? null,
    // itemized cause lines: [{ cause, driver, qty, fromPct, toPct, deltaValue, note }]
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    clauseRef: raw.clauseRef ?? null,
    status: raw.status ?? ChargeStatus.PENDING_APPROVAL,
    auditTrace: Array.isArray(raw.auditTrace) ? raw.auditTrace : [],
  };
}
