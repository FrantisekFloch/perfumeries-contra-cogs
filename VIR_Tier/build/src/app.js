// VIR_Tier entry point — LEFT-NAV WORKSPACE.
// Boot scan -> persistent sidebar (pipeline stages, free navigation) + wide
// working area. Single open-access workspace (no role gating). Engines are the
// same pure modules the tests exercise.

import { demoSources } from './lib/source.js';
import { ingestFiles } from './lib/ingest.js';
import { consolidate } from './lib/consolidation.js';
import { runPipeline } from './lib/pipeline.js';
import { runDiscovery } from './lib/ml.js';
import { StateStore } from './lib/store.js';
import { t, setLang, getLang, LANGS } from './lib/i18n.js';
import { runScan } from './lib/source.js';
import { animateIngestFlow, FLOW_NODES, mlAnalysisBlock, mlAnalysisStart, mlAnalysisComplete } from './ui/ingestflow.js';
import { renderOverview, reviewModalHtml, renderAbout } from './ui/dashboards.js';
import { renderInputs, renderMl, INPUT_CATS, tileDetail } from './ui/stages.js';
import { renderAudit, auditDataset } from './ui/audit.js';
import { renderConsolidatedDebit, chargesBySupplier } from './ui/consolidated.js';
import { invoiceDocHtml, deliveryNoteDocHtml, receiptDocHtml, eventDocHtml, engineDocHtml, agreementDocHtml, contraCogsInvoiceHtml } from './ui/doc.js';
import { serializeInvoiceXml, serializeDeliveryNoteXml, serializeReceiptCsv, serializeEventCsv, serializeCcogsEngineCsv, serializeAgreementXml } from './lib/parsers.js';
import { chargesToCsv } from './lib/injection.js';
import { initTooltips } from './ui/tooltip.js';

const app = document.getElementById('app');

// HTML-escape helper used across the modal builders (add-source, mailbox scan,
// ERP send flow, etc.). Module-scoped so every builder can use it. (Previously
// only defined locally inside chargeToXml, which made the other builders throw
// ReferenceError and render a blank modal.)
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const STAGES = [
  { id: 'inputs', label: 'navInputs', n: 1, render: renderInputs, sub: INPUT_CATS.map((c) => ({ key: c.key, label: c.label })) },
  // ML Discovery hidden from the sidebar (renderMl kept for reference/reuse) — its
  // key content (plain-language story + volume build-up) now lives in the
  // Consolidated Debit "View details". Re-add here to restore it to the nav.
  { id: 'consol', label: 'navConsolidated', n: 2, render: renderConsolidatedDebit },
  { id: 'overview', label: 'navOverview', n: 3, render: renderOverview },
  { id: 'audit', label: 'navAudit', n: 4, render: renderAudit },
];

const state = {
  store: new StateStore(),
  consolidated: null,
  fx: null,
  selections: {},
  charges: [], reconstructions: [], warnings: [], beforeAfter: [],
  discovery: { findings: [], insights: [], totalOpportunity: 0, count: 0 },
  archived: [],   // suggestions the user rejected & archived (agreementId+scopeKey)
  stage: 'inputs',
  sub: 'summary',
  ingestDone: false,            // set true once the ingest-flow animation completes
  mailboxScan: null,            // { scanned, emailCount, matchAgreementId, matchEur, email } once a shared-mailbox scan matches an email to a finding
  erpSent: {},                  // chargeId -> { docNo, sys, amount, at } for charges "posted" to ERP this session (drives the Overview realized/pending tracker)
  inputFilters: { suppliers: null, warehouses: null, sortKey: 'ccogs', sortDir: 'desc' }, // Inputs & Collection doc-list filter/sort (null set = all selected)
};

// ---- loaders ----
// The offline single-file build sets `window.__VIRT_BUNDLE` (an in-memory map of
// all data files). When present we read from it; otherwise we fetch over HTTP
// (served / GitHub Pages). This keeps both paths working with no source patching.
function bundle() { return (typeof window !== 'undefined' && window.__VIRT_BUNDLE) ? window.__VIRT_BUNDLE : null; }

