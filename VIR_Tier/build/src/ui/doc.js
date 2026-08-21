// Realistic document rendering for the Inputs "view document" modal.
// Invoice + delivery-note layouts mirror the old Perfumeries tool (letterhead,
// parties, meta grid, line tables, totals, VAT, e-invoice badge, warehouse
// split). Goods-receipt (GRN) and missing-data (OSD exception) layouts follow
// the standard real-world formats (researched). All use the light theme's
// `.invoice-doc / .doc-*` classes.

import { t } from '../lib/i18n.js';
import { BUYER, supplierFor, productName, warehouseInfo, contactFor, SETTLEMENT_TERMS } from '../lib/companies.js';
import { regNote } from '../lib/regnotes.js';
import { JOURNEY_ORDER } from '../lib/enums.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const qtyf = (n) => (Number(n) || 0).toLocaleString();
const cur = (n, c) => `${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c || ''}`.trim();
const VAT_RATE = 0.20;
function addDays(dateStr, days) { const d = new Date(dateStr || Date.now()); if (Number.isNaN(d.getTime())) return dateStr || ''; d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

// Enum-value label resolvers. Each maps a controlled enum VALUE to a localized
// label via t(); if the key is missing (t() returns the key unchanged) we fall
// back to a humanized version of the raw value so unknown values degrade
// gracefully. Business DATA values are never mutated — only their display.
const labelOr = (key, fallback) => { const v = t(key); return v === key ? String(fallback) : v; };
const humanize = (s) => String(s ?? '').replace(/_/g, ' ');
const dstLabel = (s) => (s == null || s === '' ? '—' : labelOr('dst' + s, humanize(s)));
const drvLabel = (s) => labelOr('drv_' + s, humanize(s));
const basisLabel = (s) => labelOr('basis_' + s, humanize(s).toLowerCase());
const rsLabel = (s) => labelOr('rs_' + s, humanize(s).toLowerCase());
const wtLabel = (s) => labelOr('wt_' + s, humanize(s).toLowerCase());
const rrLabel = (s) => labelOr('rr_' + s, humanize(s).toLowerCase());
const engDocTypeLabel = (s) => labelOr('engDoc_' + s, humanize(s));

function party(title, p) {
  return `<div class="doc-party"><div class="doc-party-t">${title}</div>
    <strong>${esc(p.name)}</strong><br>${esc(p.street)}<br>${esc(p.city)}<br>${esc(p.country)}
    <div class="doc-ids"><span>IČO/Reg: ${esc(p.ico ?? '—')}</span><span>DIČ: ${esc(p.dic ?? '—')}</span><span>VAT: ${esc(p.vat ?? '—')}</span></div>
  </div>`;
}

// ---- Invoice ----
// ---- Invoice process-journey visual ----
// Steps: Invoice -> Order -> Fulfillment -> Truck driving -> Truck waiting ->
// Unloaded & scanned (delivery note) -> Distributed to town WH.
// Last reached step = active/done; future = faded; a SKIPPED step whose later
// step is reached shows as an inactive GAP (the tool being clever: goods
// delivered but a scan was missed).
// i18n keys for the journey step labels (resolved at render time via t()).
const JOURNEY_LABEL_KEY = {
  INVOICE: 'jsInvoice', ORDER: 'jsOrder', FULFILLMENT: 'jsFulfillment', TRUCK_DRIVING: 'jsTruckDriving',
  TRUCK_WAITING: 'jsTruckWaiting', UNLOADED_SCANNED: 'jsUnloaded', DISTRIBUTED_TOWN: 'jsTown',
};
const jlabel = (key) => t(JOURNEY_LABEL_KEY[key] || key);
const JOURNEY_ICON = {
  INVOICE: '🧾', ORDER: '📝', FULFILLMENT: '📦', TRUCK_DRIVING: '🚚',
  TRUCK_WAITING: '⏳', UNLOADED_SCANNED: '🏭', DISTRIBUTED_TOWN: '🏪',
};

// Compute the journey state from a set of receipts (delivered goods). Returns
// { steps, skipped } used by both the delivery-note / GRN strip and finance.
function journeyStateFor(receipts) {
  let reachedIdx = JOURNEY_ORDER.indexOf('TRUCK_WAITING'); // default: arrived, awaiting unload
  let skipped = null;
  const anyTown = receipts.some((r) => r.warehouseKind === 'TOWN');
  const anySkip = receipts.some((r) => r.scannedAtMain === false);
  const anyMainScan = receipts.some((r) => r.scannedAtMain !== false && (r.warehouseKind === 'MAIN' || !r.warehouseKind));
  if (anySkip || (anyTown && !anyMainScan)) {
    reachedIdx = JOURNEY_ORDER.indexOf('DISTRIBUTED_TOWN');
    skipped = 'UNLOADED_SCANNED';
  } else if (anyMainScan && anyTown) {
    reachedIdx = JOURNEY_ORDER.indexOf('DISTRIBUTED_TOWN');
  } else if (anyMainScan) {
    reachedIdx = JOURNEY_ORDER.indexOf('UNLOADED_SCANNED');
  } else if (receipts.length) {
    reachedIdx = JOURNEY_ORDER.indexOf('UNLOADED_SCANNED');
  }
  for (const r of receipts) { const i = JOURNEY_ORDER.indexOf(r.reachedStep); if (i > reachedIdx) reachedIdx = i; }

  const steps = JOURNEY_ORDER.map((key, i) => {
    let state = 'future';
    if (key === skipped) state = 'skipped';
    else if (i <= reachedIdx) state = 'done';
    if (i === reachedIdx && state === 'done') state = 'active';
    return { key, label: jlabel(key), icon: JOURNEY_ICON[key], state };
  });
  return { steps, skipped };
}

// Reusable process-journey strip for a set of receipts (used on delivery notes
// and goods receipts — no longer on the invoice).
export function processJourney(receipts, { title = null } = {}) {
  const { steps, skipped } = journeyStateFor(receipts || []);
  const note = skipped
    ? `<div class="jn-note">${t('journeySkipNote')}</div>`
    : '';
  const stepsHtml = steps.map((s, i) => `
    <div class="jstep ${s.state}">
      <div class="jstep-ico">${s.icon}</div>
      <div class="jstep-lbl">${s.label}</div>
    </div>${i < steps.length - 1 ? `<div class="jconn ${steps[i + 1].state === 'future' || s.state === 'future' ? 'future' : (s.state === 'skipped' || steps[i + 1].state === 'skipped' ? 'gap' : 'done')}"></div>` : ''}`).join('');
  return `<section class="doc-split"><h4 class="doc-split-h">${esc(title || t('processJourney'))}</h4>
    <div class="journey">${stepsHtml}</div>${note}</section>`;
}

// Which journey stage each leakage-driver issue belongs to (where in the flow
// the problem happens). Drives the per-stage issue-type chips in finance.
const DRIVER_STAGE = {
  BACKORDERING: 'ORDER',
  EXPIRED_WINDOW_LATE_DELIVERY: 'ORDER',
  LATE_SHIPMENT: 'TRUCK_DRIVING',
  PAN_EU_SPLIT: 'TRUCK_WAITING',
  RETURN_REJECTION: 'UNLOADED_SCANNED',
  OVERAGE_SHIPMENT: 'UNLOADED_SCANNED',
  FORGOTTEN_SKU: 'UNLOADED_SCANNED',
  FOUND_LATER_PALLET: 'UNLOADED_SCANNED',
  REROUTE_SKIPPED_SCAN: 'DISTRIBUTED_TOWN',
};
// i18n keys for the short issue label per driver (chips)
const DRIVER_ISSUE_KEY = {
  BACKORDERING: 'issBackordered',
  EXPIRED_WINDOW_LATE_DELIVERY: 'issLateWindow',
  LATE_SHIPMENT: 'issLateDelivery',
  PAN_EU_SPLIT: 'issPanEu',
  RETURN_REJECTION: 'issReturned',
  OVERAGE_SHIPMENT: 'issOverage',
  FORGOTTEN_SKU: 'issSkuNotSys',
  FOUND_LATER_PALLET: 'issMissedScan',
  REROUTE_SKIPPED_SCAN: 'issRerouted',
};

// Finance journey: aggregate every goods movement across the portfolio and,
// per stage of travel, show how many are healthy plus the concrete ISSUE TYPES
// occurring at that stage (late, missed scan, returned, SKU not in system,
// rerouted…). `corrections` = flat list of reconstruction corrections.
export function financeJourney(receipts, corrections = []) {
  const all = receipts || [];
  const reachedCount = {};
  for (const key of JOURNEY_ORDER) reachedCount[key] = 0;
  for (const r of all) {
    const { steps } = journeyStateFor([r]);
    const active = steps.find((s) => s.state === 'active');
    if (active) reachedCount[active.key] = (reachedCount[active.key] || 0) + 1;
  }

  // issue-type counts per stage, from the real reconstruction corrections
  const stageIssues = {};      // stage -> { driver: count }
  for (const key of JOURNEY_ORDER) stageIssues[key] = {};
  let totalIssues = 0;
  for (const c of corrections) {
    if (!c || !c.volumeDelta) continue;
    const stage = DRIVER_STAGE[c.driver] || 'UNLOADED_SCANNED';
    stageIssues[stage][c.driver] = (stageIssues[stage][c.driver] || 0) + 1;
    totalIssues++;
  }

  const stepsHtml = JOURNEY_ORDER.map((key, i) => {
    const issues = stageIssues[key];
    const issueN = Object.values(issues).reduce((a, b) => a + b, 0);
    const st = issueN > 0 ? 'skipped' : (reachedCount[key] > 0 ? 'done' : 'future');
    const chips = Object.entries(issues)
      .sort((a, b) => b[1] - a[1])
      .map(([drv, n]) => `<span class="jissue">${esc(t(DRIVER_ISSUE_KEY[drv] || drv))} ·${n}</span>`).join('');
    const countTxt = issueN > 0 ? `${issueN} ${issueN > 1 ? t('issueMany') : t('issueOne')}` : (reachedCount[key] > 0 ? `${reachedCount[key]} ${t('okCount')}` : '—');
    return `
      <div class="jstep-wrap">
        <div class="jstep ${st}">
          <div class="jstep-ico">${JOURNEY_ICON[key]}</div>
          <div class="jstep-lbl">${jlabel(key)}</div>
          <div class="jstep-count ${issueN > 0 ? 'warn' : ''}">${countTxt}</div>
        </div>
        <div class="jissues">${chips}</div>
      </div>${i < JOURNEY_ORDER.length - 1 ? `<div class="jconn ${reachedCount[JOURNEY_ORDER[i + 1]] > 0 ? 'done' : 'future'} finance"></div>` : ''}`;
  }).join('');
  return `<section class="doc-split"><h4 class="doc-split-h">${t('finJourneyTitle', { n: totalIssues })}</h4>
    <p class="muted small">${t('finJourneyNote')}</p>
    <div class="journey journey-finance">${stepsHtml}</div></section>`;
}

// Line-item distribution by storage (per invoice), mirroring the perfumeries
// tool. Uses per-line targetStorage; falls back to the group's delivery notes.
function lineItemStorageSplit(inv, group) {
  const notes = (group?.deliveryNotes || []).filter((d) => (d.invoiceRefs || [d.invoiceNumber]).includes(inv.invoiceNumber));
  // qty[stockId][storage] = shipped
  const qtyMap = {};
  const addQty = (sku, storage, q) => { if (!storage) return; (qtyMap[sku] ||= {}); qtyMap[sku][storage] = (qtyMap[sku][storage] || 0) + q; };
  if (notes.length) {
    for (const n of notes) for (const l of n.lines) addQty(l.stockId, l.targetStorage || n.targetStorageId, l.qtyShipped || 0);
  } else {
    // fall back to invoice line target storage
    for (const l of inv.lines) addQty(l.stockId, l.targetStorage, l.qtyInvoiced || 0);
  }
  const storages = [...new Set(Object.values(qtyMap).flatMap((m) => Object.keys(m)))].sort();
  if (!storages.length) return '';
  const head = `<th>${t('docDescription')}</th>` + storages.map((s) => `<th class="num">${esc(s)}<div class="doc-sub-sku">${esc(warehouseInfo(s).city)}</div></th>`).join('') + `<th class="num">${t('docTotal')}</th>`;
  const rows = inv.lines.map((l) => {
    const per = qtyMap[l.stockId] || {};
    const cells = storages.map((s) => `<td class="num">${per[s] ? qtyf(per[s]) : '—'}</td>`).join('');
    const total = storages.reduce((sum, s) => sum + (per[s] || 0), 0);
    return `<tr><td>${esc(productName(l.stockId, l.description))}<div class="doc-sub-sku">${esc(l.stockId)}</div></td>${cells}<td class="num">${qtyf(total)}</td></tr>`;
  }).join('');
  const totalsRow = `<tr class="split-total"><td>${t('docTotalRow')}</td>` +
    storages.map((s) => `<td class="num">${qtyf(inv.lines.reduce((sum, l) => sum + ((qtyMap[l.stockId] || {})[s] || 0), 0))}</td>`).join('') +
    `<td class="num">${qtyf(Object.values(qtyMap).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0))}</td></tr>`;
  return `<section class="doc-split">
    <h4 class="doc-split-h">${t('docStorageSplitH')}</h4>
    <p class="muted small">${t('docStorageSplitNote')}</p>
    <table class="doc-lines"><thead><tr>${head}</tr></thead><tbody>${rows}${totalsRow}</tbody></table>
  </section>`;
}

export function invoiceDocHtml(inv, group = null) {
  const sup = supplierFor(inv.supplierId);
  const isProforma = inv.type === 'proforma';
  const rows = inv.lines.map((l) => {
    const unit = l.unitPrice || 0; const net = unit * l.qtyInvoiced; const vat = net * VAT_RATE;
    return { name: productName(l.stockId, l.description), sku: l.stockId, qty: l.qtyInvoiced, unit, net, vat, total: net + vat, store: l.targetStorage };
  });
  const subtotal = rows.reduce((s, r) => s + r.net, 0);
  const vatTotal = rows.reduce((s, r) => s + r.vat, 0);
  const grand = subtotal + vatTotal;
  const c = inv.currency || 'EUR';
  const lineRows = rows.map((r) => `<tr>
    <td>${esc(r.name)}<div class="doc-sub-sku">${esc(r.sku)}${r.store ? ' · ' + esc(r.store) : ''}</div></td>
    <td class="num">${qtyf(r.qty)}</td><td class="num">${cur(r.unit, c)}</td>
    <td class="num">${cur(r.net, c)}</td><td class="num">${cur(r.vat, c)}</td><td class="num">${cur(r.total, c)}</td></tr>`).join('');
  return `<article class="invoice-doc">
    <header class="doc-head"><div class="doc-brand">${esc(sup.name)}</div>
      <div class="doc-title">${isProforma ? t('docProformaTitle') : t('docInvoiceTitle')}</div></header>
    <div class="doc-parties">${party(t('docSupplier'), sup)}${party(t('docBuyer'), BUYER)}</div>
    <div class="doc-meta">
      <div><span>${t('docInvoiceNo')}</span><strong>${esc(inv.invoiceNumber)}</strong></div>
      <div><span>${t('docIssueDate')}</span><strong>${esc(inv.invoiceDate ?? '')}</strong></div>
      <div><span>${t('docDelivery')}</span><strong>${esc(inv.shipDate ?? inv.invoiceDate ?? '')}</strong></div>
      <div><span>${t('docDueDate')}</span><strong>${esc(addDays(inv.invoiceDate, 30))}</strong></div>
      <div><span>${t('docPoRef')}</span><strong>${esc(inv.poReference ?? '—')}</strong></div>
      <div><span>${t('docIncoterms')}</span><strong>${esc(inv.incoterms ?? '—')}</strong></div>
    </div>
    <table class="doc-lines"><thead><tr>
      <th>${t('docDescription')}</th><th class="num">${t('docQty')}</th><th class="num">${t('docUnit')}</th><th class="num">${t('docNet')}</th><th class="num">${t('docVat20')}</th><th class="num">${t('docTotal')}</th>
    </tr></thead><tbody>${lineRows}</tbody></table>
    <div class="doc-totals">
      <div><span>${t('docSubtotal')}</span><strong>${cur(subtotal, c)}</strong></div>
      <div><span>${t('docVatLine')}</span><strong>${cur(vatTotal, c)}</strong></div>
      <div class="grand"><span>${t('docTotalDue')}</span><strong>${cur(grand, c)}</strong></div>
    </div>
    <div class="doc-pay">
      <div><span>${t('docBank')}</span> ${esc(sup.bank ?? '—')}</div>
      <div><span>${t('docIban')}</span> ${esc(sup.iban ?? '—')}</div>
      <div><span>${t('docCurrency')}</span> ${esc(c)}</div>
    </div>
    <p class="doc-reg">${t('docContraNote', { id: esc(inv.agreementId ?? '—') })}</p>
    <p class="doc-einv">${t('docEInvoiceBadge')}</p>
    ${lineItemStorageSplit(inv, group)}
    ${tierBlock(inv)}
  </article>`;
}
// ---- Contra-COGS debit invoice (issued BY buyer TO supplier) ----
// A professional supplier-facing document. Parties are REVERSED vs a normal
// invoice (the buyer is the issuer, the supplier is the recipient) per rebate
// settlement regulations. Line descriptions are framed for the supplier —
// what is being claimed and why (rebate shortfall on delivered volume), not the
// internal engine's technical leakage cause.
// Driver -> i18n key for the supplier-facing rebate-claim clause. Resolved via
// t() at render time. A driver has a mapped clause iff its key resolves.
const CONTRA_LINE_KEY = {
  TIER_UPLIFT: 'contraTIER_UPLIFT',
  REROUTE_SKIPPED_SCAN: 'contraREROUTE_SKIPPED_SCAN',
  EXPIRED_WINDOW_LATE_DELIVERY: 'contraEXPIRED_WINDOW_LATE_DELIVERY',
  FORGOTTEN_SKU: 'contraFORGOTTEN_SKU',
  FOUND_LATER_PALLET: 'contraFOUND_LATER_PALLET',
  RETURN_REJECTION: 'contraRETURN_REJECTION',
  OVERAGE: 'contraOVERAGE',
  BACKORDERING: 'contraBACKORDERING',
};
function contraLineLabel(l) {
  const key = CONTRA_LINE_KEY[l.driver];
  // If the driver has no mapped clause, prefer the itemized data cause verbatim.
  if (!key) return l.cause || t('contraDefaultLine');
  return t(key);
}

export function contraCogsInvoiceHtml(charge, group, reconstruction) {
  const sup = supplierFor(charge.supplierId || group?.agreement?.supplierId);
  const c = charge.currency || 'EUR';
  const issueDate = new Date().toISOString().slice(0, 10);
  const docNo = `CN-${String(charge.chargeId).replace(/^TU-?/, '')}`;

  // build line rows from the charge's itemized causes; framed for the supplier
  const lines = (charge.lines && charge.lines.length)
    ? charge.lines
    : [{ cause: t('contraDefaultCause'), driver: 'TIER_UPLIFT', qty: reconstruction?.totalQualifying || 0, fromPct: charge.tierFromPct, toPct: charge.tierToPct, deltaValue: charge.variance }];
  const lineRows = lines.map((l) => `<tr>
    <td>${esc(contraLineLabel(l))}${l.note ? `<div class="doc-sub-sku">${esc(l.note)}</div>` : ''}</td>
    <td class="num">${qtyf(l.qty)}</td>
    <td class="num">${l.fromPct != null ? l.fromPct + '%' : '—'} → ${l.toPct != null ? l.toPct + '%' : '—'}</td>
    <td class="num">${cur(l.deltaValue, c)}</td></tr>`).join('');
  const subtotal = lines.reduce((s, l) => s + (Number(l.deltaValue) || 0), 0) || charge.variance;

  return `<article class="invoice-doc contra-doc">
    <header class="doc-head"><div class="doc-brand">${esc(BUYER.name)}</div>
      <div class="doc-title">${t('docContraTitle')}</div></header>
    <div class="doc-parties">${party(t('docIssuedByBuyer'), BUYER)}${party(t('docBilledToSupplier'), sup)}</div>
    <div class="doc-meta">
      <div><span>${t('docDebitNo')}</span><strong>${esc(docNo)}</strong></div>
      <div><span>${t('docIssueDate')}</span><strong>${esc(issueDate)}</strong></div>
      <div><span>${t('docAgreementRef')}</span><strong>${esc(charge.agreementId)}</strong></div>
      <div><span>${t('docScope')}</span><strong>${esc(charge.scopeKey)}</strong></div>
      <div><span>${t('docPeriod')}</span><strong>${esc(charge.period)}</strong></div>
      <div><span>${t('docRebateBasis')}</span><strong>${esc(basisLabel(charge.basis || 'UNITS'))}</strong></div>
    </div>
    <p class="small">${t('docContraIntro', { buyer: esc(BUYER.name), ref: esc(charge.agreementId) })}</p>
    <table class="doc-lines"><thead><tr>
      <th>${t('docRebateClaimDesc')}</th><th class="num">${t('docQty')}</th><th class="num">${t('docRebateRate')}</th><th class="num">${t('docAmount')}</th>
    </tr></thead><tbody>${lineRows}
      <tr class="split-total"><td colspan="3">${t('docTotalRebateClaimed')}</td><td class="num">${cur(subtotal, c)}</td></tr>
    </tbody></table>
    <div class="doc-totals">
      <div><span>${t('docRebatePrevSettled')}</span><strong>${cur(charge.claimedCcogs, c)}</strong></div>
      <div><span>${t('docRebateNowDue')}</span><strong>${cur(charge.entitledCcogs, c)}</strong></div>
      <div class="grand"><span>${t('docAmountClaimed')}</span><strong>${cur(charge.variance, c)}${charge.eurEquivalent != null ? ` (${cur(charge.eurEquivalent, 'EUR')})` : ''}</strong></div>
    </div>
    <div class="doc-pay">
      <div><span>${t('docSettlement')}</span> ${t('docSettlementValue')}</div>
      <div><span>${t('docCurrency')}</span> ${esc(c)}</div>
      <div><span>${t('docReference')}</span> ${esc(charge.chargeId)}</div>
    </div>
    <p class="doc-reg">${t('docContraFooter')}</p>
    <p class="doc-einv">${t('docEDocBadge')}</p>
  </article>`;
}

function tierBlock(inv) {
  if (!inv.discountTiers || !inv.discountTiers.length) return '';
  const rows = inv.discountTiers.map((tr) => `<tr><td class="num">${qtyf(tr.minQty)}</td><td class="num">${tr.maxQty ?? '∞'}</td><td class="num">${tr.pct}%</td></tr>`).join('');
  return `<section class="doc-split"><h4 class="doc-split-h">${t('docTierBlockH')}</h4>
    <table class="doc-lines"><thead><tr><th class="num">From</th><th class="num">To</th><th class="num">Rebate %</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

// ---- Delivery note (consolidated) ----
export function deliveryNoteDocHtml(dn, group = null) {
  const multi = String(dn.targetStorageId).includes('+');
  const rows = dn.lines.map((l) => {
    const wi = warehouseInfo(l.targetStorage || dn.targetStorageId);
    return `<tr><td>${esc(l.invoiceRef ?? dn.invoiceNumber ?? '')}</td><td>${esc(l.targetStorage || dn.targetStorageId)}<div class="doc-sub-sku">${esc(wi.city)}</div></td>
      <td>${esc(productName(l.stockId, l.stockId))}</td><td class="num">${qtyf(l.qtyShipped)}</td></tr>`;
  }).join('');
  const totalShipped = dn.lines.reduce((s, l) => s + (l.qtyShipped || 0), 0);
  const invs = (dn.invoiceRefs && dn.invoiceRefs.length ? dn.invoiceRefs : [dn.invoiceNumber]).filter(Boolean);

  // invoice-style "from / to" header: dispatching entity (source store) -> receiver
  const firstStore = String(dn.targetStorageId).split('+')[0];
  const fromWi = warehouseInfo(firstStore);
  const shipFrom = { name: fromWi.entity || BUYER.name, street: BUYER.street, city: fromWi.city || BUYER.city, country: dn.country || BUYER.country, ico: BUYER.ico, dic: BUYER.dic, vat: BUYER.vat };
  const shipTo = multi
    ? { name: BUYER.name, street: BUYER.street, city: t('docMultiWh'), country: dn.country || BUYER.country, ico: BUYER.ico, dic: BUYER.dic, vat: BUYER.vat }
    : { name: fromWi.entity || BUYER.name, street: BUYER.street, city: fromWi.city || BUYER.city, country: dn.country || BUYER.country, ico: BUYER.ico, dic: BUYER.dic, vat: BUYER.vat };

  // related receipts drive the process-journey strip at the bottom
  const receipts = (group?.receipts || []).filter((r) => invs.includes(r.invoiceRef) || (dn.targetStorageId && String(dn.targetStorageId).split('+').includes(r.storageId)));

  return `<article class="invoice-doc">
    <header class="doc-head"><div class="doc-brand">${esc(fromWi.entity || BUYER.name)}</div><div class="doc-title">${t('docDeliveryTitle')}${multi ? t('docConsolidatedSuffix') : ''}</div></header>
    <div class="doc-parties">${party(t('docDispatchedFrom'), shipFrom)}${party(t('docShipTo'), shipTo)}</div>
    <div class="doc-meta">
      <div><span>${t('docDeliveryNote')}</span><strong>${esc(dn.deliveryNoteId)}</strong></div>
      <div><span>${t('docCoversInvoices')}</span><strong>${esc(invs.join(', '))}</strong></div>
      <div><span>${t('docShipDate')}</span><strong>${esc(dn.shipDate ?? '—')}</strong></div>
      <div><span>${t('docFromStore')}</span><strong>${esc(firstStore)} · ${esc(fromWi.city)}</strong></div>
      <div><span>${t('docStatus')}</span><strong>${esc(dstLabel(dn.deliveryStatus ?? ''))}</strong></div>
      <div><span>${t('docTotalShipped')}</span><strong>${qtyf(totalShipped)}</strong></div>
    </div>
    <p class="small">${multi ? t('docConsolidatedNote') : t('docSingleWhNote')}</p>
    <table class="doc-lines"><thead><tr><th>${t('docInvoice')}</th><th>${t('docWarehouse')}</th><th>${t('docDescription')}</th><th class="num">${t('docQtyShipped')}</th></tr></thead><tbody>${rows}</tbody></table>
    ${processJourney(receipts)}
  </article>`;
}

// ---- Goods Received Note (GRN) — standard receiving document ----
export function receiptDocHtml(r) {
  const wi = warehouseInfo(r.storageId || `WH-${r.country}-01`);
  const disc = (r.qtyOrdered != null && r.qtyReceived != null && r.qtyOrdered !== r.qtyReceived)
    ? t('docDiscBy', { word: t(r.qtyReceived > r.qtyOrdered ? 'docOverage' : 'docShort'), n: Math.abs(r.qtyReceived - r.qtyOrdered) })
    : t('docNone');
  return `<article class="invoice-doc">
    <header class="doc-head"><div class="doc-brand">${esc(wi.entity)}</div><div class="doc-title">${t('docGrnTitle')}</div></header>
    <div class="doc-meta">
      <div><span>${t('docGrnNo')}</span><strong>${esc(r.grnNumber ?? r.receiptId)}</strong></div>
      <div><span>${t('docPoRef')}</span><strong>${esc(r.poRef ?? '—')}</strong></div>
      <div><span>${t('docInvoiceRef')}</span><strong>${esc(r.invoiceRef ?? '—')}</strong></div>
      <div><span>${t('docWarehouse')}</span><strong>${esc(r.storageId ?? wi.code)} · ${esc(wi.city)}</strong></div>
      <div><span>${t('docReceivedDate')}</span><strong>${esc(r.receiptDate)}</strong></div>
      <div><span>${t('docInspectedBy')}</span><strong>${esc(r.inspectedBy ?? '—')}</strong></div>
    </div>
    <table class="doc-lines"><thead><tr>
      <th>${t('docItem')}</th><th class="num">${t('docOrdered')}</th><th class="num">${t('docReceived')}</th><th class="num">${t('docAccepted')}</th><th class="num">${t('docRejected')}</th><th>${t('docCondition')}</th>
    </tr></thead><tbody>
      <tr><td>${esc(productName(r.stockId, r.stockId))}<div class="doc-sub-sku">${esc(r.stockId)}</div></td>
        <td class="num">${r.qtyOrdered != null ? qtyf(r.qtyOrdered) : '—'}</td>
        <td class="num">${qtyf(r.qtyReceived)}</td>
        <td class="num">${r.qtyAccepted != null ? qtyf(r.qtyAccepted) : '—'}</td>
        <td class="num">${r.qtyRejected != null ? qtyf(r.qtyRejected) : '0'}</td>
        <td>${esc(r.condition ?? t('docGood'))}</td></tr>
    </tbody></table>
    <div class="doc-pay">
      <div><span>${t('docDiscrepancy')}</span> ${esc(disc)}</div>
      <div><span>${t('docControlPeriod')}</span> <span class="hint" data-note="CONTROL_PERIOD">${esc(r.receiptDate)}</span></div>
      <div><span>${t('docVatTaxPoint')}</span> ${r.vatTaxPointDate ? `<span class="hint" data-note="VAT_TAX_POINT">${esc(r.vatTaxPointDate)}</span>` : '—'}</div>
    </div>
    <p class="doc-reg">${t('docGrnFooter')}</p>
    ${processJourney([r])}
  </article>`;
}

// ---- Missing-data / OSD exception (Overage/Shortage/Damage) ----
export function eventDocHtml(ev) {
  const n = regNote(ev.type);
  return `<article class="invoice-doc">
    <header class="doc-head"><div class="doc-brand">${esc(BUYER.name)}</div><div class="doc-title">${t('docOsdTitle')}</div></header>
    <div class="doc-meta">
      <div><span>${t('docExceptionId')}</span><strong>${esc(ev.eventId)}</strong></div>
      <div><span>${t('docReasonCode')}</span><strong>${esc(drvLabel(ev.type))}</strong></div>
      <div><span>${t('docCountryWh')}</span><strong>${esc(ev.country)}</strong></div>
      <div><span>${t('docSku')}</span><strong>${esc(ev.stockId ?? '—')}</strong></div>
      <div><span>${t('docReported')}</span><strong>${esc(ev.eventDate ?? '—')}</strong></div>
      <div><span>${t('docIntendedDate')}</span><strong>${esc(ev.intendedDate ?? '—')}</strong></div>
    </div>
    <table class="doc-lines"><thead><tr><th>${t('docItem')}</th><th class="num">${t('docQtyAffected')}</th><th>${t('docBackorderQ')}</th><th>${t('docRefs')}</th></tr></thead>
      <tbody><tr><td>${esc(productName(ev.stockId, ev.stockId))}</td><td class="num">${qtyf(ev.qty)}</td>
        <td>${ev.type === 'BACKORDERING' ? t('docYes') : t('docNo')}</td><td class="mono">${esc((ev.refIds || []).join(', '))}</td></tr></tbody></table>
    <p class="doc-einv" style="background:#FBF3E2;border-color:#EAD9B0;color:#7a5a12">
      <span class="hint" data-note="${esc(ev.type)}">${t('docWhyMatters')}</span> ${esc(n.short)}
    </p>
    <p class="doc-reg">${esc(n.regulation)} · ${esc(n.sourceLabel)}</p>
  </article>`;
}

// ---- Agreement — rich supplier rebate agreement sheet ----
// `group` = consolidated group (invoices, receipts...); `ba` = beforeAfter rows for this agreement.
export function agreementDocHtml(a, group = null, ba = []) {
  const sup = supplierFor(a.supplierId);
  const contact = contactFor(a.supplierId);
  const settle = SETTLEMENT_TERMS[a.rebateStructure === 'RETROSPECTIVE_TIERED' || a.scope === 'PAN_EU' ? 'B' : 'A'] || SETTLEMENT_TERMS.B;
  const tiers = a.tiers || [];
  const c = (a.currencies && a.currencies[0]) || 'EUR';

  // Achieved metrics: sum qualifying volume + entitled from beforeAfter (the "after").
  const rows = (ba || []).filter((b) => b.agreementId === a.agreementId);
  const achievedVol = rows.reduce((s, b) => s + (b.after?.reconstructedVolume || 0), 0);
  const entitled = rows.reduce((s, b) => s + (b.after?.entitled || 0), 0);
  const claimed = rows.reduce((s, b) => s + (b.before?.claimed || 0), 0);
  const gap = rows.reduce((s, b) => s + (b.costOfInaction || 0), 0);

  // Which tier the achieved volume lands in, and progress to the next.
  let achievedIdx = -1;
  for (let i = 0; i < tiers.length; i++) { if (achievedVol >= tiers[i].threshold) achievedIdx = i; else break; }
  const nextTier = tiers[achievedIdx + 1] || null;
  const bandStart = achievedIdx >= 0 ? tiers[achievedIdx].threshold : 0;
  const bandEnd = nextTier ? nextTier.threshold : bandStart;
  const pct = nextTier ? Math.min(100, Math.round(((achievedVol - bandStart) / Math.max(1, bandEnd - bandStart)) * 100)) : 100;
  const achievedRate = achievedIdx >= 0 ? tiers[achievedIdx].rate : 0;

  const met = gap > 0.01 ? t('agrUnderClaimed') : t('agrOnTarget');
  const ribbonCls = gap > 0.01 ? 'agr-ribbon warn' : 'agr-ribbon ok';

  // SKU schedule (Schedule A). Prefer the contract's declared SKU set; fall back
  // to SKUs seen on invoices. Flag SKUs the internal engine never configured.
  const engineCfg = new Set(a.engineConfiguredSkus || a.skuSet || []);
  const skuList = (a.skuSet && a.skuSet.length)
    ? a.skuSet
    : [...new Set((group?.invoices || []).flatMap((iv) => iv.lines.map((l) => l.stockId)))];
  const skuRows = (skuList.length ? skuList : ['—']).map((s, i) => {
    const missing = a.skuSet && a.skuSet.length && !engineCfg.has(s);
    return `<tr><td class="num">${i + 1}</td><td class="mono">${esc(s)}</td><td>${esc(productName(s, s))}</td>
      <td>${missing ? `<span class="pill warn">${t('agrPillNotEngine')}</span>` : `<span class="pill ok">${t('agrPillTracked')}</span>`}</td></tr>`;
  }).join('');

  // invoices applied under this agreement (Schedule C)
  const invs = group?.invoices || [];
  const invRows = invs.map((iv) => {
    const q = iv.lines.reduce((s2, l) => s2 + (l.qtyInvoiced || 0), 0);
    const inWin = a.effectiveFrom && a.effectiveTo && iv.invoiceDate && iv.invoiceDate >= a.effectiveFrom && iv.invoiceDate <= a.effectiveTo;
    return `<tr><td class="mono">${esc(iv.invoiceNumber)}</td><td>${esc(iv.country || '')}</td><td>${esc(iv.invoiceDate || '')}</td>
      <td>${inWin ? `<span class="pill ok">${t('agrPillInWindow')}</span>` : `<span class="pill warn">${t('agrPillOutside')}</span>`}</td>
      <td class="num">${qtyf(q)}</td><td class="num">${cur(iv.totalValue || 0, iv.currency || c)}</td></tr>`;
  }).join('');
  const invTotalQ = invs.reduce((s2, iv) => s2 + iv.lines.reduce((a2, l) => a2 + (l.qtyInvoiced || 0), 0), 0);
  const invTotalV = invs.reduce((s2, iv) => s2 + (iv.totalValue || 0), 0);

  const tierScheduleRows = tiers.map((tr, i) => {
    const to = tiers[i + 1] ? qtyf(tiers[i + 1].threshold - 1) : t('agrAndAbove');
    return `<tr class="${i === achievedIdx ? 'tier-row achieved' : 'tier-row'}">
      <td>${t('agrTierWord')} ${i + 1}${i === achievedIdx ? ` <span class="pill ok">${t('agrPillAchieved')}</span>` : ''}</td>
      <td class="num">${qtyf(tr.threshold === 0 ? 1 : tr.threshold)}</td><td class="num">${to}</td>
      <td class="num">${(tr.rate * 100).toFixed(2)}%</td></tr>`;
  }).join('');

  const measureTxt = a.tierMeasure === 'PER_SKU'
    ? t('agrDefMeasPerSku')
    : t('agrDefMeasCombined');
  const windowTxt = wtLabel(a.windowType || 'YEAR');
  const clauseTier = a.clauseRefs?.tier || 'Clause 4 — Rebate Schedule';
  const supName = esc(sup.name);
  const buyName = esc(BUYER.name);

  return `<article class="contract-doc">
    <div class="${ribbonCls}">${met}</div>
    <div class="ct-head">
      <div class="ct-kicker">${t('agrKicker')}</div>
      <h1 class="ct-title">${t('agrTitle')}</h1>
      <div class="ct-ref">${t('agrRefLabel')} ${esc(a.contractRef || a.agreementId)} &nbsp;·&nbsp; ${t('agrGoverningLaw')}: ${esc(a.governingLaw || 'Slovak Republic')}</div>
    </div>

    <p class="ct-recital">${t('agrThisAgreement')} ${a.signedDate ? t('agrMadeOn') + ' ' + esc(a.signedDate) : ''} <strong>${t('agrBetween')}</strong>
      <span class="ct-party">${supName}</span>${sup.city ? ' ' + t('agrOfCity') + ' ' + esc(sup.city) + ', ' + esc(sup.country) : ''}${sup.vat && sup.vat !== '—' ? ' (VAT ' + esc(sup.vat) + ')' : ''} (${t('agrTheParty', { role: t('agrSupplierRole') })})
      <strong>${t('agrAnd')}</strong>
      <span class="ct-party">${buyName}</span> ${t('agrOfCity')} ${esc(BUYER.city)}, ${esc(BUYER.country)} (VAT ${esc(BUYER.vat)}) (${t('agrTheParty', { role: t('agrBuyerRole') })}),
      ${t('agrOperatingWh')} ${esc((a.countries || []).join(', ') || 'SK, PL, CZ')}.</p>
    <p class="ct-recital">${t('agrWhereas')}</p>

    <section class="ct-clause"><h3>${t('agrH1')}</h3>
      <p><strong>1.1</strong> ${t('agrDef11')}
      <strong>1.2</strong> ${t('agrDef12Pre')} ${measureTxt}, ${t('agrDef12Post', { basis: basisLabel(a.basis || 'UNITS') })}
      <strong>1.3</strong> ${t('agrDef13')} <strong>1.4</strong> ${t('agrDef14')}</p>
    </section>

    <section class="ct-clause"><h3>${t('agrH2')}</h3>
      <p><strong>2.1</strong> ${t('agrTerm21', { from: `<strong>${esc(a.effectiveFrom || '—')}</strong>`, to: `<strong>${esc(a.effectiveTo || '—')}</strong>`, term: esc(windowTxt) })}
      <strong>2.2</strong> ${t('agrTerm22')}</p>
    </section>

    <section class="ct-clause"><h3>${t('agrH3')}</h3>
      <table class="ct-schedule"><thead><tr><th class="num">${t('agrColNum')}</th><th>${t('agrColAsin')}</th><th>${t('agrColProduct')}</th><th>${t('agrColEngine')}</th></tr></thead>
      <tbody>${skuRows}</tbody></table>
      ${a.skuSet && [...new Set(a.skuSet)].some((s) => !engineCfg.has(s)) ? `<p class="ct-flag">${t('agrEngineFlag')}</p>` : ''}
    </section>

    <section class="ct-clause"><h3>${t('agrH4')}</h3>
      <p><strong>4.1</strong> ${t('agrRebate41Pre')} <strong>${esc(rsLabel(a.rebateStructure || ''))}</strong> ${t('agrRebate41Post')}</p>
      <table class="ct-schedule"><thead><tr><th>${t('agrColTier')}</th><th class="num">${t('agrColFrom')}</th><th class="num">${t('agrColTo')}</th><th class="num">${t('agrColRebatePct')}</th></tr></thead>
      <tbody>${tierScheduleRows || '<tr><td colspan=4 class=small>—</td></tr>'}</tbody></table>
      <p class="small">${t('agrTierMeasNote', { measure: a.tierMeasure === 'PER_SKU' ? t('agrMeasPerSku') : t('agrMeasCombined'), cur: esc((a.currencies || []).join(', ')) })}</p>
    </section>

    <section class="ct-clause"><h3>${t('agrH5')}</h3>
      <p><strong>5.1</strong> ${t('agrMeas51Pre')} ${a.scope === 'PAN_EU' ? t('agrScopePanEu') : t('agrScopePerCountry')}.
      <strong>5.2</strong> ${t('agrMeas52Pre')} ${esc(rrLabel(a.retrospectiveReach || 'WITHIN_PERIOD'))}.
      <strong>5.3</strong> ${t('agrMeas53')}</p>
      <div class="ct-cards">
        <div class="mc"><div class="mc-n">${qtyf(achievedVol)}</div><div class="mc-l">${t('agrCardVol')}</div></div>
        <div class="mc"><div class="mc-n">${(achievedRate * 100).toFixed(2)}%</div><div class="mc-l">${t('agrCardRate')}</div></div>
        <div class="mc"><div class="mc-n">${cur(entitled, c)}</div><div class="mc-l">${t('agrCardEntitled')}</div></div>
        <div class="mc ${gap > 0.01 ? 'loss' : ''}"><div class="mc-n">${cur(gap, c)}</div><div class="mc-l">${t('agrCardUnderclaimed')}</div></div>
      </div>
      <div class="tier-progress">
        <div class="tp-head"><span>${t('agrTierWord')} ${achievedIdx + 1} ${t('agrTierOf')} ${tiers.length}${nextTier ? t('agrToNextTier', { qty: qtyf(bandEnd - achievedVol), rate: (nextTier.rate * 100).toFixed(1) }) : t('agrTopTier')}</span><span>${pct}%</span></div>
        <div class="tp-bar"><i style="width:${pct}%"></i></div>
      </div>
    </section>

    <section class="ct-clause"><h3>${t('agrH6')}</h3>
      <p><strong>6.1</strong> ${t('agrMethod')}: ${esc(settle.method)}. <strong>6.2</strong> ${t('agrFrequency')}: ${esc(settle.frequency)}.
      <strong>6.3</strong> ${t('agrInstrument')}: ${esc(settle.instrument)}. <strong>6.4</strong> ${t('agrReconciliation')}: ${esc(settle.reconciliation)}.
      <strong>6.5</strong> ${t('agrShortfalls')}</p>
    </section>

    <section class="ct-clause"><h3>${t('agrH7')}</h3>
      <table class="ct-schedule"><thead><tr><th>${t('docInvoice')}</th><th>${t('agrColCountry')}</th><th>${t('agrColOrderDate')}</th><th>${t('agrColWindow')}</th><th class="num">${t('docQty')}</th><th class="num">${t('agrColValue')}</th></tr></thead>
      <tbody>${invRows || '<tr><td colspan=6 class=small>—</td></tr>'}
        <tr class="ct-total"><td colspan="4">${t('docTotal')}</td><td class="num">${qtyf(invTotalQ)}</td><td class="num">${cur(invTotalV, c)}</td></tr>
      </tbody></table>
    </section>

    <section class="ct-clause"><h3>${t('agrH8')}</h3>
      <p><strong>8.1 ${t('agrConfidentiality')}</strong> ${t('agrConfidentialityBody')} <strong>8.2 ${t('agrDisputes')}</strong> ${t('agrDisputesBody')} <strong>8.3 ${t('agrEntire')}</strong> ${t('agrEntireBody')}</p>
    </section>

    <div class="ct-sign">
      <div class="ct-sig"><div class="ct-sig-line"></div><div>${t('agrForSupplier')} <strong>${t('agrSupplierRole')}</strong><br>${supName}<br><span class="small">${esc(contact.rep)} · ${esc(contact.role)}</span></div></div>
      <div class="ct-sig"><div class="ct-sig-line"></div><div>${t('agrForSupplier')} <strong>${t('agrBuyerRole')}</strong><br>${buyName}<br><span class="small">${esc(a.signatory || t('agrDefaultSignatory'))} · ${esc(a.signatoryTitle || t('agrDefaultSignatoryTitle'))}</span></div></div>
    </div>
    <p class="ct-foot">${esc(clauseTier)} · ${t('agrRefLabel')} ${esc(a.contractRef || a.agreementId)} · ${t('agrFootDemo')}</p>
  </article>`;
}

// ---- CCOGS Engine summary (the "before") ----
export function engineDocHtml(eng) {
  const refs = (arr) => (arr && arr.length ? arr.map((x) => `<span class="mono">${esc(x)}</span>`).join(', ') : '—');
  const sup = supplierFor(eng.supplierId);
  return `<article class="invoice-doc">
    <header class="doc-head"><div class="doc-brand">CCOGS Engine</div><div class="doc-title">${esc(engDocTypeLabel(eng.documentType))}</div></header>
    <div class="doc-meta">
      <div><span>${t('engDocument')}</span><strong>${esc(eng.outputId)}</strong></div>
      <div><span>${t('docSupplier')}</span><strong>${esc(sup.name)}</strong></div>
      <div><span>${t('docScope')}</span><strong>${esc(eng.scopeKey)}</strong></div>
      <div><span>${t('docPeriod')}</span><strong>${esc(eng.period)}</strong></div>
      <div><span>${t('engBasis')}</span><strong>${esc(eng.basis ?? '—')}</strong></div>
      <div><span>${t('engTierApplied')}</span><strong>${esc(eng.tierApplied ?? '—')}</strong></div>
    </div>
    <table class="doc-lines"><thead><tr><th>${t('engVolCounted')}</th><th class="num">${t('engCcogsClaimed')}</th></tr></thead>
      <tbody><tr><td>${qtyf(eng.engineVolume)}</td><td class="num">${cur(eng.amountClaimed, eng.currency)}</td></tr></tbody></table>
    <section class="doc-split"><h4 class="doc-split-h">${t('engCalcTrail')}</h4>
      <p class="small">${esc(eng.calcNote ?? '')}</p></section>
    <section class="doc-split"><h4 class="doc-split-h">${t('engLinkedDocs')}</h4>
      <div class="doc-meta" style="grid-template-columns:1fr">
        <div><span>${t('engInvoices')}</span><strong>${refs(eng.invoiceRefs)}</strong></div>
        <div><span>${t('engDeliveryNotes')}</span><strong>${refs(eng.deliveryNoteRefs)}</strong></div>
        <div><span>${t('engGoodsReceipts')}</span><strong>${refs(eng.receiptRefs)}</strong></div>
      </div>
    </section>
  </article>`;
}
