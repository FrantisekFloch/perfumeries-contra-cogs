// Dashboard rendering (DOM). Uses the analytics selectors + i18n. Renders the
// Storage, Accounting and Finance views (Finance includes SVG charts + forecast)
// and the Inventory audit module.

import { storageView, accountingView, financeView, plView, distributorView, storageBreakdown, portfolioTotals } from '../lib/analytics.js';
import { monthlyInventory, inventoryMonths } from '../lib/inventory.js';
import { monthlySeries, forecast } from '../lib/forecast.js';
import { groupedBars, lineForecast } from './charts.js';
import { t } from '../lib/i18n.js';
import { BUYER, supplierFor, productName } from '../lib/companies.js';
import {
  exceptionFeed, agingHeatmap, slaTimers, contraWaterfall, workingCapital,
  marginErosion, tierProgress, rebateAtRisk, homeDigest,
} from '../lib/insights.js';

const money = (n) => '€' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => (Number(n) || 0).toLocaleString();
const modelType = (m) => (m === 'A' ? t('model.typeA') : m === 'B' ? t('model.typeB') : m);
const STATUS_ORDER = ['Received', 'InTransitPending', 'PartiallyReceived', 'FullyMatched', 'Paid', 'Archived', 'UnderInvestigation', 'Resolved', 'Unresolvable'];
const label = (status) => t('status.' + status);