async function folderFetcher(category, name) {
  const b = bundle();
  if (b) { const v = b.files[`${category}/${name}`]; if (v == null) throw new Error(`bundle miss ${category}/${name}`); return v; }
  const res = await fetch(`data/inbox/${category}/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`fetch ${category}/${name}: ${res.status}`);
  return res.text();
}
async function loadManifest() { const b = bundle(); if (b) return b.manifest; return (await fetch('data/manifest.json')).json(); }
async function loadFx() { const b = bundle(); if (b) return b.fx; try { return await (await fetch('data/fx_rates.json')).json(); } catch { return null; } }

function normalizedSelections() {
  const s = { ...state.selections };
  delete s.viewEur;
  for (const k of Object.keys(s)) if (!s[k]) delete s[k];
  return s;
}

function recompute() {
  const out = runPipeline(state.consolidated, { selections: normalizedSelections(), fx: state.fx, now: () => new Date().toISOString() });
  state.charges = out.charges;
  state.reconstructions = out.reconstructions;
  state.warnings = out.warnings;
  state.beforeAfter = out.beforeAfter;
  state.discovery = runDiscovery({ beforeAfter: out.beforeAfter, reconstructions: out.reconstructions, consolidated: state.consolidated });
  // keep previously archived suggestions out of the rebuilt findings + charges
  if (state.archived && state.archived.length) {
    const gone = new Set(state.archived.map((a) => `${a.agreementId}|${a.scopeKey}`));
    state.discovery.findings = state.discovery.findings.filter((f) => !gone.has(`${f.agreementId}|${f.scopeKey}`));
    state.charges = state.charges.filter((c) => !gone.has(`${c.agreementId}|${c.scopeKey}`));
  }
}

// ---- shell ----
function sidebar() {
  const items = STAGES.map((st) => {
    const active = state.stage === st.id;
    const subs = active && st.sub
      ? `<div class="nav-sub">${st.sub.map((s) => {
          const cat = INPUT_CATS.find((c) => c.key === s.key);
          const cnt = cat && cat.coll ? ` <span class="nav-cnt">(${state.store.all(cat.coll).length})</span>` : '';
          return `<div class="nav-subitem ${state.sub === s.key ? 'active' : ''}" data-sub="${s.key}">${t(s.label)}${cnt}</div>`;
        }).join('')}</div>`
      : '';
    return `<div class="nav-item ${active ? 'active' : ''}" data-stage="${st.id}"><span class="n">${st.n}</span>${t(st.label)}</div>${subs}`;
  }).join('');
  return `<aside class="sidebar">
    <div class="logo">CCOGS<span class="tier"> Reclaim</span></div>
    <div class="nav-group"><div class="g-label">${t('navPipeline')}</div>${items}</div>
    <div class="nav-group sidebar-foot">
      <div class="langs">${LANGS.map((l) => `<button data-lang="${l.code}" class="${getLang() === l.code ? 'active' : ''}">${l.flag} ${l.label}</button>`).join('')}</div>
      <div class="nav-about ${state.stage === 'about' ? 'active' : ''}" data-stage="about">ⓘ ${t('navAbout')}</div>
    </div>
  </aside>`;
}

function render() {
  // guard: if the active stage is no longer in the sidebar (e.g. the retired
  // 'ml' stage), fall back to Inputs so render never dereferences undefined.
  if (state.stage !== 'about' && !STAGES.find((s) => s.id === state.stage)) state.stage = STAGES[0].id;
  // About is a standalone view (not a numbered pipeline stage)
  const isAbout = state.stage === 'about';
  const title = isAbout ? t('navAbout') : t(STAGES.find((s) => s.id === state.stage).label);
  const viewHtml = isAbout ? renderAbout(state) : STAGES.find((s) => s.id === state.stage).render(state);
  app.innerHTML = `<div class="app-shell">
    ${sidebar()}
    <main class="work">
      <div class="page-head"><h2>${title}</h2></div>
      <div id="view">${viewHtml}</div>
    </main>
  </div>`;
  bind();
  initTooltips(app);
  // If the Summary ingest-flow is on screen, (re)play its fill animation.
  if (app.querySelector('#ingestFlow')) playIngestFlow();
}

function bind() {
  wireDelegates();   // install the one-time delegated click listener on `app`
  app.querySelectorAll('[data-stage]').forEach((el) => el.addEventListener('click', () => {
    state.stage = el.dataset.stage;
    const st = STAGES.find((s) => s.id === state.stage);
    if (st && st.sub && !st.sub.find((s) => s.key === state.sub)) state.sub = st.sub[0].key;
    render();
  }));
  app.querySelectorAll('[data-sub]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); state.sub = el.dataset.sub; render(); }));
  app.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); render(); }));

  // controls (analyst) -> recompute
  app.querySelectorAll('#controls [data-sel]').forEach((sel) => sel.addEventListener('change', () => {
    const key = sel.dataset.sel;
    state.selections[key] = key === 'viewEur' ? (sel.value === 'on') : sel.value;
    if (key !== 'viewEur') recompute();
    render();
    const msg = app.querySelector('#recomputedMsg'); if (msg) { msg.textContent = t('recomputed'); setTimeout(() => { const m = app.querySelector('#recomputedMsg'); if (m) m.textContent = ''; }, 1500); }
  }));

  // inputs summary: continue into Consolidated Debit (ML Discovery is hidden)
  const sumCont = app.querySelector('#sum-continue');
  if (sumCont) sumCont.addEventListener('click', () => { state.stage = 'consol'; render(); });

  // inputs summary: clickable result tiles -> details modal (what/how/proposal/impact).
  // The mailbox tile is special: unscanned -> open the scan flow; scanned -> details.
  app.querySelectorAll('[data-tile]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.tile;
    if (id === 'mailbox' && !(state.mailboxScan && state.mailboxScan.scanned)) { openMailboxScan(); return; }
    openTileDetails(id);
  }));

  // NOTE: the Add-source button (#iflAddSource) and the Audit Excel export
  // (#auExport) are handled by a delegated click listener on `app` (installed
  // once in wireDelegates), which is immune to re-render timing and any overlay
  // stacking. Direct listeners here proved unreliable across renders.

  // inputs doc-list: filter + sort bar
  wireInputFilterBar();

  // audit section: agreement/date filters, sortable headers, Excel export
  wireAuditBar();

  // inputs: view / download documents
  app.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => openDoc(b.dataset.doc)));
  app.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => downloadDoc(b.dataset.dl)));

  // ML finding actions: Review Document (modal), Export as CSV/XML (format dialog),
  // Reject and Archive (comment dialog -> drop from suggestions).
  app.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', () => openReview(b.dataset.review)));
  app.querySelectorAll('[data-exportdlg]').forEach((b) => b.addEventListener('click', () => openExportDialog(b.dataset.exportdlg)));
  app.querySelectorAll('[data-archive]').forEach((b) => b.addEventListener('click', () => openArchiveDialog(b.dataset.archive)));
  app.querySelectorAll('[data-genfinding]').forEach((b) => b.addEventListener('click', () => generateContraFor(b.dataset.genfinding)));

  // consolidated per-supplier debit: toggle a charge, switch active supplier, generate / show agreement
  app.querySelectorAll('[data-consoltoggle]').forEach((el) => el.addEventListener('change', () => {
    const id = el.dataset.consoltoggle;
    if (!state.consolSel) state.consolSel = new Set(state.charges.map((c) => c.chargeId));
    if (el.checked) state.consolSel.add(id); else state.consolSel.delete(id);
    render();
  }));
  app.querySelectorAll('[data-consolsup]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.matches('input,[data-consoltoggle]')) return; // don't hijack checkbox clicks
    state.consolSup = el.dataset.consolsup; render();
  }));
  app.querySelectorAll('[data-consolgen]').forEach((b) => b.addEventListener('click', () => openConsolidatedInvoice(b.dataset.consolgen)));
  app.querySelectorAll('[data-consolagr]').forEach((b) => b.addEventListener('click', () => openConsolidatedAgreement(b.dataset.consolagr)));
  app.querySelectorAll('[data-consolview]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openReviewReadOnly(b.dataset.consolview); }));
  // Generate Contra-COGS invoice directly for this charge (same as View details -> Generate)
  app.querySelectorAll('[data-genrow]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const charge = state.charges.find((c) => c.chargeId === b.dataset.genrow); if (!charge) return;
    const group = state.consolidated.byAgreement.get(charge.agreementId);
    const rec = state.reconstructions.find((r) => r.agreementId === charge.agreementId);
    openContraInvoice(charge, group, rec);
  }));
}

// ---- document view/download ----
function findDoc(cat, id) {
  const c = INPUT_CATS.find((x) => x.key === cat);
  return state.store.all(c.coll).find((o) => String(c.id(o)) === String(id));
}
function docHtml(cat, o) {
  switch (cat) {
    case 'invoices': return invoiceDocHtml(o, o.agreementId ? state.consolidated?.byAgreement?.get(o.agreementId) : null);
    case 'deliveryNotes': return deliveryNoteDocHtml(o, o.agreementId ? state.consolidated?.byAgreement?.get(o.agreementId) : null);
    case 'receipts': return receiptDocHtml(o);
    case 'events': return eventDocHtml(o);
    case 'ccogsEngine': return engineDocHtml(o);
    case 'agreements': {
      const grp = state.consolidated?.byAgreement?.get(o.agreementId) || null;
      const ba = (state.beforeAfter || []).filter((b) => b.agreementId === o.agreementId);
      return agreementDocHtml(o, grp, ba);
    }
    default: return '<div class="doc">—</div>';
  }
}
function rawFor(cat, o) {
  switch (cat) {
    case 'invoices': return { name: `${o.invoiceNumber}.xml`, text: serializeInvoiceXml(o), type: 'application/xml' };
    case 'deliveryNotes': return { name: `${o.deliveryNoteId}.xml`, text: serializeDeliveryNoteXml(o), type: 'application/xml' };
    case 'receipts': return { name: `${o.receiptId}.csv`, text: serializeReceiptCsv([o]), type: 'text/csv' };
    case 'events': return { name: `${o.eventId}.csv`, text: serializeEventCsv([o]), type: 'text/csv' };
    case 'ccogsEngine': return { name: `${o.outputId}.csv`, text: serializeCcogsEngineCsv([o]), type: 'text/csv' };
    case 'agreements': return { name: `${o.agreementId}.xml`, text: serializeAgreementXml(o), type: 'application/xml' };
    default: return { name: 'doc.txt', text: JSON.stringify(o, null, 2), type: 'text/plain' };
  }
}
function openDoc(spec) {
  const [cat, id] = spec.split('|');
  const o = findDoc(cat, id); if (!o) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="docBg"><div class="modal docwide">
    <div style="margin:0 0 14px">${docHtml(cat, o)}</div>
    <div class="actions">
      <button class="btn" id="docPrint">${t('print')}</button>
      <button class="btn" id="docDl">${t('download')}</button>
      <button class="btn ghost" id="docClose">${t('close')}</button>
    </div></div></div>`;
  document.body.appendChild(holder);
  initTooltips(holder);
  const close = () => holder.remove();
  holder.querySelector('#docBg').addEventListener('click', (e) => { if (e.target.id === 'docBg') close(); });
  holder.querySelector('#docClose').addEventListener('click', close);
  holder.querySelector('#docDl').addEventListener('click', () => { const r = rawFor(cat, o); download(r.name, r.text, r.type); });
  holder.querySelector('#docPrint').addEventListener('click', () => printHtml(docHtml(cat, o)));
}
function downloadDoc(spec) { const [cat, id] = spec.split('|'); const o = findDoc(cat, id); if (!o) return; const r = rawFor(cat, o); download(r.name, r.text, r.type); }

function printHtml(inner) {
  const w = window.open('', '_blank'); if (!w) return;
  const style = document.querySelector('link[rel=stylesheet]') ? '' : '';
  w.document.write(`<!DOCTYPE html><html><head><title>${t('document')}</title><style>body{font-family:Inter,system-ui,sans-serif;padding:24px;color:#1A1A1A} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #E5E5E5;padding:8px;text-align:left} .doc-title{font-size:20px;font-weight:700}</style></head><body>${inner}</body></html>`);
  w.document.close(); w.focus(); w.print();
}

// ---- review document (read-only summary + Generate Contra-COGS Invoice) ----
function openReview(chargeId) {
  const charge = state.charges.find((c) => c.chargeId === chargeId); if (!charge) return;
  const group = state.consolidated.byAgreement.get(charge.agreementId);
  const rec = state.reconstructions.find((r) => r.agreementId === charge.agreementId);
  const holder = document.createElement('div');
  holder.innerHTML = reviewModalHtml(charge, group, rec);
  document.body.appendChild(holder);
  initTooltips(holder);

  const close = () => holder.remove();
  holder.querySelector('#reviewBg').addEventListener('click', (e) => { if (e.target.id === 'reviewBg') close(); });
  holder.querySelector('[data-closemodal]').addEventListener('click', close);

  // Generate Contra-COGS invoice (supplier-facing debit note) — open in a doc modal
  const gb = holder.querySelector('[data-gencontra]');
  if (gb) gb.addEventListener('click', () => openContraInvoice(charge, group, rec));
}

// Generate the Contra-COGS invoice directly from a finding row (same action as
// the button inside the Review Document modal).
function generateContraFor(chargeId) {
  const charge = state.charges.find((c) => c.chargeId === chargeId); if (!charge) return;
  const group = state.consolidated.byAgreement.get(charge.agreementId);
  const rec = state.reconstructions.find((r) => r.agreementId === charge.agreementId);
  openContraInvoice(charge, group, rec);
}

// ---- consolidated per-supplier debit actions ----
// Build a synthetic consolidated charge from the SELECTED charges of a supplier,
// then render it through the same supplier-facing invoice document.
function selectedChargesForSupplier(supplierId) {
  const groups = chargesBySupplier(state);
  const g = groups.find((x) => x.supplierId === supplierId) || null;
  if (!g) return [];
  const sel = state.consolSel || new Set(state.charges.map((c) => c.chargeId));
  return g.charges.filter((c) => sel.has(c.chargeId));
}
function openConsolidatedInvoice(supplierId) {
  const charges = selectedChargesForSupplier(supplierId);
  if (!charges.length) return;
  const cur = charges[0].currency || 'EUR';
  // merge selected charges into one consolidated charge (sum totals, concat lines)
  const consolidated = {
    ...charges[0],
    chargeId: `CN-${supplierId}-CONSOL`,
    scopeKey: charges.length > 1 ? 'CONSOLIDATED' : charges[0].scopeKey,
    period: 'Control period',
    claimedCcogs: charges.reduce((s, c) => s + (c.claimedCcogs || 0), 0),
    entitledCcogs: charges.reduce((s, c) => s + (c.entitledCcogs || 0), 0),
    variance: charges.reduce((s, c) => s + (c.variance || 0), 0),
    eurEquivalent: null,
    currency: cur,
    tierFromPct: null, tierToPct: null,
    lines: charges.flatMap((c) => (c.lines && c.lines.length ? c.lines
      : [{ cause: 'Volume rebate adjustment', driver: 'TIER_UPLIFT', qty: 0, fromPct: c.tierFromPct, toPct: c.tierToPct, deltaValue: c.variance, note: `Agreement ${c.agreementId}` }])),
  };
  const group = state.consolidated.byAgreement.get(charges[0].agreementId);
  const rec = state.reconstructions.find((r) => r.agreementId === charges[0].agreementId);
  openContraInvoice(consolidated, group, rec);
}
function openConsolidatedAgreement(supplierId) {
  const charges = selectedChargesForSupplier(supplierId);
  if (!charges.length) return;
  // show the agreement behind the largest selected charge for this supplier
  const top = [...charges].sort((a, b) => (b.variance || 0) - (a.variance || 0))[0];
  openDoc('agreements|' + top.agreementId);
}

// Read-only Review Document (same content as the ML Discovery review, no action
// buttons) — opened from the Consolidated Debit "View details".
function openReviewReadOnly(chargeId) {
  const charge = state.charges.find((c) => c.chargeId === chargeId); if (!charge) return;
  const group = state.consolidated.byAgreement.get(charge.agreementId);
  const rec = state.reconstructions.find((r) => r.agreementId === charge.agreementId);
  // matching ML Discovery finding drives the plain-language story sentence at
  // the top of the read-only review (same figures as ML Discovery).
  const finding = (state.discovery?.findings || []).find((f) => f.agreementId === charge.agreementId && f.scopeKey === charge.scopeKey) || null;
  const holder = document.createElement('div');
  holder.innerHTML = reviewModalHtml(charge, group, rec, { readOnly: true, finding });
  document.body.appendChild(holder);
  initTooltips(holder);
  const close = () => holder.remove();
  holder.querySelector('#reviewBg').addEventListener('click', (e) => { if (e.target.id === 'reviewBg') close(); });
  holder.querySelector('[data-closemodal]').addEventListener('click', close);
  // Per-case "Generate Contra-COGS Invoice for this case" — generates the
  // supplier-facing debit note for THIS single charge (not the consolidated
  // multi-agreement one). Closes the read-only review, then opens the invoice.
  const genOne = holder.querySelector('[data-genreadonly]');
  if (genOne) genOne.addEventListener('click', () => { close(); openContraInvoice(charge, group, rec); });
}

// ---- Summary result-tile details (what/how found, proposal, pre/post impact) ----
function openTileDetails(id) {
  const inner = tileDetail(state, id);
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="tdBg"><div class="modal docwide">
    <div style="margin:0 0 14px">${inner}</div>
    <div class="actions"><button class="btn ghost" id="tdClose">${t('close')}</button></div>
  </div></div>`;
  document.body.appendChild(holder);
  initTooltips(holder);
  const close = () => holder.remove();
  holder.querySelector('#tdBg').addEventListener('click', (e) => { if (e.target.id === 'tdBg') close(); });
  holder.querySelector('#tdClose').addEventListener('click', close);
}

// ---- Add source (EDI / API / Folder / Mailbox intake & email scan) ----------
// Demonstration intake panel. EDI/API/Folder are shown as connectable source
// types; the Mailbox option launches the shared-mailbox email scan (the one that
// can surface a missing-invoice update).
function openAddSource() {
  const SOURCES = [
    { id: 'edi', logo: 'EDI', name: t('srcEdiName'), sub: t('srcEdiSub') },
    { id: 'api', logo: 'API', name: t('srcApiName'), sub: t('srcApiSub') },
    { id: 'folder', logo: '📁', name: t('srcFolderName'), sub: t('srcFolderSub') },
    { id: 'mailbox', logo: '✉', name: t('srcMailboxName'), sub: t('srcMailboxSub'), primary: true },
  ];
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="asBg"><div class="modal">
    <div class="erp-head"><span class="erp-badge">＋</span><div>
      <h2>${t('addSourceTitle')}</h2><div class="sub">${t('addSourceLead')}</div></div></div>
    <div class="erp-syslist">
      ${SOURCES.map((s) => `<button class="erp-sys as-src${s.primary ? ' as-primary' : ''}" data-src="${s.id}">
        <span class="erp-logo erp-logo-${s.id}">${s.logo}</span>
        <span class="erp-sys-main"><span class="erp-sys-name">${esc(s.name)}</span><span class="erp-sys-sub">${esc(s.sub)}</span></span>
        <span class="as-arrow">→</span>
      </button>`).join('')}
    </div>
    <div class="actions"><button class="btn ghost" id="asClose">${t('cancel')}</button></div>
  </div></div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#asBg').addEventListener('click', (e) => { if (e.target.id === 'asBg') close(); });
  holder.querySelector('#asClose').addEventListener('click', close);
  holder.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.src;
    close();
    if (id === 'mailbox') openMailboxScan();
    else flash(t('srcConnectedMsg', { name: SOURCES.find((s) => s.id === id).name }));
  }));
}

// Find the missing-invoice finding the scanned email should attach to (prefer
// the "never arrived" AGR so the demo email reads naturally).
function missingInvoiceMatch() {
  const findings = state.discovery?.findings || [];
  const mi = findings.filter((f) => f.missingInvoice);
  return mi.find((f) => f.missingInvoice.reason === 'NEVER_ARRIVED') || mi[0] || null;
}

// ---- Shared-mailbox email scan ----------------------------------------------
// Demonstration only: a scan button, a list of selectable emails (one clearly
// relates to the missing invoice), then ingest -> attaches the email as EVIDENCE
// to the matching finding (no engine recompute) and flips the mailbox tile red.
// One-click shared-mailbox scan (demo). Clicking the "possible update" tile opens
// this scanning window directly; it auto-runs a scan, auto-closes after ~4s, and
// flips the mailbox tile to its "found & matched" (red) state — the relevant
// email is auto-ingested as evidence on the matching missing-invoice finding.
// No manual scan/select steps.
function openMailboxScan() {
  const match = missingInvoiceMatch();
  const matchAgr = match ? match.agreementId : 'AGR-020';
  const matchEur = match ? Math.round(match.leakage) : null;
  const cur = match ? match.currency : 'EUR';
  const relEmail = {
    from: 'accounts@atelier-parfums.example',
    subject: `Missing invoice for ${matchAgr} — January SK delivery`,
    date: '2027-01-09',
    body: `Dear Finance team,<br><br>Following your query, please find attached the <strong>outstanding invoice</strong> for the goods delivered under agreement <strong>${matchAgr}</strong> (January shipment to the SK main warehouse). The invoice was not transmitted at the time of delivery due to an issue on our billing side.<br><br>The delivery was received in full (GRN on file). Kindly process the corresponding rebate (Contra-COGS) accordingly.<br><br>Best regards,<br>Atelier Parfums — Accounts Receivable`,
  };

  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="mbxBg"><div class="modal">
    <div class="erp-head"><span class="erp-badge">✉</span><div>
      <h2>${t('mbxTitle')}</h2><div class="sub">${t('mbxLead')}</div></div></div>
    <div class="mbx-scanning" id="mbxScanning">
      <div class="mbx-spinner" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg></div>
      <div class="mbx-scan-text" id="mbxScanText">${t('mbxScanning')}</div>
      <div class="mbx-scan-sub small" id="mbxScanSub">${t('mbxScanExplain')}</div>
    </div>
  </div></div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#mbxBg').addEventListener('click', (e) => { if (e.target.id === 'mbxBg') close(); });

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const foundMs = reduced ? 300 : 2600;   // show "match found" partway through
  const closeMs = reduced ? 500 : 4000;   // then auto-close + flip the tile

  setTimeout(() => {
    const txt = holder.querySelector('#mbxScanText');
    const sub = holder.querySelector('#mbxScanSub');
    const box = holder.querySelector('#mbxScanning');
    if (box) box.classList.add('found');
    if (txt) txt.textContent = t('mbxFoundOne');
    if (sub) sub.innerHTML = `<strong>${esc(relEmail.subject)}</strong><br>${esc(relEmail.from)}`;
  }, foundMs);

  setTimeout(() => {
    state.mailboxScan = { scanned: true, emailCount: 3, matchAgreementId: matchAgr, matchEur, currency: cur, email: relEmail };
    if (match) match.mailboxEvidence = { from: relEmail.from, subject: relEmail.subject, date: relEmail.date, body: relEmail.body };
    close();
    render();
    flash(t('mbxIngestedMatch', { agr: matchAgr }));
  }, closeMs);
}

// ---- Contra-COGS invoice document (generated from the review modal) ----
function openContraInvoice(charge, group, rec) {
  const inner = contraCogsInvoiceHtml(charge, group, rec);
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="ciBg"><div class="modal docwide">
    <div style="margin:0 0 14px">${inner}</div>
    <div class="actions">
      <button class="btn" id="ciPrint">${t('print')}</button>
      <button class="btn dark" id="ciErp">${t('sendToErp')}</button>
      <button class="btn ghost" id="ciClose">${t('close')}</button>
    </div></div></div>`;
  document.body.appendChild(holder);
  initTooltips(holder);
  const close = () => holder.remove();
  holder.querySelector('#ciBg').addEventListener('click', (e) => { if (e.target.id === 'ciBg') close(); });
  holder.querySelector('#ciClose').addEventListener('click', close);
  holder.querySelector('#ciPrint').addEventListener('click', () => printHtml(inner));
  holder.querySelector('#ciErp').addEventListener('click', () => openErpSendFlow(charge));
}

// ---- Simulated "Send to ERP Billing System" bill-run flow -------------------
// A demonstration only — NO real network calls. Mimics posting the Contra-COGS
// debit note into an ERP billing engine (SAP SD "Create Billing Documents"
// VF06 / billing due list VF04 style): pick the target system, kick off a bill
// run, watch the posting steps, then receive a billing document number + an
// FI accounting posting confirmation (status "C — posting document created").
const ERP_SYSTEMS = [
  { id: 'sap', name: 'SAP S/4HANA', sub: 'SD Billing · VF06', logo: 'SAP' },
  { id: 'oracle', name: 'Oracle ERP Cloud', sub: 'Receivables · AutoInvoice', logo: 'ORA' },
  { id: 'd365', name: 'Microsoft Dynamics 365 F&O', sub: 'Accounts receivable · Invoice journal', logo: 'D365' },
  { id: 'netsuite', name: 'Oracle NetSuite', sub: 'Billing · Invoice run', logo: 'NS' },
];

function erpDocNo(sys) {
  const base = { sap: '90', oracle: 'AR-', d365: 'INV-', netsuite: 'INV' }[sys] || 'BD-';
  const n = Math.floor(1000000 + Math.random() * 8999999);
  return sys === 'sap' ? `${base}${n}` : `${base}${n}`;
}

function openErpSendFlow(charge) {
  const amount = `${Number(charge.variance || charge.entitledCcogs || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${charge.currency || 'EUR'}`;
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="erpBg"><div class="modal erpmodal">
    <div id="erpStage"></div>
  </div></div>`;
  document.body.appendChild(holder);
  const stage = holder.querySelector('#erpStage');
  const close = () => holder.remove();
  holder.querySelector('#erpBg').addEventListener('click', (e) => { if (e.target.id === 'erpBg') close(); });

  // --- Phase 1: select target ERP + review the posting header ---
  const renderSelect = () => {
    stage.innerHTML = `
      <div class="erp-head"><span class="erp-badge">ERP</span><div>
        <h2>${t('erpTitle')}</h2><div class="sub">${t('erpSelectLead')}</div></div></div>
      <div class="erp-syslist">
        ${ERP_SYSTEMS.map((s, i) => `<label class="erp-sys${i === 0 ? ' sel' : ''}">
          <input type="radio" name="erpsys" value="${s.id}" ${i === 0 ? 'checked' : ''}/>
          <span class="erp-logo erp-logo-${s.id}">${s.logo}</span>
          <span class="erp-sys-main"><span class="erp-sys-name">${s.name}</span><span class="erp-sys-sub">${s.sub}</span></span>
          <span class="erp-sys-tick">✓</span>
        </label>`).join('')}
      </div>
      <div class="erp-postbox">
        <div class="erp-post-h">${t('erpPostHeader')}</div>
        <div class="erp-kv"><span>${t('erpDocType')}</span><span>Contra-COGS Debit Note</span></div>
        <div class="erp-kv"><span>${t('erpBillingParty')}</span><span>${esc(charge.supplierId || '—')}</span></div>
        <div class="erp-kv"><span>${t('erpReference')}</span><span class="mono">${esc(charge.chargeId)}</span></div>
        <div class="erp-kv"><span>${t('erpAmount')}</span><span class="erp-amt">${esc(amount)}</span></div>
      </div>
      <div class="actions">
        <button class="btn dark" id="erpRun">${t('erpStartRun')}</button>
        <button class="btn ghost" id="erpCancel">${t('cancel')}</button>
      </div>`;
    stage.querySelectorAll('.erp-sys').forEach((lab) => lab.addEventListener('click', () => {
      stage.querySelectorAll('.erp-sys').forEach((l) => l.classList.remove('sel'));
      lab.classList.add('sel'); lab.querySelector('input').checked = true;
    }));
    stage.querySelector('#erpCancel').addEventListener('click', close);
    stage.querySelector('#erpRun').addEventListener('click', () => {
      const sys = stage.querySelector('input[name=erpsys]:checked')?.value || 'sap';
      renderRun(ERP_SYSTEMS.find((s) => s.id === sys) || ERP_SYSTEMS[0]);
    });
  };

  // --- Phase 2: the bill-run posting animation ---
  const renderRun = (sysObj) => {
    const steps = [t('erpStep1'), t('erpStep2'), t('erpStep3'), t('erpStep4'), t('erpStep5')];
    stage.innerHTML = `
      <div class="erp-head"><span class="erp-badge">${sysObj.logo}</span><div>
        <h2>${t('erpRunTitle')}</h2><div class="sub">${sysObj.name} · ${sysObj.sub}</div></div></div>
      <div class="erp-progress"><i id="erpBar"></i></div>
      <ul class="erp-steps" id="erpSteps">
        ${steps.map((s, i) => `<li class="erp-st" data-i="${i}"><span class="erp-st-ico"></span>${esc(s)}</li>`).join('')}
      </ul>`;
    const bar = stage.querySelector('#erpBar');
    const stEls = [...stage.querySelectorAll('.erp-st')];
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0;
    const advance = () => {
      if (i > 0) stEls[i - 1].classList.replace('run', 'done');
      if (i >= stEls.length) { renderDone(sysObj); return; }
      stEls[i].classList.add('run');
      if (bar) bar.style.width = Math.round(((i + 1) / stEls.length) * 100) + '%';
      i += 1;
      setTimeout(advance, reduced ? 120 : (650 + Math.random() * 500));
    };
    advance();
  };

  // --- Phase 3: posting confirmation (billing doc + FI accounting posting) ---
  const renderDone = (sysObj) => {
    const docNo = erpDocNo(sysObj.id);
    const fiNo = `49${Math.floor(1000000 + Math.random() * 8999999)}`;
    const today = new Date().toISOString().slice(0, 10);
    // Record this charge as REALIZED (posted to ERP) so the Finance Overview
    // pending/realized tracker reflects it.
    if (charge && charge.chargeId) {
      state.erpSent[charge.chargeId] = { docNo, sys: sysObj.name, amount, at: today, agreementId: charge.agreementId, variance: charge.variance };
    }
    stage.innerHTML = `
      <div class="erp-done">
        <div class="erp-check">✓</div>
        <h2>${t('erpDoneTitle')}</h2>
        <p class="sub">${t('erpDoneLead', { sys: sysObj.name })}</p>
        <div class="erp-postbox">
          <div class="erp-kv"><span>${t('erpBillingDoc')}</span><span class="mono erp-docno">${docNo}</span></div>
          <div class="erp-kv"><span>${t('erpFiDoc')}</span><span class="mono">${fiNo}</span></div>
          <div class="erp-kv"><span>${t('erpPostingStatus')}</span><span class="erp-status-ok">${t('erpStatusPosted')}</span></div>
          <div class="erp-kv"><span>${t('erpPostingDate')}</span><span>${today}</span></div>
          <div class="erp-kv"><span>${t('erpAmount')}</span><span class="erp-amt">${esc(amount)}</span></div>
        </div>
        <div class="erp-note small">${t('erpDemoNote')}</div>
      </div>
      <div class="actions"><button class="btn dark" id="erpDoneClose">${t('close')}</button></div>`;
    stage.querySelector('#erpDoneClose').addEventListener('click', close);
  };

  renderSelect();
}

// ---- Export as CSV/XML (format chooser dialog) ----
function chargeToXml(charge) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lines = (charge.lines || []).map((l) =>
    `    <line cause="${esc(l.cause)}" driver="${esc(l.driver)}" qty="${l.qty ?? ''}" fromPct="${l.fromPct ?? ''}" toPct="${l.toPct ?? ''}" deltaValue="${l.deltaValue ?? ''}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<contraCogsCharge>
  <chargeId>${esc(charge.chargeId)}</chargeId>
  <documentType>${esc(charge.docType)}</documentType>
  <agreementId>${esc(charge.agreementId)}</agreementId>
  <supplierId>${esc(charge.supplierId ?? '')}</supplierId>
  <scopeKey>${esc(charge.scopeKey)}</scopeKey>
  <period>${esc(charge.period)}</period>
  <claimedCcogs>${charge.claimedCcogs}</claimedCcogs>
  <entitledCcogs>${charge.entitledCcogs}</entitledCcogs>
  <variance>${charge.variance}</variance>
  <currency>${esc(charge.currency)}</currency>
  <eurEquivalent>${charge.eurEquivalent ?? ''}</eurEquivalent>
  <tierFromPct>${charge.tierFromPct ?? ''}</tierFromPct>
  <tierToPct>${charge.tierToPct ?? ''}</tierToPct>
  <status>${esc(charge.status)}</status>
  <lines>
${lines}
  </lines>
</contraCogsCharge>`;
}

function openExportDialog(chargeId) {
  const charge = state.charges.find((c) => c.chargeId === chargeId); if (!charge) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="exBg"><div class="modal">
    <h2>${t('exportAs')} — ${charge.chargeId}</h2>
    <div class="sub">${t('exportFormatQ')}</div>
    <div class="dlg-choice">
      <button class="btn tint-green" id="exCsv">CSV</button>
      <button class="btn tint-blue" id="exXml">XML</button>
    </div>
    <div class="actions"><button class="btn ghost" id="exClose">${t('cancel')}</button></div>
  </div></div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#exBg').addEventListener('click', (e) => { if (e.target.id === 'exBg') close(); });
  holder.querySelector('#exClose').addEventListener('click', close);
  holder.querySelector('#exCsv').addEventListener('click', () => { download(`${charge.chargeId}.csv`, chargesToCsv(charge), 'text/csv'); close(); flash(t('exportedCsvMsg')); });
  holder.querySelector('#exXml').addEventListener('click', () => { download(`${charge.chargeId}.xml`, chargeToXml(charge), 'application/xml'); close(); flash(t('exportedMsg')); });
}

// ---- Reject and Archive (comment dialog -> drop from suggestions) ----
function openArchiveDialog(chargeId) {
  const charge = state.charges.find((c) => c.chargeId === chargeId); if (!charge) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="arBg"><div class="modal">
    <h2>${t('archiveTitle')}</h2>
    <div class="sub">${charge.chargeId} · ${charge.agreementId} · ${charge.scopeKey}</div>
    <p class="small">${t('archiveNote')}</p>
    <label class="small" style="display:block;margin:8px 0 4px">${t('archiveComment')}</label>
    <textarea class="dlg-comment" id="arComment" placeholder="…"></textarea>
    <div class="actions">
      <button class="btn danger" id="arDo">${t('archive')}</button>
      <button class="btn ghost" id="arClose">${t('cancel')}</button>
    </div>
  </div></div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#arBg').addEventListener('click', (e) => { if (e.target.id === 'arBg') close(); });
  holder.querySelector('#arClose').addEventListener('click', close);
  holder.querySelector('#arDo').addEventListener('click', () => {
    const comment = holder.querySelector('#arComment').value || '';
    archiveFinding(charge, comment);
    close(); render(); flash(t('archivedMsg'));
  });
}

// Archive a suggestion: record it and drop the matching finding + charge so it
// no longer appears in the ML suggested list.
function archiveFinding(charge, comment) {
  state.archived.push({ chargeId: charge.chargeId, agreementId: charge.agreementId, scopeKey: charge.scopeKey, comment, at: new Date().toISOString() });
  state.discovery.findings = state.discovery.findings.filter((f) => !(f.agreementId === charge.agreementId && f.scopeKey === charge.scopeKey));
  state.charges = state.charges.filter((c) => c.chargeId !== charge.chargeId);
}

// ---- Inputs doc-list filter + sort bar wiring -------------------------------
function wireInputFilterBar() {
  const bar = app.querySelector('.fltbar');
  if (!bar) return;
  const f = state.inputFilters;

  // open/close a filter popup in place (no full re-render, so it stays open)
  bar.querySelectorAll('[data-fltmenu]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = btn.dataset.fltmenu;
    const pop = bar.querySelector(`[data-fltpop="${kind}"]`);
    const wasHidden = pop.hasAttribute('hidden');
    bar.querySelectorAll('.flt-pop').forEach((p) => p.setAttribute('hidden', ''));
    if (wasHidden) pop.removeAttribute('hidden');
  }));
  // clicking inside a popup shouldn't close it
  bar.querySelectorAll('.flt-pop').forEach((p) => p.addEventListener('click', (e) => e.stopPropagation()));

  // collect the currently-checked values for a kind into a Set (or null if ALL are checked)
  const collect = (kind) => {
    const boxes = [...bar.querySelectorAll(`[data-fltopt="${kind}"]`)];
    const checked = boxes.filter((b) => b.checked).map((b) => b.value);
    if (checked.length === boxes.length) return null; // all => null (keep future values selected)
    return new Set(checked);
  };
  const applyKind = (kind) => {
    const set = collect(kind);
    if (kind === 'sup') f.suppliers = set; else f.warehouses = set;
    render();
  };

  bar.querySelectorAll('[data-fltopt]').forEach((b) => b.addEventListener('change', () => applyKind(b.dataset.fltopt)));
  bar.querySelectorAll('[data-fltall]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = b.dataset.fltall;
    if (kind === 'sup') f.suppliers = null; else f.warehouses = null;
    render();
  }));
  bar.querySelectorAll('[data-fltnone]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = b.dataset.fltnone;
    if (kind === 'sup') f.suppliers = new Set(); else f.warehouses = new Set();
    render();
  }));

  // sort buttons: same key toggles asc/desc; a new key defaults to desc
  bar.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.sort;
    if (f.sortKey === key) f.sortDir = f.sortDir === 'asc' ? 'desc' : 'asc';
    else { f.sortKey = key; f.sortDir = 'desc'; }
    render();
  }));
}

// ---- Audit section: filter/sort wiring + multi-sheet Excel export -----------
function wireAuditBar() {
  const bar = app.querySelector('.au-fltbar');
  if (!bar) return;
  if (!state.auditFilters) state.auditFilters = { suppliers: null, validities: null, caseTypes: null, from: '', to: '', sortKey: 'LineValue', sortDir: 'desc' };
  const f = state.auditFilters;
  // map popup kind -> the filter field it drives
  const FIELD = { sup: 'suppliers', val: 'validities', case: 'caseTypes' };

  // multiselect popups (supplier / validity / case-type) — open/close in place
  bar.querySelectorAll('[data-aumenu]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = btn.dataset.aumenu;
    const pop = bar.querySelector(`[data-aupop="${kind}"]`);
    const wasHidden = pop.hasAttribute('hidden');
    bar.querySelectorAll('.flt-pop').forEach((p) => p.setAttribute('hidden', ''));
    if (wasHidden) pop.removeAttribute('hidden');
  }));
  bar.querySelectorAll('.flt-pop').forEach((p) => p.addEventListener('click', (e) => e.stopPropagation()));

  const collect = (kind) => {
    const boxes = [...bar.querySelectorAll(`[data-auopt="${kind}"]`)];
    const checked = boxes.filter((b) => b.checked).map((b) => b.value);
    return checked.length === boxes.length ? null : new Set(checked);
  };
  bar.querySelectorAll('[data-auopt]').forEach((b) => b.addEventListener('change', () => { f[FIELD[b.dataset.auopt]] = collect(b.dataset.auopt); render(); }));
  bar.querySelectorAll('[data-auall]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); f[FIELD[b.dataset.auall]] = null; render(); }));
  bar.querySelectorAll('[data-aunone]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); f[FIELD[b.dataset.aunone]] = new Set(); render(); }));

  // date range + clear
  bar.querySelectorAll('[data-audate]').forEach((inp) => inp.addEventListener('change', () => { f[inp.dataset.audate] = inp.value; render(); }));
  const clear = bar.querySelector('[data-auclear]'); if (clear) clear.addEventListener('click', () => { f.suppliers = null; f.validities = null; f.caseTypes = null; f.from = ''; f.to = ''; render(); });

  // sort buttons (Value / Qty) — toggle asc/desc
  bar.querySelectorAll('[data-ausortbtn]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.ausortbtn;
    if (f.sortKey === key) f.sortDir = f.sortDir === 'asc' ? 'desc' : 'asc';
    else { f.sortKey = key; f.sortDir = 'desc'; }
    render();
  }));

  // sortable column headers (kept in addition to the sort buttons)
  app.querySelectorAll('.au-table [data-ausort]').forEach((thEl) => thEl.addEventListener('click', () => {
    const key = thEl.dataset.ausort;
    if (f.sortKey === key) f.sortDir = f.sortDir === 'asc' ? 'desc' : 'asc';
    else { f.sortKey = key; f.sortDir = (key === 'LineValue' || key === 'Qty') ? 'desc' : 'asc'; }
    render();
  }));

  // (Excel export button #auExport is handled by the delegated listener.)
}

// One delegated click listener on `app`, installed ONCE, for the buttons that
// were unreliable with per-render direct listeners (add-source, audit export).
// Delegation survives re-renders and is unaffected by overlay/stacking issues.
let __delegatesInstalled = false;
function wireDelegates() {
  if (__delegatesInstalled) return;
  __delegatesInstalled = true;
  app.addEventListener('click', (e) => {
    const addSrc = e.target.closest && e.target.closest('#iflAddSource');
    if (addSrc) { e.preventDefault(); openAddSource(); return; }
    const exp = e.target.closest && e.target.closest('#auExport');
    if (exp) { e.preventDefault(); exportAuditExcel(); return; }
  });
}

// Load SheetJS on demand: the offline bundle inlines it onto window.XLSX; online
// we lazy-load it from a CDN. Returns a promise resolving to the XLSX global.
function ensureXlsx() {
  if (typeof window !== 'undefined' && window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // styling fork (drop-in SheetJS API + cell styles for colored tables)
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('SheetJS failed to load'));
    document.head.appendChild(s);
  });
}

// Build a styled worksheet from row objects, presented as a colored table using
// the tool's palette (green header, white bold text, banded rows, thin borders,
// autofilter, frozen header, auto column widths). Uses the xlsx-js-style fork.
function styledSheet(XLSX, rows, opts = {}) {
  const headers = opts.headers || (rows[0] ? Object.keys(rows[0]) : []);
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const GREEN = '00B67A', DARK = '1A1A1A', BAND = 'F2FAF6', LINE = 'E5E5E5';
  const numeric = new Set(opts.numeric || []);
  for (let R = range.s.r; R <= range.e.r; R++) {
    const isHeader = R === 0;
    const band = !isHeader && (R % 2 === 0);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr]; if (!cell) continue;
      const key = headers[C];
      if (isHeader) {
        cell.s = {
          fill: { fgColor: { rgb: GREEN } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: { bottom: { style: 'thin', color: { rgb: GREEN } } },
        };
      } else {
        cell.s = {
          fill: { fgColor: { rgb: band ? BAND : 'FFFFFF' } },
          font: { color: { rgb: DARK }, sz: 10 },
          alignment: { horizontal: numeric.has(key) ? 'right' : 'left', vertical: 'center' },
          border: { bottom: { style: 'hair', color: { rgb: LINE } } },
        };
        // TOTAL row emphasis (summary sheet)
        if (String(cell.v).toUpperCase() === 'TOTAL') cell.s.font = { bold: true, color: { rgb: DARK } };
      }
    }
  }
  // column widths from content
  ws['!cols'] = headers.map((h) => {
    let w = String(h).length;
    for (const r of rows) { const v = r[h]; if (v != null) w = Math.max(w, String(v).length); }
    return { wch: Math.min(48, Math.max(8, w + 2)) };
  });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: range.s.c }, e: { r: 0, c: range.e.c } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }];
  return ws;
}

async function exportAuditExcel() {
  let XLSX;
  try { XLSX = await ensureXlsx(); }
  catch { flash(t('auditExportFailed')); return; }
  const ds = auditDataset(state);
  if (!ds.lineRows.length) { flash(t('fltNoneMatch')); return; }
  const wb = XLSX.utils.book_new();
  // Sheet 0 — pivoted summary (the "page zero" that reads like the invoice header)
  const summaryHeaders = ['Supplier', 'Agreements', 'ClaimedBefore', 'EntitledAfter', 'AdditionalCcogs', 'Currency', 'MissingInvoiceCases'];
  XLSX.utils.book_append_sheet(wb, styledSheet(XLSX, ds.summaryRows, { headers: summaryHeaders, numeric: ['Agreements', 'ClaimedBefore', 'EntitledAfter', 'AdditionalCcogs', 'MissingInvoiceCases'] }), 'Summary');
  // Sheet 1 — full line/SKU detail (incl. warehouse split + delivery dates)
  const lineHeaders = ['LineRef', 'Supplier', 'Agreement', 'CaseType', 'Scope', 'Period', 'Validity', 'ValidFrom', 'ValidTo', 'Basis', 'SKU', 'Warehouse', 'WarehouseSplit', 'DeliveryNotes', 'DeliveryDates', 'GoodsReceiptDates', 'Cause', 'Driver', 'Qty', 'RateFromPct', 'RateToPct', 'LineValue', 'Currency', 'MissingInvoice', 'Note'];
  XLSX.utils.book_append_sheet(wb, styledSheet(XLSX, ds.lineRows, { headers: lineHeaders, numeric: ['Qty', 'RateFromPct', 'RateToPct', 'LineValue'] }), 'Line detail');
  // Sheet 2 — additional CCOGS requested (points back to LineRefs)
  const ccogsHeaders = ['DebitRef', 'Supplier', 'Agreement', 'Scope', 'Period', 'ClaimedBefore', 'EntitledAfter', 'AdditionalCcogs', 'Currency', 'EurEquivalent', 'Type', 'Status', 'LineRefs'];
  XLSX.utils.book_append_sheet(wb, styledSheet(XLSX, ds.ccogsRows, { headers: ccogsHeaders, numeric: ['ClaimedBefore', 'EntitledAfter', 'AdditionalCcogs', 'EurEquivalent'] }), 'CCOGS requested');
  const name = `CCOGS_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`;
  // Prefer a Blob download (works reliably from a single offline HTML file);
  // fall back to XLSX.writeFile if the array write path is unavailable.
  try {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  } catch (err) {
    try { XLSX.writeFile(wb, name); } catch { flash(t('auditExportFailed')); return; }
  }
  flash(t('auditExportedMsg', { n: ds.lineRows.length }));
}

function flash(text) { const el = document.createElement('div'); el.className = 'flash'; el.textContent = text; document.body.appendChild(el); setTimeout(() => el.remove(), 2400); }
function download(name, text, type = 'text/csv') { const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

// ---- bootstrap ----
async function main() {
  const manifest = await loadManifest();
  state.fx = await loadFx();

  // Real source scan (Database/API stubs + live Folder source). No full-screen
  // boot — the ingestion is visualised on the Summary page itself as the
  // horizontal ingest-flow infographic (see renderInputsSummary / ingestflow.js).
  const sources = demoSources(manifest, folderFetcher);
  await runScan(sources);

  const files = [];
  for (const [category, names] of Object.entries(manifest.categories)) for (const name of names) files.push({ category, name, text: await folderFetcher(category, name) });
  const ingested = ingestFiles(files);
  state.consolidated = consolidate(ingested);
  // populate the store so the inputs browser can list documents
  state.store.putAll('agreements', ingested.agreements);
  state.store.putAll('invoices', ingested.invoices);
  state.store.putAll('deliveryNotes', ingested.delivery_notes);
  state.store.putAll('receipts', ingested.receipts);
  state.store.putAll('events', ingested.events);
  state.store.putAll('ccogsEngine', ingested.ccogs_engine);
  recompute();

  // Land directly on the Summary (Inputs stage) and play the ingest-flow
  // animation with the REAL ingested counts.
  state.stage = 'inputs';
  state.sub = 'summary';
  render();   // render() plays the ingest-flow animation when it's on screen
}

// Drive the Summary ingest-flow animation from the real store counts. Called
// after render() so the DOM the builder produced exists. Only animates on the
// first visit; once state.ingestDone is set the flow renders static/finished
// and this is a no-op. On completion it flips ingestDone and reveals the
// results block (KPIs + continue).
function playIngestFlow() {
  const host = app.querySelector('#ingestFlow');
  if (!host) return;
  if (state.ingestDone) return; // already finished earlier this session
  const counts = {};
  const collOf = { invoices: 'invoices', deliveryNotes: 'deliveryNotes', receipts: 'receipts', events: 'events', ccogsEngine: 'ccogsEngine', agreements: 'agreements' };
  for (const n of FLOW_NODES) counts[n.key] = state.store.all(collOf[n.key] || n.key).length;

  // Sequence:
  //  1) ML panel stays BLOCKED ("waiting for data collection") while the live
  //     ingestion runs.
  //  2) When ingestion completes, the ML analysis starts (~6-8s). As soon as it
  //     starts we reveal the results container and stagger the tiles in one-by-one
  //     (random timing, like the ingest nodes) WHILE the analysis is still running.
  //  3) When the analysis completes, the ML panel settles and any remaining tiles
  //     + the closing row are shown.
  mlAnalysisBlock(app);
  animateIngestFlow(app, counts, {
    onDone: () => {
      mlAnalysisStart(app, {
        onDone: () => {
          state.ingestDone = true;
          mlAnalysisComplete(app);
          revealAllTiles();   // ensure everything is shown when analysis finishes
        },
      });
      beginTileReveal(app.querySelector('#mlAnalysis')?.__mlaFinishMs || 7000);
    },
  });
}

// Reveal the results container, then stagger each tile (and finally the close
// row) in over the given window (ms) so they pop in like the ingest nodes.
function beginTileReveal(windowMs) {
  const res = app.querySelector('#sumResult');
  if (!res) return;
  res.classList.remove('sum-result-hidden');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tiles = [...res.querySelectorAll('.sum-tile')];
  const closeRow = res.querySelector('.sum-close-row');
  const note = res.querySelector('.sum-tiles-note');
  if (reduced) { tiles.forEach((el) => el.classList.add('tile-in')); if (closeRow) closeRow.classList.add('tile-in'); if (note) note.classList.add('tile-in'); return; }
  // hide everything first, then stagger in across ~80% of the analysis window
  [note, ...tiles, closeRow].forEach((el) => el && el.classList.add('tile-pre'));
  const span = Math.max(1500, windowMs * 0.8);
  if (note) setTimeout(() => note.classList.add('tile-in'), 150);
  tiles.forEach((el) => {
    const ms = 300 + Math.random() * span;
    setTimeout(() => el.classList.add('tile-in'), ms);
  });
  if (closeRow) setTimeout(() => closeRow.classList.add('tile-in'), span + 250);
}

function revealAllTiles() {
  const res = app.querySelector('#sumResult');
  if (!res) return;
  res.classList.remove('sum-result-hidden');
  res.querySelectorAll('.tile-pre').forEach((el) => el.classList.add('tile-in'));
  res.querySelectorAll('.sum-tile, .sum-close-row, .sum-tiles-note').forEach((el) => el.classList.add('tile-in'));
}

function startApp() { main().catch((e) => { app.innerHTML = `<div class="work"><h2>Startup error</h2><pre class="mono">${e.message}</pre></div>`; }); }

// ---- demo login gate (same credentials as the Perfumeries tool) ----
const DEMO_CREDS = { user: 'Finance', pass: 'Pegasus' };
const $ = (id) => document.getElementById(id);

function enterApp() {
  const ls = $('login-screen'); if (ls) ls.hidden = true;
  const ds = $('denied-screen'); if (ds) ds.hidden = true;
  app.hidden = false;
  startApp();
}
function showDenied() {
  const ls = $('login-screen'); if (ls) ls.hidden = true;
  app.hidden = true;
  const ds = $('denied-screen'); if (ds) ds.hidden = false;
}
function applyLoginI18n() {
  if ($('login-sub')) $('login-sub').textContent = t('tagline');
  if ($('login-user-label')) $('login-user-label').textContent = t('loginUser');
  if ($('login-pass-label')) $('login-pass-label').textContent = t('loginPass');
  if ($('login-btn')) $('login-btn').textContent = t('loginSignIn');
  if ($('login-note')) $('login-note').textContent = t('loginNote');
  if ($('denied-title')) $('denied-title').textContent = t('loginDeniedTitle');
  if ($('denied-body')) $('denied-body').textContent = t('loginDeniedBody');
  if ($('denied-back')) $('denied-back').textContent = t('loginBack');
}
function wireLogin() {
  applyLoginI18n();
  const form = $('login-card');
  if (!form) { enterApp(); return; }   // no gate markup -> run ungated
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('login-user').value.trim();
    const p = $('login-pass').value;
    if (u === DEMO_CREDS.user && p === DEMO_CREDS.pass) {
      enterApp();
    } else {
      const err = $('login-err'); err.textContent = t('loginError'); err.hidden = false;
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireLogin);
else wireLogin();
