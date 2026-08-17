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
import { exportInventory } from './lib/inventory.js';
import { archiveInvoice, exportArchive } from './lib/archive.js';
import { renderDashboard, renderInventory } from './ui/dashboards.js';
import { t, setLang, getLang } from './lib/i18n.js';
import { startTour } from './ui/tour.js';
import { playBootLoader } from './ui/boot.js';

const BOOT_STEP_MS = 1500; // per-step delay for the "connecting" sequence

const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.hidden = false; };

const store = new StateStore(getLocalStorageBackend() || createMemoryBackend(), 'perfumeries');
const session = new Session(getSessionBackend() || createMemoryKV());
let ALL_PORTFOLIO = [];
let lastIngest = null;
let currentView = 'role'; // 'role' | 'inventory' | 'about'
let storageFilter = null;
let invMonth = null;

function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const filteredPortfolio = () => {
  const f = session.getModelFilter();
  return f === 'all' ? ALL_PORTFOLIO : ALL_PORTFOLIO.filter((v) => v.model === f);
};

// ---- static chrome (i18n) ----
function applyI18n() {
  $('subtitle').textContent = t('app.subtitle');
  $('model-filter-label').textContent = t('model.title');
  $('tour-btn').textContent = t('btn.tour');
  $('scan-title').textContent = t('scan.title');
  const mf = $('model-filter');
  const cur = session.getModelFilter();
  mf.innerHTML = [['all', t('model.all')], ['A', t('model.aName')], ['B', t('model.bName')]]
    .map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
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

// ---- boot connect sequence ----
function buildBootSteps(ingest) {
  const wh = warehouseCounts(ingest);
  const whEntries = Object.entries(wh).sort(([a], [b]) => a.localeCompare(b));
  return [
    { text: t('boot.db') },
    { text: t('boot.checkInv') },
    { text: t('boot.invLoaded', { n: ingest.invoices.length }) },
    { text: t('boot.api') },
    { text: t('boot.cnLoaded', { n: ingest.creditNotes.length }) },
    ...whEntries.map(([whId, n]) => ({ text: t('boot.whConnect', { wh: whId }), done: t('boot.whDone', { wh: whId, n }) })),
    { text: t('boot.finalizing') },
  ];
}

// ---- role bar ----
function renderRoleBar() {
  const bar = $('role-bar'); show(bar);
  const role = session.getRole();
  const tabs = ROLES.map((r) => `<button class="role-tab${currentView === 'role' && role === r ? ' active' : ''}" data-role="${r}">${t('nav.' + r)}</button>`).join('');
  const inv = `<button class="role-tab${currentView === 'inventory' ? ' active' : ''}" data-inventory="1">${t('nav.inventory')}</button>`;
  const about = `<button class="role-tab${currentView === 'about' ? ' active' : ''}" data-about="1">${t('nav.about')}</button>`;
  bar.innerHTML = tabs + inv + about;
  bar.querySelectorAll('.role-tab').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.inventory) openInventory();
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
  renderInventory(root, store.all('invoices'), ctx, {
    month: invMonth,
    onMonth: (m) => { invMonth = m; renderInventoryView(); },
    onExport: (month, list) => downloadText(`inventory_${month || 'all'}.json`, exportInventory(list)),
  });
}
function renderAbout() {
  const root = $('view-root'); show(root);
  root.innerHTML = `
    <h3>${t('about.title')}</h3>
    <p class="muted">${t('about.intro')}</p>
    <h4>${t('about.h.overview')}</h4><p>${t('about.p.overview')}</p>
    <h4>${t('about.h.data')}</h4><p>${t('about.p.data')}</p>
    <h4>${t('about.h.tabs')}</h4>
    <ul class="manual">
      <li>${t('about.tab.storage')}</li>
      <li>${t('about.tab.accounting')}</li>
      <li>${t('about.tab.finance')}</li>
      <li>${t('about.tab.inventory')}</li>
    </ul>
    <h4>${t('about.h.nav')}</h4><p>${t('about.p.nav')}</p>
    <h4>${t('about.h.models')}</h4><p>${t('about.p.models')}</p>
    <h4>${t('about.defTitle')}</h4><p>${t('about.defBody')}</p>`;
}
function renderCurrentView() {
  if (currentView === 'inventory') renderInventoryView();
  else if (currentView === 'about') renderAbout();
  else renderDash();
}
function selectRole(role) { currentView = 'role'; session.setRole(role); renderRoleBar(); renderDash(); }
function openInventory() { currentView = 'inventory'; renderRoleBar(); renderInventoryView(); }
function showAbout() { currentView = 'about'; renderRoleBar(); renderAbout(); }

// ---- tour ----
function launchTour() {
  const steps = [
    { selector: '#model-filter', text: t('model.note') },
    { selector: '.role-tab[data-role="finance"]', text: t('fin.title') + ' — ' + t('fin.openVar') + ', ' + t('fin.pendingCredit') + '.', before: () => selectRole('finance') },
    { selector: '.cards', text: t('fin.openVar') + ' / ' + t('fin.pendingCredit') + '.' },
    { selector: '.chart-wrap', text: t('fin.trendTitle') + ' + ' + t('fin.forecastTitle') + '.' },
    { selector: '.role-tab[data-role="storage"]', text: t('storage.onway') + ' · ' + t('storage.pending') + ' · ' + t('storage.aged') + '.', before: () => selectRole('storage') },
    { selector: '.role-tab[data-inventory]', text: t('inv.title'), before: () => openInventory() },
    { selector: '.role-tab[data-about]', text: t('about.defTitle'), before: () => showAbout() },
  ];
  startTour(steps, { next: t('tour.next'), skip: t('tour.skip'), done: t('tour.done') });
}

// ---- language ----
function switchLang(l) {
  session.setLang(l); setLang(l);
  applyI18n(); renderTopScan(); renderRoleBar(); renderCurrentView();
}

// ---- boot ----
async function runConnect() {
  try {
    // Read the (folder-backed) data first, then play the connection sequence with real counts.
    const { ingest, portfolio } = await runPipeline(store, defaultSources());
    lastIngest = ingest; ALL_PORTFOLIO = portfolio;

    await playBootLoader(buildBootSteps(ingest), { title: t('boot.title'), perStepMs: BOOT_STEP_MS });

    show($('scan-panel'));
    renderTopScan();
    renderRoleBar();
    selectRole(session.isRoleSelected() ? session.getRole() : 'finance');
  } catch (err) {
    const root = $('view-root'); show(root);
    root.innerHTML = `<h2>Startup error</h2><p class="err">${err.message}</p>`;
  }
}

function boot() {
  setLang(session.getLang());
  if ($('build-status')) $('build-status').textContent = `v${VERSION}`;
  applyI18n();
  $('model-filter').addEventListener('change', (e) => { session.setModelFilter(e.target.value); renderCurrentView(); });
  $('tour-btn').addEventListener('click', launchTour);
  document.querySelectorAll('#lang-switch .flag').forEach((b) => b.addEventListener('click', () => switchLang(b.dataset.lang)));
  runConnect();
}

document.addEventListener('DOMContentLoaded', boot);
