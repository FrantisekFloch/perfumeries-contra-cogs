// Horizontal "ingestion flow" infographic for the Summary page. Replaces the
// old full-screen boot/welcome. A connecting line runs left->right; six source
// nodes sit alternately above and below it (top, bottom, top, ...). Each node
// shows the ingested count, a short description and the source system it came
// from (EDI / Database). A green "wave" progress line fills across the track as
// ingestion proceeds; nodes pop in one-by-one in sync.
//
// Pure string builder + a small animate() that drives the DOM the builder made.
// SVG only (offline-safe, no libs). Light theme.

import { t } from '../lib/i18n.js';

const nf = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// The six ingested document types in flow order, each mapped to a source system
// and an i18n description key. `key` matches INPUT_CATS/store collection keys.
export const FLOW_NODES = [
  { key: 'invoices', sys: 'DB', descKey: 'flowInvoicesDesc' },
  { key: 'deliveryNotes', sys: 'EDI', descKey: 'flowDeliveryDesc' },
  { key: 'receipts', sys: 'DB', descKey: 'flowReceiptsDesc' },
  { key: 'events', sys: 'EDI', descKey: 'flowEventsDesc' },
  { key: 'ccogsEngine', sys: 'DB', descKey: 'flowEngineDesc' },
  { key: 'agreements', sys: 'DB', descKey: 'flowAgreementsDesc' },
];

