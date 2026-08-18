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
import { exportInventory } from './lib/inventory.js';
import { archiveInvoice, exportArchive } from './lib/archive.js';
import { renderDashboard, renderInventory, connectForm, invoiceDocHtml, homeHtml } from './ui/dashboards.js';
import { t, setLang, getLang } from './lib/i18n.js';
import { startTour } from './ui/tour.js';
import { createBootLoader } from './ui/boot.js';

const BOOT_STEP_MS = 700; // per-step delay for the "connecting" sequence
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.hidden = false; };

const store = new StateStore(getLocalStorageBackend() || createMemoryBackend(), 'perfumeries');
const session = new Session(getSessionBackend() || createMemoryKV());
let ALL_PORTFOLIO = [];
let lastIngest = null;
let currentView = 'home'; // 'home' | 'role' | 'inventory' | 'inventoryPartial' | 'about'
let storageFilter = null;
let invMonth = null;
let invAllMonths = true; // default: show all months
let invStatusFilter = 'all';

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
  const tabs = ROLES.map((r) => tab(currentView === 'role' && role === r, `data-role="${r}"`, t('nav.' + r))).join('');
  const invAll = tab(currentView === 'inventory', 'data-inventory="1"', t('nav.inventoryAll'));
  const invPart = tab(currentView === 'inventoryPartial', 'data-inventory-partial="1"', t('nav.inventoryPartial'));
  const about = tab(currentView === 'about', 'data-about="1"', t('nav.about'));
  // Home first, then Inventory tabs, role tabs, and About.
  bar.innerHTML = home + invAll + invPart + tabs + about;
  bar.querySelectorAll('.role-tab').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.home) showHome();
    else if (b.dataset.inventoryPartial) openInventory(true);
    else if (b.dataset.inventory) openInventory(false);
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
  });
}
function renderInventoryView() {
  const root = $('view-root'); show(root);
  const ctx = { goodsReceipts: store.all('goodsReceipts'), deliveryNotes: store.all('deliveryNotes'), creditNotes: store.all('creditNotes'), auditLog: store.auditLog() };
  const partialOnly = currentView === 'inventoryPartial';
  renderInventory(root, store.all('invoices'), ctx, {
    month: invMonth,
    allMonths: invAllMonths,
    statusFilter: partialOnly ? 'partial' : invStatusFilter,
    partialOnly,
    onMonth: (m) => { invMonth = m; invAllMonths = false; renderInventoryView(); },
    onAllMonths: (on) => { invAllMonths = on; renderInventoryView(); },
    onStatusFilter: (f) => { invStatusFilter = f; renderInventoryView(); },
    onExport: (month, list) => downloadText(`inventory_${month || 'all'}.json`, exportInventory(list)),
    onViewDoc: (invoice) => openDoc(invoice),
  });
}

// ---- invoice document modal ----
function openDoc(invoice) {
  $('doc-modal-title').textContent = `${invoice.invoiceNumber}`;
  $('doc-print').textContent = t('inv.doc.print');
  $('doc-modal-body').innerHTML = invoiceDocHtml(invoice, store.all('deliveryNotes'));
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
  const print = $('doc-print'); if (print) print.addEventListener('click', printDoc);
  const modal = $('doc-modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeDoc(); });
}
function renderHome() {
  const root = $('view-root'); show(root);
  root.innerHTML = homeHtml(filteredPortfolio());
  root.querySelectorAll('.home-card').forEach((b) => b.addEventListener('click', () => {
    const go = b.dataset.go;
    if (go === 'inventory') openInventory(false);
    else if (go === 'inventoryPartial') openInventory(true);
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
        <li>${t('about.tab.inventory')}</li>
        <li>${t('about.tab.storage')}</li>
        <li>${t('about.tab.accounting')}</li>
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
  else if (currentView === 'inventory' || currentView === 'inventoryPartial') renderInventoryView();
  else if (currentView === 'about') renderAbout();
  else renderDash();
}
function showHome() { currentView = 'home'; renderRoleBar(); renderHome(); }
function selectRole(role) { currentView = 'role'; session.setRole(role); renderRoleBar(); renderDash(); }
function openInventory(partial = false) {
  currentView = partial ? 'inventoryPartial' : 'inventory';
  renderRoleBar(); renderInventoryView();
}
function showAbout() { currentView = 'about'; renderRoleBar(); renderAbout(); }

// ---- tour ----
// Make sure Inventory — All is open with the first invoice expanded so the tour has
// concrete on-screen targets to point its satellite tips at.
function prepInventoryForTour() {
  invAllMonths = true; invStatusFilter = 'all';
  openInventory(false);
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
    { selector: '.role-tab[data-inventory-partial]', text: t('tour.partial'), before: () => openInventory(true) },
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
    { selector: '.role-tab[data-role="storage"]', text: t('tour.storage'), before: () => selectRole('storage') },
    { selector: '.role-tab[data-role="accounting"]', text: t('tour.accounting'), before: () => selectRole('accounting') },
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

  await delay(BOOT_STEP_MS);
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

  await delay(BOOT_STEP_MS); loader.step(t('boot.invLoaded', { n: ingest.invoices.length }));
  await delay(BOOT_STEP_MS); loader.step(t('boot.api'));
  await delay(BOOT_STEP_MS); loader.step(t('boot.cnLoaded', { n: ingest.creditNotes.length }));

  const whEntries = Object.entries(warehouseCounts(ingest)).sort(([a], [b]) => a.localeCompare(b));
  for (const [whId, n] of whEntries) {
    await delay(BOOT_STEP_MS);
    loader.step(t('boot.whConnect', { wh: whId }));
    loader.markDone(t('boot.whDone', { wh: whId, n }));
  }
  await delay(BOOT_STEP_MS); loader.step(t('boot.finalizing'));
  await delay(BOOT_STEP_MS); await loader.finish();

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

document.addEventListener('DOMContentLoaded', boot);
