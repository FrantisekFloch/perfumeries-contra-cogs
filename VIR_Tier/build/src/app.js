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
import { renderMappingFlow, playMappingFlow } from './ui/mappingflow.js';
import { renderConsolidatedDebit, chargesBySupplier } from './ui/consolidated.js';
import { invoiceDocHtml, deliveryNoteDocHtml, receiptDocHtml, eventDocHtml, engineDocHtml, agreementDocHtml, contraCogsInvoiceHtml } from './ui/doc.js';
import { serializeInvoiceXml, serializeDeliveryNoteXml, serializeReceiptCsv, serializeEventCsv, serializeCcogsEngineCsv, serializeAgreementXml, serializeAgreementCsv } from './lib/parsers.js';
import { chargesToCsv } from './lib/injection.js';
import { transitionCharge } from './lib/approval.js';
import { initTooltips } from './ui/tooltip.js';

const app = document.getElementById('app');

// HTML-escape helper used across the modal builders (add-source, mailbox scan,
// ERP send flow, etc.). Module-scoped so every builder can use it. (Previously
// only defined locally inside chargeToXml, which made the other builders throw
// ReferenceError and render a blank modal.)
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Sidebar is organised in THREE zones:
//   zone 1 = the CCOGS process (numbered; drives the top progress stepper)
//   zone 2 = analytics & reporting (icons, not journey steps)
//   zone 3 = "how it works" (icons, below the language selector)
// The Inputs document categories are NOT left-nav sub-items — they render as an
// in-page segmented control (the .filecat tabs), so `sub` is intentionally gone.
const STAGES = [
  { id: 'inputs', label: 'navInputs', n: 1, zone: 1, render: renderInputs, sub: [{ key: 'documents', label: 'navDocuments' }] },
  { id: 'consol', label: 'navConsolidated', n: 2, zone: 1, render: renderConsolidatedDebit },
  { id: 'overview', label: 'navOverview', zone: 2, icon: 'chart', render: renderOverview },
  { id: 'audit', label: 'navAudit', zone: 2, icon: 'audit', render: renderAudit },
  { id: 'aisummary', label: 'navAiSummary', zone: 2, icon: 'ai', render: renderAiSummary },
  { id: 'mapping', label: 'navMapping', zone: 3, icon: 'model', render: renderMappingFlow },
  { id: 'about', label: 'navAbout', zone: 3, icon: 'about', render: renderAbout },
];

// The CCOGS journey phases shown in the TOP progress stepper (Zone 1 stages
// only). Not 1:1 with nav items: "Review" is the Inputs Summary tiles, which
// live inside the Inputs stage.
const JOURNEY = [
  { key: 'ingest', label: 'stepIngest', stage: 'inputs' },
  { key: 'review', label: 'stepReview', stage: 'inputs' },
  { key: 'bill', label: 'stepBill', stage: 'consol' },
];

// small, static, palette-coloured monoline icons for zone 2 / zone 3 items
const NAV_ICON = {
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  audit: '<path d="M6 3h9l3 3v9H6z"/><path d="M9 8h6M9 11h4"/><circle cx="15" cy="17" r="3.2"/><path d="M17.4 19.4L21 23"/>',
  model: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="12" r="2.4"/><path d="M7 6.6l9 4.4M7 17.4l9-4.4"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  ai: '<path d="M12 3l1.6 3.9L17.5 8.5 13.6 10 12 14 10.4 10 6.5 8.5 10.4 6.9z"/><path d="M18.5 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
};
function navIcon(kind) {
  return `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICON[kind] || NAV_ICON.about}</svg>`;
}

/* ============================================================================
   AI Daily Summary (Analytics & reporting)
   A simulated "AI analyst" briefing: compiles on open (animated), surfaces the
   day's focus items + shared-mailbox emails, offers an HTML-email generator and
   a daily subscription, shows the (simulated) connected MCP servers / APIs, and
   embeds a predefined-question chatbot. All figures derive from the loaded
   portfolio (state.beforeAfter / discovery / charges). Connections are
   illustrative. This block lives inside the `app` module so it shares scope with
   state/t/esc/initTooltips/render.
   ============================================================================ */

// per-session flag so the "compiling" animation plays only the first open
let __aiBuilt = false;
// per-session subscription state (illustrative)
const aiSub = { on: false, time: '08:00', to: 'finance.ccogs@parfum-group.example' };

const aiEur = (v) => `${Math.round(Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} €`;

// Small monoline glyphs used inside the page (section headers, connections).
const AI_SVG = {
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  api: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><circle cx="12" cy="12" r="2.5"/>',
  feed: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.6"/>',
};
const aiIco = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AI_SVG[k] || ''}</svg>`;
const aiOrbSvg = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${NAV_ICON.ai}</svg>`;

// ---- derive today's briefing facts from the live portfolio ----
function aiBriefingData() {
  const ba = (state.beforeAfter || []);
  const findings = (state.discovery && state.discovery.findings) || [];
  const recoverable = ba.filter((b) => b.recoverable);
  const totalTrueUp = ba.reduce((s, b) => s + (b.costOfInaction || 0), 0);
  const suppliers = new Set(ba.filter((b) => b.recoverable).map((b) => b.supplierName || b.supplierId));
  // top findings by leakage
  const top = [...findings].sort((a, b) => (b.leakage || 0) - (a.leakage || 0));
  const missing = findings.filter((f) => f.missingInvoice);
  return {
    totalTrueUp,
    findingCount: findings.length,
    supplierCount: suppliers.size,
    recoverableCount: recoverable.length,
    missingCount: missing.length,
    top,
    findings,
  };
}

// Map a finding to a focus "kind" (drives the recommended-action copy). Uses
// the finding's own signals where available, else a stable rotation so the
// briefing always reads with variety.
function aiFocusKind(f, idx) {
  if (f && f.missingInvoice) return 'A';
  const sk = (f && (f.scopeKey || '')) + '';
  if (/pan|eu|combined/i.test(sk)) return 'B';
  const drv = (f && (f.driver || f.cause || '')) + '';
  if (/late|window|expired/i.test(drv)) return 'C';
  if (/sku|forgot/i.test(drv)) return 'D';
  return ['B', 'C', 'D', 'A'][idx % 4];
}

function aiFocusItems() {
  const d = aiBriefingData();
  const items = d.top.slice(0, 4);
  // fallbacks if the portfolio has fewer than 4 findings — synthesize plausible rows
  const KIND = { A: 'aiFocusA', B: 'aiFocusB', C: 'aiFocusC', D: 'aiFocusD' };
  const KIND_D = { A: 'aiFocusADesc', B: 'aiFocusBDesc', C: 'aiFocusCDesc', D: 'aiFocusDDesc' };
  const PRIO = ['high', 'high', 'med', 'low'];
  const rows = items.map((f, i) => {
    const kind = aiFocusKind(f, i);
    return {
      rank: i + 1,
      titleKey: KIND[kind],
      descKey: KIND_D[kind],
      supplier: f.supplierName || f.supplierId || '—',
      agreementId: f.agreementId || '',
      value: f.leakage || 0,
      currency: f.currency || 'EUR',
      prio: PRIO[i] || 'low',
      chargeId: f.chargeId || null,
    };
  });
  return rows;
}

