// Perfumeries — Contra COGS Reconciliation
// Startup: scan -> ingest -> advance lifecycle -> build portfolio -> dashboards.
// Plus language (EN/SK), a model filter, an About view, and a guided tour.

import { VERSION } from './lib/version.js';
import { defaultSources } from './lib/source.js';
import { StateStore, getLocalStorageBackend, createMemoryBackend } from './lib/store.js';
import { Session, getSessionBackend, createMemoryKV, ROLES } from './lib/session.js';
import { InvoiceStatus } from './lib/enums.js';
import { transition } from './lib/lifecycle.js';
import { buildPortfolio } from './lib/analytics.js';
import { runPipeline } from './lib/pipeline.js';
import { ingestFiles, persistIngest } from './lib/ingest.js';
import { matchInvoice } from './lib/matching.js';
import { applyMatchStatus } from './lib/lifecycle.js';
import { exportInventoryCsv, exportInvoicesCsv, exportDeliveryNotesCsv, invoiceDetail } from './lib/inventory.js';
import { archiveInvoice, exportArchive } from './lib/archive.js';
import { renderDashboard, renderInventory, connectForm, invoiceDocHtml, deliveryNoteDocHtml, homeHtml, boardSummaryHtml, chaseEmailText } from './ui/dashboards.js';
import { whatIfContra } from './lib/insights.js';
import { t, setLang, getLang } from './lib/i18n.js';
import { startTour } from './ui/tour.js';
import { createBootLoader } from './ui/boot.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// Varied, natural-feeling boot pacing: quick "checks" vs. longer "downloads", with a
// little jitter so it never feels like a fixed-interval animation.
const jitter = (base, spread) => base + Math.round((Math.random() - 0.5) * 2 * spread);

const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.hidden = false; };
// App-local formatters (renamed to avoid clashing with dashboards.js in the offline bundle).
const fmtMoney = (n) => '€' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) => (Number(n) || 0).toLocaleString();

const store = new StateStore(getLocalStorageBackend() || createMemoryBackend(), 'perfumeries');
const session = new Session(getSessionBackend() || createMemoryKV());
let ALL_PORTFOLIO = [];
let lastIngest = null;
let currentView = 'home'; // 'home' | 'role' | 'inventory' | 'about'
let storageFilter = null;
let invMonth = null;
let invAllMonths = true; // default: show all months
let invStatusFilter = 'all';
let invSort = 'default';
let invFreshOpen = false; // set true when a tab opens the inventory, to collapse all once

function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Model filter removed — the whole portfolio is always shown.
const filteredPortfolio = () => ALL_PORTFOLIO;

// ---- static chrome (i18n) ----
function applyI18n() {
  $('subtitle').textContent = t('app.subtitle');
  $('tour-btn').textContent = t('btn.tour');
  $('scan-title').textContent = t('scan.title');
  if ($('connect-label')) $('connect-label').textContent = t('connect.label');
  if ($('connect-upload-label')) $('connect-upload-label').textContent = t('connect.upload');
  if ($('download-all-label')) $('download-all-label').textContent = t('scan.downloadAll');
  document.querySelectorAll('#lang-switch .flag').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
}

// ---- top summary (redistributed connected-source facts) ----
function warehouseCounts(ingest) {
  const wh = {};
  ingest.goodsReceipts.forEach((g) => { wh[g.storageId] = (wh[g.storageId] || 0) + 1; });
  return wh;
}
function renderTopScan() {
  if (!lastIngest) return;
  const r = lastIngest;
  const wh = warehouseCounts(r);
  const rows = [
    [t('scan.database'), t('scan.invoices', { n: r.invoices.length }), 'found'],
    [t('scan.api'), t('scan.creditNotes', { n: r.creditNotes.length }), r.creditNotes.length ? 'found' : ''],
    [t('scan.warehouses'), t('scan.whSummary', { w: Object.keys(wh).length, r: r.goodsReceipts.length }), 'found'],
  ];
  $('scan-status').innerHTML = rows.map(([src, val, cls]) =>
    `<li><span class="src">${src}</span><span class="state ${cls}">${val}</span></li>`).join('');
  $('ingest-summary').innerHTML = '';
}



