// Dashboard rendering (DOM). Uses the analytics selectors + i18n. Renders the
// Storage, Accounting and Finance views (Finance includes SVG charts + forecast)
// and the Inventory audit module.

import { storageView, accountingView, financeView } from '../lib/analytics.js';
import { monthlyInventory, inventoryMonths } from '../lib/inventory.js';
import { monthlySeries, forecast } from '../lib/forecast.js';
import { groupedBars, lineForecast } from './charts.js';
import { t } from '../lib/i18n.js';

const money = (n) => '€' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => (Number(n) || 0).toLocaleString();
const STATUS_ORDER = ['Received', 'InTransitPending', 'PartiallyReceived', 'FullyMatched', 'Paid', 'Archived', 'UnderInvestigation', 'Resolved', 'Unresolvable'];
const label = (status) => t('status.' + status);

function tbl(headers, rows) {
  if (!rows.length) return `<p class="muted">${t('inv.none')}</p>`;
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---- Storage ----
function storageHtml(pf, storageId) {
  const sv = storageView(pf, { storageId });
  const storages = [...new Set(pf.flatMap((v) => v.storages))].sort();
  const options = [`<option value="">${t('model.all')}</option>`]
    .concat(storages.map((s) => `<option value="${s}"${s === storageId ? ' selected' : ''}>${s}</option>`)).join('');
  return `
    <div class="dash-head"><h3>${t('storage.title')}</h3>
      <label class="filter">${t('storage.filter')} <select id="storage-filter">${options}</select></label></div>
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

// ---- Finance (with charts + forecast) ----
function financeHtml(pf) {
  const fv = financeView(pf);
  const series = monthlySeries(pf);
  const fc = forecast(series.months, series.risk, 3);
  const bars = groupedBars(series.months, series.risk, series.debits, { labelA: t('fin.legendRisk'), labelB: t('fin.legendDebits') });
  const line = lineForecast(series.months, series.risk, fc.months, fc.values, {});
  const cards = `
    <div class="cards">
      <div class="card"><span class="k">${t('fin.invoices')}</span><span class="v">${fv.totals.invoices}</span></div>
      <div class="card"><span class="k">${t('fin.openVar')}</span><span class="v">${money(fv.totals.openValueAtRisk)}</span></div>
      <div class="card"><span class="k">${t('fin.pendingCredit')}</span><span class="v">${money(fv.totals.totalPendingCredit)}</span></div>
    </div>`;
  return `
    <h3>${t('fin.title')}</h3>
    ${cards}
    <h4>${t('fin.byStatus')}</h4>
    ${tbl([t('th.status'), t('th.count')], Object.entries(fv.byStatus).sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b)).map(([s, c]) => [label(s), c]))}
    <h4>${t('fin.storages')}</h4>
    ${tbl([t('th.storage'), t('th.openInvoices'), t('th.detail'), ''], fv.storagesWithIssues.map((s) => [s.storageId, s.count, s.openInvoices.join(', '), `<button class="link drill" data-storage="${s.storageId}">${t('fin.view')}</button>`]))}
    <h4>${t('fin.trendTitle')}</h4>
    <div class="chart-wrap">${bars}</div>
    <h4>${t('fin.forecastTitle')}</h4>
    <div class="chart-wrap">${line}</div>
    <p class="chart-legend"><span class="lg lg-actual"></span>${t('fin.legendRisk')} &nbsp;&nbsp; <span class="lg lg-forecast"></span>${t('fin.legendForecast')}</p>
    <p class="muted small">${t('fin.forecastNote')}</p>
  `;
}

// ---- Inventory ----
const fmtDate = (dt) => String(dt).replace('T', ' ').slice(0, 16);
function detailCard(d) {
  const cs = d.contraStatus === 'Applied'
    ? `${t('inv.contra')} ${t('contra.applied')}: ${money(d.recognizedContra)}`
    : `${t('inv.contra')} ${t('contra.' + d.contraStatus.toLowerCase())} — ${t('contra.recognized')} ${money(d.recognizedContra)}${d.pendingCredit ? ` (${money(d.pendingCredit)} ${t('contra.pending')})` : ''}`;
  return `
    <div class="inv-card">
      <div class="inv-card-head"><strong>${d.invoiceNumber}</strong> <span class="tag">${label(d.status)}</span></div>
      <p class="muted">${d.distributorId} · Model ${d.model}</p>
      <ul class="kv">
        <li><span>${t('inv.delivered')}</span><strong>${qty(d.receivedQty)} ${t('inv.of')} ${qty(d.invoicedQty)}</strong></li>
        <li><span>${t('inv.missing')}</span><strong>${qty(d.missingQty)}</strong></li>
        <li><span>${t('inv.contra')}</span><strong>${cs}</strong></li>
      </ul>
      <h4>${t('inv.receipts')}</h4>
      ${tbl([t('th.storage'), t('th.qty'), t('th.receivedOn')], d.receiptsByStorage.map((s) => [s.storageId, qty(s.qty), s.receipts.map((r) => fmtDate(r.datetime)).join('<br>')]))}
      <h4>${t('inv.deliveryNotes')}</h4>
      ${tbl([t('th.note'), t('th.storage'), t('th.source')], d.deliveryNotes.map((n) => [n.deliveryNoteId, n.targetStorageId, n.sourceFile || '—']))}
      <h4>${t('inv.creditNotes')}</h4>
      ${tbl([t('th.note'), t('th.period'), t('th.amount'), t('th.status'), t('th.source')], d.creditNotes.map((n) => [n.creditNoteId, n.period, money(n.amount), n.status, n.sourceFile || '—']))}
      <h4>${t('inv.audit')}</h4>
      ${tbl([t('th.when'), t('th.actor'), t('th.change')], d.audit.map((a) => [fmtDate(a.timestamp), a.actor, a.change]))}
      <p class="muted">${t('inv.source')}: ${d.provenance.invoiceSourceFile || '—'}</p>
    </div>`;
}

export function renderInventory(container, invoices, ctx, handlers = {}) {
  const months = inventoryMonths(invoices, ctx.goodsReceipts);
  const month = handlers.month || months[months.length - 1] || '';
  const list = month ? monthlyInventory(invoices, ctx, { month }) : [];
  const monthOpts = months.map((m) => `<option value="${m}"${m === month ? ' selected' : ''}>${m}</option>`).join('');
  container.innerHTML = `
    <div class="dash-head"><h3>${t('inv.title')}</h3>
      <div class="inv-controls">
        <label class="filter">${t('inv.month')} <select id="inv-month">${monthOpts}</select></label>
        <button class="btn" id="inv-export">${t('inv.export')}</button>
      </div>
    </div>
    ${list.length ? list.map(detailCard).join('') : `<p class="muted">${t('inv.none')}</p>`}`;
  const sel = container.querySelector('#inv-month');
  if (sel && handlers.onMonth) sel.addEventListener('change', (e) => handlers.onMonth(e.target.value));
  const exp = container.querySelector('#inv-export');
  if (exp && handlers.onExport) exp.addEventListener('click', () => handlers.onExport(month, list));
}

export function renderDashboard(container, role, pf, handlers = {}) {
  if (role === 'storage') container.innerHTML = storageHtml(pf, handlers.storageId || null);
  else if (role === 'accounting') container.innerHTML = accountingHtml(pf);
  else if (role === 'finance') container.innerHTML = financeHtml(pf);
  else container.innerHTML = `<p class="muted">${t('inv.none')}</p>`;

  const filter = container.querySelector('#storage-filter');
  if (filter && handlers.onFilter) filter.addEventListener('change', (e) => handlers.onFilter(e.target.value || null));
  container.querySelectorAll('.drill').forEach((b) => { if (handlers.onDrill) b.addEventListener('click', () => handlers.onDrill(b.dataset.storage)); });
  container.querySelectorAll('.act-pay').forEach((b) => { if (handlers.onMarkPaid) b.addEventListener('click', () => handlers.onMarkPaid(b.dataset.inv)); });
  container.querySelectorAll('.act-archive').forEach((b) => { if (handlers.onArchive) b.addEventListener('click', () => handlers.onArchive(b.dataset.inv)); });
}