// Shared-mailbox items linked to open findings (illustrative but tied to real
// suppliers/agreements in the portfolio).
function aiMailItems() {
  const d = aiBriefingData();
  const top = d.top.slice(0, 3);
  const missing = d.findings.find((f) => f.missingInvoice) || top[0] || {};
  const disputeAgr = top[1] || top[0] || {};
  const remindAgr = top[2] || top[0] || {};
  const initials = (name) => (String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?');
  const supName = (f) => f.supplierName || f.supplierId || 'Supplier';
  return [
    {
      unread: true,
      from: 'accounts@atelier-parfums.example',
      supplier: supName(missing),
      subject: `Missing invoice — ${missing.agreementId || 'AGR-020'} (January SK delivery)`,
      linked: missing.agreementId || 'AGR-020',
      noteKey: 'aiMailReplyDesc',
      initials: initials(supName(missing)),
      kind: 'reply',
    },
    {
      unread: true,
      from: 'key.accounts@maison-lumiere.example',
      supplier: supName(disputeAgr),
      subject: `Re: Rebate tier query — ${disputeAgr.agreementId || 'AGR-007'}`,
      linked: disputeAgr.agreementId || 'AGR-007',
      noteKey: 'aiMailDisputeDesc',
      initials: initials(supName(disputeAgr)),
      kind: 'dispute',
    },
    {
      unread: false,
      from: 'billing@nordic-scents.example',
      supplier: supName(remindAgr),
      subject: `Follow-up: outstanding invoice request — ${remindAgr.agreementId || 'AGR-012'}`,
      linked: remindAgr.agreementId || 'AGR-012',
      noteKey: 'aiMailRemindDesc',
      initials: initials(supName(remindAgr)),
      kind: 'remind',
    },
  ];
}

// Simulated live connections (MCP servers / APIs / data feeds).
function aiConnections() {
  return {
    mcp: [
      { name: 'ccogs-ledger-mcp', meta: 'Contra-COGS ledger · 4 tools', live: true },
      { name: 'agreements-mcp', meta: 'Rebate agreements · 3 tools', live: true },
      { name: 'shared-mailbox-mcp', meta: 'Finance inbox · IMAP bridge', live: true },
      { name: 'fx-rates-mcp', meta: 'ECB reference rates', live: true },
    ],
    api: [
      { name: 'ERP Billing API', meta: 'SAP FI · OData v4', live: true },
      { name: 'EDI Gateway', meta: 'RECADV / INVOIC · AS2', live: true },
      { name: 'Warehouse WMS', meta: 'SK · PL · CZ · GRN feed', live: true },
    ],
    data: [
      { name: 'CCOGS Engine output', meta: 'nightly batch · 03:10', live: true },
      { name: 'Goods-receipt lake', meta: 'streaming', live: true },
      { name: 'Supplier master', meta: 'daily sync', live: true },
    ],
  };
}

// ---- page render ----
function renderAiSummary(state) {
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  // First open: show the "compiling" animation, which then swaps to the briefing.
  if (!__aiBuilt) {
    const steps = ['aiBuildConnect', 'aiBuildScan', 'aiBuildReconcile', 'aiBuildRank', 'aiBuildEmail'];
    return `<div class="ai-wrap">
      <p class="ai-lead">${t('aiTagline')}</p>
      <div class="ai-build" id="aiBuild">
        <div class="ai-build-head">
          <span class="ai-orb">${aiOrbSvg}</span>
          <div><div class="ai-build-title">${t('aiBuilding')}</div>
          <div class="ai-build-sub">${day}</div></div>
        </div>
        <div class="ai-steps">
          ${steps.map((s, i) => `<div class="ai-step" data-aistep="${i}">
            <span class="ai-step-ico">${i + 1}</span>
            <span class="ai-step-label">${t(s)}</span>
            <span class="ai-step-stat"></span>
          </div>`).join('')}
        </div>
        <div class="ai-build-bar"><i id="aiBuildBar"></i></div>
      </div>
    </div>`;
  }
  return aiBriefingHtml(day, time);
}

function aiBriefingHtml(day, time) {
  const d = aiBriefingData();
  const focus = aiFocusItems().slice(0, 3);
  const mail = aiMailItems();
  const conn = aiConnections();
  const unread = mail.filter((m) => m.unread).length;

  const focusHtml = focus.map((r) => `
    <div class="ai-focus-item">
      <span class="ai-rank">${r.rank}</span>
      <div class="ai-focus-main">
        <div class="t">${t(r.titleKey)}</div>
        <div class="ai-focus-tags">
          <span class="ai-pill ${r.prio}">${t(r.prio === 'high' ? 'aiFocusHigh' : r.prio === 'med' ? 'aiFocusMed' : 'aiFocusLow')}</span>
          <span class="ai-pill">${esc(r.supplier)}</span>
          ${r.agreementId ? `<span class="ai-pill"><span class="mono">${esc(r.agreementId)}</span></span>` : ''}
        </div>
      </div>
      <div class="ai-focus-cta">
        <div class="ai-focus-val gold">${aiEur(r.value)}</div>
        <button class="btn ghost ai-cta-btn" ${r.chargeId ? `data-aifocus="${esc(r.chargeId)}"` : 'data-aigoto="consol"'}>${t('aiFocusReview')} →</button>
      </div>
    </div>`).join('');

  const mailHtml = mail.map((m) => `
    <div class="ai-mail-item ${m.unread ? 'unread' : ''}">
      <span class="ai-mail-av">${esc(m.initials)}</span>
      <div>
        <div class="ai-mail-sub">${esc(m.subject)}${m.unread ? `<span class="ai-badge-unread">${t('aiMailUnread')}</span>` : ''}</div>
        <div class="ai-mail-note"><strong>${esc(m.supplier)}</strong> ${t(m.noteKey)} · <span class="mono">${esc(m.linked)}</span></div>
        <div><button class="btn ghost ai-cta-btn" data-aimail="${esc(m.kind)}">${t('aiMailReview')} →</button></div>
      </div>
    </div>`).join('');

  const connCol = (titleKey, icoClass, items) => `
    <div class="ai-conn-col">
      <div class="ai-conn-col-h">${t(titleKey)}</div>
      ${items.map((c) => `<div class="ai-conn">
        <span class="ai-conn-ico ${icoClass}">${aiIco(icoClass === 'mcp' ? 'server' : icoClass === 'api' ? 'api' : 'feed')}</span>
        <div class="ai-conn-body"><div class="ai-conn-name">${esc(c.name)}</div><div class="ai-conn-meta">${esc(c.meta)}</div></div>
        <span class="ai-conn-stat"><span class="live-dot"></span>${t('aiConnLive')}</span>
      </div>`).join('')}
    </div>`;

  return `<div class="ai-wrap ai-reveal">
    <div class="ai-hero-split">
      <div class="ai-hero-left">
        <span class="ai-orb">${aiOrbSvg}</span>
        <div class="ai-hero-body">
          <div class="ai-hero-greet">${t('aiGreeting')}</div>
          <div class="ai-hero-meta"><span class="dot">●</span> ${t('aiReady')} · ${t('aiGenAt')} ${esc(time)} · ${esc(day)}</div>
          <div class="ai-hero-lead">${t('aiHeadlineLead')}</div>
        </div>
      </div>
      <div class="ai-hero-sub">
        <div class="ai-sec-head"><span class="ai-sec-ico">${aiIco('bell')}</span><h3>${t('aiSubscribe')}</h3></div>
        <div class="ai-field"><label>${t('aiEmailTo')}</label><input type="email" id="aiSubTo" value="${esc(aiSub.to)}"/></div>
        <div class="ai-field"><label>${t('aiSubTime')}</label><input type="time" id="aiSubTime" value="${esc(aiSub.time)}"/></div>
        <div class="ai-email-actions">
          <button class="btn ${aiSub.on ? 'ghost' : 'dark'}" id="aiSubBtn">${aiSub.on ? t('aiSubCancel') : t('aiSubConfirm')}</button>
        </div>
        <div class="ai-sub-status ${aiSub.on ? 'on' : ''}" id="aiSubStatus"><span class="live-dot"></span>${t('aiSubOn', { time: esc(aiSub.time) })}</div>
      </div>
    </div>

    <div class="ai-two ai-two-focus">
      <div class="ai-sec" style="margin:0">
        <div class="ai-sec-head"><span class="ai-sec-ico">${aiIco('mail')}</span><h3>${t('aiMailTitle')}</h3></div>
        <p class="ai-sec-lead">${t('aiMailLead')}</p>
        <div class="ai-mail">${mailHtml}</div>
      </div>
      <div class="ai-sec" style="margin:0">
        <div class="ai-sec-head"><span class="ai-sec-ico">${aiIco('target')}</span><h3>${t('aiFocusTitle')}</h3></div>
        <p class="ai-sec-lead">${t('aiFocusLead')}</p>
        <div class="ai-focus">${focusHtml || `<div class="small">—</div>`}</div>
      </div>
    </div>

    ${aiChatHtml()}

    <div class="ai-sec">
      <div class="ai-sec-head"><span class="ai-sec-ico">${aiIco('plug')}</span><h3>${t('aiConnTitle')}</h3></div>
      <p class="ai-sec-lead">${t('aiConnLead')}</p>
      <div class="ai-conn-grid">
        ${connCol('aiConnMcp', 'mcp', conn.mcp)}
        ${connCol('aiConnApi', 'api', conn.api)}
        ${connCol('aiConnData', 'data', conn.data)}
      </div>
    </div>

    <p class="ai-disclaimer">${t('aiDisclaimer')}</p>
  </div>`;
}

// ---- chatbot ----
function aiChatHtml() {
  const qs = aiChatQuestions();
  const chips = qs.slice(0, 8).map((q) => `<button class="ai-chip" data-aiq="${esc(q.id)}">${esc(q.q)}</button>`).join('');
  return `<div class="ai-chat" id="aiChat">
    <div class="ai-chat-head">
      <span class="ai-orb">${aiOrbSvg}</span>
      <div><h3>${t('aiChatTitle')}</h3><div class="sub">${t('aiChatLead')}</div></div>
    </div>
    <div class="ai-chat-log" id="aiChatLog">
      <div class="ai-msg bot">${aiChatGreeting()}</div>
    </div>
    <div class="ai-chips-wrap">
      <div class="ai-chips-lbl">${t('aiChatSuggested')}</div>
      <div class="ai-chips" id="aiChips">${chips}</div>
    </div>
    <div class="ai-chat-input">
      <input type="text" id="aiChatInput" placeholder="${t('aiChatPlaceholder')}"/>
      <button class="btn dark" id="aiChatSend">${t('aiChatSend')}</button>
    </div>
  </div>`;
}

function aiChatGreeting() {
  const d = aiBriefingData();
  return `Hello — I'm your CCOGS assistant. Today I found <strong>${d.findingCount}</strong> open findings totalling <strong>${aiEur(d.totalTrueUp)}</strong> in recoverable True-Up across <strong>${d.supplierCount}</strong> suppliers. Pick a question below, or type your own.`;
}

// Predefined question bank. Answers are generated from live portfolio data so
// the chatbot feels grounded. EN base copy (kept in JS, not i18n, for clarity).
function aiChatQuestions() {
  const d = aiBriefingData();
  const top = d.top[0] || {};
  const topName = top.supplierName || top.supplierId || 'the top supplier';
  const bySupplier = {};
  for (const b of (state.beforeAfter || [])) { if (!b.recoverable) continue; const k = b.supplierName || b.supplierId; bySupplier[k] = (bySupplier[k] || 0) + (b.costOfInaction || 0); }
  const supplierRank = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]);
  return [
    { id: 'today', q: 'What should I focus on today?', a: () => {
      const f = aiFocusItems();
      if (!f.length) return `Nothing is flagged as recoverable right now — the portfolio looks clean.`;
      const lines = f.map((r) => `<strong>${r.rank}.</strong> ${t(r.titleKey)} — <strong>${aiEur(r.value)}</strong> (${esc(r.supplier)}${r.agreementId ? ', ' + esc(r.agreementId) : ''})`).join('<br>');
      return `Here are today's top priorities, ordered by value at risk:<br><br>${lines}`;
    } },
    { id: 'total', q: 'How much can we recover in total?', a: () => `Across the portfolio I estimate <strong>${aiEur(d.totalTrueUp)}</strong> in recoverable Contra-COGS True-Up, spread over <strong>${d.recoverableCount}</strong> findings and <strong>${d.supplierCount}</strong> suppliers.` },
    { id: 'topsupplier', q: 'Which supplier has the biggest opportunity?', a: () => {
      if (!supplierRank.length) return `No recoverable opportunity by supplier at the moment.`;
      const rows = supplierRank.slice(0, 5).map(([n, v], i) => `${i + 1}. <strong>${esc(n)}</strong> — ${aiEur(v)}`).join('<br>');
      return `By recoverable value, the leaders are:<br><br>${rows}`;
    } },
    { id: 'emails', q: 'Any emails I need to deal with?', a: () => {
      const m = aiMailItems();
      const rows = m.map((x) => `• <strong>${esc(x.supplier)}</strong> — ${esc(x.subject)}${x.unread ? ' (unread)' : ''}`).join('<br>');
      return `There are <strong>${m.filter((x) => x.unread).length}</strong> unread items in the shared Finance mailbox linked to open findings:<br><br>${rows}<br><br>The missing-invoice reply is ready to recalculate; the tier dispute needs a response with the reconstructed-volume evidence.`;
    } },
    { id: 'missing', q: 'What is a missing-invoice case?', a: () => `A missing-invoice case is where goods were received in full (a Goods Receipt Note is on file) but the supplier never sent the invoice. Recovery is blocked until the invoice arrives — so the action is: chase the supplier, then recalculate the Contra-COGS once it lands. Today I see <strong>${d.missingCount}</strong> such case(s).` },
    { id: 'paneu', q: 'How does pan-EU aggregation help?', a: () => `Rebate tiers are often measured per country. When SK, PL and CZ volume for the same supplier agreement is measured separately, each may fall short of a threshold. Combining them (pan-EU) can cross into a higher tier — so the entitled rebate rises, and the difference is recoverable.` },
    { id: 'tiers', q: 'How is the tier / rate decided?', a: () => `The engine reads the agreement's tier table (thresholds + rates), the measurement basis (units, value or weight) and the period (month/quarter/year). It reconstructs the true qualifying volume, finds the tier that volume should reach, then compares the entitled Contra-COGS to what was actually claimed. The gap is the recoverable True-Up.` },
    { id: 'timing', q: 'Why do late deliveries cause losses?', a: () => `Eligibility is set by the order/invoice date being inside the contract window. But if delivery (or the goods-receipt scan) lands after the window closes, the engine may exclude that volume even though it qualifies. The tool re-includes it and flags the timing gap.` },
    { id: 'howrecover', q: 'How do I actually recover the money?', a: () => `From a finding, open it in the Consolidated Debit, review the reconstruction, then generate a Contra-COGS debit note. After the one Finance approval, it can be exported (billing-ingestible CSV) or sent to the ERP billing flow. Everything is captured in the immutable audit trail.` },
    { id: 'sources', q: 'What data are you reading from?', a: () => {
      const c = aiConnections();
      return `I read (read-only) from <strong>${c.mcp.length}</strong> MCP servers (${c.mcp.map((x) => x.name).join(', ')}), <strong>${c.api.length}</strong> APIs (${c.api.map((x) => x.name).join(', ')}) and <strong>${c.data.length}</strong> data feeds. All access is audited.`;
    } },
    { id: 'confidence', q: 'How confident are these findings?', a: () => `Each finding is scored by an explainable ranker (magnitude vs peers, under-claim lift, driver pressure and tier proximity) — no black-box ML. The score drives the priority order; the money figures come straight from the deterministic reconstruction, so they're auditable line by line.` },
    { id: 'subscribe', q: 'How do I get this every morning?', a: () => `Use the "Subscribe to daily updates" panel above: set a recipient and a delivery time, then confirm. You'll receive this briefing as a formatted HTML email every business day. You can also generate the email on demand with "Generate HTML email".` },
    { id: 'topvalue', q: `What's the single biggest finding?`, a: () => {
      if (!top || !top.leakage) return `No single finding stands out right now.`;
      return `The largest single finding is <strong>${esc(topName)}</strong>${top.agreementId ? ` (<span class="mono">${esc(top.agreementId)}</span>)` : ''} at <strong>${aiEur(top.leakage)}</strong>${top.missingInvoice ? ' — a missing-invoice case, so chase the invoice first.' : '.'}` ;
    } },
    { id: 'audit', q: 'Is every number auditable?', a: () => `Yes. Every recoverable figure traces from the supplementing charge → variance (entitled − claimed) → reconstructed volume → source events (receipts, returns, overages, late/pan-EU) → the agreement clause that grants it. The Audit / Reporting page exports a colored three-sheet Excel workbook of the full line detail.` },
  ];
}

