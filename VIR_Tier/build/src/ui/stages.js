// Stage views for the workspace: Inputs/Collection and ML Discovery (SVG flow +
// expandable findings with the drill-down folded in). Pure string builders;
// app.js wires interactions.

import { t } from '../lib/i18n.js';
import { Scope } from '../lib/enums.js';
import { hintSpan } from './tooltip.js';

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

export function renderInputs(state) {
  const sub = state.sub || 'summary';
  if (sub === 'summary') return renderInputsSummary(state);
  const cat = DOC_CATS.find((c) => c.key === sub) || DOC_CATS[0];
  const items = state.store.all(cat.coll);
  const tabs = INPUT_CATS.map((c) =>
    `<div class="filecat ${c.key === sub ? 'active' : ''}" data-sub="${c.key}">${t(c.label)}${c.summary ? '' : `<span class="cnt">${state.store.all(c.coll).length}</span>`}</div>`).join('');
  const cards = items.slice(0, 120).map((o) => {
    const id = cat.id(o);
    return `<div class="doccard">
      <div class="id">${esc(id)}</div>
      <div class="meta">${esc(cat.meta(o))}</div>
      <div class="row">
        <button class="btn primary" data-doc="${cat.key}|${esc(id)}">${t('view')}</button>
        <button class="btn ghost" data-dl="${cat.key}|${esc(id)}">${t('download')}</button>
      </div>
    </div>`;
  }).join('');
  return `
    <p class="lead">${t('filesLead')}</p>
    <div class="filecats">${tabs}</div>
    <div class="doclist">${cards || `<div class="small">—</div>`}</div>
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

export function renderInputsSummary(state) {
  const counts = DOC_CATS.map((c) => ({ key: c.key, label: t(c.label), n: state.store.all(c.coll).length }));
  const total = counts.reduce((s, c) => s + c.n, 0);

  // recovery-side figures (analysis/matching result)
  const findN = state.discovery?.findings?.length || 0;
  const ba = state.beforeAfter || [];
  const cleanN = ba.filter((b) => !b.recoverable).length;
  const recoverEur = ba.reduce((s, b) => s + (b.eurEquivalent != null && b.currency !== 'EUR' ? b.eurEquivalent : (b.costOfInaction || 0)), 0);

  const tiles = counts.map((c) =>
    `<button class="sum-tile" data-sub="${c.key}">
      <div class="sum-ico">${sumIcon(c.key)}</div>
      <div class="sum-tile-txt"><div class="sum-n">${nf(c.n)}</div><div class="sum-l">${esc(c.label)}</div></div>
    </button>`).join('');

  return `
    <p class="lead">${t('summaryLead')}</p>

    <div class="sum-hero">
      <div class="sum-hero-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div>
        <div class="sum-hero-h">${t('summaryDone')}</div>
        <div class="sum-hero-sub">${t('summaryDoneSub', { total: nf(total) })}</div>
      </div>
    </div>

    <h3 class="sum-h">${t('summaryIngested')}</h3>
    <div class="sum-grid">${tiles}</div>

    <div class="sum-result">
      <div class="sum-result-row">
        <div class="sum-kpi"><div class="n">${nf(findN)}</div><div class="l">${t('summaryDiscrepancies')}</div></div>
        <div class="sum-kpi"><div class="n">${nf(cleanN)}</div><div class="l">${t('summaryClean')}</div></div>
        <div class="sum-kpi"><div class="n gold">${nf(recoverEur)} EUR</div><div class="l">${t('summaryRecoverable')}</div></div>
      </div>
      <p class="small">${t('summaryMatchNote')}</p>
      <button class="btn primary big" id="sum-continue">${t('summaryContinue')} →</button>
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
          <button class="btn tint-orange" data-exportdlg="${charge.chargeId}">${t('exportFile')}</button>
          <button class="btn tint-ghost" data-archive="${charge.chargeId}">${t('rejectArchive')}</button>
        </div>
      </div>`
    : '';

  // contract duration badge (Yearly / Quarterly / Monthly / Half-year / Promo)
  const windowType = group?.agreement?.windowType || null;
  const durLabel = windowType ? t('dur' + windowType.replace(/_/g, '')) : '';
  const durBadge = durLabel ? `<span class="dur-badge dur-${(windowType || '').toLowerCase()}">${esc(durLabel)}</span>` : '';

  return `<details class="mlfind">
    <summary class="ml-cols">
      <span class="mf-main"><span class="chev">▶</span><strong>${esc(f.supplierName ?? f.supplierId)}</strong> <span class="mono">${f.agreementId}</span>${durBadge}</span>
      <span class="mf-scope">${f.scopeKey}</span>
      <span class="num mf-before">${nf(f.claimed)} ${c}</span>
      <span class="num mf-after">${nf(f.entitled)} ${c}</span>
      <span class="num mf-leak"><strong>${nf(f.leakage)} ${c}</strong></span>
      <span class="num mf-prio"><span class="prio-badge">${(f.priority * 100).toFixed(0)}</span></span>
    </summary>
    <div class="mf-body">
      <p class="mf-story">${t('mlStory', {
        claimed: nf(f.claimed), cur: c, engV: nf(dv.engineVolume), reconV: nf(dv.reconstructedVolume),
        baseV: nf(dv.baseVolume), restored: nf(dv.restoredUnits),
        tierA: ta.idx >= 0 ? ta.idx + 1 : '—', rateA: ((ta.rate || 0) * 100).toFixed(2),
        tierB: tb.idx >= 0 ? tb.idx + 1 : '—', rateB: ((tb.rate || 0) * 100).toFixed(2),
        entitled: nf(f.entitled), leak: nf(f.leakage),
      })}</p>

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
