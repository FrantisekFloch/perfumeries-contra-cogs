// Stage views for the workspace: Inputs/Collection and ML Discovery (SVG flow +
// expandable findings with the drill-down folded in). Pure string builders;
// app.js wires interactions.

import { t } from '../lib/i18n.js';
import { Scope } from '../lib/enums.js';
import { hintSpan } from './tooltip.js';
import { renderIngestFlow, FLOW_NODES, renderMlAnalysisPanel } from './ingestflow.js';

const nf = (v) => (v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---- Stage 1: Inputs & Collection ---------------------------------------
// Categories map to store collections; `sub` selects the active category.
// Document categories the browser can list. The `summary` entry is a special
// non-listing sub (rendered by renderInputsSummary) and is placed LAST so it
// reads as the "wrap-up" page after Agreements.
export const INPUT_CATS = [
  { key: 'invoices', label: 'subInvoices', coll: 'invoices', id: (o) => o.invoiceNumber, meta: (o) => `${o.supplierName ?? o.supplierId ?? ''} · ${o.country ?? ''} · ${o.lines?.length ?? 0} ${'lines'}` },
  { key: 'deliveryNotes', label: 'subDeliveryNotes', coll: 'deliveryNotes', id: (o) => o.deliveryNoteId, meta: (o) => `${o.targetStorageId} · ${o.deliveryStatus ?? ''}` },
  { key: 'receipts', label: 'subReceipts', coll: 'receipts', id: (o) => o.receiptId, meta: (o) => `${o.country} · ${o.stockId} · ${nf(o.qtyReceived)}` },
  { key: 'events', label: 'subMissing', coll: 'events', id: (o) => o.eventId, meta: (o) => `${o.type.replace(/_/g, ' ')} · ${o.country} · ${nf(o.qty)}` },
  { key: 'ccogsEngine', label: 'subEngine', coll: 'ccogsEngine', id: (o) => o.outputId, meta: (o) => `${o.scopeKey} · ${o.documentType} · ${nf(o.amountClaimed)} ${o.currency}` },
  { key: 'agreements', label: 'subAgreements', coll: 'agreements', id: (o) => o.agreementId, meta: (o) => `${o.rebateStructure ?? ''} · ${o.scope ?? ''} · ${o.basis ?? ''}` },
  { key: 'summary', label: 'subSummary', summary: true },
];
// document categories only (excludes the summary pseudo-tab)
const DOC_CATS = INPUT_CATS.filter((c) => !c.summary);

// ---- shared filter/sort for ingested documents (reused by the Audit view) ----
// Normalise any ingested document to a comparable attribute set: supplier,
// warehouse, and the three sort measures (ccogs value, order value, units). Doc
// shapes differ per category, so we extract with per-type fallbacks. Supplier is
// resolved via the owning agreement when the doc itself doesn't carry it.
export function docAttrs(catKey, o, state) {
  const agId = o.agreementId || null;
  const grp = agId ? state.consolidated?.byAgreement?.get(agId) : null;
  const ag = grp?.agreement || null;
  const supplierId = o.supplierId || ag?.supplierId || '—';
  const supplierName = o.supplierName || ag?.supplierName || supplierId;
  // warehouse: receipts storageId, delivery target, else country/scope
  const warehouse = o.storageId || o.targetStorageId || o.warehouseKind && `${o.country || ''}-${o.warehouseKind}` || o.country || o.scopeKey || '—';
  // ccogs value for this doc: engine claim amount, else the agreement's
  // reconstructed recoverable (from beforeAfter), else 0.
  let ccogs = 0;
  if (o.amountClaimed != null) ccogs = o.amountClaimed;
  else if (agId) ccogs = (state.beforeAfter || []).filter((b) => b.agreementId === agId).reduce((s, b) => s + (b.after?.entitled || 0), 0);
  // order value: invoice total, else sum(line qty*unitPrice), else qty*—
  let orderVal = 0;
  if (o.totalValue != null) orderVal = o.totalValue;
  else if (Array.isArray(o.lines)) orderVal = o.lines.reduce((s, l) => s + (Number(l.qtyInvoiced || l.qtyShipped || 0) * Number(l.unitPrice || 0)), 0);
  // units: receipts qty, invoice/delivery line sum, event qty, engine volume
  let units = 0;
  if (o.qtyReceived != null) units = o.qtyReceived;
  else if (o.qty != null) units = o.qty;
  else if (o.engineVolume != null) units = o.engineVolume;
  else if (Array.isArray(o.lines)) units = o.lines.reduce((s, l) => s + Number(l.qtyInvoiced || l.qtyShipped || 0), 0);
  return { supplierId, supplierName, warehouse: String(warehouse), ccogs, orderVal, units };
}

// distinct supplier + warehouse values present in a category's items (for the filter chips)
function distinctFilterValues(catKey, items, state) {
  const sup = new Map(); const wh = new Set();
  for (const o of items) { const a = docAttrs(catKey, o, state); sup.set(a.supplierId, a.supplierName); wh.add(a.warehouse); }
  return { suppliers: [...sup.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), warehouses: [...wh].sort() };
}

// apply the current inputFilters (supplier/warehouse multiselect + sort) to items
export function applyInputFilterSort(catKey, items, state) {
  const f = state.inputFilters || {};
  const supSel = f.suppliers;   // null => all
  const whSel = f.warehouses;   // null => all
  let rows = items.map((o) => ({ o, a: docAttrs(catKey, o, state) }));
  if (supSel) rows = rows.filter((r) => supSel.has(r.a.supplierId));
  if (whSel) rows = rows.filter((r) => whSel.has(r.a.warehouse));
  const key = f.sortKey || 'ccogs';
  const dir = f.sortDir === 'asc' ? 1 : -1;
  const val = (r) => key === 'order' ? r.a.orderVal : key === 'units' ? r.a.units : r.a.ccogs;
  rows.sort((x, y) => (val(x) - val(y)) * dir);
  return rows.map((r) => r.o);
}

// the filter + sort control bar (top of the doc list)
function inputFilterBar(catKey, items, state) {
  const f = state.inputFilters || {};
  const { suppliers, warehouses } = distinctFilterValues(catKey, items, state);
  const supSel = f.suppliers; const whSel = f.warehouses;
  const supCount = supSel ? supSel.size : suppliers.length;
  const whCount = whSel ? whSel.size : warehouses.length;
  const sortBtn = (key, label) => {
    const active = (f.sortKey || 'ccogs') === key;
    const arrow = active ? (f.sortDir === 'asc' ? '↑' : '↓') : '';
    return `<button class="flt-sort ${active ? 'active' : ''}" data-sort="${key}">${label} <span class="flt-arrow">${arrow}</span></button>`;
  };
  const chkList = (kind, opts, sel) => opts.map((op) => {
    const id = kind === 'sup' ? op.id : op;
    const label = kind === 'sup' ? op.name : op;
    const on = !sel || sel.has(id);
    return `<label class="flt-opt"><input type="checkbox" data-fltopt="${kind}" value="${esc(String(id))}" ${on ? 'checked' : ''}/> ${esc(label)}</label>`;
  }).join('');
  return `<div class="fltbar">
    <div class="flt-group flt-menu">
      <button class="flt-toggle" data-fltmenu="sup">${t('fltSupplier')} <span class="flt-count">${supCount}/${suppliers.length}</span> ▾</button>
      <div class="flt-pop" data-fltpop="sup" hidden>
        <div class="flt-pop-actions"><button data-fltall="sup">${t('fltAll')}</button><button data-fltnone="sup">${t('fltNone')}</button></div>
        <div class="flt-opts">${chkList('sup', suppliers, supSel)}</div>
      </div>
    </div>
    <div class="flt-group flt-menu">
      <button class="flt-toggle" data-fltmenu="wh">${t('fltWarehouse')} <span class="flt-count">${whCount}/${warehouses.length}</span> ▾</button>
      <div class="flt-pop" data-fltpop="wh" hidden>
        <div class="flt-pop-actions"><button data-fltall="wh">${t('fltAll')}</button><button data-fltnone="wh">${t('fltNone')}</button></div>
        <div class="flt-opts">${chkList('wh', warehouses, whSel)}</div>
      </div>
    </div>
    <div class="flt-spacer"></div>
    <div class="flt-group flt-sorts"><span class="flt-lbl">${t('fltSortBy')}</span>
      ${sortBtn('ccogs', t('fltSortCcogs'))}${sortBtn('order', t('fltSortOrder'))}${sortBtn('units', t('fltSortUnits'))}
    </div>
  </div>`;
}

export function renderInputs(state) {
  const sub = state.sub || 'summary';
  if (sub === 'summary') return renderInputsSummary(state);
  const cat = DOC_CATS.find((c) => c.key === sub) || DOC_CATS[0];
  const allItems = state.store.all(cat.coll);
  const tabs = INPUT_CATS.map((c) =>
    `<div class="filecat ${c.key === sub ? 'active' : ''}" data-sub="${c.key}">${t(c.label)}${c.summary ? '' : `<span class="cnt">${state.store.all(c.coll).length}</span>`}</div>`).join('');
  // apply the top-of-screen filter + sort (default: all selected, sort by ccogs desc)
  const items = applyInputFilterSort(cat.key, allItems, state);
  const cards = items.slice(0, 120).map((o) => {
    const id = cat.id(o);
    const a = docAttrs(cat.key, o, state);
    return `<div class="doccard">
      <div class="id">${esc(id)}</div>
      <div class="meta">${esc(cat.meta(o))}</div>
      <div class="doccard-attrs">
        <span class="dca">${esc(a.supplierName)}</span>
        <span class="dca">${esc(a.warehouse)}</span>
        <span class="dca num">${nf(a.ccogs)} € ${t('fltSortCcogs').toLowerCase()}</span>
      </div>
      <div class="row">
        <button class="btn primary" data-doc="${cat.key}|${esc(id)}">${t('view')}</button>
        <button class="btn ghost" data-dl="${cat.key}|${esc(id)}">${t('download')}</button>
      </div>
    </div>`;
  }).join('');
  const shown = Math.min(items.length, 120);
  return `
    <button class="btn tint-green back-btn" data-sub="summary">← ${t('backToSummary')}</button>
    <p class="lead">${t('filesLead')}</p>
    <div class="filecats">${tabs}</div>
    ${inputFilterBar(cat.key, allItems, state)}
    <div class="flt-result small">${t('fltShowing', { shown, total: allItems.length })}</div>
    <div class="doclist">${cards || `<div class="small">${t('fltNoneMatch')}</div>`}</div>
  `;
}

// ---- Inputs SUMMARY sub-page (landing page after boot) ------------------
// Shows how much of each document type was ingested, confirms the collection +
// matching pass is complete, and offers a Continue button into ML Discovery.
// Refined monoline SVG icons (24px, currentColor) — a professional alternative
// to emoji. Stroke-based, consistent weight.
const SUM_SVG = {
  invoices: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  deliveryNotes: '<path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7" cy="17" r="1.6"/><circle cx="17.5" cy="17" r="1.6"/>',
  receipts: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  events: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  ccogsEngine: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  agreements: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 15h5"/>',
};
const sumIcon = (key) => `<svg class="sum-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SUM_SVG[key] || SUM_SVG.agreements}</svg>`;

// Recoverable amount for a single before/after row. Uses the native recoverable
// (costOfInaction) so every total in the tool reconciles to the SAME figure to
// the cent (Overview / Consolidated / Audit all sum this). The per-charge EUR
// equivalent is still shown on the individual document where FX applies.
function recEur(b) { return (b.costOfInaction || 0); }

// Build the analysed result tiles that fill the workspace below the two top
// windows. Each tile is a self-contained finding summary the user can click to
// open full details (what/how found, proposal, pre/post impact). Sizes vary
// (wide / tall / normal) so the grid reads like a professional dashboard.
export function summaryTiles(state) {
  const ba = state.beforeAfter || [];
  const recs = state.reconstructions || [];
  const consolidated = state.consolidated;
  const unitsOf = (agreementId, scopeKey) => {
    const r = recs.find((x) => x.agreementId === agreementId);
    if (!r) return 0;
    return r.volumes.filter((v) => scopeKey === 'PAN_EU' ? true : v.scopeKey === scopeKey).reduce((s, v) => s + (v.unitCount || 0), 0);
  };
  const totalUnits = recs.reduce((s, r) => s + r.volumes.reduce((a, v) => a + (v.unitCount || 0), 0), 0);
  const totalPortfolioEur = ba.reduce((s, b) => s + (b.after?.entitled || b.before?.claimed || 0), 0);

  const recoverable = ba.filter((b) => b.recoverable);
  const clean = ba.filter((b) => !b.recoverable);
  const recoverEur = recoverable.reduce((s, b) => s + recEur(b), 0);
  const cleanEur = clean.reduce((s, b) => s + (b.before?.claimed || 0), 0);

  // driver aggregation across all consolidated groups
  const drv = {};
  if (consolidated) for (const g of consolidated.byAgreement.values()) for (const e of (g.events || [])) {
    (drv[e.type] ||= { count: 0, units: 0, suppliers: new Set() });
    drv[e.type].count += 1; drv[e.type].units += (e.qty || 0); if (g.agreement) drv[e.type].suppliers.add(g.agreement.supplierId);
  }
  const D = (k) => drv[k] || { count: 0, units: 0, suppliers: new Set() };

  // late-delivery family (late / expired-window / backorder)
  const lateKeys = ['LATE_SHIPMENT', 'EXPIRED_WINDOW_LATE_DELIVERY', 'BACKORDERING'];
  const lateUnits = lateKeys.reduce((s, k) => s + D(k).units, 0);
  const lateSuppliers = new Set(lateKeys.flatMap((k) => [...D(k).suppliers])).size;
  const lateEur = recoverable.filter((b) => {
    const g = consolidated?.byAgreement?.get(b.agreementId);
    return g && (g.events || []).some((e) => lateKeys.includes(e.type));
  }).reduce((s, b) => s + recEur(b), 0);

  // missing-invoice (the new issue)
  const mi = (consolidated?.missingInvoices) || [];
  const miUnits = mi.reduce((s, m) => s + (m.units || 0), 0);
  const miEur = recoverable.filter((b) => (consolidated?.byAgreement?.get(b.agreementId)?.hasMissingInvoice)).reduce((s, b) => s + recEur(b), 0);
  const miSuppliers = new Set(mi.map((m) => m.supplierId)).size;

  // pan-EU aggregation wins
  const panEu = recoverable.filter((b) => b.scopeKey === 'PAN_EU');
  const panEuEur = panEu.reduce((s, b) => s + recEur(b), 0);

  // forgotten SKU + reroute + found-later grouped as "process/scan" issues
  const scanKeys = ['REROUTE_SKIPPED_SCAN', 'FORGOTTEN_SKU', 'FOUND_LATER_PALLET'];
  const scanUnits = scanKeys.reduce((s, k) => s + D(k).units, 0);
  const scanEur = recoverable.filter((b) => {
    const g = consolidated?.byAgreement?.get(b.agreementId);
    return g && (g.events || []).some((e) => scanKeys.includes(e.type));
  }).reduce((s, b) => s + recEur(b), 0);

  const tiles = [];
  // portfolio — wide, neutral
  tiles.push({ id: 'portfolio', size: 'wide', kind: 'info', icon: 'portfolio',
    title: t('tilePortfolio'), big: `${nf(totalPortfolioEur)} EUR`,
    subs: [`${nf(totalUnits)} ${t('tileUnits')}`, `${ba.length} ${t('tileAgreements')}`] });
  // confirmed complete — normal, positive
  tiles.push({ id: 'complete', size: 'normal', kind: 'ok', icon: 'complete',
    title: t('tileComplete'), big: `${nf(clean.length)}`,
    subs: [`${nf(cleanEur)} EUR`, `${nf(clean.length)} ${t('tileOrders')}`] });
  // missing invoice — TALL, danger (the headline new issue). review=true -> tinted.
  if (mi.length) tiles.push({ id: 'missing_invoice', size: 'tall', kind: 'danger', icon: 'missing', flag: true, review: true,
    title: t('tileMissingInvoice'), big: `${nf(miEur)} EUR`,
    subs: [`${mi.length} ${t('tileCases')}`, `${nf(miUnits)} ${t('tileUnits')}`, `${miSuppliers} ${t('tileSuppliers')}`],
    note: t('tileMissingInvoiceNote') });
  // late delivery — normal, warn, needs review -> tinted
  if (lateUnits) tiles.push({ id: 'late', size: 'normal', kind: 'warn', icon: 'late', review: true,
    title: t('tileLate'), big: `${nf(lateEur)} EUR`,
    subs: [`${lateSuppliers} ${t('tileSuppliers')}`, `${nf(lateUnits)} ${t('tileUnits')}`] });
  // pan-EU aggregation — recovery opportunity, needs review -> tinted
  if (panEu.length) tiles.push({ id: 'paneu', size: 'normal', kind: 'warn', icon: 'paneu', review: true,
    title: t('tilePanEu'), big: `${nf(panEuEur)} EUR`,
    subs: [`${panEu.length} ${t('tileAgreements')}`] });
  // scan/config issues — normal, warn, needs review -> tinted
  if (scanUnits) tiles.push({ id: 'scan', size: 'normal', kind: 'warn', icon: 'scan', review: true,
    title: t('tileScan'), big: `${nf(scanEur)} EUR`,
    subs: [`${nf(scanUnits)} ${t('tileUnits')}`] });

  // mailbox scan — starts AMBER ("possible update, click to scan"); once the
  // user runs the scan and matches an email to a finding it turns RED with the
  // matched Contra-COGS opportunity value. state.mailboxScan drives the switch.
  const ms2 = state.mailboxScan || null;
  if (ms2 && ms2.scanned) {
    const matchEur = ms2.matchEur != null ? `${nf(ms2.matchEur)} EUR` : t('mbxMatched');
    tiles.push({ id: 'mailbox', size: 'normal', kind: 'danger', icon: 'mailbox', flag: true, review: true,
      title: t('tileMailbox'), big: matchEur,
      subs: [`${ms2.emailCount || 1} ${t('mbxEmails')}`, ms2.matchAgreementId ? `${t('agreement')} ${ms2.matchAgreementId}` : ''].filter(Boolean),
      note: t('tileMailboxFoundNote') });
  } else {
    tiles.push({ id: 'mailbox', size: 'normal', kind: 'warn', icon: 'mailbox', review: true, cta: t('mbxScanCta'),
      title: t('tileMailbox'), big: t('mbxPossible'),
      subs: [t('mbxSharedMailbox')], note: t('tileMailboxNote') });
  }

  return { tiles, totals: { findN: recoverable.length, cleanN: clean.length, recoverEur, totalUnits, totalPortfolioEur } };
}

const TILE_SVG = {
  portfolio: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  complete: '<path d="M4 12l5 5L20 6"/>',
  missing: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  late: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
  paneu: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3"/><path d="M3 12h18"/>',
  mailbox: '<path d="M3 6h18v12H3z"/><path d="M3 7l9 6 9-6"/>',
};
const tileIcon = (k) => `<svg class="tile-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TILE_SVG[k] || TILE_SVG.portfolio}</svg>`;

// Build the details modal body for one result tile: what was found, how it was
// found, the proposal, and the pre/post (before/after) impact. Reads the same
// aggregates as the tiles plus per-agreement drill rows.
export function tileDetail(state, id) {
  const ba = state.beforeAfter || [];
  const consolidated = state.consolidated;
  const recoverable = ba.filter((b) => b.recoverable);
  const groupHas = (b, keys) => { const g = consolidated?.byAgreement?.get(b.agreementId); return g && (g.events || []).some((e) => keys.includes(e.type)); };

  const meta = {
    portfolio: { titleKey: 'tilePortfolio', rows: ba, what: 'tdPortfolioWhat', how: 'tdPortfolioHow', prop: 'tdPortfolioProp' },
    complete: { titleKey: 'tileComplete', rows: ba.filter((b) => !b.recoverable), what: 'tdCompleteWhat', how: 'tdCompleteHow', prop: 'tdCompleteProp' },
    missing_invoice: { titleKey: 'tileMissingInvoice', rows: recoverable.filter((b) => consolidated?.byAgreement?.get(b.agreementId)?.hasMissingInvoice), what: 'tdMissingWhat', how: 'tdMissingHow', prop: 'tdMissingProp' },
    late: { titleKey: 'tileLate', rows: recoverable.filter((b) => groupHas(b, ['LATE_SHIPMENT', 'EXPIRED_WINDOW_LATE_DELIVERY', 'BACKORDERING'])), what: 'tdLateWhat', how: 'tdLateHow', prop: 'tdLateProp' },
    paneu: { titleKey: 'tilePanEu', rows: recoverable.filter((b) => b.scopeKey === 'PAN_EU'), what: 'tdPanEuWhat', how: 'tdPanEuHow', prop: 'tdPanEuProp' },
    scan: { titleKey: 'tileScan', rows: recoverable.filter((b) => groupHas(b, ['REROUTE_SKIPPED_SCAN', 'FORGOTTEN_SKU', 'FOUND_LATER_PALLET'])), what: 'tdScanWhat', how: 'tdScanHow', prop: 'tdScanProp' },
  }[id];

  // mailbox tile details: show the scanned email + what it was matched to.
  if (id === 'mailbox') {
    const s = state.mailboxScan;
    if (!s || !s.scanned) return `<div class="td"><h2>${t('tileMailbox')}</h2><p>${t('mbxNotScannedYet')}</p></div>`;
    const e = s.email;
    return `<div class="td">
      <h2>${t('tileMailbox')}</h2>
      <div class="td-grid">
        <div class="td-block"><div class="td-k">${t('tdWhat')}</div><div>${t('tdMailboxWhat')}</div></div>
        <div class="td-block"><div class="td-k">${t('tdHow')}</div><div>${t('tdMailboxHow')}</div></div>
        <div class="td-block"><div class="td-k">${t('tdProposal')}</div><div>${t('tdMailboxProp', { agr: s.matchAgreementId || '—' })}</div></div>
      </div>
      ${e ? `<div class="eml-doc" style="margin:8px 0 14px">
        <div class="eml-h"><div><div class="eml-subj">${esc(e.subject)}</div>
        <div class="eml-meta">${t('mbxFrom')}: ${esc(e.from)} · ${esc(e.date)}</div></div>
        <span class="mbx-rel">⚑ ${t('mbxRelated')}</span></div>
        <div class="eml-body">${e.body}</div>
      </div>` : ''}
      <div class="td-impact">
        <div class="td-imp"><div class="l">${t('agreement')}</div><div class="v mono">${esc(s.matchAgreementId || '—')}</div></div>
        <div class="td-arrow">→</div>
        <div class="td-imp gold"><div class="l">${t('tdImpact')}</div><div class="v">${s.matchEur != null ? nf(s.matchEur) + ' EUR' : '—'}</div></div>
      </div>
    </div>`;
  }

  if (!meta) return `<div class="doc">—</div>`;

  const rows = meta.rows;
  const before = rows.reduce((s, b) => s + (b.before?.claimed || 0), 0);
  const after = rows.reduce((s, b) => s + (b.after?.entitled || b.before?.claimed || 0), 0);
  const rec = rows.filter((b) => b.recoverable).reduce((s, b) => s + recEur(b), 0);

  const drill = rows.slice(0, 40).map((b) => `<tr>
    <td class="mono">${esc(b.agreementId)}</td><td>${esc(b.supplierName || b.supplierId)}</td><td>${esc(b.scopeKey)}</td>
    <td class="num">${nf(b.before?.claimed || 0)} ${esc(b.currency)}</td>
    <td class="num">${nf(b.after?.entitled || 0)} ${esc(b.currency)}</td>
    <td class="num gold">${b.recoverable ? nf(recEur(b)) + ' EUR' : '—'}</td>
  </tr>`).join('');

  return `
    <div class="td">
      <h2>${t(meta.titleKey)}</h2>
      <div class="td-grid">
        <div class="td-block"><div class="td-k">${t('tdWhat')}</div><div>${t(meta.what)}</div></div>
        <div class="td-block"><div class="td-k">${t('tdHow')}</div><div>${t(meta.how)}</div></div>
        <div class="td-block"><div class="td-k">${t('tdProposal')}</div><div>${t(meta.prop)}</div></div>
      </div>
      <div class="td-impact">
        <div class="td-imp"><div class="l">${t('tdBefore')}</div><div class="v">${nf(before)} EUR</div></div>
        <div class="td-arrow">→</div>
        <div class="td-imp"><div class="l">${t('tdAfter')}</div><div class="v">${nf(after)} EUR</div></div>
        <div class="td-imp gold"><div class="l">${t('tdImpact')}</div><div class="v">${nf(rec)} EUR</div></div>
      </div>
      <h4>${t('tdBreakdown')} <span class="small">(${rows.length})</span></h4>
      <table><thead><tr>
        <th>${t('agreement')}</th><th>${t('supplier')}</th><th>${t('scope')}</th>
        <th class="num">${t('colOriginal')}</th><th class="num">${t('colRecomputed')}</th><th class="num">${t('colTrueUp')}</th>
      </tr></thead><tbody>${drill || `<tr><td colspan="6" class="small">—</td></tr>`}</tbody></table>
    </div>`;
}

function tileCard(tl) {
  const subs = (tl.subs || []).map((s) => `<span class="tile-sub">${esc(s)}</span>`).join('');
  const flag = tl.flag ? `<span class="tile-flag">⚑ ${esc(t('miBadge'))}</span>` : '';
  const note = tl.note ? `<div class="tile-note">${esc(tl.note)}</div>` : '';
  return `<button class="sum-tile tile-${tl.size} tile-${tl.kind}${tl.review ? ' tile-review' : ''}" data-tile="${esc(tl.id)}">
    <div class="tile-h"><span class="tile-ico">${tileIcon(tl.icon)}</span><span class="tile-title">${esc(tl.title)}</span>${flag}</div>
    <div class="tile-big">${esc(tl.big)}</div>
    <div class="tile-subs">${subs}</div>
    ${note}
    <div class="tile-cta">${esc(tl.cta || t('tileOpenDetails'))} →</div>
  </button>`;
}

export function renderInputsSummary(state) {
  // counts keyed by flow-node key (same keys as the store collections)
  const flowCounts = {};
  for (const n of FLOW_NODES) { const cat = DOC_CATS.find((c) => c.key === n.key); flowCounts[n.key] = cat ? state.store.all(cat.coll).length : 0; }

  const { tiles, totals } = summaryTiles(state);

  // The results block (tiles + summary row) is revealed only after the ingest
  // + ML analysis animation completes. On return visits (state.ingestDone) it's
  // shown immediately and both top windows render in their finished static state.
  const done = !!state.ingestDone;

  return `
    <p class="lead">${t('summaryLead')}</p>

    <div class="sum-top">
      <div class="sum-top-left">${renderIngestFlow(flowCounts, { done })}</div>
      <div class="sum-top-right">${renderMlAnalysisPanel({ done })}</div>
    </div>

    <div class="sum-result${done ? '' : ' sum-result-hidden'}" id="sumResult">
      <p class="small sum-tiles-note">${t('tilesLensNote')}</p>
      <div class="sum-tiles">${tiles.map(tileCard).join('')}</div>

      <div class="sum-close-row">
        <div class="sum-close-figs">
          <span class="scf"><strong>${nf(totals.findN)}</strong> ${t('summaryDiscrepancies')}</span>
          <span class="scf"><strong>${nf(totals.cleanN)}</strong> ${t('summaryClean')}</span>
          <span class="scf gold"><strong>${nf(totals.recoverEur)} EUR</strong> ${t('summaryRecoverable')}</span>
        </div>
        <button class="btn dark big" id="sum-continue">${t('summaryContinue')} →</button>
      </div>
    </div>
  `;
}

// ---- ML Discovery (compact before/after summary + expandable findings) --
export function renderMl(state) {
  const d = state.discovery;
  const ba = state.beforeAfter || [];
  const totalBefore = ba.reduce((s, b) => s + (b.before?.claimed || 0), 0);
  const totalAfter = ba.reduce((s, b) => s + (b.after?.entitled || 0), 0);
  // portfolio framing: everything, then the clean (no-issue) slice, then the
  // engine-claimed "before" on the flagged agreements.
  const totalAll = ba.reduce((s, b) => s + (b.after?.entitled || b.before?.claimed || 0), 0);
  const cleanRows = ba.filter((b) => !b.recoverable);
  const skippedAmt = cleanRows.reduce((s, b) => s + (b.before?.claimed || 0), 0);
  const skippedN = cleanRows.length;

  // Total portfolio -> Skipped (no issue) -> CCOGS Engine (before) -> reconstructed (after)
  const summary = `
    <div class="ba ba-compact ba-ml">
      <div class="panel total"><div class="h">${t('mlTotalAmount')}</div><div class="big">${nf(totalAll)}</div><div class="small">${t('allAgreements')}</div></div>
      <div class="arrow">›</div>
      <div class="panel skipped"><div class="h">${t('mlSkippedClean')}</div><div class="big">${nf(skippedAmt)}</div><div class="small">${skippedN} ${t('cleanDeliveries')}</div></div>
      <div class="arrow">›</div>
      <div class="panel before"><div class="h">${t('before')}</div><div class="big">${nf(totalBefore)}</div><div class="small">${t('engineClaimed')}</div></div>
      <div class="arrow">→</div>
      <div class="panel after"><div class="h">${t('after')}</div><div class="big">${nf(totalAfter)}</div><div class="small">${t('toolEntitled')} · ${t('controlPeriod')}</div></div>
    </div>`;

  return `
    <p class="lead">${t('mlFlowLead')}</p>
    <div class="ml-legend">
      <div>${t('legOriginal')}</div>
      <div>${t('legRecomputed')}</div>
      <div>${t('legTrueUp')}</div>
      <div>${t('legPriority')}</div>
    </div>
    ${summary}
    ${mlPanel(state)}
  `;
}

function mlPanel(state) {
  const d = state.discovery;
  // findings — each is an expandable card with full derivation
  const cards = d.findings.slice(0, 14).map((f) => mlFindingCard(f, state)).join('');
  return `<div class="mlpanel"><h4>${t('nodeFindings')}</h4>
    <div class="ml-findhead ml-cols">
      <span>${t('colSupplierAgreement')}</span><span>${t('scope')}</span>
      <span class="num">${t('colOriginal')}</span><span class="num">${t('colRecomputed')}</span><span class="num">${t('colTrueUp')}</span><span class="num">${t('colPriority')}</span>
    </div>
    ${cards || '<div class="small">—</div>'}
  </div>`;
}

// Discrepancy panel for a missing-invoice finding: shows the three-way mismatch
// (agreement + delivery note + goods receipts all present, but the supplier
// invoice and the CCOGS engine output are missing) plus the linked GRN receipts.
// This is the "what was found / how it was found" the user asked to surface.
export function miDiscrepancyBlock(mi, group, cur) {
  const reasonKey = mi.reason === 'ERP_REJECTED' ? 'miReasonRejected' : 'miReasonNever';
  const dn = group ? group.deliveryNotes.length : 0;
  const rc = group ? group.receipts.length : 0;
  const tie = [
    { k: 'agreement', ok: true, label: t('miTieAgreement') },
    { k: 'delivery', ok: dn > 0, label: t('miTieDelivery', { n: dn }) },
    { k: 'receipts', ok: rc > 0, label: t('miTieReceipts', { n: rc }) },
    { k: 'invoice', ok: false, label: t('miTieInvoice') },
    { k: 'ccogs', ok: false, label: t('miTieCcogs') },
  ];
  const rows = tie.map((x) =>
    `<li class="mi-tie ${x.ok ? 'ok' : 'bad'}"><span class="mi-tick">${x.ok ? '✓' : '✕'}</span>${esc(x.label)}</li>`).join('');
  const refs = (mi.receiptRefs || []).slice(0, 12).map((r) => `<span class="mi-ref mono">${esc(r)}</span>`).join(' ');
  return `<div class="mi-disc">
    <div class="mi-disc-head">⚑ ${t('miDiscTitle')} <span class="mi-reason">${t(reasonKey)}</span></div>
    <p class="small">${t('miDiscLead')}</p>
    <ul class="mi-ties">${rows}</ul>
    <div class="mi-proposal"><strong>${t('miProposalLabel')}:</strong> ${t('miProposal', { units: nf(mi.units || 0), cur })}</div>
    ${refs ? `<div class="mi-refs"><span class="small">${t('miEvidence')}:</span> ${refs}</div>` : ''}
  </div>`;
}

export function mlFindingCard(f, state = {}) {
  const dv = f.derivation || {};
  const c = f.currency;
  const drivers = (dv.driverContributions || []).map((d) =>
    `<tr><td>${esc(d.driver.replace(/_/g, ' '))}</td><td class="num">+${nf(d.units)}</td><td class="small">${esc(d.note || '')}</td></tr>`).join('');
  const tb = dv.tierBefore || {}; const ta = dv.tierAfter || {};

  // group data (per-country roll-up + goods receipts behind the base) — moved here
  // from the old Consolidation stage.
  const group = state.consolidated?.byAgreement?.get(f.agreementId) || null;
  const rec = (state.reconstructions || []).find((r) => r.agreementId === f.agreementId);
  const byCountry = {};
  if (rec) for (const v of rec.volumes) for (const [cc, val] of Object.entries(v.byCountry || {})) byCountry[cc] = (byCountry[cc] ?? 0) + val;
  const countryRows = Object.entries(byCountry).map(([cc, v]) => `<tr><td>${cc}</td><td class="num">${nf(v)}</td><td class="small">${f.scopeKey === 'PAN_EU' ? t('rolledCombined') : t('measuredStandalone')}</td></tr>`).join('');
  const receipts = group ? group.receipts : [];
  const receiptRows = receipts.slice(0, 30).map((r) => `<tr><td class="mono">${esc(r.grnNumber || r.receiptId)}</td><td>${r.country}</td><td>${esc(r.storageId || '')}</td><td class="num">${nf(r.qtyReceived)}</td><td>${esc(r.receiptDate)}</td></tr>`).join('');

  // finance-approver actions live on the finding (open the full review + True-Up modal).
  // All buttons route through the same review document; the modal gates approve/reject/
  // export/inject to the Finance Approver role.
  const charge = (state.charges || []).find((x) => x.agreementId === f.agreementId && x.scopeKey === f.scopeKey);
  const actionBar = charge
    ? `<div class="mf-actionbar">
        <div class="mf-actrow">
          <button class="btn tint-green" data-review="${charge.chargeId}">${t('reviewDoc')}</button>
          <button class="btn tint-orange" data-archive="${charge.chargeId}">${t('rejectArchive')}</button>
          <button class="btn tint-ghost" data-exportdlg="${charge.chargeId}">${t('exportFile')}</button>
          <button class="btn tint-blue mf-gen" data-genfinding="${charge.chargeId}">${t('genContraInvoice')}</button>
        </div>
        <div class="mf-actrow mf-actrow2">
          <button class="btn tint-amber" data-doc="agreements|${esc(f.agreementId)}">${t('showAgreement')}</button>
        </div>
      </div>`
    : '';

  // contract duration badge (Yearly / Quarterly / Monthly / Half-year / Promo)
  const windowType = group?.agreement?.windowType || null;
  const durLabel = windowType ? t('dur' + windowType.replace(/_/g, '')) : '';
  const durBadge = durLabel ? `<span class="dur-badge dur-${(windowType || '').toLowerCase()}">${esc(durLabel)}</span>` : '';

  // Missing-invoice discrepancy: distinct "manual check" badge + narrative.
  const mi = f.missingInvoice || null;
  const miBadge = mi
    ? `<span class="mi-badge" title="${esc(t('miManualCheck'))}">⚑ ${esc(t('miBadge'))}</span>`
    : '';
  const storyHtml = mi
    ? t(mi.reason === 'ERP_REJECTED' ? 'miStoryRejected' : 'miStoryNever', {
        cur: c, units: nf(mi.units || dv.reconstructedVolume), reconV: nf(dv.reconstructedVolume),
        rateA: ((ta.rate || 0) * 100).toFixed(2), tierA: ta.idx >= 0 ? ta.idx + 1 : '—',
        entitled: nf(f.entitled), leak: nf(f.leakage),
      })
    : t(tb.idx !== ta.idx ? 'mlStoryTierMove' : 'mlStorySameTier', {
        claimed: nf(f.claimed), cur: c, engV: nf(dv.engineVolume), reconV: nf(dv.reconstructedVolume),
        baseV: nf(dv.baseVolume), restored: nf(dv.restoredUnits),
        tierA: ta.idx >= 0 ? ta.idx + 1 : '—', rateA: ((ta.rate || 0) * 100).toFixed(2),
        tierB: tb.idx >= 0 ? tb.idx + 1 : '—', rateB: ((tb.rate || 0) * 100).toFixed(2),
        entitled: nf(f.entitled), leak: nf(f.leakage),
      });

  return `<details class="mlfind${mi ? ' mlfind-mi' : ''}">
    <summary class="ml-cols">
      <span class="mf-main"><span class="chev">▶</span><strong>${esc(f.supplierName ?? f.supplierId)}</strong> <span class="mono">${f.agreementId}</span>${durBadge}${miBadge}</span>
      <span class="mf-scope">${f.scopeKey}</span>
      <span class="num mf-before">${nf(f.claimed)} ${c}</span>
      <span class="num mf-after">${nf(f.entitled)} ${c}</span>
      <span class="num mf-leak"><strong>${nf(f.leakage)} ${c}</strong></span>
      <span class="num mf-prio"><span class="prio-badge">${(f.priority * 100).toFixed(0)}</span></span>
    </summary>
    <div class="mf-body">
      <p class="mf-story${mi ? ' mf-story-mi' : ''}">${storyHtml}</p>
      ${mi ? miDiscrepancyBlock(mi, group, c) : ''}

      ${actionBar}

      <div class="mf-cols">
        <div>
          <h5>${t('whereVolume')}</h5>
          <table><thead><tr><th>${t('colSource')}</th><th class="num">${t('colUnits')}</th><th>${t('colWhy')}</th></tr></thead><tbody>
            <tr><td>${t('baseReceipts')}</td><td class="num">${nf(dv.baseVolume)}</td><td class="small">${t('baseReceiptsWhy')}</td></tr>
            ${drivers || `<tr><td colspan=3 class=small>${t('noDriverCorr')}</td></tr>`}
            <tr class="mf-total"><td>${t('reconQualifying')}</td><td class="num">${nf(dv.reconstructedVolume)}</td><td></td></tr>
          </tbody></table>
        </div>
        <div>
          <h5>${t('moneyBeforeAfter')}</h5>
          <table><tbody>
            <tr><td>${t('origClaimed')}</td><td class="num">${nf(f.claimed)} ${c}</td></tr>
            <tr><td>${t('recompEntitled')}</td><td class="num">${nf(f.entitled)} ${c}</td></tr>
            <tr class="mf-total"><td>${t('trueUpRecoverable')}</td><td class="num">${nf(f.leakage)} ${c}</td></tr>
          </tbody></table>
          <p class="small">${t('underClaimLift', { lift: dv.liftPct, prio: (f.priority * 100).toFixed(0), conf: (f.confidence * 100).toFixed(0) })}</p>
        </div>
      </div>

      <h5>${t('perCountryRoll')} ${f.scopeKey === 'PAN_EU' ? t('combinedPanEu') : t('standalone')}</h5>
      <table><thead><tr><th>${t('colCountry')}</th><th class="num">${t('colQualQty')}</th><th>${t('colAggregation')}</th></tr></thead><tbody>${countryRows || '<tr><td colspan=3 class=small>—</td></tr>'}</tbody></table>

      <h5>${t('goodsBehindBase')} (${receipts.length})</h5>
      <table><thead><tr><th>GRN</th><th>${t('colCountry')}</th><th>${t('colWarehouse')}</th><th class="num">${t('qty')}</th><th>${hintSpan(t('controlPeriod'), 'CONTROL_PERIOD')}</th></tr></thead><tbody>${receiptRows || '<tr><td colspan=5 class=small>—</td></tr>'}</tbody></table>
    </div>
  </details>`;
}
