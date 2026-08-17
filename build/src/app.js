// Perfumeries — Contra COGS Reconciliation
// Entry point. Wires the startup source scan -> ingestion -> persistence and
// renders a lightweight ingest summary. Role views/dashboards arrive in later tasks.

import { VERSION } from './lib/version.js';
import { SourceScanner, defaultSources } from './lib/source.js';
import { ingestFiles, persistIngest } from './lib/ingest.js';
import { StateStore, getLocalStorageBackend, createMemoryBackend } from './lib/store.js';
import { ScanStatus } from './lib/enums.js';

const LABELS = { database: 'Database', api: 'API', folder: 'Folder' };
const STATE_CLASS = {
  [ScanStatus.FOUND]: 'found',
  [ScanStatus.ERROR]: 'error',
  [ScanStatus.NO_UPDATES]: '',
  [ScanStatus.SCANNING]: '',
};

function renderScanRows() {
  const scan = document.getElementById('scan-status');
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

function renderSummary(result) {
  const root = document.getElementById('view-root');
  if (!root) return;
  const storages = new Set(result.goodsReceipts.map((g) => g.storageId));
  const received = result.goodsReceipts.reduce((s, g) => s + g.qtyReceived, 0);
  const errors = result.errors.length;
  const incomplete = result.incomplete.length;
  root.innerHTML = `
    <h2>Ingest summary</h2>
    <ul class="summary">
      <li><strong>${result.invoices.length}</strong> invoice(s)</li>
      <li><strong>${result.deliveryNotes.length}</strong> delivery note(s)</li>
      <li><strong>${result.goodsReceipts.length}</strong> goods-receipt row(s) — ${received} units across ${storages.size} storage(s)</li>
      <li><strong>${result.creditNotes.length}</strong> credit note(s)</li>
      ${incomplete ? `<li class="warn">${incomplete} invoice(s) flagged incomplete</li>` : ''}
      ${errors ? `<li class="err">${errors} file error(s)</li>` : ''}
    </ul>
    <p class="hint">Matching, gaps, dashboards and the Inventory module arrive in the next tasks.</p>
  `;
}

async function boot() {
  const status = document.getElementById('build-status');
  if (status) status.textContent = `v${VERSION}`;

  const rows = renderScanRows();
  const onStatus = (id, state, message) => {
    const el = rows[id];
    if (!el) return;
    el.textContent = state === ScanStatus.SCANNING ? (message || 'scanning…') : (message || state);
    el.className = `state ${STATE_CLASS[state] || ''}`.trim();
  };

  const store = new StateStore(getLocalStorageBackend() || createMemoryBackend(), 'perfumeries');

  try {
    const { files } = await new SourceScanner(defaultSources(), { onStatus }).scanAll();
    const result = ingestFiles(files);
    persistIngest(store, result);
    renderSummary(result);
  } catch (err) {
    const root = document.getElementById('view-root');
    if (root) root.innerHTML = `<h2>Startup error</h2><p class="err">${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