// ---- role bar ----
function renderRoleBar() {
  const bar = $('role-bar'); show(bar);
  bar.setAttribute('role', 'tablist');
  const role = session.getRole();
  const tab = (active, attrs, lbl) => `<button role="tab" aria-selected="${active}"${active ? ' aria-current="page"' : ''} class="role-tab${active ? ' active' : ''}" ${attrs}>${lbl}</button>`;
  const home = tab(currentView === 'home', 'data-home="1"', t('nav.home'));
  const inv = tab(currentView === 'inventory', 'data-inventory="1"', t('nav.inventoryAll'));
  // Finance dashboard before Operations dashboard (finance is the priority view).
  const order = ['finance', 'operations'];
  const tabs = order.map((r) => tab(currentView === 'role' && role === r, `data-role="${r}"`, t('nav.' + r))).join('');
  const about = tab(currentView === 'about', 'data-about="1"', t('nav.about'));
  // Home · Inventory · Finance · Operations · About.
  bar.innerHTML = home + inv + tabs + about;
  bar.querySelectorAll('.role-tab').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.home) showHome();
    else if (b.dataset.inventory) openInventory();
    else if (b.dataset.about) showAbout();
    else selectRole(b.dataset.role);
  }));
}

// ---- views ----
function rebuildPortfolio() {
  ALL_PORTFOLIO = buildPortfolio(store.all('invoices'), store.all('goodsReceipts'), store.all('deliveryNotes'), { asOf: new Date().toISOString() });
}
function renderDash() {
  const root = $('view-root'); show(root);
  renderDashboard(root, session.getRole(), filteredPortfolio(), {
    storageId: storageFilter,
    onFilter: (sid) => { storageFilter = sid; renderDash(); },
    onDrill: (sid) => { storageFilter = sid; selectRole('storage'); },
    onMarkPaid: (inv) => { transition(store, inv, InvoiceStatus.PAID, { actor: 'accounting' }); rebuildPortfolio(); renderDash(); },
    onArchive: (inv) => { const rec = archiveInvoice(store, inv, { actor: 'accounting' }); downloadText(`archive_${inv}.json`, exportArchive(rec)); rebuildPortfolio(); renderDash(); },
    onBulkPay: (ids) => { ids.forEach((inv) => transition(store, inv, InvoiceStatus.PAID, { actor: 'accounting' })); rebuildPortfolio(); renderDash(); },
    onBoardExport: () => openBoard(),
  });
}
function openBoard() {
  $('doc-modal-title').textContent = t('board.title');
  $('doc-print').textContent = t('inv.doc.print');
  $('doc-print').onclick = printDoc;
  $('doc-modal-body').innerHTML = boardSummaryHtml(filteredPortfolio());
  $('doc-modal').hidden = false;
  try { $('doc-close').focus(); } catch { /* ignore */ }
}
function renderInventoryView() {
  const root = $('view-root'); show(root);
  const ctx = { goodsReceipts: store.all('goodsReceipts'), deliveryNotes: store.all('deliveryNotes'), creditNotes: store.all('creditNotes'), auditLog: store.auditLog() };
  const collapseAllDefault = invFreshOpen; invFreshOpen = false; // collapse once, on open
  renderInventory(root, store.all('invoices'), ctx, {
    month: invMonth,
    allMonths: invAllMonths,
    statusFilter: invStatusFilter,
    sort: invSort,
    collapseAllDefault,
    onMonth: (m) => { invMonth = m; invAllMonths = false; renderInventoryView(); },
    onAllMonths: (on) => { invAllMonths = on; renderInventoryView(); },
    onStatusFilter: (f) => { invStatusFilter = f; renderInventoryView(); },
    onSort: (s) => { invSort = s; renderInventoryView(); },
    onExport: (month, list) => downloadText(`inventory_${month || 'all'}.csv`, exportInventoryCsv(list), 'text/csv'),
    onViewDoc: (invoice) => openDoc(invoice),
    onViewDeliveryNote: (invoice) => openDeliveryNote(invoice),
    onChase: (invNum) => openChase(invNum),
    onWhatIf: (invNum) => openWhatIf(invNum),
  });
}

function openChase(invNum) {
  const ctx = { goodsReceipts: store.all('goodsReceipts'), deliveryNotes: store.all('deliveryNotes'), creditNotes: store.all('creditNotes'), auditLog: store.auditLog() };
  const inv = store.all('invoices').find((i) => i.invoiceNumber === invNum);
  if (!inv) return;
  const d = invoiceDetail(inv, ctx);
  const text = chaseEmailText(d);
  $('doc-modal-title').textContent = t('inv.chase');
  $('doc-print').textContent = t('chase.copy');
  $('doc-modal-body').innerHTML = `<pre class="chase-pre" id="chase-text">${text}</pre>`;
  $('doc-modal').hidden = false;
  const printBtn = $('doc-print');
  printBtn.onclick = () => { try { navigator.clipboard && navigator.clipboard.writeText(text); } catch { /* ignore */ } printBtn.textContent = t('chase.copied'); };
}