function aiChatAnswer(id) {
  const q = aiChatQuestions().find((x) => x.id === id);
  if (!q) return `I don't have a scripted answer for that yet — try one of the suggested questions.`;
  try { return q.a(); } catch { return `Sorry, I couldn't compute that just now.`; }
}

// Free-text -> best matching predefined answer (keyword scored). Falls back to
// the "focus today" answer so the bot always says something useful.
function aiChatMatch(text) {
  const s = (text || '').toLowerCase();
  if (!s.trim()) return null;
  const KW = {
    today: ['today', 'focus', 'priorit', 'first'],
    total: ['total', 'how much', 'overall', 'sum', 'recover in total'],
    topsupplier: ['supplier', 'vendor', 'biggest', 'largest opportunity'],
    emails: ['email', 'mail', 'inbox', 'mailbox', 'message'],
    missing: ['missing', 'no invoice', 'grn', 'goods receipt'],
    paneu: ['pan', 'eu', 'aggreg', 'combine', 'cross-country', 'country'],
    tiers: ['tier', 'rate', 'threshold', 'rebate %', 'percent'],
    timing: ['late', 'timing', 'window', 'delivery date', 'expired'],
    howrecover: ['how do i recover', 'recover the money', 'debit note', 'claim', 'export', 'erp'],
    sources: ['data', 'source', 'mcp', 'api', 'connect', 'reading'],
    confidence: ['confiden', 'accurate', 'trust', 'ml', 'model'],
    subscribe: ['subscri', 'daily', 'every morning', 'schedule'],
    topvalue: ['biggest finding', 'single', 'largest finding'],
    audit: ['audit', 'traceable', 'evidence', 'defensible', 'excel'],
  };
  let best = null, bestScore = 0;
  for (const [id, kws] of Object.entries(KW)) {
    let sc = 0; for (const k of kws) if (s.includes(k)) sc += 1;
    if (sc > bestScore) { bestScore = sc; best = id; }
  }
  return bestScore > 0 ? best : 'today';
}