// small monoline source-system glyphs (24px, currentColor)
const SYS_SVG = {
  EDI: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  DB: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  API: '<path d="M8 4l-4 8 4 8M16 4l4 8-4 8"/>',
};
const sysGlyph = (sys) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYS_SVG[sys] || SYS_SVG.DB}</svg>`;

// Build one node's card markup. `pos` = 'top' | 'bottom'. The whole card is a
// button that opens the Documents collection at "Latest received"
// (data-ingestnode); the user then narrows to a category via the top control.
// It starts in the "loading" state (spinner
// overlay) and the count is shown immediately (real value).
function nodeCard(n, count, pos, done) {
  const sysLabel = t('sys' + n.sys); // sysEDI / sysDB / sysAPI
  const stateCls = done ? 'lit' : 'loading';
  return `<div class="ifl-node ifl-${pos} ${stateCls}" data-flow="${esc(n.key)}">
    <button class="ifl-card" data-ingestnode="${esc(n.key)}" title="${esc(t(labelKey(n.key)))}">
      <div class="ifl-spin" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg></div>
      <div class="ifl-card-h"><span class="ifl-sys ifl-sys-${n.sys.toLowerCase()}">${sysGlyph(n.sys)} ${esc(sysLabel)}</span></div>
      <div class="ifl-count">${nf(count)}</div>
      <div class="ifl-label">${esc(t(labelKey(n.key)))}</div>
      <div class="ifl-desc">${esc(t(n.descKey))}</div>
    </button>
    <div class="ifl-stem"></div>
    <div class="ifl-dot"></div>
  </div>`;
}

// map the flow key to the existing sub-tab label key used elsewhere
function labelKey(key) {
  return ({
    invoices: 'subInvoices', deliveryNotes: 'subDeliveryNotes', receipts: 'subReceipts',
    events: 'subMissing', ccogsEngine: 'subEngine', agreements: 'subAgreements',
  })[key] || key;
}

// Render the flow. `counts` = { key: n }. Static markup starts un-filled; call
// animateIngestFlow() to fill the wave and count up.
// `opts.done` = render in the already-finished static state (nodes lit, wave
// full, title = complete). Used on return visits so it doesn't re-animate.
export function renderIngestFlow(counts = {}, opts = {}) {
  const done = !!opts.done;
  const nodes = FLOW_NODES.map((n, i) => nodeCard(n, counts[n.key] || 0, i % 2 === 0 ? 'top' : 'bottom', done)).join('');
  const title = done ? (t('flowComplete') + ' · ' + t('flowClickHint')) : t('flowConnecting');
  return `
    <div class="ifl${done ? ' done' : ''}" id="ingestFlow">
      <div class="ifl-head">
        <div class="ifl-head-main">
          <div class="ifl-kick">${t('flowKick')}</div>
          <div class="ifl-title" id="iflTitle">${title}</div>
        </div>
        <button class="ifl-addsrc" id="iflAddSource" title="${t('addSourceHint')}">＋ ${t('addSource')}</button>
      </div>
      <div class="ifl-track">
        <div class="ifl-line"><i class="ifl-wave" id="iflWave" style="width:${done ? '100%' : '0%'}"></i></div>
        <div class="ifl-nodes">${nodes}</div>
      </div>
    </div>`;
}

// ---- Machine-Learning analysis panel (sits to the RIGHT of the ingest flow) ----
// A professional, "mathematical" looking animated panel: a phase line
// (Initializing -> Analysis in progress -> Complete), a live scrolling matrix of
// figures/equations, a converging optimisation curve, and a set of rotating
// method chips. Pure SVG + CSS; no libraries. It animates in parallel with the
// ingest flow and settles when analysis "completes".
export function renderMlAnalysisPanel(opts = {}) {
  const done = !!opts.done;
  // deterministic-ish grid of "coefficients" the animation scrolls through
  const cells = [];
  for (let i = 0; i < 36; i++) cells.push(`<span class="mla-cell">${(Math.random() * 2 - 1).toFixed(2)}</span>`);
  // a smooth converging curve (loss going down) as an inline SVG polyline
  const pts = [];
  for (let x = 0; x <= 100; x += 4) {
    const y = 40 * Math.exp(-x / 34) + 4 + (Math.sin(x / 6) * 1.6);
    pts.push(`${x},${(50 - y).toFixed(1)}`);
  }
  const eqs = [
    'argmin&nbsp;Σ‖Vᵢ − V̂ᵢ‖²',
    'P = 0.40·mag + 0.30·lift + 0.20·drv + 0.10·tier',
    'V̂ = Σ receipts + Σ driverΔ',
    'entitled = valueBase × rate(V̂)',
    'z = (x − μ) / σ',
  ];
  // The panel starts BLOCKED (waiting for the live ingestion to finish). Once
  // ingestion completes, mlAnalysisStart() unblocks it and runs the analysis
  // (~6-8s), then mlAnalysisComplete() settles it. Light theme, business look.
  const startCls = done ? ' done' : ' blocked';
  const topLabel = done ? t('mlaComplete') : t('mlaAnalysisRunning');
  return `
    <div class="mla${startCls}" id="mlAnalysis">
      <div class="mla-head">
        <div class="mla-kick">${t('mlaKick')}</div>
        <div class="mla-phase" id="mlaPhase">${topLabel}</div>
        <div class="mla-model">
          <span class="mla-model-name" id="mlaModelName">${t('mlaModelName')} · <span id="mlaModelState">${done ? t('mlaComplete') : t('mlaModelIdle')}</span></span>
        </div>
      </div>
      <div class="mla-body">
        <div class="mla-viz">
          <svg class="mla-curve" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="mlaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#00B67A" stop-opacity="0.28"/><stop offset="100%" stop-color="#00B67A" stop-opacity="0"/>
            </linearGradient></defs>
            <polyline class="mla-line" points="${pts.join(' ')}"/>
            <polygon class="mla-area" points="0,50 ${pts.join(' ')} 100,50" fill="url(#mlaGrad)"/>
          </svg>
          <div class="mla-scan" aria-hidden="true"></div>
          <div class="mla-wait" id="mlaWait"><span class="mla-wait-dot"></span>${t('mlaWaiting')}</div>
        </div>
        <div class="mla-matrix" aria-hidden="true">${cells.join('')}</div>
        <div class="mla-eqs">${eqs.map((e, i) => `<span class="mla-eq" style="animation-delay:${i * 0.6}s">${e}</span>`).join('')}</div>
      </div>
      <div class="mla-foot"><span class="mla-spark" id="mlaSpark"></span><span class="mla-stat" id="mlaStat">${done ? t('mlaDoneStat') : t('mlaWaiting')}</span></div>
    </div>`;
}

// Render the panel in its initial BLOCKED state (waiting for ingestion). No-op
// beyond ensuring classes/labels are right; the panel markup already ships
// blocked, so this simply (re)asserts it in case of a re-render.
export function mlAnalysisBlock(host) {
  const root = host.querySelector('#mlAnalysis');
  if (!root) return;
  if (root.__mlaTimers) root.__mlaTimers.forEach((tm) => clearTimeout(tm));
  root.classList.remove('done', 'working'); root.classList.add('blocked');
  const state = root.querySelector('#mlaModelState'); if (state) state.textContent = t('mlaModelIdle');
  const stat = root.querySelector('#mlaStat'); if (stat) stat.textContent = t('mlaWaiting');
}

// Unblock + run the analysis. Called once the live ingestion completes. Runs the
// viz for ~6-8s, then calls opts.onDone (which settles the panel + reveals
// results). Respects reduced-motion (snaps to done quickly).
export function mlAnalysisStart(host, opts = {}) {
  const root = host.querySelector('#mlAnalysis');
  if (!root) return;
  if (root.__mlaTimers) root.__mlaTimers.forEach((tm) => clearTimeout(tm));
  const timers = []; root.__mlaTimers = timers;
  const phase = root.querySelector('#mlaPhase');
  const modelState = root.querySelector('#mlaModelState');
  const stat = root.querySelector('#mlaStat');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.classList.remove('blocked', 'done'); root.classList.add('working');
  if (phase) phase.textContent = t('mlaAnalysisRunning');
  if (modelState) modelState.textContent = t('mlaRunning');
  if (stat) stat.textContent = t('mlaWorking');

  const finishMs = reduced ? 200 : (6000 + Math.random() * 2000); // 6-8s real feel
  root.__mlaFinishMs = finishMs;
  timers.push(setTimeout(() => { if (typeof opts.onDone === 'function') opts.onDone(); }, finishMs));
}

// Settle the ML panel to its finished state (called from mlAnalysisStart onDone).
export function mlAnalysisComplete(host) {
  const root = host.querySelector('#mlAnalysis');
  if (!root) return;
  const phase = root.querySelector('#mlaPhase');
  const modelState = root.querySelector('#mlaModelState');
  const stat = root.querySelector('#mlaStat');
  root.classList.remove('working', 'blocked'); root.classList.add('done');
  if (phase) phase.textContent = t('mlaComplete');
  if (modelState) modelState.textContent = t('mlaComplete');
  if (stat) stat.textContent = t('mlaDoneStat');
}

// Animate: all nodes load at once (spinner overlay), each finishing at a RANDOM
// time between ~2s and ~8s so it feels like real parallel ingestion. The wave
// advances as each source completes; when all are done the title flips to
// "All sources ingested · click any source to see the items". Respects
// prefers-reduced-motion by snapping straight to the finished state.
// Re-entrant: a fresh call cancels any timers from a previous call on this host.
export function animateIngestFlow(host, counts = {}, opts = {}) {
  const root = host.querySelector('#ingestFlow');
  if (!root) return;
  // cancel a previous run on this root
  if (root.__iflTimers) { root.__iflTimers.forEach((tm) => clearTimeout(tm)); }
  const timers = []; root.__iflTimers = timers;

  const wave = root.querySelector('#iflWave');
  const title = root.querySelector('#iflTitle');
  const nodeEls = [...root.querySelectorAll('.ifl-node')];
  const n = nodeEls.length || 1;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // reset to loading state
  let finished = 0;
  nodeEls.forEach((el) => { el.classList.add('loading'); el.classList.remove('lit'); });
  if (wave) wave.style.width = '0%';

  const finish = (el) => {
    el.classList.remove('loading'); el.classList.add('lit');
    finished += 1;
    if (wave) wave.style.width = Math.round((finished / n) * 100) + '%';
    if (finished >= n) {
      if (wave) wave.style.width = '100%';
      if (title) title.textContent = t('flowComplete') + ' · ' + t('flowClickHint');
      if (typeof opts.onDone === 'function') opts.onDone();
    }
  };

  if (reduced) {
    if (title) title.textContent = t('flowComplete') + ' · ' + t('flowClickHint');
    nodeEls.forEach((el) => { el.classList.remove('loading'); el.classList.add('lit'); });
    if (wave) wave.style.width = '100%';
    if (typeof opts.onDone === 'function') opts.onDone();
    return;
  }

  if (title) title.textContent = t('flowIngesting');
  const MIN = opts.min ?? 2000;
  const MAX = opts.max ?? 8000;
  for (const el of nodeEls) {
    const ms = Math.round(MIN + Math.random() * (MAX - MIN));
    timers.push(setTimeout(() => finish(el), ms));
  }
}