function openWhatIf(invNum) {
  const view = ALL_PORTFOLIO.find((v) => v.invoiceNumber === invNum);
  const inv = store.all('invoices').find((i) => i.invoiceNumber === invNum);
  if (!view) return;
  const missing = view.missingQty || 0;
  const step = Math.max(1, Math.round(missing / 100));
  const render = (extra) => {
    const r = whatIfContra(view, extra, inv);
    return `<div class="whatif-result">
      <div class="cards">
        <div class="card"><span class="k">${t('whatif.before')}</span><span class="v">${fmtMoney(r.before)}</span></div>
        <div class="card"><span class="k">${t('whatif.after')}</span><span class="v">${fmtMoney(r.after)}</span></div>
        <div class="card"><span class="k">${t('whatif.delta')}</span><span class="v">+${fmtMoney(r.delta)}</span></div>
      </div>
      <p class="muted small">${r.clears ? t('whatif.clears') : t('whatif.stillOpen', { n: fmtQty(r.invoicedQty - r.newReceived) })}</p>
    </div>`;
  };
  $('doc-modal-title').textContent = `${t('inv.whatif')} — ${invNum}`;
  $('doc-print').textContent = t('inv.doc.close');
  $('doc-modal-body').innerHTML = `
    <div class="whatif">
      <p class="muted small">${t('whatif.intro', { missing: fmtQty(missing) })}</p>
      <label class="whatif-ctl">${t('whatif.extra')}
        <input type="range" id="whatif-range" min="0" max="${missing}" value="${missing}" step="${step}"/>
        <output id="whatif-out">${fmtQty(missing)}</output>
      </label>
      <div id="whatif-slot">${render(missing)}</div>
    </div>`;
  $('doc-modal').hidden = false;
  const range = $('whatif-range');
  range.addEventListener('input', () => {
    const v = Number(range.value);
    $('whatif-out').textContent = fmtQty(v);
    $('whatif-slot').innerHTML = render(v);
  });
  $('doc-print').onclick = () => closeDoc();
}