// ---- AI summary: interactions ----

// Play the "compiling" animation, then flip __aiBuilt and re-render into the
// finished briefing. Respects prefers-reduced-motion.
function playAiBuild() {
  const host = app.querySelector('#aiBuild');
  if (!host) return;
  const steps = [...host.querySelectorAll('[data-aistep]')];
  const bar = host.querySelector('#aiBuildBar');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepMs = reduced ? 140 : 620;
  const counts = ['128 sources', '3 unread', '19 findings', 'ranked', 'draft ready'];
  let i = 0;
  const tick = () => {
    if (i > 0) { const prev = steps[i - 1]; if (prev) { prev.classList.remove('active'); prev.classList.add('done'); const ic = prev.querySelector('.ai-step-ico'); if (ic) ic.textContent = '✓'; const st = prev.querySelector('.ai-step-stat'); if (st) st.textContent = counts[i - 1] || ''; } }
    if (i >= steps.length) {
      if (bar) bar.style.width = '100%';
      __aiBuilt = true;
      setTimeout(() => { if (state.stage === 'aisummary') render(); }, reduced ? 60 : 340);
      return;
    }
    const cur = steps[i];
    if (cur) { cur.classList.add('active'); const ic = cur.querySelector('.ai-step-ico'); if (ic) ic.innerHTML = '<span class="spin"></span>'; }
    if (bar) bar.style.width = `${Math.round(((i + 1) / (steps.length + 1)) * 100)}%`;
    i += 1;
    setTimeout(tick, stepMs);
  };
  tick();
}

function wireAiSummary() {
  // Focus item -> open the finding review (if we have a real chargeId) or jump
  // to the Consolidated Debit stage.
  app.querySelectorAll('[data-aifocus]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.aifocus;
    if (typeof openReview === 'function' && state.charges && state.charges.some((c) => c.chargeId === id)) openReview(id);
    else { state.stage = 'consol'; render(); }
  }));
  app.querySelectorAll('[data-aigoto]').forEach((b) => b.addEventListener('click', () => { state.stage = b.dataset.aigoto; render(); }));

  // Shared-mailbox item -> open a simulated email reader.
  app.querySelectorAll('[data-aimail]').forEach((b) => b.addEventListener('click', () => openAiEmail(b.dataset.aimail)));


  // Subscribe toggle.
  const sub = app.querySelector('#aiSubBtn');
  if (sub) sub.addEventListener('click', () => {
    const toEl = app.querySelector('#aiSubTo'); const timeEl = app.querySelector('#aiSubTime');
    if (toEl) aiSub.to = toEl.value || aiSub.to;
    if (timeEl) aiSub.time = timeEl.value || aiSub.time;
    aiSub.on = !aiSub.on;
    flash(aiSub.on ? t('aiSubOn', { time: aiSub.time }) : t('aiSubOff'));
    render();
  });

  // Chatbot: suggested-question chips.
  app.querySelectorAll('[data-aiq]').forEach((c) => c.addEventListener('click', () => {
    const q = aiChatQuestions().find((x) => x.id === c.dataset.aiq);
    aiChatSubmit(q ? q.q : c.textContent, c.dataset.aiq);
  }));
  // Chatbot: free-text send.
  const send = app.querySelector('#aiChatSend');
  const input = app.querySelector('#aiChatInput');
  const doSend = () => { if (!input) return; const v = input.value.trim(); if (!v) return; input.value = ''; aiChatSubmit(v, aiChatMatch(v)); };
  if (send) send.addEventListener('click', doSend);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } });
}

// Append a user bubble + a typing indicator, then the bot answer. Does NOT
// re-render the page (keeps the chat scroll + input focus).
function aiChatSubmit(questionText, answerId) {
  const log = app.querySelector('#aiChatLog');
  if (!log) return;
  const userMsg = document.createElement('div');
  userMsg.className = 'ai-msg user';
  userMsg.textContent = questionText;
  log.appendChild(userMsg);
  const typing = document.createElement('div');
  typing.className = 'ai-msg-typing';
  typing.innerHTML = '<i></i><i></i><i></i>';
  log.appendChild(typing);
  log.scrollTop = log.scrollHeight;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    typing.remove();
    const bot = document.createElement('div');
    bot.className = 'ai-msg bot';
    bot.innerHTML = aiChatAnswer(answerId);
    log.appendChild(bot);
    log.scrollTop = log.scrollHeight;
  }, reduced ? 120 : 640);
}

// ---- simulated shared-mailbox email reader ----
function openAiEmail(kind) {
  const m = aiMailItems().find((x) => x.kind === kind) || aiMailItems()[0];
  const bodies = {
    reply: `Dear Finance team,<br><br>Following your query, please find attached the <strong>outstanding invoice</strong> for the goods delivered under agreement <strong>${esc(m.linked)}</strong> (January shipment to the SK main warehouse). The invoice was not transmitted at the time of delivery due to an issue on our billing side.<br><br>The delivery was received in full (GRN on file). Kindly process the corresponding rebate (Contra-COGS) accordingly.<br><br>Best regards,<br>${esc(m.supplier)} — Accounts Receivable`,
    dispute: `Dear Finance team,<br><br>We have reviewed your Contra-COGS claim under agreement <strong>${esc(m.linked)}</strong>. Our records place the qualifying volume in a <strong>lower tier</strong> than your calculation. Could you please share the reconstructed-volume breakdown, including the pan-EU aggregation and the goods-receipt dates you relied on?<br><br>We want to resolve this quickly and correctly.<br><br>Kind regards,<br>${esc(m.supplier)} — Key Accounts`,
    remind: `Dear Finance team,<br><br>This is a friendly follow-up to our request dated last week regarding the outstanding invoice under agreement <strong>${esc(m.linked)}</strong>. We have not yet received a response and would appreciate an update at your earliest convenience.<br><br>Thank you,<br>${esc(m.supplier)} — Billing`,
  };
  const suggested = {
    reply: 'Recalculate the Contra-COGS now that the invoice is available, then move the finding into the Consolidated Debit.',
    dispute: 'Reply with the reconstructed-volume evidence (pan-EU aggregation + GRN dates) exported from the Audit page.',
    remind: 'Send a follow-up to the supplier and log a reminder task; the recovery stays blocked until the invoice arrives.',
  };
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="aiMailBg"><div class="modal">
    <div class="erp-head"><span class="erp-badge">✉</span><div>
      <h2>${esc(m.subject)}</h2><div class="sub">${t('aiMailFrom')}: ${esc(m.from)} · ${t('aiMailLinked')} <span class="mono">${esc(m.linked)}</span></div></div></div>
    <div class="card" style="margin:14px 0; line-height:1.6">${bodies[kind] || bodies.reply}</div>
    <div class="loss-banner"><strong>${t('aiMailAction')}:</strong> ${esc(suggested[kind] || suggested.reply)}</div>
    <div class="actions">
      <button class="btn dark" id="aiMailGoto">${t('aiFocusOpen')} →</button>
      <button class="btn ghost" id="aiMailClose">${t('close')}</button>
    </div>
  </div></div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#aiMailBg').addEventListener('click', (e) => { if (e.target.id === 'aiMailBg') close(); });
  holder.querySelector('#aiMailClose').addEventListener('click', close);
  const goto = holder.querySelector('#aiMailGoto');
  if (goto) goto.addEventListener('click', () => { close(); state.stage = 'consol'; render(); });
}

