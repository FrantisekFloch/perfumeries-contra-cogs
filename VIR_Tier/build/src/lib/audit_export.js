// Audit export builder. Produces the LINE-LEVEL audit dataset for the Audit
// section and the multi-sheet Excel export. Pure data (no SheetJS, no DOM) so it
// is unit-testable; the UI layer turns these row arrays into worksheets.
//
// Three datasets, mirroring the three Excel sheets the supplier receives:
//   summaryRows : pivoted per-agreement summary (before / after / delta), the
//                 "page zero" that reads like the contra-COGS invoice header.
//   lineRows    : one row per charge line (cause/driver/qty/rate/delta) enriched
//                 with agreement + supplier + scope + period + validity, each with
//                 a stable LineRef so the CCOGS sheet can point back to it.
//   ccogsRows   : one row per additional-CCOGS debit requested, listing the
//                 LineRefs that make it up (so the supplier can trace the request).

const WIN_LBL = { MONTH: 'Monthly', QUARTER: 'Quarterly', HALF_YEAR: 'Half-year', YEAR: 'Yearly', CUSTOM: 'Custom' };

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

/**
 * @param {object} state  app state (needs charges, beforeAfter, reconstructions, consolidated, discovery, erpSent)
 * @param {object} [opts] { agreementIds?: Set, from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' } line-level filters
 * @returns {object} { summaryRows, lineRows, ccogsRows, meta }
 */