// ---- invoice document modal ----
function openDoc(invoice) {
  $('doc-modal-title').textContent = `${invoice.invoiceNumber}`;
  $('doc-print').textContent = t('inv.doc.print');
  $('doc-print').onclick = printDoc;
  $('doc-modal-body').innerHTML = invoiceDocHtml(invoice, store.all('deliveryNotes'));
  $('doc-modal').hidden = false;
  try { $('doc-close').focus(); } catch { /* ignore */ }
}
function openDeliveryNote(invoice) {
  $('doc-modal-title').textContent = `${invoice.invoiceNumber} — ${t('inv.viewDeliveryNote')}`;
  $('doc-print').textContent = t('inv.doc.print');
  $('doc-print').onclick = printDoc;
  $('doc-modal-body').innerHTML = deliveryNoteDocHtml(invoice, store.all('deliveryNotes'), store.all('goodsReceipts'));
  $('doc-modal').hidden = false;
  try { $('doc-close').focus(); } catch { /* ignore */ }
}
function closeDoc() { $('doc-modal').hidden = true; }
function printDoc() {
  const html = $('doc-modal-body').innerHTML;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Invoice</title>${document.querySelector('style') ? `<style>${document.querySelector('style').textContent}</style>` : ''}</head><body class="print-invoice">${html}</body></html>`);
  w.document.close(); w.focus(); w.print();
}
function wireDocModal() {
  const close = $('doc-close'); if (close) close.addEventListener('click', closeDoc);
  // NOTE: the action button (#doc-print) is driven per-open via .onclick (print / copy /
  // close), so we do NOT attach a permanent listener here — that caused every modal's
  // action button to also trigger print (opening a new tab).
  const modal = $('doc-modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeDoc(); });
}
function renderHome() {
  const root = $('view-root'); show(root);
  root.innerHTML = homeHtml(filteredPortfolio());
  root.querySelectorAll('.home-card').forEach((b) => b.addEventListener('click', () => {
    const go = b.dataset.go;
    if (go === 'inventory') openInventory();
    else if (go === 'about') showAbout();
    else selectRole(go);
  }));
}

function renderAbout() {
  const root = $('view-root'); show(root);
  // Terms-&-conditions-style manual: numbered sections + sticky table of contents.
  const sections = [
    { id: 'overview', h: t('about.h.overview'), body: `<p>${t('about.p.overview')}</p>` },
    { id: 'data', h: t('about.h.data'), body: `<p>${t('about.p.data')}</p>` },
    { id: 'tabs', h: t('about.h.tabs'), body: `<ul class="manual">
        <li>${t('about.tab.home')}</li>
        <li>${t('about.tab.inventory')}</li>
        <li>${t('about.tab.operations')}</li>
        <li>${t('about.tab.finance')}</li>
        <li>${t('about.tab.about')}</li></ul>` },
    { id: 'inventory', h: t('about.h.inv'), body: `<p>${t('about.p.inv')}</p>
        <ul class="manual">
          <li>${t('about.inv.chips')}</li>
          <li>${t('about.inv.receipts')}</li>
          <li>${t('about.inv.ccmiss')}</li>
          <li>${t('about.inv.over')}</li>
          <li>${t('about.inv.filters')}</li>
          <li>${t('about.inv.doc')}</li>
        </ul>` },
    { id: 'statuses', h: t('about.h.statuses'), body: `<ul class="manual">
        <li><span class="chip chip-received">${t('status.Received')}</span> ${t('about.st.received')}</li>
        <li><span class="chip chip-short">${t('inv.sit.short')}</span> ${t('about.st.short')}</li>
        <li><span class="chip chip-over">${t('inv.sit.over')}</span> ${t('about.st.over')}</li>
        <li><span class="chip chip-rerouted">${t('inv.sit.rerouted')}</span> ${t('about.st.rerouted')}</li>
        <li><span class="chip chip-delayed">${t('inv.sit.delayed')}</span> ${t('about.st.delayed')}</li>
        <li><span class="chip chip-pending">${t('inv.sit.pending')}</span> ${t('about.st.pending')}</li>
        <li><span class="chip chip-lost">${t('inv.sit.lost')}</span> ${t('about.st.lost')}</li>
      </ul>` },
    { id: 'nav', h: t('about.h.nav'), body: `<p>${t('about.p.nav')}</p>` },
    { id: 'models', h: t('about.h.models'), body: `<p>${t('about.p.models')}</p>` },
    { id: 'contra', h: t('about.defTitle'), body: `<p>${t('about.defBody')}</p>` },
    { id: 'glossary', h: t('about.h.glossary'), body: `<dl class="glossary">
        <dt>Contra COGS</dt><dd>${t('about.g.contra')}</dd>
        <dt>${t('about.g.proformaT')}</dt><dd>${t('about.g.proforma')}</dd>
        <dt>GINR</dt><dd>${t('about.g.ginr')}</dd>
        <dt>FOB</dt><dd>${t('about.g.fob')}</dd>
        <dt>RECADV</dt><dd>${t('about.g.recadv')}</dd>
        <dt>EDI</dt><dd>${t('about.g.edi')}</dd>
        <dt>FCF</dt><dd>${t('about.g.fcf')}</dd>
      </dl>` },
    { id: 'privacy', h: t('about.h.privacy'), body: `<p>${t('about.p.privacy')}</p>` },
  ];
  const toc = sections.map((s, i) => `<li><a href="#about-${s.id}">${i + 1}. ${s.h}</a></li>`).join('');
  const body = sections.map((s, i) => `
    <section class="about-sec" id="about-${s.id}">
      <h4>${i + 1}. ${s.h}</h4>${s.body}
    </section>`).join('');
  root.innerHTML = `
    <div class="about-doc">
      <h3>${t('about.title')}</h3>
      <p class="muted">${t('about.intro')}</p>
      <div class="about-layout">
        <nav class="about-toc" aria-label="${t('about.tocTitle')}">
          <div class="about-toc-t">${t('about.tocTitle')}</div>
          <ol>${toc}</ol>
        </nav>
        <div class="about-body">${body}</div>
      </div>
    </div>`;
}
function renderCurrentView() {
  if (currentView === 'home') renderHome();
  else if (currentView === 'inventory') renderInventoryView();
  else if (currentView === 'about') renderAbout();
  else renderDash();
}
function showHome() { currentView = 'home'; renderRoleBar(); renderHome(); }
function selectRole(role) { currentView = 'role'; session.setRole(role); renderRoleBar(); renderDash(); }
function openInventory() {
  currentView = 'inventory';
  invFreshOpen = true; // collapse all invoices on this fresh open
  renderRoleBar(); renderInventoryView();
}
function showAbout() { currentView = 'about'; renderRoleBar(); renderAbout(); }

// ---- tour ----
// Make sure Inventory — All is open with the first invoice expanded so the tour has
// concrete on-screen targets to point its satellite tips at.
function prepInventoryForTour() {
  invAllMonths = true; invStatusFilter = 'all';
  openInventory();
  const firstToggle = document.querySelector('.inv-card.collapsed .inv-toggle');
  if (firstToggle) firstToggle.click(); // expand the first card if collapsed
}

function launchTour() {
  const steps = [
    { intro: true, title: t('tour.welcomeTitle'), text: t('tour.welcome') },
    { selector: '#lang-switch', text: t('tour.lang') },
    { selector: '.role-tab[data-inventory]', text: t('tour.invIntro') },
    {
      selector: '.role-tab[data-inventory]',
      text: t('tour.invView'),
      before: () => prepInventoryForTour(),
      satellites: [
        { selector: '.inv-filters', text: t('tour.sat.filters'), dir: 'up' },
        { selector: '#inv-allmonths', text: t('tour.sat.allMonths'), dir: 'up' },
        { selector: '.inv-card .chips-inline', text: t('tour.sat.chips'), dir: 'up' },
        { selector: '.inv-card .anchor-situation', text: t('tour.sat.situation'), dir: 'left' },
        { selector: '.inv-card .anchor-receipts', text: t('tour.sat.receipts'), dir: 'left' },
        { selector: '.inv-card .cc-miss', text: t('tour.sat.ccMiss'), dir: 'left' },
        { selector: '.inv-card .inv-doc-btn', text: t('tour.sat.viewDoc'), dir: 'up' },
        { selector: '.inv-toggle', text: t('tour.sat.collapse'), dir: 'right' },
      ],
    },
    {
      selector: '.role-tab[data-role="finance"]',
      text: t('tour.finance'),
      before: () => selectRole('finance'),
      satellites: [
        { selector: '.cards', text: t('tour.sat.kpi'), dir: 'up' },
        { selector: '.issues', text: t('tour.sat.issues'), dir: 'up' },
        { selector: '.grid.pl', text: t('tour.sat.pl'), dir: 'left' },
        { selector: '.chart-wrap', text: t('tour.sat.charts'), dir: 'up' },
      ],
    },
    { selector: '.role-tab[data-role="operations"]', text: t('tour.operations'), before: () => selectRole('operations') },
    { selector: '.connect-bar', text: t('tour.connect') },
    { selector: '.role-tab[data-about]', text: t('tour.about'), before: () => showAbout() },
  ];
  startTour(steps, { next: t('tour.next'), skip: t('tour.skip'), done: t('tour.done'), start: t('tour.start') });
}

// ---- connect a new source (demo dialog) ----
function openConnect(kind) {
  const modal = $('connect-modal');
  const { title, html } = connectForm(kind);
  $('connect-title').textContent = title;
  $('connect-form').innerHTML = html;
  $('connect-cancel').textContent = t('connect.cancel');
  $('connect-save').textContent = t('connect.save');
  modal.dataset.kind = kind;
  modal.hidden = false;
  const first = $('connect-form').querySelector('input, select');
  if (first) try { first.focus(); } catch { /* ignore */ }
}
function closeConnect() { $('connect-modal').hidden = true; }
function saveConnect() {
  const kind = $('connect-modal').dataset.kind;
  const name = ($('cf-name') && $('cf-name').value) || 'Source';
  // Demo: connecting a folder points at ./data/incoming/ where sample files live.
  const path = kind === 'folder' ? (($('cf-path') && $('cf-path').value) || './data/incoming/') : `(${kind.toUpperCase()})`;
  const n = kind === 'folder' ? 2 : 0; // incoming/ ships with a couple of demo files
  closeConnect();
  const li = document.createElement('li');
  li.innerHTML = `<span class="src">${name}</span><span class="state found">${t('connect.done', { name, n, path })}</span>`;
  $('scan-status').appendChild(li);
}
// Classify an uploaded file into an ingest category by extension + XML root tag.
function classifyUpload(name, content) {
  if (/\.csv$/i.test(name)) return 'storage_reports';
  const head = content.slice(0, 400);
  if (/<invoice[\s>]/.test(head)) return 'invoices';
  if (/<deliveryNote[\s>]/.test(head)) return 'delivery_notes';
  if (/<creditNote[\s>]/.test(head)) return 'credit_notes';
  return null;
}

async function handleUpload(fileList) {
  const files = [];
  const unreadable = [];
  for (const f of Array.from(fileList)) {
    try {
      const content = await f.text();
      const category = classifyUpload(f.name, content);
      if (category) files.push({ name: f.name, category, path: `upload://${f.name}`, content });
      else unreadable.push(f.name);
    } catch { unreadable.push(f.name); }
  }

  const status = $('scan-status');
  if (!files.length) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="src">Upload</span><span class="state error">${t('upload.none')}</span>`;
    status.appendChild(li);
    return;
  }

  const ingest = ingestFiles(files);
  persistIngest(store, ingest);
  // Re-run matching/lifecycle so newly uploaded receipts/notes update invoice status.
  const receipts = store.all('goodsReceipts');
  const dns = store.all('deliveryNotes');
  for (const inv of store.all('invoices')) {
    applyMatchStatus(store, inv.invoiceNumber, matchInvoice(inv, receipts, dns), { actor: 'upload' });
  }
  rebuildPortfolio();

  const li = document.createElement('li');
  li.innerHTML = `<span class="src">Upload</span><span class="state found">${t('upload.done', {
    n: files.length, inv: ingest.invoices.length, dn: ingest.deliveryNotes.length,
    gr: ingest.goodsReceipts.length, cn: ingest.creditNotes.length,
  })}</span>`;
  status.appendChild(li);
  if (unreadable.length) {
    const e = document.createElement('li');
    e.innerHTML = `<span class="src"></span><span class="state error">${t('upload.err', { n: unreadable.length, names: unreadable.join(', ') })}</span>`;
    status.appendChild(e);
  }
  renderCurrentView();
}

function wireConnectButtons() {
  ['edi', 'api', 'folder'].forEach((k) => {
    const b = $(`connect-${k}`);
    if (b) b.addEventListener('click', () => openConnect(k));
  });
  const close = $('connect-close'); if (close) close.addEventListener('click', closeConnect);
  const cancel = $('connect-cancel'); if (cancel) cancel.addEventListener('click', closeConnect);
  const save = $('connect-save'); if (save) save.addEventListener('click', saveConnect);
  const modal = $('connect-modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeConnect(); });
  const upBtn = $('connect-upload'); const upInput = $('upload-input');
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('connect-modal').hidden) closeConnect();
    if (!$('doc-modal').hidden) closeDoc();
  });
  if (upBtn && upInput) {
    upBtn.addEventListener('click', () => upInput.click());
    upInput.addEventListener('change', (e) => { handleUpload(e.target.files); e.target.value = ''; });
  }
  const dl = $('download-all');
  if (dl) dl.addEventListener('click', downloadAllData);
}

// Download every connected invoice + delivery note as CSV (two files, one click). The tool
// is fully client-side with no filesystem/zip access, so CSV is the portable choice.
function downloadAllData() {
  const invoices = store.all('invoices');
  const deliveryNotes = store.all('deliveryNotes');
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`perfumeries_invoices_${stamp}.csv`, exportInvoicesCsv(invoices), 'text/csv');
  // Small stagger so browsers reliably fire both downloads.
  setTimeout(() => downloadText(`perfumeries_delivery_notes_${stamp}.csv`, exportDeliveryNotesCsv(deliveryNotes), 'text/csv'), 150);
  const status = $('scan-status');
  if (status) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="src"></span><span class="state found">${t('scan.downloadedAll', { inv: invoices.length, dn: deliveryNotes.length })}</span>`;
    status.appendChild(li);
  }
}