// ---- HTML briefing email: build, preview, download ----
function aiEmailHtml() {
  const d = aiBriefingData();
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const focus = aiFocusItems();
  const mail = aiMailItems();
  const A = '#00B67A', INK = '#1A1A1A', MUT = '#6B6B6B', LINE = '#E5E5E5', GOLD = '#C77800', DARK = '#1A1A1A';
  const focusRows = focus.map((r) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font-weight:700;color:${INK};width:28px">${r.rank}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};color:${INK}">
        <div style="font-weight:600">${esc(t(r.titleKey))}</div>
        <div style="color:${MUT};font-size:13px">${esc(r.supplier)}${r.agreementId ? ' · ' + esc(r.agreementId) : ''}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};text-align:right;font-weight:800;color:${GOLD};white-space:nowrap">${aiEur(r.value)}</td>
    </tr>`).join('');
  const mailRows = mail.map((m) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};color:${INK}">
        <div style="font-weight:600">${esc(m.subject)}</div>
        <div style="color:${MUT};font-size:13px">${esc(m.from)} · ${esc(m.linked)}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};text-align:right;color:${m.unread ? '#2f6fed' : MUT};font-size:12px;font-weight:700;text-transform:uppercase">${m.unread ? 'Unread' : 'Read'}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>CCOGS AI Daily Summary — ${esc(day)}</title></head>
  <body style="margin:0;background:#F5F5F5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${INK}">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:linear-gradient(135deg,#12241d,#1A1A1A);border-radius:12px;padding:24px;color:#fff">
      <div style="font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:#8fd9bf;font-weight:700">CCOGS Reclaim · AI Daily Summary</div>
      <div style="font-size:22px;font-weight:800;margin-top:6px">Good morning. Here's today's briefing.</div>
      <div style="color:#b9c4bf;font-size:13px;margin-top:4px">${esc(day)}</div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
      <tr>
        <td style="width:33%;padding:6px"><div style="background:#fff;border:1px solid ${LINE};border-left:3px solid ${GOLD};border-radius:10px;padding:14px"><div style="font-size:20px;font-weight:800;color:${GOLD}">${aiEur(d.totalTrueUp)}</div><div style="color:${MUT};font-size:12px">Recoverable True-Up</div></div></td>
        <td style="width:33%;padding:6px"><div style="background:#fff;border:1px solid ${LINE};border-left:3px solid ${A};border-radius:10px;padding:14px"><div style="font-size:20px;font-weight:800">${d.findingCount}</div><div style="color:${MUT};font-size:12px">Open findings</div></div></td>
        <td style="width:33%;padding:6px"><div style="background:#fff;border:1px solid ${LINE};border-left:3px solid #2f6fed;border-radius:10px;padding:14px"><div style="font-size:20px;font-weight:800">${d.supplierCount}</div><div style="color:${MUT};font-size:12px">Suppliers affected</div></div></td>
      </tr>
    </table>
    <div style="background:#fff;border:1px solid ${LINE};border-radius:12px;padding:18px;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700;margin-bottom:10px">What to focus on today</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${focusRows}</table>
    </div>
    <div style="background:#fff;border:1px solid ${LINE};border-radius:12px;padding:18px;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700;margin-bottom:10px">Shared mailbox — needs attention</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${mailRows}</table>
    </div>
    <div style="text-align:center;margin:18px 0 6px">
      <a href="#" style="display:inline-block;background:${A};color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Open the CCOGS Reclaim Tool</a>
    </div>
    <div style="color:${MUT};font-size:11px;text-align:center;margin-top:16px">Automated briefing generated by the CCOGS Reclaim assistant. Figures derive from the current portfolio. This is a demonstration message.</div>
  </div></body></html>`;
}

function openAiEmailPreview() {
  const html = aiEmailHtml();
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="aiEmBg"><div class="modal docwide">
    <div class="erp-head"><span class="erp-badge">✉</span><div>
      <h2>${t('aiEmailTitle')}</h2><div class="sub">${t('aiEmailLead')}</div></div></div>
    <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:14px 0;max-height:460px;overflow-y:auto">
      <iframe id="aiEmFrame" style="width:100%;height:640px;border:0;background:#F5F5F5" title="email preview"></iframe>
    </div>
    <div class="actions">
      <button class="btn dark" id="aiEmDownload">⤓ ${t('aiEmailPreview')}</button>
      <button class="btn" id="aiEmPrint">${t('print')}</button>
      <button class="btn ghost" id="aiEmClose">${t('close')}</button>
    </div>
  </div></div>`;
  document.body.appendChild(holder);
  // populate the iframe via srcdoc (keeps the preview isolated from app styles)
  const frame = holder.querySelector('#aiEmFrame');
  if (frame) frame.srcdoc = html;
  const close = () => holder.remove();
  holder.querySelector('#aiEmBg').addEventListener('click', (e) => { if (e.target.id === 'aiEmBg') close(); });
  holder.querySelector('#aiEmClose').addEventListener('click', close);
  holder.querySelector('#aiEmDownload').addEventListener('click', () => {
    download(`CCOGS_AI_Daily_Summary_${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html');
    flash(t('aiEmailBuilt'));
  });
  holder.querySelector('#aiEmPrint').addEventListener('click', () => printHtml(html));
}

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
  consolFilters: { suppliers: null, windows: null, years: null, amounts: null }, // Consolidated Debit global filter (null = all)
  miContacted: false,           // missing-invoice: set true once the supplier has been contacted (unlocks recalculate)
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
// Zone 1 = numbered process pill (green active / silver ✓ visited).
// Zone 2 & 3 = small palette icon, no number.
function navItemHtml(st) {
  const active = state.stage === st.id;
  const visited = state.visited && state.visited.has(st.id) && !active;
  if (st.zone === 1) {
    const mark = visited ? '✓' : st.n;
    // sub-items (e.g. Inputs → Documents) show only when the stage is active
    const subs = (active && st.sub)
      ? `<div class="nav-sub">${st.sub.map((s) => {
          // "documents" is active for any non-summary sub (a document category or latest)
          const on = s.key === 'documents' ? (state.sub && state.sub !== 'summary') : (state.sub === s.key);
          return `<div class="nav-subitem ${on ? 'active' : ''}" data-subnav="${s.key}">${t(s.label)}</div>`;
        }).join('')}</div>`
      : '';
    return `<div class="nav-item ${active ? 'active' : ''}" data-stage="${st.id}"><span class="n ${visited ? 'done' : ''}">${mark}</span>${t(st.label)}</div>${subs}`;
  }
  return `<div class="nav-item nav-item-icon ic-${st.icon} ${active ? 'active' : ''}" data-stage="${st.id}"><span class="nav-ico">${navIcon(st.icon)}</span>${t(st.label)}</div>`;
}
function sidebar() {
  const z1 = STAGES.filter((s) => s.zone === 1).map(navItemHtml).join('');
  const z2 = STAGES.filter((s) => s.zone === 2).map(navItemHtml).join('');
  const z3 = STAGES.filter((s) => s.zone === 3).map(navItemHtml).join('');
  return `<aside class="sidebar">
    <div class="logo">CCOGS<span class="tier"> Reclaim</span></div>
    <div class="nav-group"><div class="g-label">${t('navProcess')}</div>${z1}</div>
    <div class="nav-group nav-zone2"><div class="g-label">${t('navAnalytics')}</div>${z2}</div>
    <div class="nav-group sidebar-foot">
      <div class="langs">${LANGS.map((l) => `<button data-lang="${l.code}" class="${getLang() === l.code ? 'active' : ''}">${l.flag} ${l.label}</button>`).join('')}</div>
    </div>
    <div class="nav-group nav-zone3"><div class="g-label">${t('navHowItWorks')}</div>${z3}</div>
  </aside>`;
}

