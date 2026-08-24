// Role dashboards + review document (Req 9, 7, 8, 12). Pure-ish view layer:
// receives the app "state" (consolidated data, current selections, charges) and
// callbacks for recompute/approve/reject/export/inject.

import { t } from '../lib/i18n.js';
import { hintSpan } from './tooltip.js';
import { barChart } from './charts.js';
import { buildReviewDocument } from '../lib/approval.js';
import { financeJourney } from './doc.js';
import { miDiscrepancyBlock } from './stages.js';

const money = (v, cur) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`;

function fmtN(n) { return Math.round(n).toLocaleString(); }

// ---- Finance Overview: savings & earnings summary (before -> after portfolio) ----
export function renderOverview(state) {
  const { beforeAfter = [] } = state;

  // portfolio before (engine claimed) -> after (tool entitled) -> recovered True-Up
  const totalBefore = beforeAfter.reduce((s, b) => s + (b.before?.claimed || 0), 0);
  const totalAfter = beforeAfter.reduce((s, b) => s + (b.after?.entitled || 0), 0);
  const totalTrueUp = beforeAfter.reduce((s, b) => s + (b.costOfInaction || 0), 0);
  const recoverableCount = beforeAfter.filter((b) => b.recoverable).length;
  const upliftPct = totalBefore > 0 ? ((totalAfter / totalBefore - 1) * 100) : 0;

  // portfolio framing (same flow as ML Discovery): everything, then the clean
  // (no-issue) slice, then the engine-claimed "before" on the flagged agreements.
  const totalAll = beforeAfter.reduce((s, b) => s + (b.after?.entitled || b.before?.claimed || 0), 0);
  const cleanRows = beforeAfter.filter((b) => !b.recoverable);
  const skippedAmt = cleanRows.reduce((s, b) => s + (b.before?.claimed || 0), 0);
  const skippedN = cleanRows.length;
  const eur = (v) => `${fmtN(v)} €`;

  // breakdowns of the recoverable True-Up
  const val = (b) => b.costOfInaction || 0;
  const agg = (keyFn) => {
    const m = {};
    for (const b of beforeAfter) { const k = keyFn(b) || '—'; m[k] = (m[k] ?? 0) + val(b); }
    return Object.entries(m).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const bySupplier = agg((b) => b.supplierName || b.supplierId);
  const byScope = agg((b) => b.scopeKey);
  const byPeriod = agg((b) => b.period);

  // top recovery opportunities, GROUPED by supplier then contract validity —
  // a supplier subtotal row leads each group, then its recoverable agreements.
  const WIN_LBL = { MONTH: 'Monthly', QUARTER: 'Quarterly', HALF_YEAR: 'Half-year', YEAR: 'Yearly', CUSTOM: 'Custom' };
  const validityOf = (agreementId) => {
    const g = state.consolidated?.byAgreement?.get(agreementId);
    return WIN_LBL[g?.agreement?.windowType] || '—';
  };
  const recoverable = [...beforeAfter].filter((b) => b.recoverable);
  const bySup = {};
  for (const b of recoverable) { const k = b.supplierName || b.supplierId || '—'; (bySup[k] ||= []).push(b); }
  const supOrder = Object.entries(bySup)
    .map(([sup, items]) => ({ sup, items, total: items.reduce((s, b) => s + val(b), 0) }))
    .sort((a, b) => b.total - a.total);
  let groupedRows = '';
  for (const grp of supOrder) {
    const cur = grp.items[0].currency;
    groupedRows += `<tr class="grp-head"><td colspan="6"><strong>${grp.sup}</strong></td><td class="num"><strong style="color:var(--gold)">${fmtN(grp.total)} ${cur}</strong></td></tr>`;
    for (const b of [...grp.items].sort((a, b2) => val(b2) - val(a))) {
      groupedRows += `<tr>
        <td class="sub-cell"></td>
        <td>${validityOf(b.agreementId)}</td>
        <td class="mono">${b.agreementId}</td>
        <td>${b.scopeKey}</td>
        <td class="num">${fmtN(b.before.claimed)} ${b.currency}</td>
        <td class="num">${fmtN(b.after.entitled)} ${b.currency}</td>
        <td class="num"><strong style="color:var(--gold)">${fmtN(val(b))} ${b.currency}</strong></td>
      </tr>`;
    }
  }

  // all goods movements across the portfolio drive the finance process-journey
  const allReceipts = state.consolidated ? [...state.consolidated.byAgreement.values()].flatMap((g) => g.receipts || []) : [];
  const allCorrections = (state.reconstructions || []).flatMap((r) => r.corrections || []);

  // ---- Claim Builder worklist (from concept B5) — what's in this recovery run ----
  // Findings currently in the discovery list are "included"; archived suggestions
  // are "excluded". Placed above the process journey.
  const findings = state.discovery?.findings || [];
  const archived = state.archived || [];
  // group per supplier -> compact boxes (included findings + excluded/archived)
  const wlSup = new Map();
  const wlBucket = (name) => { if (!wlSup.has(name)) wlSup.set(name, { name, items: [], total: 0, cur: 'EUR' }); return wlSup.get(name); };
  for (const f of findings) { const b = wlBucket(f.supplierName || f.supplierId); b.items.push({ status: 'include', id: f.agreementId, amt: f.leakage || 0 }); b.total += (f.leakage || 0); b.cur = f.currency || 'EUR'; }
  for (const a of archived) { const b = wlBucket(a.supplierName || a.agreementId); b.items.push({ status: 'excluded', id: a.agreementId, amt: 0, note: a.comment }); }
  const wlIncludedCount = findings.length;
  const wlIncTotal = findings.reduce((s, f) => s + (f.leakage || 0), 0);
  const wlBoxes = [...wlSup.values()].sort((a, b) => b.total - a.total).map((b) => {
    const chips = b.items.map((it) => `<span class="wl-chip ${it.status}" title="${it.status === 'include' ? fmtN(it.amt) + ' ' + b.cur : (it.note || t('wlExcluded'))}"><span class="mono">${it.id}</span>${it.status === 'include' ? ` · ${fmtN(it.amt)}` : ' ✕'}</span>`).join('');
    return `<div class="wl-box">
      <div class="wl-box-h"><span class="wl-box-n">${b.name}</span><span class="wl-box-t euro">${fmtN(b.total)} ${b.cur}</span></div>
      <div class="wl-chips">${chips}</div>
    </div>`;
  }).join('');
  // ---- (A) ML findings summary + CCOGS delta + pending/realized tracker -------
  // CCOGS delta = what the engine claimed (before) vs what the tool reconstructs
  // you are entitled to (after). The delta is the additional CCOGS found to reclaim.
  const ccogsDelta = totalAfter - totalBefore;

  // pending vs realized additional-CCOGS: a recoverable charge is "realized" once
  // it has been posted to the ERP billing system this session (state.erpSent).
  const erpSent = state.erpSent || {};
  const charges = state.charges || [];
  const recCharges = charges.filter((c) => (c.variance || 0) > 0.01);
  const realized = recCharges.filter((c) => erpSent[c.chargeId]);
  const pending = recCharges.filter((c) => !erpSent[c.chargeId]);
  const realizedEur = realized.reduce((s, c) => s + (c.variance || 0), 0);
  const pendingEur = pending.reduce((s, c) => s + (c.variance || 0), 0);
  const trackerPct = (realizedEur + pendingEur) > 0 ? Math.round(realizedEur / (realizedEur + pendingEur) * 100) : 0;

  // ML findings summary — top findings by recoverable, with a type badge
  // (missing-invoice cases flagged) so Finance sees WHAT the model surfaced.
  const findingsAll = [...(state.discovery?.findings || [])].sort((a, b) => (b.leakage || 0) - (a.leakage || 0));
  const miCount = findingsAll.filter((f) => f.missingInvoice).length;
  const findingRows = findingsAll.slice(0, 8).map((f) => {
    const badge = f.missingInvoice
      ? `<span class="of-badge mi">⚑ ${t('miBadge')}</span>`
      : (f.scopeKey === 'PAN_EU' ? `<span class="of-badge pan">Pan-EU</span>` : '');
    return `<tr>
      <td>${f.supplierName || f.supplierId} <span class="mono small">${f.agreementId}</span> ${badge}</td>
      <td>${f.scopeKey}</td>
      <td class="num">${fmtN(f.claimed)} ${f.currency}</td>
      <td class="num">${fmtN(f.entitled)} ${f.currency}</td>
      <td class="num"><strong style="color:var(--gold)">${fmtN(f.leakage)} ${f.currency}</strong></td>
    </tr>`;
  }).join('');

  const findingsSummaryBlock = `
    <h3 class="ov-h">${t('ovFindingsTitle')}</h3>
    <p class="muted small">${t('ovFindingsNote')}</p>
    <div class="ov-cards">
      <div class="ov-metric">
        <div class="l">${t('ovCcogsBefore')}</div><div class="v">${eur(totalBefore)}</div>
        <div class="s">${t('engineClaimed')}</div>
      </div>
      <div class="ov-metric arrow-metric"><span>→</span></div>
      <div class="ov-metric">
        <div class="l">${t('ovCcogsAfter')}</div><div class="v">${eur(totalAfter)}</div>
        <div class="s">${t('toolEntitled')}</div>
      </div>
      <div class="ov-metric gold">
        <div class="l">${t('ovCcogsDelta')}</div><div class="v">${eur(ccogsDelta)}</div>
        <div class="s">${recoverableCount} ${t('recoverableAgreements')} · ${miCount} ${t('ovMissingInvoiceCount')}</div>
      </div>
    </div>

    <div class="card ov-tracker">
      <div class="ovt-head"><strong>${t('ovTrackerTitle')}</strong><span class="small muted">${t('ovTrackerNote')}</span></div>
      <div class="ovt-bar"><i style="width:${trackerPct}%"></i></div>
      <div class="ovt-legend">
        <span class="ovt-leg realized"><b>${eur(realizedEur)}</b> ${t('ovRealized')} (${realized.length})</span>
        <span class="ovt-leg pending"><b>${eur(pendingEur)}</b> ${t('ovPending')} (${pending.length})</span>
      </div>
    </div>

    <div class="table-wrap"><table class="ov-findings"><thead><tr>
      <th>${t('supplier')} / ${t('agreement')}</th><th>${t('scope')}</th>
      <th class="num">${t('colOriginal')}</th><th class="num">${t('colRecomputed')}</th><th class="num">${t('colTrueUp')}</th>
    </tr></thead><tbody>${findingRows || `<tr><td colspan="5" class="small">—</td></tr>`}</tbody></table></div>`;

  const worklistBlock = `
    <h3 class="ov-h">${t('wlTitle')}</h3>
    <p class="muted small">${t('wlNote')}</p>
    <div class="card wl-card">
      <div class="wl-head"><span>${wlIncludedCount} ${t('wlInRun')} · ${wlSup.size} ${t('wlSuppliers')}</span><span class="euro" style="font-weight:800;color:var(--gold)">${fmtN(wlIncTotal)} EUR</span></div>
      <div class="wl-boxes">${wlBoxes || `<div class="small">—</div>`}</div>
    </div>`;

  // ---- agreement-duration split: fail rate + savings per contract length ----
  const WINDOW_LABEL = { MONTH: 'Monthly', QUARTER: 'Quarterly', HALF_YEAR: 'Half-year', YEAR: 'Yearly', CUSTOM: 'Custom' };
  const WINDOW_ORDER = ['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR', 'CUSTOM'];
  const winStats = {};   // windowType -> { total, recovered, savings }
  if (state.consolidated) {
    // one entry per agreement (dedupe beforeAfter rows to the agreement level)
    const seen = new Set();
    for (const b of beforeAfter) {
      const g = state.consolidated.byAgreement.get(b.agreementId);
      const wt = g?.agreement?.windowType || 'CUSTOM';
      winStats[wt] = winStats[wt] || { total: 0, recovered: 0, savings: 0, agreements: new Set() };
      winStats[wt].savings += (b.eurEquivalent != null && b.currency !== 'EUR' ? b.eurEquivalent : (b.costOfInaction || 0));
      winStats[wt].agreements.add(b.agreementId);
      if (b.recoverable) winStats[wt].recovered += 1;
      const k = b.agreementId;
      if (!seen.has(k)) { seen.add(k); }
    }
    // count agreements + recoverable agreements per window
    for (const [id, g] of state.consolidated.byAgreement) {
      const wt = g.agreement.windowType || 'CUSTOM';
      winStats[wt] = winStats[wt] || { total: 0, recovered: 0, savings: 0, agreements: new Set() };
      winStats[wt].total += 1;
    }
  }
  const winRows = WINDOW_ORDER.filter((w) => winStats[w] && winStats[w].total > 0).map((w) => {
    const s = winStats[w];
    const recAg = s.agreements ? [...s.agreements].filter((id) => beforeAfter.some((b) => b.agreementId === id && b.recoverable)).length : 0;
    const failPct = s.total > 0 ? Math.round((recAg / s.total) * 100) : 0;
    return { window: w, label: WINDOW_LABEL[w] || w, total: s.total, recAg, failPct, savings: s.savings };
  });
  const winSavingsChart = winRows.map((r) => ({ label: r.label, value: r.savings }));
  const winFailChart = winRows.map((r) => ({ label: r.label, value: r.failPct }));
  const winTableCompact = winRows.map((r) => `
    <tr>
      <td><strong>${r.label}</strong></td>
      <td class="num">${r.total}</td>
      <td class="num">${r.failPct}%</td>
      <td class="num"><strong style="color:var(--gold)">${fmtN(r.savings)} EUR</strong></td>
    </tr>`).join('');

  return `
    <p class="lead">${t('overviewLead')}</p>

    <div class="ba ba-ml">
      <div class="panel total"><div class="h">${t('mlTotalAmount')}</div><div class="big">${eur(totalAll)}</div><div class="small">${t('allAgreements')}</div></div>
      <div class="arrow">›</div>
      <div class="panel skipped"><div class="h">${t('mlSkippedClean')}</div><div class="big">${eur(skippedAmt)}</div><div class="small">${skippedN} ${t('cleanDeliveries')}</div></div>
      <div class="arrow">›</div>
      <div class="panel before"><div class="h">${t('before')}</div><div class="big">${eur(totalBefore)}</div><div class="small">${t('engineClaimed')}</div></div>
      <div class="arrow">→</div>
      <div class="panel after"><div class="h">${t('after')}</div><div class="big">${eur(totalAfter)}</div><div class="small">${t('toolEntitled')} · ${hintSpan(t('controlPeriod'), 'CONTROL_PERIOD')}</div></div>
    </div>
    <div class="loss-banner">${t('totalRecoverable')}: <strong>${eur(totalTrueUp)}</strong> &nbsp;·&nbsp; ${upliftPct.toFixed(1)}% ${t('upliftOnClaimed')} &nbsp;·&nbsp; ${recoverableCount} ${t('recoverableAgreements')}</div>

    ${findingsSummaryBlock}

    ${worklistBlock}

    ${financeJourney(allReceipts, allCorrections)}

    <div class="chart-grid">
      <div class="card chart-card">
        <div class="chart-head"><h3>${t('recoveryBySupplier')}</h3><span class="chart-sub">EUR</span></div>
        ${barChart(bySupplier.slice(0, 8), { palette: true, unit: 'EUR' })}
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>${t('recoveryByScope')}</h3><span class="chart-sub">EUR</span></div>
        ${barChart(byScope, { palette: true, unit: 'EUR' })}
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>${t('recoveryByPeriod')}</h3><span class="chart-sub">EUR</span></div>
        ${barChart(byPeriod.slice(0, 12), { cls: 'bar accent', unit: 'EUR' })}
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>${t('recoverableByDuration')}</h3><span class="chart-sub">EUR</span></div>
        ${barChart(winSavingsChart, { cls: 'bar accent', unit: 'EUR' })}
      </div>
    </div>

    <h3 class="ov-h">${t('byContractDuration')}</h3>
    <p class="muted small">${t('byContractDurationNote')}</p>
    <div class="chart-grid">
      <div class="card chart-card">
        <div class="chart-head"><h3>${t('failRateByDuration')}</h3><span class="chart-sub">%</span></div>
        ${barChart(winFailChart, { cls: 'bar risk', unit: '%' })}
      </div>
      <div class="card chart-card ov-dur-table">
        <div class="chart-head"><h3>${t('contractDuration')}</h3></div>
        <div class="table-wrap"><table><thead><tr>
          <th>${t('contractDuration')}</th><th class="num">${t('agreements')}</th><th class="num">${t('failRate')}</th><th class="num">${t('recoverableEur')}</th>
        </tr></thead><tbody>${winTableCompact || `<tr><td colspan="4" class="small">—</td></tr>`}</tbody></table></div>
      </div>
    </div>

    <h3 class="ov-h">${t('topOpportunities')}</h3>
    <p class="muted small">${t('topOpportunitiesNote')}</p>
    <div class="table-wrap"><table><thead><tr>
      <th>${t('supplier')}</th><th>${t('validity')}</th><th>${t('agreement')}</th><th>${t('scope')}</th>
      <th class="num">${t('engineClaimed')}</th><th class="num">${t('toolEntitled')}</th><th class="num">True-Up</th>
    </tr></thead><tbody>${groupedRows || `<tr><td colspan="7" class="small">—</td></tr>`}</tbody></table></div>
  `;
}

// ---- review modal ----
// opts.readOnly = true renders the same document with NO action buttons
// (used by the Consolidated Debit "View details").
export function reviewModalHtml(charge, group, reconstruction, opts = {}) {
  const doc = buildReviewDocument({ charge, agreement: group.agreement, reconstruction, contributingRecords: group.receipts.map((r) => r.receiptId) });
  const calc = doc.calculation;
  const corrections = (doc.corrections || []).map((c) =>
    `<tr><td>${hintSpan(c.driver.replace(/_/g, ' '), c.driver)}</td><td>${c.country ?? ''}</td><td class="num">${c.volumeDelta ?? 0}</td><td class="small">${c.note ?? ''}</td></tr>`).join('');
  const vols = (doc.reconstructedVolume || []).map((v) =>
    `<tr><td>${v.scopeKey}</td><td>${v.period}</td><td class="num">${Number(v.qualifyingVolume).toLocaleString()}</td></tr>`).join('');
  const audit = (doc.auditTrace || []).map((e) =>
    `<tr><td class="mono">${e.seq}</td><td class="mono small">${e.timestamp}</td><td>${e.actor}</td><td>${e.action}</td></tr>`).join('');

  // Plain-language "what happened" sentence (same as ML Discovery). Built from
  // the matching finding's derivation so figures line up exactly.
  let storyBlock = '';
  let volumeBlock = '';
  const f = opts.finding;
  if (f) {
    const dv = f.derivation || {}; const tb = dv.tierBefore || {}; const ta = dv.tierAfter || {};
    const mi = f.missingInvoice || null;
    if (mi) {
      storyBlock = `<p class="mf-story review-story mf-story-mi">${t(mi.reason === 'ERP_REJECTED' ? 'miStoryRejected' : 'miStoryNever', {
        cur: f.currency, units: fmtN(mi.units || dv.reconstructedVolume), reconV: fmtN(dv.reconstructedVolume),
        rateA: ((ta.rate || 0) * 100).toFixed(2), tierA: ta.idx >= 0 ? ta.idx + 1 : '—',
        entitled: fmtN(f.entitled), leak: fmtN(f.leakage),
      })}</p>${miDiscrepancyBlock(mi, group, f.currency)}`;
    } else {
      storyBlock = `<p class="mf-story review-story">${t(tb.idx !== ta.idx ? 'mlStoryTierMove' : 'mlStorySameTier', {
        claimed: fmtN(f.claimed), cur: f.currency, engV: fmtN(dv.engineVolume), reconV: fmtN(dv.reconstructedVolume),
        baseV: fmtN(dv.baseVolume), restored: fmtN(dv.restoredUnits),
        tierA: ta.idx >= 0 ? ta.idx + 1 : '—', rateA: ((ta.rate || 0) * 100).toFixed(2),
        tierB: tb.idx >= 0 ? tb.idx + 1 : '—', rateB: ((tb.rate || 0) * 100).toFixed(2),
        entitled: fmtN(f.entitled), leak: fmtN(f.leakage),
      })}</p>`;
    }

    // "Where the volume came from" — base receipts + per-driver restored units +
    // reconstructed total (ported from the ML Discovery finding card so this
    // breakdown isn't lost when ML Discovery is hidden).
    const driverRows = (dv.driverContributions || []).map((d) =>
      `<tr><td>${hintSpan(String(d.driver).replace(/_/g, ' '), d.driver)}</td><td class="num">+${fmtN(d.units)}</td><td class="small">${d.note ?? ''}</td></tr>`).join('');
    volumeBlock = `<div class="section"><h4>${t('whereVolume')}</h4>
      <table><thead><tr><th>${t('colSource')}</th><th class="num">${t('colUnits')}</th><th>${t('colWhy')}</th></tr></thead><tbody>
        <tr><td>${t('baseReceipts')}</td><td class="num">${fmtN(dv.baseVolume)}</td><td class="small">${t('baseReceiptsWhy')}</td></tr>
        ${driverRows || `<tr><td colspan="3" class="small">${t('noDriverCorr')}</td></tr>`}
        <tr class="mf-total"><td>${t('reconQualifying')}</td><td class="num">${fmtN(dv.reconstructedVolume)}</td><td></td></tr>
      </tbody></table>
    </div>`;
  }

  return `
  <div class="modal-bg" id="reviewBg">
    <div class="modal">
      ${opts.readOnly ? `<div class="modal-topbar">
        <button class="btn tint-green-soft" data-genreadonly="${charge.chargeId}">${t('genContraInvoice')}</button>
        <button class="btn ghost" data-closemodal>${t('close')}</button>
      </div>` : ''}
      <h2>${t('reviewDoc')} — ${charge.chargeId}</h2>
      <div class="sub">${doc.supplier.name} · ${doc.agreementId} · ${doc.scopeKey} · ${doc.period}</div>

      ${storyBlock}

      <div class="section"><h4>CCOGS True-Up ${charge.tierToPct != null ? `· ${t('rateLabel')} ${charge.tierToPct}%` : ''}</h4>
        <div class="kv">
          <div class="k">${t('structure')}</div><div>${calc.structure ?? charge.structure ?? ''} / ${calc.basis ?? charge.basis ?? ''}</div>
          <div class="k">Original CCOGS (claimed)</div><div>${money(calc.claimedCcogs, calc.currency)}</div>
          <div class="k">Recomputed CCOGS (entitled)</div><div>${money(calc.entitledCcogs, calc.currency)}</div>
          <div class="k">Recoverable True-Up</div><div><strong style="color:var(--gold)">${money(calc.variance, calc.currency)}</strong>${(charge.eurEquivalent ?? calc.eurEquivalent) != null ? ` (${money(charge.eurEquivalent ?? calc.eurEquivalent, 'EUR')})` : ''}</div>
        </div>
      </div>

      ${volumeBlock}

      ${(charge.lines && charge.lines.length) ? `<div class="section"><h4>Itemized causes</h4>
        <table><thead><tr><th>Cause</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Delta</th></tr></thead>
        <tbody>${charge.lines.map((l) => `<tr><td>${l.cause}${l.note ? `<div class="small">${l.note}</div>` : ''}</td><td class="num">${Number(l.qty).toLocaleString()}</td><td class="num">${l.toPct != null ? l.toPct + '%' : (l.fromPct != null ? l.fromPct + '%' : '—')}</td><td class="num">${money(l.deltaValue, calc.currency)}</td></tr>`).join('')}
        <tr class="mf-total"><td colspan="3">Total recoverable (cumulative)</td><td class="num">${money(calc.variance, calc.currency)}</td></tr></tbody></table>
      </div>` : ''}

      <div class="section"><h4>${t('reconstructedVolume')}</h4>
        <table><thead><tr><th>${t('scope')}</th><th>${t('period')}</th><th class="num">Qty</th></tr></thead><tbody>${vols || ''}</tbody></table>
      </div>

      <div class="section"><h4>${t('corrections')}</h4>
        <table><thead><tr><th>Driver</th><th>Country</th><th class="num">Δ</th><th>Note</th></tr></thead><tbody>${corrections || `<tr><td colspan="4" class="small">—</td></tr>`}</tbody></table>
      </div>

      <div class="section"><h4>${t('clause')}</h4><div class="small">${doc.clause ?? ''}</div>
        <div class="k small" style="margin-top:6px">${t('provenance')}: <span class="mono">${doc.provenance ?? ''}</span></div>
      </div>

      <div class="section"><h4>${t('auditTrace')}</h4>
        <table><thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th></tr></thead><tbody>${audit}</tbody></table>
      </div>

      ${opts.readOnly ? '' : `<div class="actions">
        <button class="btn primary" data-gencontra="${charge.chargeId}">${t('genContraInvoice')}</button>
        <button class="btn ghost" data-closemodal>${t('close')}</button>
      </div>`}
    </div>
  </div>`;
}



// ---- About & Manual (terms-&-conditions style: sticky TOC + numbered sections) ----
export function renderAbout() {
  const sections = [
    { id: 'overview', h: t('ab.h.overview'), body: `<p>${t('ab.p.overview')}</p>` },
    { id: 'data', h: t('ab.h.data'), body: `<p>${t('ab.p.data')}</p>
        <ul class="manual">
          <li>${t('ab.src.db')}</li>
          <li>${t('ab.src.api')}</li>
          <li>${t('ab.src.wh')}</li>
        </ul>` },
    { id: 'stages', h: t('ab.h.stages'), body: `<p>${t('ab.p.stages')}</p>
        <ul class="manual">
          <li>${t('ab.stg.inputs')}</li>
          <li>${t('ab.stg.ml')}</li>
          <li>${t('ab.stg.overview')}</li>
        </ul>` },
    { id: 'inputs', h: t('ab.h.inputs'), body: `<p>${t('ab.p.inputs')}</p>
        <ul class="manual">
          <li>${t('ab.doc.invoice')}</li>
          <li>${t('ab.doc.dn')}</li>
          <li>${t('ab.doc.grn')}</li>
          <li>${t('ab.doc.event')}</li>
          <li>${t('ab.doc.engine')}</li>
          <li>${t('ab.doc.agreement')}</li>
        </ul>
        <p>${t('ab.p.summary')}</p>` },
    // ---- RECONSTRUCTION ENGINE — the big, detailed section (end-to-end mapping
    // that powers the Consolidated Debit findings) ----
    { id: 'consol', h: t('ab.h.ml'), body: `
        <p>${t('ab.p.ml')}</p>
        <h5>${t('ab.ml.pipelineH')}</h5>
        <ol class="manual">
          <li>${t('ab.ml.step1')}</li>
          <li>${t('ab.ml.step2')}</li>
          <li>${t('ab.ml.step3')}</li>
          <li>${t('ab.ml.step4')}</li>
          <li>${t('ab.ml.step5')}</li>
          <li>${t('ab.ml.step6')}</li>
          <li>${t('ab.ml.step7')}</li>
        </ol>
        <h5>${t('ab.ml.driversH')}</h5>
        <p>${t('ab.ml.driversP')}</p>
        <ul class="manual">
          <li>${t('ab.ml.dReroute')}</li>
          <li>${t('ab.ml.dForgotten')}</li>
          <li>${t('ab.ml.dExpired')}</li>
          <li>${t('ab.ml.dFound')}</li>
          <li>${t('ab.ml.dReturn')}</li>
          <li>${t('ab.ml.dOverage')}</li>
          <li>${t('ab.ml.dBackorder')}</li>
          <li>${t('ab.ml.dLate')}</li>
          <li>${t('ab.ml.dPanEu')}</li>
        </ul>
        <h5>${t('ab.ml.scoreH')}</h5>
        <p>${t('ab.ml.scoreP')}</p>
        <div class="formula">score = 0.40·magnitude + 0.30·lift + 0.20·driverPressure + 0.10·tierProximity</div>
        <div class="formula">confidence = 0.5 + 0.5·score</div>
        <ul class="manual">
          <li>${t('ab.ml.sMagnitude')}</li>
          <li>${t('ab.ml.sLift')}</li>
          <li>${t('ab.ml.sDriver')}</li>
          <li>${t('ab.ml.sTier')}</li>
        </ul>
        <h5>${t('ab.ml.outputH')}</h5>
        <p>${t('ab.ml.outputP')}</p>` },
    { id: 'trueup', h: t('ab.h.trueup'), body: `<p>${t('ab.p.trueup')}</p>` },
    // ---- NEW capability sections ----
    { id: 'missinginvoice', h: t('ab.h.mi'), body: `<p>${t('ab.p.mi')}</p>
        <ul class="manual">
          <li>${t('ab.mi.never')}</li>
          <li>${t('ab.mi.rejected')}</li>
        </ul>
        <p>${t('ab.mi.how')}</p>` },
    { id: 'loading', h: t('ab.h.loading'), body: `<p>${t('ab.p.loading')}</p>
        <ul class="manual">
          <li>${t('ab.load.ingest')}</li>
          <li>${t('ab.load.ml')}</li>
          <li>${t('ab.load.tiles')}</li>
        </ul>` },
    { id: 'sources', h: t('ab.h.sources'), body: `<p>${t('ab.p.sources')}</p>
        <ul class="manual">
          <li>${t('ab.src2.edi')}</li>
          <li>${t('ab.src2.api')}</li>
          <li>${t('ab.src2.folder')}</li>
          <li>${t('ab.src2.mailbox')}</li>
        </ul>
        <p>${t('ab.src2.scan')}</p>` },
    { id: 'generate', h: t('ab.h.generate'), body: `<p>${t('ab.p.generate')}</p>
        <ul class="manual">
          <li>${t('ab.gen.percase')}</li>
          <li>${t('ab.gen.consolidated')}</li>
          <li>${t('ab.gen.erp')}</li>
        </ul>` },
    { id: 'filters', h: t('ab.h.filters'), body: `<p>${t('ab.p.filters')}</p>` },
    { id: 'audit', h: t('ab.h.audit'), body: `<p>${t('ab.p.audit')}</p>
        <ul class="manual">
          <li>${t('ab.audit.sheet0')}</li>
          <li>${t('ab.audit.sheet1')}</li>
          <li>${t('ab.audit.sheet2')}</li>
        </ul>` },
    { id: 'finance', h: t('ab.h.finance'), body: `<p>${t('ab.p.finance')}</p><p>${t('ab.p.finance2')}</p>` },
    { id: 'nav', h: t('ab.h.nav'), body: `<p>${t('ab.p.nav')}</p>` },
    { id: 'glossary', h: t('ab.h.glossary'), body: `<dl class="glossary">
        <dt>CCOGS</dt><dd>${t('ab.g.ccogs')}</dd>
        <dt>${t('ab.g.trueupT')}</dt><dd>${t('ab.g.trueup')}</dd>
        <dt>VIR</dt><dd>${t('ab.g.vir')}</dd>
        <dt>${t('ab.g.tierT')}</dt><dd>${t('ab.g.tier')}</dd>
        <dt>GRN</dt><dd>${t('ab.g.grn')}</dd>
        <dt>${t('ab.g.panEuT')}</dt><dd>${t('ab.g.panEu')}</dd>
        <dt>${t('ab.g.windowT')}</dt><dd>${t('ab.g.window')}</dd>
      </dl>` },
    { id: 'privacy', h: t('ab.h.privacy'), body: `<p>${t('ab.p.privacy')}</p>` },
  ];
  const toc = sections.map((s, i) => `<li><a href="#about-${s.id}">${i + 1}. ${s.h}</a></li>`).join('');
  const body = sections.map((s, i) => `
    <section class="about-sec" id="about-${s.id}">
      <h4>${i + 1}. ${s.h}</h4>${s.body}
    </section>`).join('');
  return `
    <div class="about-doc">
      <p class="muted">${t('ab.intro')}</p>
      <div class="about-layout">
        <nav class="about-toc" aria-label="${t('ab.tocTitle')}">
          <div class="about-toc-t">${t('ab.tocTitle')}</div>
          <ol>${toc}</ol>
        </nav>
        <div class="about-body">${body}</div>
      </div>
    </div>`;
}