function tbl(headers, rows) {
  if (!rows.length) return `<p class="muted">${t('inv.none')}</p>`;
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---- Home (page 0) ----
const EXC_CLS = { likelyLost: 'bad', lost: 'bad', over: 'warn', short: 'warn', delayed: 'info', aged: 'warn' };
export function exceptionFeedTeaserHtml(pf, limit = 6) {
  const feed = exceptionFeed(pf).slice(0, limit);
  if (!feed.length) return '';
  const rows = feed.map((e) => `<li class="exc-row exc-${EXC_CLS[e.type] || 'info'}">
    <span class="exc-type">${t('exc.' + e.type)}</span>
    <button class="exc-inv exc-link" data-inv="${e.invoiceNumber}" title="${t('exc.open')}">${e.invoiceNumber}</button>
    <span class="exc-meta">${e.distributorId} · ${qty(e.missingQty)} ${t('inv.missing').toLowerCase()} · ${e.ageDays}d</span>
    <span class="exc-risk">${money(e.valueAtRisk)}</span>
  </li>`).join('');
  return `<section class="home-exceptions">
    <h3 class="home-h">${t('home.exceptions')}</h3>
    <ul class="exc-list">${rows}</ul>
  </section>`;
}

export function homeHtml(pf, quality = null) {
  const tot = portfolioTotals(pf);
  const CLOSED = ['FullyMatched', 'Paid', 'Archived'];
  const open = pf.filter((v) => !CLOSED.includes(v.status)).length;
  const partial = pf.filter((v) => v.status === 'PartiallyReceived').length;
  const inTransit = pf.filter((v) => v.status === 'InTransitPending').length;
  const over = pf.filter((v) => (v.receivedQty || 0) > (v.invoicedQty || 0)).length;
  const storages = new Set(pf.flatMap((v) => v.storages)).size;

  const kpi = (v, k, cls = '') => `<div class="home-kpi ${cls}"><span class="v">${v}</span><span class="k">${k}</span></div>`;
  const quick = (go, title, desc) => `<button class="home-card" data-go="${go}"><span class="hc-t">${title}</span><span class="hc-d">${desc}</span></button>`;

  return `
    <div class="home">
      <header class="home-hero">
        <span class="home-eyebrow">${t('home.eyebrow')}</span>
        <h2>${t('home.welcome')}</h2>
        <p class="home-lead">${t('home.overview')}</p>
        <p class="home-sub">${t('home.data')}</p>
      </header>

      <div class="home-digest">${t('home.digest', homeDigest(pf))}</div>

      ${exceptionFeedTeaserHtml(pf)}

      <section class="home-metrics">
        <h3 class="home-h">${t('home.metricsTitle')}</h3>
        <div class="home-kpis">
          ${kpi(tot.invoices, t('home.k.invoices'))}
          ${kpi(money(tot.openValueAtRisk), t('home.k.risk'), 'accent')}
          ${kpi(money(tot.pendingContra), t('home.k.pending'), 'warn')}
          ${kpi(tot.fillRate + '%', t('home.k.fill'), 'ok')}
          ${kpi(open, t('home.k.open'))}
          ${kpi(storages, t('home.k.storages'))}
        </div>
        <div class="home-alerts">
          <span class="home-alert warn">${partial} ${t('home.a.partial')}</span>
          <span class="home-alert info">${inTransit} ${t('home.a.transit')}</span>
          <span class="home-alert warn">${over} ${t('home.a.over')}</span>
          <span class="home-alert ok">${money(tot.recognizedContra)} ${t('home.a.recognized')}</span>
        </div>
      </section>

      ${quality ? `<section class="home-dq">
        <h3 class="home-h">${t('dq.title')}</h3>
        ${quality.clean
          ? `<p class="dq-ok">✓ ${t('dq.clean', { n: quality.checked })}</p>`
          : `<ul class="dq-list">${quality.issues.map((i) => `<li class="dq-issue">${t('dq.' + i.type, { n: i.count })}</li>`).join('')}</ul>`}
      </section>` : ''}

      <section class="home-nav">
        <h3 class="home-h">${t('home.explore')}</h3>
        <p class="home-navtext">${t('home.navText')}</p>
        <div class="home-cards">
          ${quick('inventory', t('nav.inventoryAll'), t('home.c.inventory'))}
          ${quick('inventoryPartial', t('nav.inventoryPartial'), t('home.c.partial'))}
          ${quick('finance', t('nav.finance'), t('home.c.finance'))}
          ${quick('operations', t('nav.operations'), t('home.c.operations'))}
          ${quick('about', t('nav.about'), t('home.c.about'))}
        </div>
      </section>
    </div>`;
}

// ---- Storage ----
function storageHtml(pf, storageId) {
  const sv = storageView(pf, { storageId });
  const storages = [...new Set(pf.flatMap((v) => v.storages))].sort();
  const options = [`<option value="">${t('model.all')}</option>`]
    .concat(storages.map((s) => `<option value="${s}"${s === storageId ? ' selected' : ''}>${s}</option>`)).join('');
  const atRisk = sv.pendingDelivery.reduce((s, v) => s + (v.valueAtRisk || 0), 0);
  const scope = storageId || t('storage.allStorages');
  const summary = t('storage.situation', {
    scope, total: sv.count, onway: sv.onWay.length,
    pending: sv.pendingDelivery.length, aged: sv.agedPending.length, risk: money(atRisk),
  });
  return `
    <div class="dash-head"><h3>${t('storage.title')}</h3>
      <label class="filter">${t('storage.filter')} <select id="storage-filter">${options}</select></label></div>
    <p class="situation-line">📦 ${summary}</p>
    <h4>${t('storage.onway')} (${sv.onWay.length})</h4>
    ${tbl([t('th.invoice'), t('th.distributor'), t('th.invoiced'), t('th.received')], sv.onWay.map((v) => [v.invoiceNumber, v.distributorId, qty(v.invoicedQty), qty(v.received)]))}
    <h4>${t('storage.pending')} (${sv.pendingDelivery.length})</h4>
    ${tbl([t('th.invoice'), t('th.missing'), t('th.valueAtRisk'), t('th.storages')], sv.pendingDelivery.map((v) => [v.invoiceNumber, qty(v.missingQty), money(v.valueAtRisk), v.storages.join(', ')]))}
    <h4>${t('storage.aged')}</h4>
    ${tbl([t('th.invoice'), t('th.value'), t('th.ageDays')], sv.agedPending.map((a) => [a.invoiceNumber, money(a.value), a.ageDays]))}
    <h4>${t('storage.trend')}</h4>
    ${tbl([t('th.period'), t('th.amount')], sv.trendByPeriod.map((r) => [r.period, money(r.amount)]))}
  `;
}

// ---- Accounting ----
function closedAction(v) {
  if (v.status === 'FullyMatched') return `<button class="link act-pay" data-inv="${v.invoiceNumber}">${t('act.markPaid')}</button>`;
  if (v.status === 'Paid') return `<button class="link act-archive" data-inv="${v.invoiceNumber}">${t('act.archive')}</button>`;
  return '—';
}
function accountingHtml(pf) {
  const av = accountingView(pf);
  return `
    <h3>${t('acc.title')}</h3>
    <p class="muted">${t('acc.summary', { open: av.summary.openCount, closed: av.summary.closedCount, risk: money(av.summary.openValueAtRisk) })}</p>
    <h4>${t('acc.open')} (${av.open.length})</h4>
    ${tbl([t('th.invoice'), t('th.status'), t('th.missing'), t('th.valueAtRisk')], av.open.map((v) => [v.invoiceNumber, label(v.status), qty(v.missingQty), money(v.valueAtRisk)]))}
    <h4>${t('acc.closed')} (${av.closed.length})</h4>
    ${tbl([t('th.invoice'), t('th.status'), t('th.contraRecognized'), t('th.actions')], av.closed.map((v) => [v.invoiceNumber, label(v.status), money(v.contra.recognizedContra), closedAction(v)]))}
  `;
}

// ---- Operations (merged Storage + Accounting) ----
function agingHeatmapHtml(pf) {
  const hm = agingHeatmap(pf);
  if (!hm.rows.length) return `<p class="muted">${t('ops.noOpen')}</p>`;
  const head = `<th>${t('th.storage')}</th>` + hm.labels.map((l) => `<th class="num">${l}</th>`).join('') + `<th class="num">${t('th.value')}</th>`;
  const cell = (val) => {
    if (val <= 0) return `<td class="num heat heat-0">–</td>`;
    const intensity = Math.min(1, val / hm.max);
    const bg = `rgba(231,76,60,${(0.12 + intensity * 0.6).toFixed(2)})`;
    return `<td class="num heat" style="background:${bg}">${money(val)}</td>`;
  };
  const rows = hm.rows.map((r) => `<tr><td>${r.storageId}</td>${r.buckets.map(cell).join('')}<td class="num"><strong>${money(r.total)}</strong></td></tr>`).join('');
  return `<table class="grid heatmap"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function slaTimersHtml(pf) {
  const timers = slaTimers(pf).slice(0, 12);
  if (!timers.length) return `<p class="muted">${t('ops.noOpen')}</p>`;
  return timers.map((s) => {
    const cls = s.breached ? 'bad' : s.pct > 75 ? 'warn' : 'ok';
    const rem = s.breached ? t('ops.overdue', { n: -s.remaining }) : t('ops.daysLeft', { n: s.remaining });
    return `<div class="sla-row">
      <span class="sla-inv">${s.invoiceNumber}</span>
      <span class="sla-bar"><span class="sla-fill ${cls}" style="width:${s.pct}%"></span></span>
      <span class="sla-meta ${cls}">${s.used}/${s.sla}d · ${rem}</span>
      <span class="sla-risk">${money(s.valueAtRisk)}</span>
    </div>`;
  }).join('');
}

function operationsHtml(pf, storageId) {
  const sv = storageView(pf, { storageId });
  const av = accountingView(pf);
  const storages = [...new Set(pf.flatMap((v) => v.storages))].sort();
  const options = [`<option value="">${t('model.all')}</option>`]
    .concat(storages.map((s) => `<option value="${s}"${s === storageId ? ' selected' : ''}>${s}</option>`)).join('');
  const atRisk = sv.pendingDelivery.reduce((s, v) => s + (v.valueAtRisk || 0), 0);
  const situation = t('ops.situation', {
    scope: storageId || t('storage.allStorages'), total: sv.count,
    onway: sv.onWay.length, pending: sv.pendingDelivery.length, aged: sv.agedPending.length, risk: money(atRisk),
  });

  // Bulk-actionable closed table: fully matched rows get a checkbox for bulk pay/archive.
  const closedRows = av.closed.map((v) => {
    const canPay = v.status === 'FullyMatched';
    const cb = canPay ? `<input type="checkbox" class="bulk-cb" data-inv="${v.invoiceNumber}"/>` : '';
    return [cb, v.invoiceNumber, label(v.status), money(v.contra.recognizedContra), closedAction(v)];
  });

  return `
   <div class="ops-view">
    <div class="dash-head"><h3>${t('ops.title')}</h3>
      <label class="filter">${t('storage.filter')} <select id="storage-filter">${options}</select></label></div>
    <p class="situation-line">📦 ${situation}</p>

    <h4>${t('ops.slaTitle')}</h4>
    <div class="sla-list">${slaTimersHtml(pf)}</div>

    <h4>${t('ops.agingTitle')}</h4>
    ${agingHeatmapHtml(pf)}

    <h4>${t('storage.onway')} (${sv.onWay.length})</h4>
    ${tbl([t('th.invoice'), t('th.distributor'), t('th.invoiced'), t('th.received')], sv.onWay.map((v) => [v.invoiceNumber, v.distributorId, qty(v.invoicedQty), qty(v.received)]))}

    <h4>${t('storage.pending')} (${sv.pendingDelivery.length})</h4>
    ${tbl([t('th.invoice'), t('th.missing'), t('th.valueAtRisk'), t('th.storages')], sv.pendingDelivery.map((v) => [v.invoiceNumber, qty(v.missingQty), money(v.valueAtRisk), v.storages.join(', ')]))}

    <h4>${t('acc.open')} (${av.open.length})</h4>
    ${tbl([t('th.invoice'), t('th.status'), t('th.missing'), t('th.valueAtRisk')], av.open.map((v) => [v.invoiceNumber, label(v.status), qty(v.missingQty), money(v.valueAtRisk)]))}

    <div class="bulk-head"><h4>${t('acc.closed')} (${av.closed.length})</h4>
      <button class="btn ghost" id="bulk-pay" disabled>${t('ops.bulkPay')}</button></div>
    ${tbl(['<span class="cbh"></span>', t('th.invoice'), t('th.status'), t('th.contraRecognized'), t('th.actions')], closedRows)}
   </div>`;
}

// ---- Finance (with charts + forecast) ----
function issueIndicators(pf) {
  const closed = pf.filter((v) => ['FullyMatched', 'Paid', 'Archived'].includes(v.status)).length;
  const partial = pf.filter((v) => v.status === 'PartiallyReceived').length;
  const coming = pf.filter((v) => v.status === 'InTransitPending').length;
  // "Potential loss" = open invoices still missing quantity that are not simply in transit.
  const lost = pf.filter((v) => v.missingQty > 0 && v.status === 'UnderInvestigation').length;
  const cell = (n, key, cls) => `<div class="issue ${cls}"><span class="v">${n}</span><span class="k">${t(key)}</span></div>`;
  return `
    <h4>${t('fin.issues')}</h4>
    <div class="issues">
      ${cell(closed, 'fin.iss.closed', 'ok')}
      ${cell(partial, 'fin.iss.partial', 'warn')}
      ${cell(coming, 'fin.iss.coming', 'info')}
      ${cell(lost, 'fin.iss.lost', 'bad')}
    </div>`;
}

function financeHtml(pf) {
  const fv = financeView(pf);
  const cards = `
    <div class="cards">
      <div class="card"><span class="k">${t('fin.invoices')}</span><span class="v">${fv.totals.invoices}</span></div>
      <div class="card"><span class="k">${t('fin.openVar')}</span><span class="v">${money(fv.totals.openValueAtRisk)}</span></div>
      <div class="card"><span class="k">${t('fin.pendingCredit')}</span><span class="v">${money(fv.totals.totalPendingCredit)}</span></div>
    </div>`;
  const tot = portfolioTotals(pf);
  const pl = plView(pf);
  const dist = distributorView(pf);
  const sb = storageBreakdown(pf);
  const kpi2 = `
    <div class="cards">
      <div class="card"><span class="k">${t('fin.deliveredValue')}</span><span class="v">${money(tot.deliveredValue)}</span></div>
      <div class="card"><span class="k">${t('fin.contraRecognized')}</span><span class="v">${money(tot.recognizedContra)}</span></div>
      <div class="card"><span class="k">${t('fin.fillRate')}</span><span class="v">${tot.fillRate}%</span></div>
      <div class="card"><span class="k">${t('fin.unitsMoved')}</span><span class="v">${qty(tot.receivedQty)} / ${qty(tot.invoicedQty)}</span></div>
    </div>`;
  const plRows = [
    [t('fin.pl.revenue'), money(pl.revenue)],
    [t('fin.pl.grossCogs'), money(pl.grossCogs)],
    [t('fin.pl.contra'), '− ' + money(pl.contraCogsRecognized)],
    [t('fin.pl.netCogs'), money(pl.netCogs)],
    [t('fin.pl.margin'), money(pl.grossMargin)],
    [t('fin.pl.pending'), money(pl.pendingContra)],
  ];
  const plTable = `<table class="grid pl"><tbody>${plRows.map(([k, v], i) => `<tr class="${i === 4 ? 'pl-strong' : ''}"><td>${k}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>`;
  const wf = contraWaterfall(pf);
  const wc = workingCapital(pf);
  const ero = marginErosion(pf);
  const tiers = tierProgress(pf);
  const rar = rebateAtRisk(pf);
  const wfMax = Math.max(1, wf.full);
  const wfBar = (step) => {
    const w = Math.round((step.value / wfMax) * 100);
    return `<div class="wf-row"><span class="wf-k">${t('wf.' + step.label)}</span>
      <span class="wf-track"><span class="wf-fill wf-${step.kind}" style="width:${w}%"></span></span>
      <span class="wf-v">${money(step.value)}</span></div>`;
  };
  const wcTile = `<div class="cards">
    <div class="card"><span class="k">${t('wc.dpo')}</span><span class="v">${wc.dpo}d</span></div>
    <div class="card"><span class="k">${t('wc.avgAge')}</span><span class="v">${wc.avgOpenAgeDays}d</span></div>
    <div class="card"><span class="k">${t('wc.cashLocked')}</span><span class="v">${money(wc.cashLocked)}</span></div>
  </div>`;
  const tierRows = tiers.map((d) => `<div class="tier-row">
      <span class="tier-d">${d.distributorId} <span class="muted small">(${modelType(d.model)})</span></span>
      <span class="tier-track"><span class="tier-fill" style="width:${d.pct}%"></span></span>
      <span class="tier-meta">${d.currentPct}%${d.toNextTier > 0 ? ` → ${d.nextPct}% ${t('tier.inUnits', { n: qty(d.toNextTier) })}` : ` · ${t('tier.top')}`}${d.extraRebate > 0 ? ` · +${money(d.extraRebate)}` : ''}</span>
    </div>`).join('');
  return `
   <div class="fin-view">
    <div class="fin-head"><h3>${t('fin.title')}</h3><button class="btn" id="board-export">${t('fin.boardExport')}</button></div>
    ${cards}
    ${kpi2}
    ${issueIndicators(pf)}
    <h4>${t('fin.waterfallTitle')}</h4>
    <div class="waterfall">${wf.steps.map(wfBar).join('')}</div>
    <p class="muted small">${t('fin.waterfallNote')}</p>
    <h4>${t('fin.wcTitle')}</h4>
    ${wcTile}
    <h4>${t('fin.tierTitle')} <span class="help" title="${t('fin.tierHelp')}">?</span></h4>
    <div class="tier-list">${tierRows || `<p class="muted">—</p>`}</div>
    <h4>${t('fin.rebateRiskTitle')} (${money(ero.total)})</h4>
    ${tbl([t('th.invoice'), t('th.distributor'), t('fin.reason'), t('th.valueAtRisk')], rar.slice(0, 12).map((r) => [r.invoiceNumber, r.distributorId, t('reason.' + r.reason), money(r.atRisk)]))}
    <h4>${t('fin.plTitle')}</h4>
    ${plTable}
    <p class="muted small">${t('fin.plNote')}</p>
    <h4>${t('fin.distTitle')}</h4>
    ${tbl([t('th.distributor'), t('th.type'), t('fin.invoices'), t('fin.deliveredValue'), t('fin.contraRecognized'), t('fin.pendingCredit'), t('fin.fillRate')],
      dist.map((d) => [d.distributorId, modelType(d.model), d.invoices, money(d.deliveredValue), money(d.recognizedContra), money(d.pendingContra), d.fillRate + '%']))}
    <h4>${t('fin.storageTitle')}</h4>
    ${tbl([t('th.storage'), t('fin.invoices'), t('th.openInvoices'), t('th.valueAtRisk'), ''],
      sb.map((s) => [s.storageId, s.invoices, s.openInvoices, money(s.openValueAtRisk), `<button class="link drill" data-storage="${s.storageId}">${t('fin.view')}</button>`]))}
    <h4>${t('fin.byStatus')}</h4>
    ${tbl([t('th.status'), t('th.count')], Object.entries(fv.byStatus).sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b)).map(([s, c]) => [label(s), c]))}
    <h4>${t('fin.trendTitle')}</h4>
    ${financeChartsTail(pf)}
   </div>`;
}
function financeChartsTail(pf) {
  const series = monthlySeries(pf);
  const fc = forecast(series.months, series.risk, 3);
  const bars = groupedBars(series.months, series.risk, series.debits, { labelA: t('fin.legendRisk'), labelB: t('fin.legendDebits') });
  const line = lineForecast(series.months, series.risk, fc.months, fc.values, {});
  return `
    <div class="chart-wrap">${bars}</div>
    <h4>${t('fin.forecastTitle')}</h4>
    <div class="chart-wrap">${line}</div>
    <p class="chart-legend"><span class="lg lg-actual"></span>${t('fin.legendRisk')} &nbsp;&nbsp; <span class="lg lg-forecast"></span>${t('fin.legendForecast')}</p>
    <p class="muted small">${t('fin.forecastNote')}</p>
  `;
}

// #11 Board-ready one-pager (printable summary of the whole portfolio).
export function boardSummaryHtml(pf) {
  const tot = portfolioTotals(pf);
  const wf = contraWaterfall(pf);
  const feed = exceptionFeed(pf).slice(0, 5);
  const dist = distributorView(pf);
  const dg = homeDigest(pf);
  return `
  <article class="invoice-doc board">
    <header class="doc-head"><div class="doc-brand">Perfumeries</div>
      <div class="doc-title">${t('board.title')}</div></header>
    <p class="muted">${t('home.digest', dg)}</p>
    <h4>${t('board.kpis')}</h4>
    <div class="cards">
      <div class="card"><span class="k">${t('fin.invoices')}</span><span class="v">${tot.invoices}</span></div>
      <div class="card"><span class="k">${t('fin.openVar')}</span><span class="v">${money(tot.openValueAtRisk)}</span></div>
      <div class="card"><span class="k">${t('fin.contraRecognized')}</span><span class="v">${money(tot.recognizedContra)}</span></div>
      <div class="card"><span class="k">${t('fin.pendingCredit')}</span><span class="v">${money(tot.pendingContra)}</span></div>
    </div>
    <h4>${t('fin.waterfallTitle')}</h4>
    ${tbl([t('th.detail'), t('th.amount')], wf.steps.map((s) => [t('wf.' + s.label), money(s.value)]))}
    <h4>${t('board.topRisks')}</h4>
    ${tbl([t('exc.header'), t('th.invoice'), t('th.distributor'), t('th.valueAtRisk')], feed.map((e) => [t('exc.' + e.type), e.invoiceNumber, e.distributorId, money(e.valueAtRisk)]))}
    <h4>${t('fin.distTitle')}</h4>
    ${tbl([t('th.distributor'), t('fin.deliveredValue'), t('fin.contraRecognized'), t('fin.pendingCredit')], dist.map((d) => [d.distributorId, money(d.deliveredValue), money(d.recognizedContra), money(d.pendingContra)]))}
    <p class="doc-einv">${t('board.note')}</p>
  </article>`;
}

// #18 Chase-email draft (SK/EN) for an invoice's missing goods, from its inventory detail.
export function chaseEmailText(d) {
  const sup = supplierFor(d.distributorId);
  const shortStores = (d.receivedSituation || []).filter((s) => s.situation === 'short' || s.situation === 'pending' || s.situation === 'lost' || s.situation === 'delayed');
  const lines = shortStores.map((s) => `  - ${s.storageId}: ${t('chase.expected')} ${qty(s.expected)}, ${t('chase.received')} ${qty(s.received)}, ${t('chase.missing')} ${qty(s.missing)}`).join('\n')
    || `  - ${t('chase.totalMissing')}: ${qty(d.missingQty)}`;
  return t('chase.body', {
    supplier: sup.name, invoice: d.invoiceNumber, missing: qty(d.missingQty), lines,
    company: BUYER.name,
  });
}

// #16 What-if simulator UI (interactive slider inside the doc modal body).
export function whatIfHtml(d) {
  const missing = d.missingQty || 0;
  return `<div class="whatif" data-inv="${d.invoiceNumber}" data-missing="${missing}"
      data-tier="${(d.receivedSituation && 0) || ''}">
    <h4>${t('inv.whatif')} — ${d.invoiceNumber}</h4>
    <p class="muted small">${t('whatif.intro', { missing: qty(missing) })}</p>
    <label class="whatif-ctl">${t('whatif.extra')}
      <input type="range" id="whatif-range" min="0" max="${missing}" value="${missing}" step="${Math.max(1, Math.round(missing / 100))}"/>
      <output id="whatif-out">${qty(missing)}</output>
    </label>
    <div id="whatif-result" class="whatif-result"></div>
  </div>`;
}

// ---- Inventory ----
const fmtDate = (dt) => String(dt).replace('T', ' ').slice(0, 16);

// Received-situation chips (only storages the invoice ships to). Visible collapsed + expanded.
function situationChips(d) {
  const sit = d.receivedSituation || [];
  if (!sit.length) return '';
  const chips = sit.map((s) => {
    const eta = s.expectedDate && (s.situation === 'delayed' || s.situation === 'rerouted')
      ? ` · ${t('inv.eta')} ${s.expectedDate}` : '';
    const qtyInfo = s.expected ? ` · ${qty(s.received)}/${qty(s.expected)}` : '';
    const overInfo = s.situation === 'over' ? ` · +${qty(s.over)}` : '';
    return `<span class="chip chip-${s.situation}" title="${t('inv.sit.' + s.situation)}${qtyInfo}${overInfo}${eta}">${s.storageId}</span>`;
  }).join('');
  return `<span class="chips" aria-label="${t('inv.situation')}">${chips}</span>`;
}

function monthlySplitLine(d) {
  const parts = (d.monthlySplit || []).filter((m) => m.amount > 0);
  if (parts.length <= 1) return '';
  const list = parts.map((m) => `${m.period} (${money(m.amount)})`).join(' · ');
  // The split-month signal is the Contra COGS miss: because an invoice may only be
  // raised for goods actually delivered (delivery date required), the tier volume gets
  // split across months and the discount can't fully qualify until the rest arrives.
  return `<p class="cc-miss" title="${t('inv.ccMissTip')}">⚠ ${t('inv.ccMiss')}: ${list}</p>`;
}

// #1 Journey timeline — Invoiced → Shipped → In transit → Received.
// Progress varies by invoice age so brand-new invoices show only "Invoiced",
// slightly older ones "Shipped", then "In transit", then "Received" once goods arrive.
function invoiceAgeDays(d) {
  const t0 = new Date(d.proformaDate || Date.now()).getTime();
  if (Number.isNaN(t0)) return 99;
  return Math.max(0, Math.round((Date.now() - t0) / 86400000));
}
function journeyHtml(d) {
  const age = invoiceAgeDays(d);
  const allReceived = d.missingQty <= 0 && d.invoicedQty > 0;
  const anyReceived = (d.receivedQty || 0) > 0;
  // Age gates for the pre-receipt legs (only when nothing has been received yet).
  const shipped = anyReceived || allReceived || age >= 1; // shipped ~a day after invoicing
  const transit = anyReceived || allReceived || age >= 3; // in transit a few days out
  const steps = [
    { key: 'invoiced', done: true },
    { key: 'shipped', done: shipped },
    { key: 'transit', done: transit },
    { key: 'received', done: allReceived },
  ];
  const dots = steps.map((s, i) => `
    <span class="jn-step ${s.done ? 'done' : ''}">
      <span class="jn-dot"></span><span class="jn-lbl">${t('journey.' + s.key)}</span>
    </span>${i < steps.length - 1 ? `<span class="jn-line ${s.done ? 'done' : ''}"></span>` : ''}`).join('');
  return `<div class="journey">${dots}</div>`;
}

function detailBody(d) {
  const cs = d.contraStatus === 'Applied'
    ? `${t('inv.contra')} ${t('contra.applied')}: ${money(d.recognizedContra)}`
    : `${t('inv.contra')} ${t('contra.' + d.contraStatus.toLowerCase())} — ${t('contra.recognized')} ${money(d.recognizedContra)}${d.pendingCredit ? ` (${money(d.pendingCredit)} ${t('contra.pending')})` : ''}`;
  const proforma = d.type === 'proforma' ? t('inv.proformaDate') : t('inv.invoiceDate');
  return `
      <ul class="kv">
        <li><span>${proforma}</span><strong>${d.proformaDate || '—'}</strong></li>
        <li><span>${t('inv.delivered')}</span><strong>${qty(d.receivedQty)} ${t('inv.of')} ${qty(d.invoicedQty)}</strong></li>
        <li><span>${t('inv.missing')}</span><strong>${qty(d.missingQty)}</strong></li>
        <li><span>${t('inv.contra')}</span><strong>${cs}</strong></li>
      </ul>
      ${journeyHtml(d)}
      ${monthlySplitLine(d)}
      ${(d.overQty || 0) > 0 ? `<p class="over-warn" title="${t('inv.overTip')}">⚠ ${t('inv.overWarn', { n: qty(d.overQty) })}</p>` : ''}
      ${d.missingQty > 0 ? `<div class="inv-actions">
        <button class="btn ghost chase-btn" data-inv="${d.invoiceNumber}">✉ ${t('inv.chase')}</button>
        <button class="btn ghost whatif-btn" data-inv="${d.invoiceNumber}">${t('inv.whatif')}</button>
      </div>` : ''}
      <h4 class="anchor-situation">${t('inv.situation')}</h4>
      <div class="sit-full">${situationChips(d) || `<span class="muted">—</span>`}</div>
      <h4 class="anchor-receipts">${t('inv.receipts')}</h4>
      ${tbl([t('th.storage'), t('th.expected'), t('th.received'), t('th.missing'), t('th.receivedOn')], d.receiptsByStorage.map((s) => {
        const short = (s.missing || 0) > 0;
        const over = (s.over || 0) > 0;
        const recCell = short ? `<span class="qty-short">${qty(s.qty)}</span>`
          : over ? `<span class="qty-over">${qty(s.qty)}</span>` : qty(s.qty);
        const missCell = short ? `<span class="qty-short">${qty(s.missing)}</span>`
          : over ? `<span class="qty-over">+${qty(s.over)}</span>` : '0';
        const dates = s.receipts.map((r) => fmtDate(r.datetime)).join('<br>') || '—';
        const src = s.deliverySource ? `<span class="src-fyi">${s.deliverySource}</span>` : '';
        return [s.storageId, qty(s.expected || 0), recCell, missCell, `${dates}${src ? '<br>' + src : ''}`];
      }))}
      <h4>${t('inv.creditNotes')}</h4>
      ${tbl([t('th.note'), t('th.period'), t('th.amount'), t('th.status'), t('th.source')], d.creditNotes.map((n) => [n.creditNoteId, n.period, money(n.amount), n.status, n.sourceFile || '—']))}
      <h4>${t('inv.audit')}</h4>
      ${tbl([t('th.when'), t('th.actor'), t('th.change')], d.audit.map((a) => [fmtDate(a.timestamp), a.actor, a.change]))}
      <p class="muted">${t('inv.source')}: ${d.provenance.invoiceSourceFile || '—'}</p>`;
}

function detailCard(d, collapsed) {
  return `
    <div class="inv-card${collapsed ? ' collapsed' : ''}" data-inv="${d.invoiceNumber}">
      <div class="inv-card-head">
        <button class="inv-toggle" data-inv="${d.invoiceNumber}" aria-expanded="${!collapsed}" title="${collapsed ? t('inv.expand') : t('inv.collapse')}">${collapsed ? '▸' : '▾'}</button>
        <strong>${d.invoiceNumber}</strong>
        <span class="row-date">${d.proformaDate || ''}</span>
        <span class="tag">${label(d.status)}</span>
        <span class="muted small row-dist">${d.distributorId} · ${modelType(d.model)}</span>
        ${(d.overQty || 0) > 0 ? `<span class="row-flag flag-over" title="${t('inv.overWarn', { n: qty(d.overQty) })}">⚠ ${t('inv.sit.over')} +${qty(d.overQty)}</span>` : ''}
        ${(d.missingQty || 0) > 0 ? `<span class="row-flag flag-short" title="${t('inv.missing')}: ${qty(d.missingQty)}">${t('inv.missing')} ${qty(d.missingQty)}</span>` : ''}
        <span class="chips-inline">${situationChips(d)}</span>
        <button class="btn ghost inv-doc-btn inv-doc-sm" data-inv="${d.invoiceNumber}">📄 ${t('inv.viewDoc')}</button>
      </div>
      <div class="inv-card-body">${detailBody(d)}</div>
    </div>`;
}

// Which situations count as "issue" (for the "Has issues" filter).
const hasIssue = (d) => (d.overQty || 0) > 0 || (d.receivedSituation || []).some((s) => ['lost', 'delayed', 'rerouted', 'pending', 'short', 'over'].includes(s.situation));
function matchesStatusFilter(d, f) {
  if (!f || f === 'all') return true;
  if (f === 'partial') return d.status === 'PartiallyReceived';
  if (f === 'intransit') return d.status === 'InTransitPending';
  if (f === 'matched') return ['FullyMatched', 'Paid', 'Archived'].includes(d.status);
  if (f === 'issues') return hasIssue(d);
  return true;
}

const collapsedSet = new Set(); // remembers collapsed invoices across re-renders

export function renderInventory(container, invoices, ctx, handlers = {}) {
  const months = inventoryMonths(invoices, ctx.goodsReceipts);
  const partialOnly = handlers.partialOnly === true;
  const allMonths = handlers.allMonths === true;
  const statusFilter = handlers.statusFilter || (partialOnly ? 'partial' : 'all');
  const month = allMonths ? '' : (handlers.month || months[months.length - 1] || '');

  // Build the list: all months (union) or a single month.
  let list = allMonths
    ? invoices.flatMap((inv) => monthlyInventory([inv], ctx, { month: inventoryMonths([inv], ctx.goodsReceipts)[0] || '' }))
    : (month ? monthlyInventory(invoices, ctx, { month }) : []);
  // De-dupe (an invoice can appear once per active month when unioned).
  const seen = new Set();
  list = list.filter((d) => (seen.has(d.invoiceNumber) ? false : seen.add(d.invoiceNumber)));
  list = list.filter((d) => matchesStatusFilter(d, statusFilter));

  // Sort by invoice date (newest / oldest) when requested.
  const sort = handlers.sort || 'default';
  const dateVal = (d) => new Date(d.proformaDate || 0).getTime() || 0;
  if (sort === 'newest') list.sort((a, b) => dateVal(b) - dateVal(a));
  else if (sort === 'oldest') list.sort((a, b) => dateVal(a) - dateVal(b));

  // On a fresh open of the view, collapse every invoice for a tidy overview.
  if (handlers.collapseAllDefault) list.forEach((d) => collapsedSet.add(d.invoiceNumber));

  const monthOpts = months.map((m) => `<option value="${m}"${m === month ? ' selected' : ''}>${m}</option>`).join('');
  const filterBtn = (val, key) => `<button class="chip-btn${statusFilter === val ? ' active' : ''}" data-status="${val}">${t(key)}</button>`;
  const sortBtn = (val, key) => `<button class="chip-btn${sort === val ? ' active' : ''}" data-sort="${val}">${t(key)}</button>`;
  const title = partialOnly ? t('nav.inventoryPartial') : t('nav.inventoryAll');
  const statusBtns = partialOnly ? '' : `
        ${filterBtn('all', 'inv.f.all')}
        ${filterBtn('partial', 'inv.f.partial')}
        ${filterBtn('intransit', 'inv.f.intransit')}
        ${filterBtn('matched', 'inv.f.matched')}
        ${filterBtn('issues', 'inv.f.issues')}`;
  const filters = `
      <div class="inv-filters">
        ${statusBtns}
        <span class="inv-filter-sep"></span>
        ${sortBtn('newest', 'inv.sort.newest')}
        ${sortBtn('oldest', 'inv.sort.oldest')}
      </div>`;

  container.innerHTML = `
    <div class="dash-head"><h3>${title}</h3>
      <div class="inv-controls">
        <label class="filter">${t('inv.month')} <select id="inv-month"${allMonths ? ' disabled' : ''}>${monthOpts}</select></label>
        <button class="chip-btn${allMonths ? ' active' : ''}" id="inv-allmonths">${t('inv.allMonths')}</button>
        <button class="btn ghost" id="inv-collapse">${t('inv.collapseAll')}</button>
        <button class="btn ghost" id="inv-expand">${t('inv.expandAll')}</button>
        <button class="btn" id="inv-export">${t('inv.export')}</button>
      </div>
    </div>
    ${filters}
    <p class="muted small">${t('inv.countLabel', { n: list.length })}</p>
    <div class="inv-list">${list.length ? list.map((d) => detailCard(d, collapsedSet.has(d.invoiceNumber))).join('') : `<p class="muted">${t('inv.none')}</p>`}</div>`;

  // Wire month + all-months + export.
  const sel = container.querySelector('#inv-month');
  if (sel && handlers.onMonth) sel.addEventListener('change', (e) => handlers.onMonth(e.target.value));
  const am = container.querySelector('#inv-allmonths');
  if (am && handlers.onAllMonths) am.addEventListener('click', () => handlers.onAllMonths(!allMonths));
  const exp = container.querySelector('#inv-export');
  if (exp && handlers.onExport) exp.addEventListener('click', () => handlers.onExport(allMonths ? 'all' : month, list));

  // Status filter buttons.
  container.querySelectorAll('.chip-btn[data-status]').forEach((b) => {
    if (handlers.onStatusFilter) b.addEventListener('click', () => handlers.onStatusFilter(b.dataset.status));
  });
  // Sort buttons (toggle off if already active → back to default order).
  container.querySelectorAll('.chip-btn[data-sort]').forEach((b) => {
    if (handlers.onSort) b.addEventListener('click', () => handlers.onSort(sort === b.dataset.sort ? 'default' : b.dataset.sort));
  });

  // Collapse / expand (local UI state, no re-fetch).
  container.querySelectorAll('.inv-toggle').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.inv;
    if (collapsedSet.has(id)) collapsedSet.delete(id); else collapsedSet.add(id);
    const card = container.querySelector(`.inv-card[data-inv="${id}"]`);
    const nowCollapsed = collapsedSet.has(id);
    card.classList.toggle('collapsed', nowCollapsed);
    b.textContent = nowCollapsed ? '▸' : '▾';
    b.setAttribute('aria-expanded', String(!nowCollapsed));
    b.title = nowCollapsed ? t('inv.expand') : t('inv.collapse');
  }));
  const setAll = (collapse) => {
    list.forEach((d) => { if (collapse) collapsedSet.add(d.invoiceNumber); else collapsedSet.delete(d.invoiceNumber); });
    container.querySelectorAll('.inv-card').forEach((card) => {
      card.classList.toggle('collapsed', collapse);
      const b = card.querySelector('.inv-toggle');
      if (b) { b.textContent = collapse ? '▸' : '▾'; b.setAttribute('aria-expanded', String(!collapse)); }
    });
  };
  const cAll = container.querySelector('#inv-collapse');
  if (cAll) cAll.addEventListener('click', () => setAll(true));
  const eAll = container.querySelector('#inv-expand');
  if (eAll) eAll.addEventListener('click', () => setAll(false));

  // "View invoice" → open the printable e-invoice document for that invoice.
  container.querySelectorAll('.inv-doc-btn').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const inv = invoices.find((iv) => iv.invoiceNumber === b.dataset.inv);
    if (inv && handlers.onViewDoc) handlers.onViewDoc(inv);
  }));
  // #18 chase-email · #16 what-if
  container.querySelectorAll('.chase-btn').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); if (handlers.onChase) handlers.onChase(b.dataset.inv);
  }));
  container.querySelectorAll('.whatif-btn').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); if (handlers.onWhatIf) handlers.onWhatIf(b.dataset.inv);
  }));
}

