// Dashboard rendering (DOM). Consumes the pure analytics selectors and renders
// the Storage, Accounting, and Finance views. Event wiring is attached after render.

import { storageView, accountingView, financeView } from '../lib/analytics.js';
import { monthlyInventory, inventoryMonths } from '../lib/inventory.js';

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

function detailCard(d) {
  return `
    <div class="inv-card">
      <div class="inv-card-head"><strong>${d.invoiceNumber}</strong> · ${d.distributorId} · Model ${d.model} · <span class="tag">${d.status}</span></div>
      <p class="muted">Invoiced ${d.invoicedQty} · Received ${d.receivedQty} · Missing ${d.missingQty} · Contra ${d.contraStatus} (recognized ${money(d.recognizedContra)}${d.pendingCredit ? `, pending ${money(d.pendingCredit)}` : ''})</p>
      <h4>Receipts by storage</h4>
      ${tbl(['Storage', 'Qty', 'Dates'], d.receiptsByStorage.map((s) => [s.storageId, s.qty, s.receipts.map((r) => r.datetime).join('<br>')]))}
      <h4>Delivery notes</h4>
      ${tbl(['Note', 'Storage', 'Source'], d.deliveryNotes.map((n) => [n.deliveryNoteId, n.targetStorageId, n.sourceFile || '—']))}
      <h4>Credit notes</h4>
      ${tbl(['Note', 'Period', 'Amount', 'Status', 'Source'], d.creditNotes.map((n) => [n.creditNoteId, n.period, money(n.amount), n.status, n.sourceFile || '—']))}
      <h4>Audit history</h4>
      ${tbl(['When', 'Actor', 'Change'], d.audit.map((a) => [a.timestamp, a.actor, a.change]))}
      <p class="muted">Source: ${d.provenance.invoiceSourceFile || '—'}</p>
    </div>`;
}

/**
 * Render the Inventory audit module.
 * ctx: { goodsReceipts, deliveryNotes, creditNotes, auditLog }
 * handlers: { month, onMonth(month), onExport(month, list) }
 */
export function renderInventory(container, invoices, ctx, handlers = {}) {
  const months = inventoryMonths(invoices, ctx.goodsReceipts);
  const month = handlers.month || months[months.length - 1] || '';
  const list = month ? monthlyInventory(invoices, ctx, { month }) : [];
  const monthOpts = months.map((m) => `<option value="${m}"${m === month ? ' selected' : ''}>${m}</option>`).join('');

  container.innerHTML = `
    <div class="dash-head"><h3>Inventory — audit</h3>
      <div class="inv-controls">
        <label class="filter">Month <select id="inv-month">${monthOpts}</select></label>
        <button class="btn" id="inv-export">Export month (JSON)</button>
      </div>
    </div>
    ${list.length ? list.map(detailCard).join('') : '<p class="muted">No invoices for this month.</p>'}`;

  const sel = container.querySelector('#inv-month');
  if (sel && handlers.onMonth) sel.addEventListener('change', (e) => handlers.onMonth(e.target.value));
  const exp = container.querySelector('#inv-export');
  if (exp && handlers.onExport) exp.addEventListener('click', () => handlers.onExport(month, list));
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
