// Role dashboards + review document (Req 9, 7, 8, 12). Pure-ish view layer:
// receives the app "state" (consolidated data, current selections, charges) and
// callbacks for recompute/approve/reject/export/inject.

import { t } from '../lib/i18n.js';
import { hintSpan } from './tooltip.js';
import { barChart } from './charts.js';
import { buildReviewDocument } from '../lib/approval.js';
import { financeJourney } from './doc.js';

const money = (v, cur) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`;

function fmtN(n) { return Math.round(n).toLocaleString(); }

// ---- Finance Overview: savings & earnings summary (before -> after portfolio) ----
export function renderOverview(state) {
  const { charges, beforeAfter = [] } = state;

  // portfolio before (engine claimed) -> after (tool entitled) -> recovered True-Up
  const totalBefore = beforeAfter.reduce((s, b) => s + (b.before?.claimed || 0), 0);
  const totalAfter = beforeAfter.reduce((s, b) => s + (b.after?.entitled || 0), 0);
  const totalTrueUp = beforeAfter.reduce((s, b) => s + (b.costOfInaction || 0), 0);
  const recoverableCount = beforeAfter.filter((b) => b.recoverable).length;
  const upliftPct = totalBefore > 0 ? ((totalAfter / totalBefore - 1) * 100) : 0;

  // status of the recovery pipeline (how much is approved / injected)
  const byStatus = {};
  for (const c of charges) byStatus[c.status] = (byStatus[c.status] || 0) + (c.variance || 0);
  const injected = (byStatus.INJECTED || 0) + (byStatus.EXPORTED || 0);
  const approved = byStatus.APPROVED || 0;
  const pending = byStatus.PENDING_APPROVAL || 0;

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

    <div class="ba">
      <div class="panel before"><div class="h">${t('before')}</div><div class="big">${fmtN(totalBefore)}</div><div class="small">${t('engineClaimed')}</div></div>
      <div class="arrow">→</div>
      <div class="panel after"><div class="h">${t('after')}</div><div class="big">${fmtN(totalAfter)}</div><div class="small">${t('toolEntitled')} · ${hintSpan(t('controlPeriod'), 'CONTROL_PERIOD')}</div></div>
    </div>
    <div class="loss-banner">${t('totalRecoverable')}: <strong>${fmtN(totalTrueUp)}</strong> &nbsp;·&nbsp; ${upliftPct.toFixed(1)}% ${t('upliftOnClaimed')} &nbsp;·&nbsp; ${recoverableCount} ${t('recoverableAgreements')}</div>

    <div class="kpi">
      <div class="box"><div class="n loss">${fmtN(totalTrueUp)}</div><div class="l">${t('totalRecoverable')} (True-Up)</div></div>
      <div class="box"><div class="n">${fmtN(injected)}</div><div class="l">${t('kpiExportedInjected')}</div></div>
      <div class="box"><div class="n">${fmtN(approved)}</div><div class="l">${t('kpiApprovedAwaiting')}</div></div>
      <div class="box"><div class="n">${fmtN(pending)}</div><div class="l">${t('kpiPendingApproval')}</div></div>
    </div>

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
export function reviewModalHtml(charge, group, reconstruction) {
  const doc = buildReviewDocument({ charge, agreement: group.agreement, reconstruction, contributingRecords: group.receipts.map((r) => r.receiptId) });
  const calc = doc.calculation;
  const corrections = (doc.corrections || []).map((c) =>
    `<tr><td>${hintSpan(c.driver.replace(/_/g, ' '), c.driver)}</td><td>${c.country ?? ''}</td><td class="num">${c.volumeDelta ?? 0}</td><td class="small">${c.note ?? ''}</td></tr>`).join('');
  const vols = (doc.reconstructedVolume || []).map((v) =>
    `<tr><td>${v.scopeKey}</td><td>${v.period}</td><td class="num">${Number(v.qualifyingVolume).toLocaleString()}</td></tr>`).join('');
  const audit = (doc.auditTrace || []).map((e) =>
    `<tr><td class="mono">${e.seq}</td><td class="mono small">${e.timestamp}</td><td>${e.actor}</td><td>${e.action}</td></tr>`).join('');

  return `
  <div class="modal-bg" id="reviewBg">
    <div class="modal">
      <h2>${t('reviewDoc')} — ${charge.chargeId}</h2>
      <div class="sub">${doc.supplier.name} · ${doc.agreementId} · ${doc.scopeKey} · ${doc.period}</div>

      <div class="section"><h4>CCOGS True-Up ${charge.tierFromPct != null && charge.tierToPct != null && charge.tierFromPct !== charge.tierToPct ? `· ${charge.tierFromPct}% → ${charge.tierToPct}%` : ''}</h4>
        <div class="kv">
          <div class="k">${t('structure')}</div><div>${calc.structure ?? charge.structure ?? ''} / ${calc.basis ?? charge.basis ?? ''}</div>
          <div class="k">Original CCOGS (claimed)</div><div>${money(calc.claimedCcogs, calc.currency)}</div>
          <div class="k">Recomputed CCOGS (entitled)</div><div>${money(calc.entitledCcogs, calc.currency)}</div>
          <div class="k">Recoverable True-Up</div><div><strong style="color:var(--gold)">${money(calc.variance, calc.currency)}</strong>${(charge.eurEquivalent ?? calc.eurEquivalent) != null ? ` (${money(charge.eurEquivalent ?? calc.eurEquivalent, 'EUR')})` : ''}</div>
        </div>
      </div>

      ${(charge.lines && charge.lines.length) ? `<div class="section"><h4>Itemized causes</h4>
        <table><thead><tr><th>Cause</th><th class="num">Qty</th><th class="num">From%</th><th class="num">To%</th><th class="num">Delta</th></tr></thead>
        <tbody>${charge.lines.map((l) => `<tr><td>${l.cause}${l.note ? `<div class="small">${l.note}</div>` : ''}</td><td class="num">${Number(l.qty).toLocaleString()}</td><td class="num">${l.fromPct}%</td><td class="num">${l.toPct}%</td><td class="num">${money(l.deltaValue, calc.currency)}</td></tr>`).join('')}
        <tr class="mf-total"><td colspan="4">Total recoverable (cumulative)</td><td class="num">${money(calc.variance, calc.currency)}</td></tr></tbody></table>
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

      <div class="actions">
        <button class="btn primary" data-gencontra="${charge.chargeId}">${t('genContraInvoice')}</button>
        <button class="btn ghost" data-closemodal>${t('close')}</button>
      </div>
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
    // ---- ML DISCOVERY — the big, detailed section (end-to-end mapping) ----
    { id: 'ml', h: t('ab.h.ml'), body: `
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
    { id: 'finance', h: t('ab.h.finance'), body: `<p>${t('ab.p.finance')}</p>` },
    { id: 'roles', h: t('ab.h.roles'), body: `<p>${t('ab.p.roles')}</p>` },
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
