// Perfumeries — Contra COGS Reconciliation
// Entry point. Startup flow: choose Contra COGS model -> scan sources ->
// ingest -> persist -> render ingest summary. Dashboards/Inventory come later.

import { VERSION } from './lib/version.js';
import { SourceScanner, defaultSources } from './lib/source.js';
import { ingestFiles, persistIngest } from './lib/ingest.js';
import { StateStore, getLocalStorageBackend, createMemoryBackend } from './lib/store.js';
import { Session, getSessionBackend, createMemoryKV } from './lib/session.js';
import { ScanStatus, ContraCogsModel } from './lib/enums.js';

const LABELS = { database: 'Database', api: 'API', folder: 'Folder' };
const STATE_CLASS = {
  [ScanStatus.FOUND]: 'found',
  [ScanStatus.ERROR]: 'error',
  [ScanStatus.NO_UPDATES]: '',
  [ScanStatus.SCANNING]: '',
};
const MODEL_DESC = {
  [ContraCogsModel.A]: 'Direct / line-item — net (discounted) unit price already on the invoice.',
  [ContraCogsModel.B]: 'Back-edge allowance — standard price + monthly credit note; contra held pending until cleared.',
};

const $ = (id) => document.getElementById(id);

function show(el) { if (el) el.hidden = false; }

function renderModelPanel(session, onChosen) {
  const panel = $('model-panel');
  if (!panel) return;
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
    <p class="hint">This sets the session model for the demo. Individual invoices still carry their own model.</p>
  `;
  panel.querySelectorAll('.model-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      session.setModel(btn.dataset.model);
      renderModelPanel(session, onChosen); // reflect selection
      onChosen(btn.dataset.model);
    });
  });
}

function renderScanRows() {
  const scan = $('scan-status');
  if (!scan) return {};
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

function renderSummary(result, model) {
  const root = $('view-root');
  if (!root) return;
  show(root);
  const storages = new Set(result.goodsReceipts.map((g) => g.storageId));
  const received = result.goodsReceipts.reduce((s, g) => s + g.qtyReceived, 0);
  root.innerHTML = `
    <h2>Ingest summary <span class="badge">Model ${model}</span></h2>
    <ul class="summary">
      <li><strong>${result.invoices.length}</strong> invoice(s)</li>
      <li><strong>${result.deliveryNotes.length}</strong> delivery note(s)</li>
      <li><strong>${result.goodsReceipts.length}</strong> goods-receipt row(s) — ${received} units across ${storages.size} storage(s)</li>
      <li><strong>${result.creditNotes.length}</strong> credit note(s)</li>
      ${result.incomplete.length ? `<li class="warn">${result.incomplete.length} invoice(s) flagged incomplete</li>` : ''}
      ${result.errors.length ? `<li class="err">${result.errors.length} file error(s)</li>` : ''}
    </ul>
    <p class="hint">Matching, gaps, dashboards and the Inventory module arrive in the next tasks.</p>
  `;
}

async function runScan(store, model) {
  const scanPanel = $('scan-panel');
  show(scanPanel);
  const rows = renderScanRows();
  const onStatus = (id, state, message) => {
    const el = rows[id];
    if (!el) return;
    el.textContent = state === ScanStatus.SCANNING ? (message || 'scanning…') : (message || state);
    el.className = `state ${STATE_CLASS[state] || ''}`.trim();
  };
  try {
    const { files } = await new SourceScanner(defaultSources(), { onStatus }).scanAll();
    const result = ingestFiles(files);
    persistIngest(store, result);
    renderSummary(result, model);
  } catch (err) {
    const root = $('view-root');
    if (root) { show(root); root.innerHTML = `<h2>Startup error</h2><p class="err">${err.message}</p>`; }
  }
}

function boot() {
  const status = $('build-status');
  if (status) status.textContent = `v${VERSION}`;

  const store = new StateStore(getLocalStorageBackend() || createMemoryBackend(), 'perfumeries');
  const session = new Session(getSessionBackend() || createMemoryKV());

  let started = false;
  const start = (model) => { if (started) return; started = true; runScan(store, model); };

  renderModelPanel(session, start);
  if (session.isModelSelected()) start(session.getModel()); // resume prior choice
}

document.addEventListener('DOMContentLoaded', boot);