// Top progress stepper — the CCOGS journey (Ingest → Review → Select & bill).
// Shown only on Zone 1 process stages. The active PHASE is derived from the
// current stage (and the Inputs sub: summary => Review, else Ingest).
function progressStepper() {
  const st = STAGES.find((s) => s.id === state.stage);
  if (!st || st.zone !== 1) return '';
  // which phase are we in?
  let activeIdx;
  if (state.stage === 'consol') activeIdx = 2;
  else activeIdx = (state.sub === 'summary') ? 1 : 0;   // inputs: summary tiles = Review
  return `<div class="progress-nav" role="navigation" aria-label="${t('navProcess')}">
    ${JOURNEY.map((j, i) => {
      const cls = i < activeIdx ? 'done' : (i === activeIdx ? 'active' : '');
      const dot = i < activeIdx ? '✓' : (i + 1);
      const sub = i === activeIdx ? t('stepHere') : '';
      return `<button class="pstep2 ${cls}" data-step="${j.key}">
        <span class="pdot">${dot}</span>
        <span class="plabel"><span class="pl-t">${i + 1}. ${t(j.label)}</span><span class="pl-s">${sub}</span></span>
      </button>`;
    }).join('')}
  </div>`;
}

function render() {
  // guard: if the active stage is no longer in the sidebar (e.g. the retired
  // 'ml' stage), fall back to Inputs so render never dereferences undefined.
  const st = STAGES.find((s) => s.id === state.stage);
  if (!st) { state.stage = STAGES[0].id; return render(); }
  // track visited stages so Zone-1 pills can show a silver ✓
  if (!state.visited) state.visited = new Set();
  state.visited.add(state.stage);
  const title = t(st.label);
  const viewHtml = st.render(state);
  app.innerHTML = `<div class="app-shell">
    ${sidebar()}
    <main class="work">
      ${progressStepper()}
      <div class="page-head"><h2>${title}</h2></div>
      <div id="view">${viewHtml}</div>
    </main>
  </div>`;
  bind();
  initTooltips(app);
  // If the Summary ingest-flow is on screen, (re)play its fill animation.
  if (app.querySelector('#ingestFlow')) playIngestFlow();
  // Mapping Logic stage (#5): auto-play the animated model workflow.
  if (app.querySelector('#mfScreen')) playMappingFlow(app);
  // AI Daily Summary: play the "compiling" animation, then swap to the briefing.
  if (app.querySelector('#aiBuild')) playAiBuild();
}

function bind() {
  wireDelegates();   // install the one-time delegated click listener on `app`
  app.querySelectorAll('[data-stage]').forEach((el) => el.addEventListener('click', () => {
    state.stage = el.dataset.stage;
    // clicking the Inputs stage always lands on its Summary page (same as the
    // "back to summary" button), even when a Documents sub-view was open.
    if (el.dataset.stage === 'inputs') state.sub = 'summary';
    render();
  }));
  app.querySelectorAll('[data-sub]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); state.sub = el.dataset.sub; render(); }));
  // left-nav sub-item: "Documents" opens the collection view (default: Latest received)
  app.querySelectorAll('[data-subnav]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const k = el.dataset.subnav;
    state.stage = 'inputs';
    state.sub = (k === 'documents') ? (state.sub && state.sub !== 'summary' ? state.sub : 'latest') : k;
    render();
  }));
  // Latest received: Show 10 / Show 50 selector
  app.querySelectorAll('[data-latestn]').forEach((el) => el.addEventListener('click', () => { state.latestN = Number(el.dataset.latestn) === 50 ? 50 : 10; render(); }));
  // Live-data-ingestion tiles (invoice/EDI/goods receipt/...) open the Documents
  // collection at "Latest received" — the user then picks a category up top.
  app.querySelectorAll('[data-ingestnode]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    state.stage = 'inputs';
    state.sub = 'latest';
    render();
  }));
  // top progress stepper — jump to the phase's stage (Review = Inputs Summary tab)
  app.querySelectorAll('[data-step]').forEach((el) => el.addEventListener('click', () => {
    const j = JOURNEY.find((x) => x.key === el.dataset.step); if (!j) return;
    state.stage = j.stage;
    if (j.key === 'review') state.sub = 'summary';
    else if (j.key === 'ingest' && state.sub === 'summary') state.sub = 'invoices';
    render();
  }));
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

  // Finance Overview — global filter bar (supplier / issue / contract / validity)
  wireOverviewFilterBar();

  // Consolidated Debit — global filter bar (supplier / contract / year / amount)
  wireConsolFilterBar();

  // Finance Overview — Claim builder Summary "Top 3 by" sort buttons are wired via
  // the delegated listener in wireDelegates() (robust across re-renders).

  // Mapping Logic stage (#5): Replay restarts the animation. (Ends at Scene C.)
  const mfReplay = app.querySelector('#mfReplay');
  if (mfReplay) mfReplay.addEventListener('click', () => playMappingFlow(app));

  // AI Daily Summary — wire the briefing controls (only present once built).
  wireAiSummary();

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

  // Consolidated Debit: switch active supplier + open the read-only review.
  app.querySelectorAll('[data-consolsup]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.matches('input,[data-stagetoggle],[data-stageadd],[data-stageremove],[data-consolview]')) return; // don't hijack checkbox/button clicks
    state.consolSup = el.dataset.consolsup; render();
  }));
  app.querySelectorAll('[data-consolview]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openReviewReadOnly(b.dataset.consolview); }));

  // ---- Consolidated Debit — review-then-include (add/remove to the live debit) ----
  app.querySelectorAll('[data-stageadd]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.stageSel) state.stageSel = new Set();
    state.stageSel.add(b.dataset.stageadd); render();
  }));
  app.querySelectorAll('[data-stageremove]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.stageSel) state.stageSel.delete(b.dataset.stageremove); render();
  }));
  app.querySelectorAll('[data-stageclear]').forEach((b) => b.addEventListener('click', () => {
    state.stageSel = new Set(); render();
  }));
  // checkbox in the staging left panel toggles the same staging selection
  app.querySelectorAll('[data-stagetoggle]').forEach((el) => el.addEventListener('change', (e) => {
    e.stopPropagation();
    if (!state.stageSel) state.stageSel = new Set();
    if (el.checked) state.stageSel.add(el.dataset.stagetoggle); else state.stageSel.delete(el.dataset.stagetoggle);
    render();
  }));
  // NOTE: supplier-card switching (data-consolsup) is already wired above and is
  // reused by the staging page; its guard skips <input> so the staging checkbox
  // won't switch suppliers, and the Add/Remove handlers call stopPropagation().
  app.querySelectorAll('[data-stagegen]').forEach((b) => b.addEventListener('click', () => openStagingInvoice(b.dataset.stagegen)));
  app.querySelectorAll('[data-stageagr]').forEach((b) => b.addEventListener('click', () => openStagingAgreement(b.dataset.stageagr)));
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

