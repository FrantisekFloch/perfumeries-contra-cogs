// Consolidated per-supplier debit stage (adapted from concept B3).
// Left: findings grouped by supplier, each with a checkbox to include/exclude.
// Right: a LIVE Contra-COGS document preview that rebuilds as the user ticks
// agreements — the same figures the Review Document modal shows (original vs
// recomputed vs recoverable True-Up + itemized cause lines), consolidated
// across the selected charges for that supplier.
// Buttons: Generate Contra-COGS Invoice · Show agreement summary.

import { t } from '../lib/i18n.js';

const nf = (v) => (v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = (v, c) => `${nf(v)} ${c || 'EUR'}`;

// group charges by supplier -> [{ supplierId, supplierName, charges[] }]
export function chargesBySupplier(state) {
  const groups = new Map();
  for (const ch of (state.charges || [])) {
    const g = state.consolidated?.byAgreement?.get(ch.agreementId) || null;
    const name = g?.agreement?.supplierName || ch.supplierId || '—';
    const id = ch.supplierId || name;
    if (!groups.has(id)) groups.set(id, { supplierId: id, supplierName: name, charges: [] });
    groups.get(id).charges.push(ch);
  }
  // sort suppliers by total recoverable desc
  const sorted = [...groups.values()].sort((a, b) =>
    b.charges.reduce((s, c) => s + (c.variance || 0), 0) - a.charges.reduce((s, c) => s + (c.variance || 0), 0));

  // Curated pins: surface specific suppliers at fixed slots (1-based) regardless
  // of value, without disturbing the relative order of the rest.
  const PINNED_SUPPLIERS = [
    { match: 'Maison Aroma', slot: 1 },
    { match: 'Velvet & Co', slot: 3 },
  ];
  const pins = PINNED_SUPPLIERS
    .map((p) => ({ ...p, g: sorted.find((x) => (x.supplierName || '').includes(p.match)) }))
    .filter((p) => p.g);
  if (!pins.length) return sorted;
  const pinnedGs = new Set(pins.map((p) => p.g));
  const rest = sorted.filter((g) => !pinnedGs.has(g));
  const result = [];
  for (const p of [...pins].sort((a, b) => a.slot - b.slot)) {
    while (result.length < p.slot - 1 && rest.length) result.push(rest.shift());
    result.push(p.g);
  }
  return [...result, ...rest];
}

// which supplier is active in the right panel; default = first
function activeSupplier(state, groups) {
  if (state.consolSup && groups.some((g) => g.supplierId === state.consolSup)) return state.consolSup;
  return groups.length ? groups[0].supplierId : null;
}

// selection set of chargeIds (default: all selected)
function selSet(state) {
  if (!state.consolSel) {
    state.consolSel = new Set((state.charges || []).map((c) => c.chargeId));
  }
  return state.consolSel;
}

export function renderConsolidatedDebit(state) {
  const groups = chargesBySupplier(state);
  if (!groups.length) return `<p class="lead">${t('consolLead')}</p><div class="small">—</div>`;
  const sel = selSet(state);
  const activeId = activeSupplier(state, groups);
  const active = groups.find((g) => g.supplierId === activeId) || groups[0];

  // ---- LEFT: suppliers with per-charge checkboxes ----
  const left = groups.map((g) => {
    const isActive = g.supplierId === active.supplierId;
    const supTotal = g.charges.filter((c) => sel.has(c.chargeId)).reduce((s, c) => s + (c.variance || 0), 0);
    const cur = g.charges[0]?.currency || 'EUR';
    const rows = g.charges.map((c) => {
      const on = sel.has(c.chargeId);
      const grp = state.consolidated?.byAgreement?.get(c.agreementId);
      const dur = grp?.agreement?.windowType ? t('dur' + grp.agreement.windowType.replace(/_/g, '')) : '';
      return `<tr class="${on ? '' : 'off'}">
        <td><input type="checkbox" data-consoltoggle="${esc(c.chargeId)}" ${on ? 'checked' : ''}></td>
        <td class="mono">${esc(c.agreementId)}</td>
        <td>${esc(c.scopeKey)}${dur ? ` · <span class="small">${esc(dur)}</span>` : ''}</td>
        <td class="num"><strong style="color:var(--gold)">${money(c.variance, c.currency)}</strong></td>
        <td><div class="consol-rowbtns">
          <button class="btn tint-ghost consol-view" data-consolview="${esc(c.chargeId)}">${t('viewDetails')}</button>
          <button class="btn tint-green-soft consol-gen" data-genrow="${esc(c.chargeId)}">${t('genContraInvoice')}</button>
        </div></td>
      </tr>`;
    }).join('');
    return `<div class="supgrp ${isActive ? 'active' : ''}" data-consolsup="${esc(g.supplierId)}">
      <div class="suphead"><span class="sn">${esc(g.supplierName)}</span><span class="st euro">${money(supTotal, cur)}</span></div>
      <table><thead><tr><th style="width:34px"></th><th>${t('agreement')}</th><th>${t('scope')}</th><th class="num">True-Up</th><th style="width:1%"></th></tr></thead>
        <tbody>${rows}</tbody></table>
    </div>`;
  }).join('');

  // ---- RIGHT: live consolidated preview for the active supplier ----
  const selCharges = active.charges.filter((c) => sel.has(c.chargeId));
  const cur = active.charges[0]?.currency || 'EUR';
  const totalClaimed = selCharges.reduce((s, c) => s + (c.claimedCcogs || 0), 0);
  const totalEntitled = selCharges.reduce((s, c) => s + (c.entitledCcogs || 0), 0);
  const totalVar = selCharges.reduce((s, c) => s + (c.variance || 0), 0);

  // all itemized cause lines across the selected charges
  const lineRows = selCharges.flatMap((c) =>
    (c.lines && c.lines.length ? c.lines : [{ cause: 'Volume rebate adjustment', qty: 0, fromPct: c.tierFromPct, toPct: c.tierToPct, deltaValue: c.variance, note: '' }])
      .map((l) => `<tr>
        <td>${esc(l.cause)} <span class="small mono">(${esc(c.agreementId)})</span>${l.note ? `<div class="small">${esc(l.note)}</div>` : ''}</td>
        <td class="num">${nf(l.qty)}</td>
        <td class="num">${l.toPct != null ? l.toPct + '%' : (l.fromPct != null ? l.fromPct + '%' : '—')}</td>
        <td class="num">${money(l.deltaValue, c.currency)}</td>
      </tr>`)).join('');

  const scopeRows = selCharges.map((c) => `<tr><td class="mono">${esc(c.agreementId)}</td><td>${esc(c.scopeKey)}</td><td>${esc(c.period)}</td><td class="num">${money(c.variance, c.currency)}</td></tr>`).join('');

  const canGen = selCharges.length > 0;
  const preview = `
    <div class="consol-doc">
      <div class="cd-head">
        <div><div class="cd-kick">${t('consolPreview')}</div><h3>${t('contraInvoiceTitle')}</h3>
          <div class="small">${t('consolFor')}: <strong>${esc(active.supplierName)}</strong> · ${selCharges.length} ${t('consolLinesLabel')}</div></div>
        <div class="cd-tot"><div class="small">${t('totalRecoverable')}</div><div class="cd-eur euro">${money(totalVar, cur)}</div></div>
      </div>

      <div class="cd-kv">
        <div class="k">Original CCOGS (claimed)</div><div class="num">${money(totalClaimed, cur)}</div>
        <div class="k">Recomputed CCOGS (entitled)</div><div class="num">${money(totalEntitled, cur)}</div>
        <div class="k">Recoverable True-Up</div><div class="num"><strong style="color:var(--gold)">${money(totalVar, cur)}</strong></div>
      </div>

      <h5>${t('consolItemized')}</h5>
      <table class="cd-lines"><thead><tr><th>Cause</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${lineRows || `<tr><td colspan="4" class="small">${t('consolNothing')}</td></tr>`}
        ${selCharges.length ? `<tr class="mf-total"><td colspan="3">${t('consolTotalLine')}</td><td class="num">${money(totalVar, cur)}</td></tr>` : ''}</tbody></table>

      <h5>${t('consolScopes')}</h5>
      <table class="cd-lines"><thead><tr><th>${t('agreement')}</th><th>${t('scope')}</th><th>${t('period')}</th><th class="num">True-Up</th></tr></thead>
        <tbody>${scopeRows || `<tr><td colspan="4" class="small">—</td></tr>`}</tbody></table>

      <div class="cd-actions">
        <button class="btn tint-blue" data-consolgen="${esc(active.supplierId)}" ${canGen ? '' : 'disabled'}>${t('genConsolidatedContra')}</button>
        <button class="btn tint-amber" data-consolagr="${esc(active.supplierId)}" ${canGen ? '' : 'disabled'}>${t('showAgreement')}</button>
      </div>
    </div>`;

  return `
    <p class="lead">${t('consolLead')}</p>
    <div class="consol-grid">
      <div class="consol-left">${left}</div>
      <div class="consol-right">${preview}</div>
    </div>`;
}
