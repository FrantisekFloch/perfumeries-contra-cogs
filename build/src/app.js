// Perfumeries — Contra COGS Reconciliation
// Startup flow: choose model -> scan -> ingest -> advance lifecycle -> build
// portfolio -> pick role -> render dashboard.

import { VERSION } from './lib/version.js';
import { defaultSources } from './lib/source.js';
import { StateStore, getLocalStorageBackend, createMemoryBackend } from './lib/store.js';
import { Session, getSessionBackend, createMemoryKV, ROLES } from './lib/session.js';
import { ScanStatus, ContraCogsModel, InvoiceStatus } from './lib/enums.js';
import { transition } from './lib/lifecycle.js';
import { buildPortfolio } from './lib/analytics.js';
import { runPipeline } from './lib/pipeline.js';
import { exportInventory } from './lib/inventory.js';
import { archiveInvoice, exportArchive } from './lib/archive.js';
import { renderDashboard, renderInventory } from './ui/dashboards.js';

const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.hidden = false; };

const LABELS = { database: 'Database', api: 'API', folder: 'Folder' };
const STATE_CLASS = { [ScanStatus.FOUND]: 'found', [ScanStatus.ERROR]: 'error', [ScanStatus.NO_UPDATES]: '', [ScanStatus.SCANNING]: '' };
const MODEL_DESC = {
  [ContraCogsModel.A]: 'Direct / line-item — net (discounted) unit price already on the invoice.',
  [ContraCogsModel.B]: 'Back-edge allowance — standard price + monthly credit note; contra held pending until cleared.',
};
const ROLE_LABELS = { storage: 'Storage', accounting: 'Accounting', finance: 'Finance' };

// module state
const store = new StateStore(getLocalStorageBackend() || createMemoryBackend(), 'perfumeries');
const session = new Session(getSessionBackend() || createMemoryKV());
let PORTFOLIO = [];
let storageFilter = null;
let currentView = 'role'; // 'role' | 'inventory'
let invMonth = null;

function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function renderModelPanel(onChosen) {
  const panel = $('model-panel');
  const current = session.getModel();
  panel.innerHTML = `
    <h2>Choose Contra COGS model</h2>
    <div class="model-choices">
      ${[ContraCogsModel.A, ContraCogsModel.B].map((m) => `
        <button class="model-btn${current === m ? ' selected' : ''}" data-model="${m}">
          <span class="model-name">Model ${m}</span>
          <span class="model-desc">${MODEL_DESC[m]}</span>
        </button>`).join('')}
    </div>
    <p class="hint">Sets the session model for the demo. Individual invoices still carry their own model.</p>`;
  panel.querySelectorAll('.model-btn').forEach((btn) => btn.addEventListener('click', () => {
    session.setModel(btn.dataset.model);
    renderModelPanel(onChosen);
    onChosen(btn.dataset.model);
  }));
}

function renderScanRows() {
  const scan = $('scan-status');
  scan.innerHTML = '';
  const rows = {};
  for (const id of ['database', 'api', 'folder']) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="src">${LABELS[id]}</span><span class="state">idle</span>`;
    scan.appendChild(li);
    rows[id] = li.querySelector('.state');
  }
  return rows;
}

function renderIngestSummary(result, model) {
  const el = $('ingest-summary');
  const storages = new Set(result.goodsReceipts.map((g) => g.storageId));
  const received = result.goodsReceipts.reduce((s, g) => s + g.qtyReceived, 0);
  el.innerHTML = `
    <p class="summary-line">Ingested <span class="badge">Model ${model}</span>
      ${result.invoices.length} invoice(s), ${result.deliveryNotes.length} delivery note(s),
      ${result.goodsReceipts.length} receipt row(s) — ${received} units / ${storages.size} storage(s),
      ${result.creditNotes.length} credit note(s)
      ${result.incomplete.length ? `· <span class="warn">${result.incomplete.length} incomplete</span>` : ''}
      ${result.errors.length ? `· <span class="err">${result.errors.length} error(s)</span>` : ''}
    </p>`;
}

function renderRoleBar() {
  const bar = $('role-bar');
  show(bar);
  const current = session.getRole();
  const roleTabs = ROLES.map((r) =>
    `<button class="role-tab${currentView === 'role' && current === r ? ' active' : ''}" data-role="${r}">${ROLE_LABELS[r]}</button>`).join('');
  const invTab = `<button class="role-tab${currentView === 'inventory' ? ' active' : ''}" data-inventory="1">Inventory</button>`;
  bar.innerHTML = roleTabs + invTab;
  bar.querySelectorAll('.role-tab').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.inventory) openInventory(); else selectRole(b.dataset.role);
  }));
}

function rebuildPortfolio() {
  PORTFOLIO = buildPortfolio(store.all('invoices'), store.all('goodsReceipts'), store.all('deliveryNotes'), { asOf: new Date().toISOString() });
}

function renderCurrentDashboard() {
  const root = $('view-root');
  show(root);
  renderDashboard(root, session.getRole(), PORTFOLIO, {
    storageId: storageFilter,
    onFilter: (sid) => { storageFilter = sid; renderCurrentDashboard(); },
    onDrill: (sid) => { storageFilter = sid; selectRole('storage'); },
    onMarkPaid: (inv) => { transition(store, inv, InvoiceStatus.PAID, { actor: 'accounting' }); rebuildPortfolio(); renderCurrentDashboard(); },
    onArchive: (inv) => {
      const record = archiveInvoice(store, inv, { actor: 'accounting' });
      downloadText(`archive_${inv}.json`, exportArchive(record));
      rebuildPortfolio(); renderCurrentDashboard();
    },
  });
}

function inventoryCtx() {
  return {
    goodsReceipts: store.all('goodsReceipts'),
    deliveryNotes: store.all('deliveryNotes'),
    creditNotes: store.all('creditNotes'),
    auditLog: store.auditLog(),
  };
}

function renderInventoryView() {
  const root = $('view-root');
  show(root);
  const invoices = store.all('invoices');
  renderInventory(root, invoices, inventoryCtx(), {
    month: invMonth,
    onMonth: (m) => { invMonth = m; renderInventoryView(); },
    onExport: (month, list) => downloadText(`inventory_${month || 'all'}.json`, exportInventory(list)),
  });
}

function selectRole(role) {
  currentView = 'role';
  session.setRole(role);
  renderRoleBar();
  renderCurrentDashboard();
}

function openInventory() {
  currentView = 'inventory';
  renderRoleBar();
  renderInventoryView();
}

async function runScan(model) {
  show($('scan-panel'));
  const rows = renderScanRows();
  const onStatus = (id, state, message) => {
    const el = rows[id];
    if (!el) return;
    el.textContent = state === ScanStatus.SCANNING ? (message || 'scanning…') : (message || state);
    el.className = `state ${STATE_CLASS[state] || ''}`.trim();
  };
  try {
    const { ingest, portfolio } = await runPipeline(store, defaultSources(), { onStatus });
    renderIngestSummary(ingest, model);
    PORTFOLIO = portfolio;

    renderRoleBar();
    selectRole(session.isRoleSelected() ? session.getRole() : 'finance');
  } catch (err) {
    const root = $('view-root');
    show(root);
    root.innerHTML = `<h2>Startup error</h2><p class="err">${err.message}</p>`;
  }
}

function boot() {
  const status = $('build-status');
  if (status) status.textContent = `v${VERSION}`;
  let started = false;
  const start = (model) => { if (started) return; started = true; runScan(model); };
  renderModelPanel(start);
  if (session.isModelSelected()) start(session.getModel());
}

document.addEventListener('DOMContentLoaded', boot);