// ---- Connect-source dialog (task 4) ----
const field = (key, id, opts = {}) => {
  const lbl = t('connect.f.' + key);
  if (opts.options) {
    const os = opts.options.map((o) => `<option value="${o}">${o}</option>`).join('');
    return `<label class="fld"><span>${lbl}</span><select id="cf-${id}">${os}</select></label>`;
  }
  return `<label class="fld"><span>${lbl}</span><input id="cf-${id}" type="${opts.type || 'text'}" value="${opts.value || ''}" placeholder="${opts.ph || ''}"/></label>`;
};

/** Returns { title, html } for the connect dialog of a given kind. */
export function connectForm(kind) {
  if (kind === 'edi') {
    return { title: t('connect.edi.title'), html: [
      field('name', 'name', { value: 'Maison Aroma — EDI (AS2)', ph: 'Maison Aroma EDI' }),
      field('protocol', 'protocol', { options: ['AS2', 'OFTP2', 'SFTP', 'X.400'] }),
      field('host', 'host', { value: 'as2://edi.maisonaroma.sk/as2/inbound' }),
      field('partnerId', 'partnerId', { value: '8591234000019' }),
      field('username', 'username', { value: 'perfumeries-b2b' }),
      field('password', 'password', { type: 'password', value: '••••••••••' }),
    ].join('') };
  }
  if (kind === 'api') {
    return { title: t('connect.api.title'), html: [
      field('name', 'name', { value: 'Nordic Scents — REST API', ph: 'Nordic Scents API' }),
      field('baseUrl', 'baseUrl', { value: 'https://api.nordicscents.se/v2' }),
      field('auth', 'auth', { options: ['OAuth2 (client credentials)', 'API key', 'Basic'] }),
      field('token', 'token', { type: 'password', value: '••••••••••••••••' }),
      field('poll', 'poll', { options: ['Every 15 min', 'Hourly', 'Every 4h', 'Daily 06:00'] }),
    ].join('') };
  }
  return { title: t('connect.folder.title'), html: [
    field('name', 'name', { value: 'OneDrive — AP inbox', ph: 'Shared drive inbox' }),
    field('path', 'path', { value: './data/incoming/', ph: './data/incoming/' }),
    field('pattern', 'pattern', { value: '*.xml, *.csv' }),
    field('format', 'format', { options: ['XML (invoice/DN)', 'CSV (RECADV)', 'Mixed'] }),
  ].join('') + `<p class="muted small">${t('connect.demoNote')}</p>` };
}