// EXPERIMENTAL staging page: generate a consolidated invoice from the charges
// the user ADDED to the batch (state.stageSel). Mirrors openConsolidatedInvoice
// but reads the staging selection so it stays independent of the shipped page.
function stagedChargesForSupplier(supplierId) {
  const groups = chargesBySupplier(state);
  const g = groups.find((x) => x.supplierId === supplierId) || null;
  if (!g) return [];
  const sel = state.stageSel || new Set();
  return g.charges.filter((c) => sel.has(c.chargeId));
}
function openStagingInvoice(supplierId) {
  const charges = stagedChargesForSupplier(supplierId);
  if (!charges.length) return;
  const cur = charges[0].currency || 'EUR';
  const consolidated = {
    ...charges[0],
    chargeId: `CN-${supplierId}-STAGED`, // marker: staged consolidated charge
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
function openStagingAgreement(supplierId) {
  const charges = stagedChargesForSupplier(supplierId);
  if (!charges.length) return;
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

  // recovery-workflow transition buttons (issue / dispute / settle / close / approve / reject)
  holder.querySelectorAll('[data-cxn]').forEach((b) => b.addEventListener('click', () => {
    const to = b.dataset.cxn;
    const idx = state.charges.findIndex((c) => c.chargeId === b.dataset.cxid);
    if (idx < 0) return;
    const cur = state.charges[idx];
    const extra = {};
    let note = '';
    if (to === 'DISPUTED') { note = window.prompt(t('csDisputePrompt')) || ''; extra.disputeReason = note; }
    if (to === 'PARTIALLY_SETTLED' || to === 'CLOSED') {
      const amt = window.prompt(t('csSettlePrompt'), String(cur.variance ?? ''));
      if (amt != null && amt !== '') extra.settledAmount = Number(amt);
    }
    if (to === 'REJECTED') { note = window.prompt(t('csDisputePrompt')) || ''; }
    try {
      state.charges[idx] = transitionCharge(cur, to, { actor: 'analyst', now: () => new Date().toISOString(), note, extra });
    } catch (e) { window.alert(String(e.message || e)); return; }
    close(); render(); openReviewReadOnly(b.dataset.cxid);
  }));

  // supplier-reply capture — save the note onto the charge + audit entry
  const supSave = holder.querySelector('[data-supsave]');
  if (supSave) supSave.addEventListener('click', () => {
    const ta = holder.querySelector('[data-supresp]');
    const noteVal = ta ? ta.value.trim() : '';
    const idx = state.charges.findIndex((c) => c.chargeId === supSave.dataset.supsave);
    if (idx < 0) return;
    const cur = state.charges[idx];
    const at = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const entry = { seq: (cur.auditTrace?.length || 0) + 1, timestamp: at, actor: 'analyst', action: 'SUPPLIER_REPLY', details: { chargeId: cur.chargeId, note: noteVal } };
    state.charges[idx] = { ...cur, supplierResponse: { at, channel: 'manual', note: noteVal }, auditTrace: [...(cur.auditTrace || []), entry] };
    close(); render(); openReviewReadOnly(supSave.dataset.supsave);
  });
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
  // missing-invoice supplier-action flow: Contact supplier -> (enables) Recalculate.
  const contactBtn = holder.querySelector('[data-micontact]');
  if (contactBtn) contactBtn.addEventListener('click', () => {
    state.miContacted = true;
    flash(t('miContactedMsg'));
    close();
    openTileDetails('missing_invoice');   // reopen with the step marked done + recalc enabled
  });
  const recalcBtn = holder.querySelector('[data-mirecalc]');
  if (recalcBtn) recalcBtn.addEventListener('click', () => { if (recalcBtn.disabled) return; flash(t('miRecalcMsg')); });
}

// ---- Add source (EDI / API / Folder / Mailbox intake & email scan) ----------
// Demonstration intake panel. EDI/API/Folder are shown as connectable source
// types; the Mailbox option launches the shared-mailbox email scan (the one that
// can surface a missing-invoice update).
function openAddSource() {
  // Three connectable sources (mailbox removed — it has its own tile/flow).
  const SOURCES = [
    { id: 'edi', logo: 'EDI', name: t('srcEdiName'), sub: t('srcEdiSub') },
    { id: 'api', logo: 'API', name: t('srcApiName'), sub: t('srcApiSub') },
    { id: 'folder', logo: '📁', name: t('srcFolderName'), sub: t('srcFolderSub') },
  ];
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="asBg"><div class="modal">
    <div class="erp-head"><span class="erp-badge">＋</span><div>
      <h2>${t('addSourceTitle')}</h2><div class="sub">${t('addSourceLead')}</div></div></div>
    <div class="erp-syslist">
      ${SOURCES.map((s) => `<button class="erp-sys as-src" data-src="${s.id}">
        <span class="erp-logo erp-logo-${s.id}">${s.logo}</span>
        <span class="erp-sys-main"><span class="erp-sys-name">${esc(s.name)}</span><span class="erp-sys-sub">${esc(s.sub)}</span></span>
        <span class="as-arrow">→</span>
      </button>`).join('')}
    </div>
    <div class="as-tmpl"><button class="btn tint-ghost" id="asTmpl">⤓ ${t('agrCsvTemplate')}</button>
      <span class="small muted">${t('agrCsvTemplateHint')}</span></div>
    <div class="actions"><button class="btn ghost" id="asClose">${t('cancel')}</button></div>
  </div></div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#asBg').addEventListener('click', (e) => { if (e.target.id === 'asBg') close(); });
  holder.querySelector('#asClose').addEventListener('click', close);
  holder.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.src;
    close();
    openConnectSource(id);
  }));
  // downloadable bulk-import template so teams can load agreements from a spreadsheet
  const tmpl = holder.querySelector('#asTmpl');
  if (tmpl) tmpl.addEventListener('click', () => download('agreement_import_template.csv', agreementCsvTemplate(), 'text/csv'));
}

// A ready-to-fill CSV template for bulk agreement import (header row + one
// worked example showing the tiers/currencies/countries/clauses encoding).
function agreementCsvTemplate() {
  const example = {
    agreementId: 'AGR-EXAMPLE', supplierId: 'SUP-001', supplierName: 'Example Supplier Ltd',
    contractRef: 'CTR-2026-001', rebateStructure: 'RETROSPECTIVE_TIERED', basis: 'UNITS', period: 'YEAR', scope: 'PAN_EU',
    retrospectiveReach: 'WITHIN_PERIOD', tierMeasure: 'COMBINED', windowType: 'YEAR',
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
    signatory: 'Jane Doe', signatoryTitle: 'Head of Procurement', signedDate: '2025-12-15', governingLaw: 'SK',
    tiers: [{ threshold: 0, rate: 0.01 }, { threshold: 10000, rate: 0.02 }, { threshold: 25000, rate: 0.03 }],
    currencies: ['EUR', 'PLN', 'CZK'], countries: ['SK', 'PL', 'CZ'],
    skuSet: ['ASIN-100', 'ASIN-200'], engineConfiguredSkus: ['ASIN-100'],
    clauseRefs: { tier: 'Clause 4.2', panEu: 'Clause 7.1' },
  };
  return serializeAgreementCsv([example]);
}

