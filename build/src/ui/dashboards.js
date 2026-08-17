// Dashboard rendering (DOM). Consumes the pure analytics selectors and renders
// the Storage, Accounting, and Finance views. Event wiring is attached after render.

import { storageView, accountingView, financeView } from '../lib/analytics.js';

const money = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function tbl(headers, rows) {
  if (!rows.length) return '<p class="muted">None.</p>';
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function storageHtml(pf, storageId) {
  const sv = storageView(pf, { storageId });
  const storages = [...new Set(pf.flatMap((v) => v.storages))].sort();
  const options = ['<option value="">All storages</option>']
    .concat(storages.map((s) => `<option value="${s}"${s === storageId ? ' selected' : ''}>${s}</option>`)).join('');
  return `
    <div class="dash-head"><h3>Storage view</h3>
      <label class="filter">Storage <select id="storage-filter">${options}</select></label></div>
    <h4>On the way (${sv.onWay.length})</h4>
    ${tbl(['Invoice', 'Distributor', 'Invoiced', 'Received'], sv.onWay.map((v) => [v.invoiceNumber, v.distributorId, v.invoicedQty, v.receivedQty]))}
    <h4>Pending delivery (${sv.pendingDelivery.length})</h4>
    ${tbl(['Invoice', 'Missing', 'Value at risk', 'Storages'], sv.pendingDelivery.map((v) => [v.invoiceNumber, v.missingQty, money(v.valueAtRisk), v.storages.join(', ')]))}
    <h4>Aged pending</h4>
    ${tbl(['Invoice', 'Value', 'Age (days)'], sv.agedPending.map((a) => [a.invoiceNumber, money(a.value), a.ageDays]))}
    <h4>Trend by period (debits)</h4>
    ${tbl(['Period', 'Amount'], sv.trendByPeriod.map((t) => [t.period, money(t.amount)]))}
  `;
}

function accountingHtml(pf) {
  const av = accountingView(pf);
  return `
    <h3>Accounting view</h3>
    <p class="muted">Open: ${av.summary.openCount} · Closed: ${av.summary.closedCount} · Open value at risk: ${money(av.summary.openValueAtRisk)}</p>
    <h4>Open / not fully closed (${av.open.length})</h4>
    ${tbl(['Invoice', 'Status', 'Missing', 'Value at risk'], av.open.map((v) => [v.invoiceNumber, v.status, v.missingQty, money(v.valueAtRisk)]))}
    <h4>Closed (${av.closed.length})</h4>
    ${tbl(['Invoice', 'Status', 'Contra recognized'], av.closed.map((v) => [v.invoiceNumber, v.status, money(v.contra.recognizedContra)]))}
  `;
}

function financeHtml(pf) {
  const fv = financeView(pf);
  const cards = `
    <div class="cards">
      <div class="card"><span class="k">Invoices</span><span class="v">${fv.totals.invoices}</span></div>
      <div class="card"><span class="k">Value at risk</span><span class="v">${money(fv.totals.totalValueAtRisk)}</span></div>
      <div class="card"><span class="k">Pending contra credit</span><span class="v">${money(fv.totals.totalPendingCredit)}</span></div>
    </div>`;
  return `
    <h3>Finance view</h3>
    ${cards}
    <h4>By status</h4>
    ${tbl(['Status', 'Count'], Object.entries(fv.byStatus).map(([s, c]) => [s, c]))}
    <h4>Storages with pending issues</h4>
    ${tbl(['Storage', 'Invoices', 'Value at risk', ''], fv.storagesWithIssues.map((s) => [s.storageId, s.invoices.join(', '), money(s.valueAtRisk), `<button class="link drill" data-storage="${s.storageId}">view</button>`]))}
  `;
}

/**
 * Render a role dashboard into `container`.
 * handlers: { storageId, onFilter(storageId), onDrill(storageId) }
 */
export function renderDashboard(container, role, pf, handlers = {}) {
  if (role === 'storage') container.innerHTML = storageHtml(pf, handlers.storageId || null);
  else if (role === 'accounting') container.innerHTML = accountingHtml(pf);
  else if (role === 'finance') container.innerHTML = financeHtml(pf);
  else container.innerHTML = '<p class="muted">Select a role.</p>';

  const filter = container.querySelector('#storage-filter');
  if (filter && handlers.onFilter) filter.addEventListener('change', (e) => handlers.onFilter(e.target.value || null));
  container.querySelectorAll('.drill').forEach((b) => {
    if (handlers.onDrill) b.addEventListener('click', () => handlers.onDrill(b.dataset.storage));
  });
}