export function buildAuditDataset(state, opts = {}) {
  const charges = (state.charges || []).filter((c) => (c.variance || 0) > 0.01);
  const consolidated = state.consolidated;
  const discovery = state.discovery || { findings: [] };
  const erpSent = state.erpSent || {};
  const agFilter = opts.agreementIds || null;   // null => all
  const from = opts.from || null;
  const to = opts.to || null;

  const validityOf = (agreementId) => {
    const g = consolidated?.byAgreement?.get(agreementId);
    return { label: WIN_LBL[g?.agreement?.windowType] || '—', from: g?.agreement?.effectiveFrom || '', to: g?.agreement?.effectiveTo || '' };
  };
  const findingFor = (agreementId, scopeKey) => (discovery.findings || []).find((f) => f.agreementId === agreementId && f.scopeKey === scopeKey) || null;

  // date filter: keep a charge whose agreement validity window overlaps [from,to]
  const inWindow = (v) => {
    if (!from && !to) return true;
    const s = v.from || '0000-01-01'; const e = v.to || '9999-12-31';
    if (from && e < from) return false;
    if (to && s > to) return false;
    return true;
  };

  const lineRows = [];
  const ccogsRows = [];
  const summaryMap = new Map();  // supplier -> { supplier, before, after, delta, agreements:Set }

  for (const c of charges) {
    if (agFilter && !agFilter.has(c.agreementId)) continue;
    const v = validityOf(c.agreementId);
    if (!inWindow(v)) continue;
    const g = consolidated?.byAgreement?.get(c.agreementId);
    const ag = g?.agreement || {};
    const supplierName = ag.supplierName || c.supplierId || '—';
    const finding = findingFor(c.agreementId, c.scopeKey);
    const isMissing = !!(finding && finding.missingInvoice) || (g && g.hasMissingInvoice);
    const realized = !!erpSent[c.chargeId];

    // Warehouse split + delivery-note dates for this agreement (from the group's
    // receipts + delivery notes). Per-SKU warehouse where available; overall split
    // string for the agreement; delivery-note reference + dates.
    const receipts = (g && g.receipts) || [];
    const deliveryNotes = (g && g.deliveryNotes) || [];
    const whBySku = {};        // stockId -> Set(warehouse)
    const whQty = {};          // warehouse -> qty
    for (const r of receipts) {
      const wh = r.storageId || r.warehouseKind || r.country || '—';
      (whBySku[r.stockId] ||= new Set()).add(wh);
      whQty[wh] = (whQty[wh] || 0) + (r.qtyReceived || 0);
    }
    const warehouseSplit = Object.entries(whQty).sort((a, b) => b[1] - a[1]).map(([w, q]) => `${w}:${Math.round(q)}`).join(' | ');
    const dnRefs = deliveryNotes.map((d) => d.deliveryNoteId).filter(Boolean).join(', ');
    const dnDates = [...new Set(deliveryNotes.map((d) => d.shipDate).filter(Boolean))].sort().join(', ');
    const rcDates = [...new Set(receipts.map((r) => r.receiptDate).filter(Boolean))].sort();
    const rcDateRange = rcDates.length ? (rcDates.length > 1 ? `${rcDates[0]} … ${rcDates[rcDates.length - 1]}` : rcDates[0]) : '';

    // per-line rows with a stable LineRef
    const lines = (c.lines && c.lines.length) ? c.lines : [{ cause: 'Volume rebate adjustment', driver: c.tierApplied ? 'TIER_UPLIFT' : '—', qty: 0, fromPct: c.tierFromPct, toPct: c.tierToPct, deltaValue: c.variance, note: '' }];
    const refs = [];
    lines.forEach((l, i) => {
      const lineRef = `${c.agreementId}-L${i + 1}`;
      refs.push(lineRef);
      const lineSku = l.stockId || l.sku || '';
      const lineWh = (lineSku && whBySku[lineSku]) ? [...whBySku[lineSku]].join(' / ') : (warehouseSplit ? warehouseSplit.split(' | ')[0].split(':')[0] : '');
      lineRows.push({
        LineRef: lineRef,
        Supplier: supplierName,
        SupplierId: c.supplierId || ag.supplierId || '',
        Agreement: c.agreementId,
        CaseType: isMissing ? 'Missing invoice' : 'Tier / volume',
        Scope: c.scopeKey,
        Period: c.period,
        Validity: v.label,
        ValidFrom: v.from,
        ValidTo: v.to,
        Basis: c.basis || ag.basis || '',
        SKU: lineSku,
        Warehouse: lineWh,
        WarehouseSplit: warehouseSplit,
        DeliveryNotes: dnRefs,
        DeliveryDates: dnDates,
        GoodsReceiptDates: rcDateRange,
        Cause: l.cause || '',
        Driver: l.driver || '',
        Qty: l.qty || 0,
        RateFromPct: l.fromPct != null ? l.fromPct : '',
        RateToPct: l.toPct != null ? l.toPct : '',
        LineValue: round2(l.deltaValue || 0),
        Currency: c.currency || 'EUR',
        MissingInvoice: isMissing ? 'YES' : '',
        Note: l.note || '',
      });
    });

    ccogsRows.push({
      DebitRef: c.chargeId,
      Supplier: supplierName,
      Agreement: c.agreementId,
      Scope: c.scopeKey,
      Period: c.period,
      ClaimedBefore: round2(c.claimedCcogs || 0),
      EntitledAfter: round2(c.entitledCcogs || 0),
      AdditionalCcogs: round2(c.variance || 0),
      Currency: c.currency || 'EUR',
      EurEquivalent: c.eurEquivalent != null ? round2(c.eurEquivalent) : '',
      // FX audit trail: the exact rate + as-of date used to derive EurEquivalent
      FxRate: c.fxSnapshot && c.fxSnapshot.rate != null ? c.fxSnapshot.rate : '',
      FxAsOf: c.fxSnapshot && c.fxSnapshot.asOf ? c.fxSnapshot.asOf : '',
      Type: isMissing ? 'Missing invoice / no CCOGS' : 'Tier / volume reconstruction',
      Status: realized ? 'Posted to ERP' : 'Pending',
      LineRefs: refs.join(', '),
    });

    // summary pivot per supplier
    const before = (state.beforeAfter || []).filter((b) => b.agreementId === c.agreementId).reduce((s, b) => s + (b.before?.claimed || 0), 0);
    const after = (state.beforeAfter || []).filter((b) => b.agreementId === c.agreementId).reduce((s, b) => s + (b.after?.entitled || 0), 0);
    if (!summaryMap.has(supplierName)) summaryMap.set(supplierName, { Supplier: supplierName, Agreements: new Set(), ClaimedBefore: 0, EntitledAfter: 0, AdditionalCcogs: 0, Currency: c.currency || 'EUR', MissingInvoiceCases: 0 });
    const sm = summaryMap.get(supplierName);
    sm.Agreements.add(c.agreementId);
    sm.AdditionalCcogs += (c.variance || 0);
    if (isMissing) sm.MissingInvoiceCases += 1;
  }

  // finalise summary rows (compute before/after per supplier from beforeAfter)
  const summaryRows = [...summaryMap.values()].map((sm) => {
    const agIds = sm.Agreements;
    const rows = (state.beforeAfter || []).filter((b) => agIds.has(b.agreementId));
    const before = rows.reduce((s, b) => s + (b.before?.claimed || 0), 0);
    const after = rows.reduce((s, b) => s + (b.after?.entitled || 0), 0);
    return {
      Supplier: sm.Supplier,
      Agreements: agIds.size,
      ClaimedBefore: round2(before),
      EntitledAfter: round2(after),
      AdditionalCcogs: round2(sm.AdditionalCcogs),
      Currency: sm.Currency,
      MissingInvoiceCases: sm.MissingInvoiceCases,
    };
  }).sort((a, b) => b.AdditionalCcogs - a.AdditionalCcogs);

  // grand-total row appended to the summary
  if (summaryRows.length) {
    summaryRows.push({
      Supplier: 'TOTAL',
      Agreements: summaryRows.reduce((s, r) => s + r.Agreements, 0),
      ClaimedBefore: round2(summaryRows.reduce((s, r) => s + r.ClaimedBefore, 0)),
      EntitledAfter: round2(summaryRows.reduce((s, r) => s + r.EntitledAfter, 0)),
      AdditionalCcogs: round2(summaryRows.reduce((s, r) => s + r.AdditionalCcogs, 0)),
      Currency: '',
      MissingInvoiceCases: summaryRows.reduce((s, r) => s + r.MissingInvoiceCases, 0),
    });
  }

  return {
    summaryRows, lineRows, ccogsRows,
    meta: { lineCount: lineRows.length, ccogsCount: ccogsRows.length, supplierCount: summaryMap.size, generatedAt: new Date().toISOString() },
  };
}
