// VIR_Tier entry point — LEFT-NAV WORKSPACE.
// Boot scan -> persistent sidebar (pipeline stages, free navigation) + wide
// working area. All roles browse read-only; approve/reject gated to Finance
// Approver. Engines are the same pure modules the tests exercise.

import { demoSources } from './lib/source.js';
import { ingestFiles } from './lib/ingest.js';
import { consolidate } from './lib/consolidation.js';
import { runPipeline } from './lib/pipeline.js';
import { runDiscovery } from './lib/ml.js';
import { StateStore } from './lib/store.js';
import { Role } from './lib/enums.js';
import { t, setLang, getLang, LANGS } from './lib/i18n.js';
import { runBoot } from './ui/boot.js';
import { renderOverview, reviewModalHtml, renderAbout } from './ui/dashboards.js';
import { renderInputs, renderMl, INPUT_CATS } from './ui/stages.js';
import { invoiceDocHtml, deliveryNoteDocHtml, receiptDocHtml, eventDocHtml, engineDocHtml, agreementDocHtml, contraCogsInvoiceHtml } from './ui/doc.js';
import { serializeInvoiceXml, serializeDeliveryNoteXml, serializeReceiptCsv, serializeEventCsv, serializeCcogsEngineCsv, serializeAgreementXml } from './lib/parsers.js';
import { chargesToCsv } from './lib/injection.js';
import { initTooltips } from './ui/tooltip.js';

const app = document.getElementById('app');

const STAGES = [
  { id: 'inputs', label: 'navInputs', n: 1, render: renderInputs, sub: INPUT_CATS.map((c) => ({ key: c.key, label: c.label })) },
  { id: 'ml', label: 'navMl', n: 2, render: renderMl },
  { id: 'overview', label: 'navOverview', n: 3, render: renderOverview },
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
  role: Role.ANALYST,           // acting role (gates approve). Browsing is open.
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
  const roles = [Role.ANALYST, Role.FINANCE_APPROVER, Role.FINANCE_OVERVIEW].map((r) =>
    `<option value="${r}" ${state.role === r ? 'selected' : ''}>${t(r === Role.ANALYST ? 'roleAnalyst' : r === Role.FINANCE_APPROVER ? 'roleApprover' : 'roleOverview')}</option>`).join('');
  return `<aside class="sidebar">
    <div class="logo">VIR<span class="tier">_Tier</span></div>
    <div class="nav-group"><div class="g-label">${t('navPipeline')}</div>${items}</div>
    <div class="nav-group sidebar-foot">
      <div class="g-label">${t('navRole')}</div>
      <div style="padding:4px 12px"><select id="roleSel" class="field" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:8px">${roles}</select></div>
      <div class="langs">${LANGS.map((l) => `<button data-lang="${l.code}" class="${getLang() === l.code ? 'active' : ''}">${l.flag} ${l.label}</button>`).join('')}</div>
      <div class="nav-about ${state.stage === 'about' ? 'active' : ''}" data-stage="about">ⓘ ${t('navAbout')}</div>
    </div>
  </aside>`;
}

function render() {
  const roleName = t(state.role === Role.ANALYST ? 'roleAnalyst' : state.role === Role.FINANCE_APPROVER ? 'roleApprover' : 'roleOverview');
  // About is a standalone view (not a numbered pipeline stage)
  const isAbout = state.stage === 'about';
  const title = isAbout ? t('navAbout') : t(STAGES.find((s) => s.id === state.stage).label);
  const viewHtml = isAbout ? renderAbout(state) : STAGES.find((s) => s.id === state.stage).render(state);
  app.innerHTML = `<div class="app-shell">
    ${sidebar()}
    <main class="work">
      <div class="page-head"><h2>${title}</h2><span class="role-pill">${t('navRole')}: ${roleName}</span></div>
      <div id="view">${viewHtml}</div>
    </main>
  </div>`;
  bind();
  initTooltips(app);
}

function bind() {
  app.querySelectorAll('[data-stage]').forEach((el) => el.addEventListener('click', () => {
    state.stage = el.dataset.stage;
    const st = STAGES.find((s) => s.id === state.stage);
    if (st && st.sub && !st.sub.find((s) => s.key === state.sub)) state.sub = st.sub[0].key;
    render();
  }));
  app.querySelectorAll('[data-sub]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); state.sub = el.dataset.sub; render(); }));
  app.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); render(); }));
  const roleSel = app.querySelector('#roleSel');
  if (roleSel) roleSel.addEventListener('change', () => { state.role = roleSel.value; render(); });

  // controls (analyst) -> recompute
  app.querySelectorAll('#controls [data-sel]').forEach((sel) => sel.addEventListener('change', () => {
    const key = sel.dataset.sel;
    state.selections[key] = key === 'viewEur' ? (sel.value === 'on') : sel.value;
    if (key !== 'viewEur') recompute();
    render();
    const msg = app.querySelector('#recomputedMsg'); if (msg) { msg.textContent = t('recomputed'); setTimeout(() => { const m = app.querySelector('#recomputedMsg'); if (m) m.textContent = ''; }, 1500); }
  }));

  // inputs summary: continue into ML Discovery
  const sumCont = app.querySelector('#sum-continue');
  if (sumCont) sumCont.addEventListener('click', () => { state.stage = 'ml'; render(); });

  // inputs: view / download documents
  app.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => openDoc(b.dataset.doc)));
  app.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => downloadDoc(b.dataset.dl)));

  // ML finding actions: Review Document (modal), Export as CSV/XML (format dialog),
  // Reject and Archive (comment dialog -> drop from suggestions).
  app.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', () => openReview(b.dataset.review)));
  app.querySelectorAll('[data-exportdlg]').forEach((b) => b.addEventListener('click', () => openExportDialog(b.dataset.exportdlg)));
  app.querySelectorAll('[data-archive]').forEach((b) => b.addEventListener('click', () => openArchiveDialog(b.dataset.archive)));
  app.querySelectorAll('[data-genfinding]').forEach((b) => b.addEventListener('click', () => generateContraFor(b.dataset.genfinding)));
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

// ---- Contra-COGS invoice document (generated from the review modal) ----
function openContraInvoice(charge, group, rec) {
  const inner = contraCogsInvoiceHtml(charge, group, rec);
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="ciBg"><div class="modal docwide">
    <div style="margin:0 0 14px">${inner}</div>
    <div class="actions">
      <button class="btn" id="ciPrint">${t('print')}</button>
      <button class="btn ghost" id="ciClose">${t('close')}</button>
    </div></div></div>`;
  document.body.appendChild(holder);
  initTooltips(holder);
  const close = () => holder.remove();
  holder.querySelector('#ciBg').addEventListener('click', (e) => { if (e.target.id === 'ciBg') close(); });
  holder.querySelector('#ciClose').addEventListener('click', close);
  holder.querySelector('#ciPrint').addEventListener('click', () => printHtml(inner));
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

function flash(text) { const el = document.createElement('div'); el.className = 'flash'; el.textContent = text; document.body.appendChild(el); setTimeout(() => el.remove(), 2400); }
function download(name, text, type = 'text/csv') { const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

// ---- bootstrap ----
async function main() {
  const manifest = await loadManifest();
  state.fx = await loadFx();
  const sources = demoSources(manifest, folderFetcher);
  await runBoot(app, sources);

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
  render();
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