// ---- language ----
function switchLang(l) {
  session.setLang(l); setLang(l);
  applyI18n(); renderTopScan(); renderRoleBar(); renderCurrentView();
}

// ---- boot ----
async function runConnect() {
  // Show the loader IMMEDIATELY, then load data in the background so the page is never blank.
  const loader = createBootLoader({ title: t('boot.title') });
  loader.step(t('boot.db'));
  const pipelinePromise = runPipeline(store, defaultSources());

  await delay(jitter(650, 200)); // connecting to database — a moment to establish
  loader.step(t('boot.checkInv'));

  let ingest; let portfolio;
  try {
    ({ ingest, portfolio } = await pipelinePromise);
  } catch (err) {
    await loader.finish();
    const root = $('view-root'); show(root);
    root.innerHTML = `<h2>Startup error</h2><p class="err">${err.message}</p>`;
    return;
  }
  lastIngest = ingest; ALL_PORTFOLIO = portfolio;

  await delay(jitter(1100, 300)); loader.step(t('boot.invLoaded', { n: ingest.invoices.length })); // "downloading" invoices — longer
  await delay(jitter(500, 150)); loader.step(t('boot.api'));                                        // quick handshake
  await delay(jitter(900, 250)); loader.step(t('boot.cnLoaded', { n: ingest.creditNotes.length })); // pulling credit notes

  const whEntries = Object.entries(warehouseCounts(ingest)).sort(([a], [b]) => a.localeCompare(b));
  for (const [whId, n] of whEntries) {
    await delay(jitter(420, 220)); // connect to each warehouse — snappy but uneven
    loader.step(t('boot.whConnect', { wh: whId }));
    await delay(jitter(520, 260)); // receiving its delivery update — varies by volume
    loader.markDone(t('boot.whDone', { wh: whId, n }));
  }
  await delay(jitter(1300, 300)); loader.step(t('boot.finalizing')); // reconciling — the heavy step
  await delay(jitter(700, 200)); await loader.finish();

  show($('scan-panel'));
  renderTopScan();
  // Default landing view: Home (page 0).
  showHome();
}