// Realistic per-source connection dialog (EDI / API / Folder). Each has its own
// distinct set of professional fields. Demo-only: "Connect" flashes a confirmation.
function connectSourceForm(kind) {
  const fld = (labelKey, id, opts = {}) => {
    const lbl = t(labelKey);
    if (opts.options) {
      const os = opts.options.map((o) => `<option${o === opts.value ? ' selected' : ''}>${esc(o)}</option>`).join('');
      return `<label class="cf-fld"><span>${esc(lbl)}</span><select id="cf-${id}">${os}</select></label>`;
    }
    return `<label class="cf-fld"><span>${esc(lbl)}</span><input id="cf-${id}" type="${opts.type || 'text'}" value="${esc(opts.value || '')}" placeholder="${esc(opts.ph || '')}"/></label>`;
  };
  if (kind === 'edi') {
    return {
      title: t('cfEdiTitle'), sub: t('cfEdiSub'),
      html: `<div class="cf-grid cf-2col">
        ${fld('cfName', 'name', { value: 'Lumière Cosmetics — EDI (AS2)', ph: 'Trading partner EDI' })}
        ${fld('cfProtocol', 'protocol', { options: ['AS2', 'OFTP2', 'SFTP', 'X.400', 'VAN'], value: 'AS2' })}
        ${fld('cfStandard', 'standard', { options: ['ANSI X12', 'EDIFACT', 'TRADACOMS', 'XML/GS1'], value: 'EDIFACT' })}
        ${fld('cfEndpoint', 'endpoint', { value: 'as2://edi.lumierecosmetics.fr/as2/inbound' })}
        ${fld('cfAs2Id', 'as2id', { value: 'LUMIERE-PROD-01' })}
        ${fld('cfIsaSender', 'isasender', { value: 'ZZ · 8590012340019' })}
        ${fld('cfIsaReceiver', 'isareceiver', { value: 'ZZ · PERFUMERIES-AR' })}
        ${fld('cfTxnSets', 'txnsets', { value: '810, 856, 850, 997', ph: '810, 856, 850' })}
        ${fld('cfCert', 'cert', { value: 'partner_as2_public.cer', ph: 'AS2 signing certificate' })}
      </div>
      <p class="muted small">${t('cfDemoNote')}</p>`,
    };
  }
  if (kind === 'api') {
    return {
      title: t('cfApiTitle'), sub: t('cfApiSub'),
      html: `<div class="cf-grid cf-2col">
        ${fld('cfName', 'name', { value: 'Nordica Beauty — REST API', ph: 'Partner / ERP API' })}
        ${fld('cfBaseUrl', 'baseurl', { value: 'https://api.nordicabeauty.se/v2' })}
        ${fld('cfAuth', 'auth', { options: ['OAuth 2.0 (client credentials)', 'API key', 'Basic auth', 'Bearer token'], value: 'OAuth 2.0 (client credentials)' })}
        ${fld('cfTokenUrl', 'tokenurl', { value: 'https://auth.nordicabeauty.se/oauth/token' })}
        ${fld('cfClientId', 'clientid', { value: 'perfumeries-ar-client' })}
        ${fld('cfClientSecret', 'secret', { type: 'password', value: '••••••••••••••••' })}
        ${fld('cfScope', 'scope', { value: 'invoices.read deliverynotes.read' })}
        ${fld('cfPoll', 'poll', { options: ['Every 15 min', 'Hourly', 'Every 4 hours', 'Daily 06:00'], value: 'Hourly' })}
        ${fld('cfPageSize', 'pagesize', { type: 'number', value: '500' })}
      </div>
      <p class="muted small">${t('cfDemoNote')}</p>`,
    };
  }
  // folder (mirrors the old perfumeries.html Folder dialog)
  return {
    title: t('cfFolderTitle'), sub: t('cfFolderSub'),
    html: `<div class="cf-grid">
      ${fld('cfName', 'name', { value: 'OneDrive — AP inbox', ph: 'Shared drive inbox' })}
      ${fld('cfPath', 'path', { value: './data/incoming/', ph: './data/incoming/' })}
      ${fld('cfPattern', 'pattern', { value: '*.xml, *.csv' })}
      ${fld('cfFormat', 'format', { options: ['XML (invoice / DN)', 'CSV (RECADV)', 'Mixed'], value: 'XML (invoice / DN)' })}
    </div>
    <p class="muted small">${t('cfDemoNote')}</p>`,
  };
}
function openConnectSource(kind) {
  const { title, sub, html } = connectSourceForm(kind);
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="modal-bg" id="cfBg"><div class="modal">
    <div class="erp-head"><span class="erp-badge">＋</span><div>
      <h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div></div></div>
    <div class="cf-body">${html}</div>
    <div class="actions">
      <button class="btn ghost" id="cfCancel">${t('cancel')}</button>
      <button class="btn primary" id="cfSave">${t('cfConnect')}</button>
    </div>
  </div></div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#cfBg').addEventListener('click', (e) => { if (e.target.id === 'cfBg') close(); });
  holder.querySelector('#cfCancel').addEventListener('click', close);
  holder.querySelector('#cfSave').addEventListener('click', () => {
    const nameEl = holder.querySelector('#cf-name');
    const name = (nameEl && nameEl.value) || t('srcEdiName');
    close();
    flash(t('srcConnectedMsg', { name }));
  });
  const first = holder.querySelector('#cf-body input, .cf-body input, .cf-body select');
  if (first) { try { first.focus(); } catch { /* ignore */ } }
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
  const closeMs = reduced ? 500 : 6000;   // then auto-close + flip the tile (keep "ingesting" up 2s longer)

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

// ---- Finance Overview GLOBAL filter bar wiring (supplier/issue/contract/validity) ----
function wireOverviewFilterBar() {
  const bar = app.querySelector('.ov-fltbar');
  if (!bar) return;
  if (!state.ovFilters) state.ovFilters = { suppliers: null, scopes: null, windows: null, validity: null };
  const f = state.ovFilters;
  const FIELD = { sup: 'suppliers', scope: 'scopes', win: 'windows', val: 'validity' };

  bar.querySelectorAll('[data-ovmenu]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = btn.dataset.ovmenu;
    const pop = bar.querySelector(`[data-ovpop="${kind}"]`);
    const wasHidden = pop.hasAttribute('hidden');
    bar.querySelectorAll('.flt-pop').forEach((p) => p.setAttribute('hidden', ''));
    if (wasHidden) pop.removeAttribute('hidden');
  }));
  bar.querySelectorAll('.flt-pop').forEach((p) => p.addEventListener('click', (e) => e.stopPropagation()));

  const collect = (kind) => {
    const boxes = [...bar.querySelectorAll(`[data-ovopt="${kind}"]`)];
    const checked = boxes.filter((b) => b.checked).map((b) => b.value);
    return checked.length === boxes.length ? null : new Set(checked);
  };
  bar.querySelectorAll('[data-ovopt]').forEach((b) => b.addEventListener('change', () => { f[FIELD[b.dataset.ovopt]] = collect(b.dataset.ovopt); render(); }));
  bar.querySelectorAll('[data-ovall]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); f[FIELD[b.dataset.ovall]] = null; render(); }));
  bar.querySelectorAll('[data-ovnone]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); f[FIELD[b.dataset.ovnone]] = new Set(); render(); }));
  const clear = bar.querySelector('[data-ovclear]'); if (clear) clear.addEventListener('click', () => { f.suppliers = null; f.scopes = null; f.windows = null; f.validity = null; render(); });
}

// ---- Consolidated Debit GLOBAL filter bar wiring (supplier/contract/year/amount) ----
function wireConsolFilterBar() {
  const bar = app.querySelector('.cf-fltbar');
  if (!bar) return;
  if (!state.consolFilters) state.consolFilters = { suppliers: null, windows: null, years: null, amounts: null };
  const f = state.consolFilters;
  const FIELD = { sup: 'suppliers', win: 'windows', year: 'years', amt: 'amounts' };

  bar.querySelectorAll('[data-cfmenu]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = btn.dataset.cfmenu;
    const pop = bar.querySelector(`[data-cfpop="${kind}"]`);
    const wasHidden = pop.hasAttribute('hidden');
    bar.querySelectorAll('.flt-pop').forEach((p) => p.setAttribute('hidden', ''));
    if (wasHidden) pop.removeAttribute('hidden');
  }));
  bar.querySelectorAll('.flt-pop').forEach((p) => p.addEventListener('click', (e) => e.stopPropagation()));

  const collect = (kind) => {
    const boxes = [...bar.querySelectorAll(`[data-cfopt="${kind}"]`)];
    const checked = boxes.filter((b) => b.checked).map((b) => b.value);
    return checked.length === boxes.length ? null : new Set(checked);
  };
  bar.querySelectorAll('[data-cfopt]').forEach((b) => b.addEventListener('change', () => { f[FIELD[b.dataset.cfopt]] = collect(b.dataset.cfopt); render(); }));
  bar.querySelectorAll('[data-cfall]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); f[FIELD[b.dataset.cfall]] = null; render(); }));
  bar.querySelectorAll('[data-cfnone]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); f[FIELD[b.dataset.cfnone]] = new Set(); render(); }));
  const clear = bar.querySelector('[data-cfclear]'); if (clear) clear.addEventListener('click', () => { f.suppliers = null; f.windows = null; f.years = null; f.amounts = null; render(); });
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
    // Finance Overview Claim-Builder sort buttons — delegated so a click always
    // registers regardless of per-render binding timing.
    const wl = e.target.closest && e.target.closest('[data-wlsort]');
    if (wl) { e.preventDefault(); state.wlSort = wl.dataset.wlsort; render(); return; }
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