// ---- Printable EU e-invoice document (task 9) ----
const VAT_RATE = 0.20;
function addDaysIso(dateStr, days) {
  const d = new Date(dateStr || Date.now());
  if (Number.isNaN(d.getTime())) return dateStr || '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Line-item × storage distribution (from delivery notes) for the doc's second page. */
function lineItemSplit(invoice, deliveryNotes) {
  const notes = deliveryNotes.filter((d) => d.invoiceNumber === invoice.invoiceNumber);
  const storages = [...new Set(notes.map((n) => n.targetStorageId))].sort();
  if (!storages.length) return '';
  // qty[stockId][storageId] = shipped
  const qtyMap = {};
  notes.forEach((n) => n.lines.forEach((l) => {
    (qtyMap[l.stockId] ||= {});
    qtyMap[l.stockId][n.targetStorageId] = (qtyMap[l.stockId][n.targetStorageId] || 0) + (l.qtyShipped || 0);
  }));
  const head = `<th>${t('inv.doc.col.desc')}</th>` + storages.map((s) => `<th class="num">${s}</th>`).join('') + `<th class="num">${t('inv.doc.col.total')}</th>`;
  const rows = invoice.lines.map((l) => {
    const per = qtyMap[l.stockId] || {};
    const cells = storages.map((s) => `<td class="num">${per[s] ? qty(per[s]) : '—'}</td>`).join('');
    const total = storages.reduce((sum, s) => sum + (per[s] || 0), 0);
    return `<tr><td>${productName(l.stockId, l.description)}</td>${cells}<td class="num">${qty(total)}</td></tr>`;
  }).join('');
  const totalsRow = `<tr class="split-total"><td>${t('inv.doc.split.total')}</td>` +
    storages.map((s) => {
      const col = invoice.lines.reduce((sum, l) => sum + ((qtyMap[l.stockId] || {})[s] || 0), 0);
      return `<td class="num">${qty(col)}</td>`;
    }).join('') +
    `<td class="num">${qty(invoice.lines.reduce((sum, l) => sum + Object.values(qtyMap[l.stockId] || {}).reduce((a, b) => a + b, 0), 0))}</td></tr>`;
  return `
    <section class="doc-split">
      <h4 class="doc-split-h">${t('inv.doc.split.title')}</h4>
      <p class="muted small">${t('inv.doc.split.note')}</p>
      <table class="doc-lines"><thead><tr>${head}</tr></thead><tbody>${rows}${totalsRow}</tbody></table>
    </section>`;
}

/** Full Slovak/English e-invoice document for one invoice (returns HTML). */
export function invoiceDocHtml(invoice, deliveryNotes = []) {
  const sup = supplierFor(invoice.distributorId);
  const isProforma = invoice.type === 'proforma';
  const issue = invoice.invoiceDate || '';
  const rows = invoice.lines.map((l) => {
    const unit = (l.unitPriceNet != null ? l.unitPriceNet : l.unitPriceStandard);
    const net = unit * l.qtyInvoiced;
    const vat = net * VAT_RATE;
    return { name: productName(l.stockId, l.description), qty: l.qtyInvoiced, unit, net, vat, total: net + vat };
  });
  const subtotal = rows.reduce((s, r) => s + r.net, 0);
  const vatTotal = rows.reduce((s, r) => s + r.vat, 0);
  const grand = subtotal + vatTotal;
  const party = (title, p) => `
    <div class="doc-party">
      <div class="doc-party-t">${title}</div>
      <strong>${p.name}</strong><br>${p.street}<br>${p.city}<br>${p.country}
      <div class="doc-ids">
        <span>${t('inv.doc.ico')}: ${p.ico}</span><span>${t('inv.doc.dic')}: ${p.dic}</span><span>${t('inv.doc.icdph')}: ${p.icdph}</span>
      </div>
    </div>`;
  const cell = (v, cls = '') => `<td class="${cls}">${v}</td>`;
  const lineRows = rows.map((r) => `<tr>
    ${cell(r.name)}${cell(qty(r.qty), 'num')}${cell(money(r.unit), 'num')}
    ${cell(money(r.net), 'num')}${cell(money(r.vat), 'num')}${cell(money(r.total), 'num')}
  </tr>`).join('');

  return `
  <article class="invoice-doc">
    <header class="doc-head">
      <div class="doc-brand">Perfumeries</div>
      <div class="doc-title">${isProforma ? t('inv.doc.proforma') : t('inv.doc.title')}</div>
    </header>
    <div class="doc-parties">
      ${party(t('inv.doc.supplier'), sup)}
      ${party(t('inv.doc.buyer'), BUYER)}
    </div>
    <div class="doc-meta">
      <div><span>${t('inv.doc.number')}</span><strong>${invoice.invoiceNumber}</strong></div>
      <div><span>${t('inv.doc.issue')}</span><strong>${issue}</strong></div>
      <div><span>${t('inv.doc.delivery')}</span><strong>${invoice.shipDate || issue}</strong></div>
      <div><span>${t('inv.doc.due')}</span><strong>${addDaysIso(issue, 30)}</strong></div>
      <div><span>${t('inv.doc.po')}</span><strong>${invoice.poReference || '—'}</strong></div>
      <div><span>${t('inv.doc.vs')}</span><strong>${String(invoice.invoiceNumber).replace(/\D/g, '') || '—'}</strong></div>
    </div>
    <table class="doc-lines">
      <thead><tr>
        <th>${t('inv.doc.col.desc')}</th><th class="num">${t('inv.doc.col.qty')}</th>
        <th class="num">${t('inv.doc.col.unit')}</th><th class="num">${t('inv.doc.col.net')}</th>
        <th class="num">${t('inv.doc.col.vat')}</th><th class="num">${t('inv.doc.col.total')}</th>
      </tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    <div class="doc-totals">
      <div><span>${t('inv.doc.subtotal')}</span><strong>${money(subtotal)}</strong></div>
      <div><span>${t('inv.doc.vat20')}</span><strong>${money(vatTotal)}</strong></div>
      <div class="grand"><span>${t('inv.doc.grand')}</span><strong>${money(grand)}</strong></div>
    </div>
    <div class="doc-pay">
      <div><span>${t('inv.doc.bank')}</span> ${BUYER.bank}</div>
      <div><span>${t('inv.doc.iban')}</span> ${sup.iban}</div>
      <div><span>${t('inv.doc.currency')}</span> ${invoice.currency || 'EUR'}</div>
    </div>
    <p class="doc-reg">${t('inv.doc.reg')}: ${BUYER.reg}</p>
    <p class="doc-einv">🔒 ${t('inv.doc.einv')}</p>
    ${lineItemSplit(invoice, deliveryNotes)}
  </article>`;
}

export function renderDashboard(container, role, pf, handlers = {}) {
  if (role === 'operations') container.innerHTML = operationsHtml(pf, handlers.storageId || null);
  else if (role === 'finance') container.innerHTML = financeHtml(pf);
  else container.innerHTML = operationsHtml(pf, handlers.storageId || null);

  const filter = container.querySelector('#storage-filter');
  if (filter && handlers.onFilter) filter.addEventListener('change', (e) => handlers.onFilter(e.target.value || null));
  container.querySelectorAll('.drill').forEach((b) => { if (handlers.onDrill) b.addEventListener('click', () => handlers.onDrill(b.dataset.storage)); });
  const board = container.querySelector('#board-export');
  if (board && handlers.onBoardExport) board.addEventListener('click', () => handlers.onBoardExport());
  container.querySelectorAll('.act-pay').forEach((b) => { if (handlers.onMarkPaid) b.addEventListener('click', () => handlers.onMarkPaid(b.dataset.inv)); });
  container.querySelectorAll('.act-archive').forEach((b) => { if (handlers.onArchive) b.addEventListener('click', () => handlers.onArchive(b.dataset.inv)); });

  // Bulk actions (#21): enable the bulk button when any checkbox is ticked.
  const cbs = [...container.querySelectorAll('.bulk-cb')];
  const bulkBtn = container.querySelector('#bulk-pay');
  if (bulkBtn) {
    const sync = () => { bulkBtn.disabled = !cbs.some((c) => c.checked); };
    cbs.forEach((c) => c.addEventListener('change', sync));
    bulkBtn.addEventListener('click', () => {
      const ids = cbs.filter((c) => c.checked).map((c) => c.dataset.inv);
      if (handlers.onBulkPay && ids.length) handlers.onBulkPay(ids);
    });
    sync();
  }
}