function boot() {
  setLang(session.getLang());
  if ($('build-status')) $('build-status').textContent = `v${VERSION}`;
  applyI18n();
  $('tour-btn').addEventListener('click', launchTour);
  document.querySelectorAll('#lang-switch .flag').forEach((b) => b.addEventListener('click', () => switchLang(b.dataset.lang)));
  wireConnectButtons();
  wireDocModal();
  runConnect();
}

// ---- login gate (demo-only, hardcoded credentials) ----
// NOTE: client-side hardcoded credentials are visible in the source and provide no
// real security. This is a demonstration gate only.
const DEMO_CREDS = { user: 'Finance', pass: 'Pegasus' };

function enterApp() {
  $('login-screen').hidden = true;
  $('denied-screen').hidden = true;
  $('app-header').hidden = false;
  $('app').hidden = false;
  $('app-footer').hidden = false;
  boot();
}

function showDenied() {
  $('login-screen').hidden = true;
  $('app-header').hidden = true;
  $('app').hidden = true;
  $('app-footer').hidden = true;
  $('denied-screen').hidden = false;
}

function applyLoginI18n() {
  if ($('login-sub')) $('login-sub').textContent = t('app.subtitle');
  if ($('login-user-label')) $('login-user-label').textContent = t('login.user');
  if ($('login-pass-label')) $('login-pass-label').textContent = t('login.pass');
  if ($('login-btn')) $('login-btn').textContent = t('login.signIn');
  if ($('login-note')) $('login-note').textContent = t('login.note');
  if ($('denied-title')) $('denied-title').textContent = t('login.deniedTitle');
  if ($('denied-body')) $('denied-body').textContent = t('login.deniedBody');
  if ($('denied-back')) $('denied-back').textContent = t('login.back');
}

function wireLogin() {
  setLang(session.getLang());
  applyLoginI18n();
  const form = $('login-card');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('login-user').value.trim();
    const p = $('login-pass').value;
    if (u === DEMO_CREDS.user && p === DEMO_CREDS.pass) {
      enterApp();
    } else {
      const err = $('login-err');
      err.textContent = t('login.error');
      err.hidden = false;
      // After a clearly wrong attempt, route to the "not granted" page.
      setTimeout(showDenied, 700);
    }
  });
  const back = $('denied-back');
  if (back) back.addEventListener('click', () => {
    $('denied-screen').hidden = true;
    $('login-screen').hidden = false;
    $('login-err').hidden = true;
    $('login-pass').value = '';
    try { $('login-user').focus(); } catch { /* ignore */ }
  });
  try { $('login-user').focus(); } catch { /* ignore */ }
}

document.addEventListener('DOMContentLoaded', wireLogin);
