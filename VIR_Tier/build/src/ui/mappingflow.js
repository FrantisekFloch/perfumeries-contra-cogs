// Mapping Logic — animated model workflow (nav stage #5).
//
// A single-screen, self-explanatory animation of HOW the tool turns raw source
// documents into the findings shown on the summary. Pure SVG + CSS + a small
// timeline driver (setTimeout). Offline-safe, no libraries. Light theme, sized
// to fit one monitor screen (roughly Finance-Overview height).
//
// Storyboard:
//   Scene A — Collecting sources: the Invoices window comes to the front, its
//     counter ticks 0->N, then it shrinks and flies to a stacked "ingested"
//     slot on the left. Delivery notes follow (a touch faster), then goods,
//     CCOGS engine, missing data and agreements (~2s each).
//   Scene B — Machine learning: a neural-network-style panel (input / hidden /
//     output layers) lights up its connections every which way (~8s), showing
//     that all sources are being combined into the mapping.
//   Scene C — Results: the stacked ingestions on the left feed a small "ML done"
//     core; high-level result windows appear on the right, each labelled with
//     which inputs combined to produce it (e.g. Late delivery <- invoice +
//     goods receipt + CCOGS engine).
//   Scene D — Next steps (revealed by a button): Data -> ML analysis -> Results
//     -> the manual actions the user can take (generate invoice, contact
//     supplier, audit export).
//
// Pure string builder + playMappingFlow() that animates the DOM it produced.

import { t } from '../lib/i18n.js';

const nf = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// The six sources in collection order. `sys` = source system badge; `count` is
// the live number of ingested docs; timings tuned per the storyboard.
// icon = a tiny monoline glyph so each window reads at a glance.
const SRC_ICON = {
  invoice: '<path d="M6 3h9l3 3v15l-2-1-2 1-2-1-2 1-2-1-2 1V3z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  delivery: '<path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  goods: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
  engine: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  missing: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  agreement: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 12l2 2 4-4"/>',
};
function srcGlyph(icon) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SRC_ICON[icon] || SRC_ICON.invoice}</svg>`;
}

// order + metadata for the six collected sources
const SOURCES = [
  { key: 'invoices', icon: 'invoice', sys: 'DB', labelKey: 'subInvoices', collectMs: 5000, fallback: 42 },
  { key: 'deliveryNotes', icon: 'delivery', sys: 'EDI', labelKey: 'subDeliveryNotes', collectMs: 4000, fallback: 28 },
  { key: 'receipts', icon: 'goods', sys: 'DB', labelKey: 'subReceipts', collectMs: 2000, fallback: 36 },
  { key: 'ccogsEngine', icon: 'engine', sys: 'DB', labelKey: 'subEngine', collectMs: 2000, fallback: 30 },
  { key: 'events', icon: 'missing', sys: 'EDI', labelKey: 'subMissing', collectMs: 2000, fallback: 12 },
  { key: 'agreements', icon: 'agreement', sys: 'DB', labelKey: 'subAgreements', collectMs: 2000, fallback: 18 },
];

// The high-level results (Scene C). Each names the inputs that combine to
// produce it (shown as source chips) + a plain-language "why". `srcs` reference
// SOURCES keys so we can draw the right feeder chips.
const RESULTS = [
  { key: 'late', titleKey: 'mfResLate', srcs: ['invoices', 'receipts', 'ccogsEngine'], whyKey: 'mfResLateWhy', cls: 'r-late' },
  { key: 'paneu', titleKey: 'mfResPanEu', srcs: ['receipts', 'agreements', 'ccogsEngine'], whyKey: 'mfResPanEuWhy', cls: 'r-paneu' },
  { key: 'scan', titleKey: 'mfResScan', srcs: ['ccogsEngine', 'agreements'], whyKey: 'mfResScanWhy', cls: 'r-scan' },
  { key: 'missing', titleKey: 'mfResMissing', srcs: ['deliveryNotes', 'receipts', 'events'], whyKey: 'mfResMissingWhy', cls: 'r-missing' },
  { key: 'complete', titleKey: 'mfResComplete', srcs: ['invoices', 'receipts'], whyKey: 'mfResCompleteWhy', cls: 'r-complete' },
];

// Next-steps flow (Scene D): stages then the branch actions the user can take.
const NEXT_STAGES = [
  { key: 'data', labelKey: 'mfNsData', icon: 'δ', cls: 'ns-data' },
  { key: 'ml', labelKey: 'mfNsMl', icon: '∑', cls: 'ns-ml' },
  { key: 'results', labelKey: 'mfNsResults', icon: '✓', cls: 'ns-results' },
];
const NEXT_ACTIONS = [
  { key: 'generate', titleKey: 'mfNsGenerate', descKey: 'mfNsGenerateD', cls: 'na-generate' },
  { key: 'rejected', titleKey: 'mfNsRejected', descKey: 'mfNsRejectedD', cls: 'na-rejected' },
  { key: 'details', titleKey: 'mfNsDetails', descKey: 'mfNsDetailsD', cls: 'na-details' },
];

// --- source-system glyph reused from ingest flow look ---
function sysBadge(sys) {
  return `<span class="mf-sys mf-sys-${sys.toLowerCase()}">${t('sys' + sys)}</span>`;
}

// Build one collected-source window (Scene A). Rendered absolutely-positioned;
// the animation moves it to the front, counts up, then parks it in the stack.
function sourceWindow(s, count, idx) {
  return `<div class="mf-srcwin" data-src="${s.key}" data-idx="${idx}" style="--slot:${idx}">
    <div class="mf-srcwin-h">
      <span class="mf-srcwin-ico">${srcGlyph(s.icon)}</span>
      <span class="mf-srcwin-t">${t(s.labelKey)}</span>
      ${sysBadge(s.sys)}
    </div>
    <div class="mf-srcwin-count"><span class="mf-num" data-count="${count}">0</span></div>
    <div class="mf-srcwin-sub">${t('mfCollecting')}</div>
  </div>`;
}

// Neural-net panel (Scene B). Three columns of nodes (input/hidden/output) with
// SVG edges connecting every input to every hidden and every hidden to every
// output. CSS animates edge "signal" pulses in all directions.
function neuralPanel() {
  const IN = 6, HID = 5, OUT = 5;
  const W = 460, H = 300, padY = 26;
  const colX = [60, 230, 400];
  const ys = (n) => Array.from({ length: n }, (_, i) => padY + (H - 2 * padY) * (n === 1 ? 0.5 : i / (n - 1)));
  const inY = ys(IN), hidY = ys(HID), outY = ys(OUT);
  let edges = '';
  let e = 0;
  for (let i = 0; i < IN; i++) for (let h = 0; h < HID; h++) {
    edges += `<line class="mf-edge" x1="${colX[0]}" y1="${inY[i].toFixed(1)}" x2="${colX[1]}" y2="${hidY[h].toFixed(1)}" style="--d:${(e++ % 12) * 0.12}s"/>`;
  }
  for (let h = 0; h < HID; h++) for (let o = 0; o < OUT; o++) {
    edges += `<line class="mf-edge mf-edge-2" x1="${colX[1]}" y1="${hidY[h].toFixed(1)}" x2="${colX[2]}" y2="${outY[o].toFixed(1)}" style="--d:${(e++ % 12) * 0.12}s"/>`;
  }
  const nodes = (xs, arr, cls) => arr.map((y, i) => `<circle class="mf-node ${cls}" cx="${xs}" cy="${y.toFixed(1)}" r="7" style="--d:${i * 0.15}s"/>`).join('');
  const colLbl = (x, key) => `<text class="mf-collbl" x="${x}" y="14" text-anchor="middle">${t(key)}</text>`;
  return `<div class="mf-nn" id="mfNn">
    <div class="mf-nn-head"><span class="mf-nn-kick">${t('mfMlKick')}</span><span class="mf-nn-title">${t('mfMlTitle')}</span></div>
    <svg class="mf-nn-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${colLbl(colX[0], 'mfLayerIn')}${colLbl(colX[1], 'mfLayerHidden')}${colLbl(colX[2], 'mfLayerOut')}
      <g class="mf-edges">${edges}</g>
      ${nodes(colX[0], inY, 'mf-node-in')}
      ${nodes(colX[1], hidY, 'mf-node-hid')}
      ${nodes(colX[2], outY, 'mf-node-out')}
    </svg>
    <div class="mf-nn-cap">${t('mfMlCap')}</div>
  </div>`;
}

// Result window (Scene C) with its feeder source chips.
function resultWindow(r, idx) {
  const chips = r.srcs.map((k) => {
    const s = SOURCES.find((x) => x.key === k);
    return `<span class="mf-rchip">${srcGlyph(s.icon)} ${t(s.labelKey)}</span>`;
  }).join('<span class="mf-plus">+</span>');
  return `<div class="mf-result ${r.cls}" data-result="${r.key}" style="--ri:${idx}">
    <div class="mf-result-h">${t(r.titleKey)}</div>
    <div class="mf-result-srcs">${chips}</div>
    <div class="mf-result-why">${t(r.whyKey)}</div>
  </div>`;
}

// The compact left stack shown in Scene C (parked ingestions) + ML core.
function resultsStage() {
  const stack = SOURCES.map((s) => `<div class="mf-stack-item" data-src="${s.key}">
    <span class="mf-stack-ico">${srcGlyph(s.icon)}</span>
    <span class="mf-stack-t">${t(s.labelKey)}</span>
  </div>`).join('');
  const results = RESULTS.map((r, i) => resultWindow(r, i)).join('');
  return `<div class="mf-resultstage" id="mfResults">
    <div class="mf-stack">
      <div class="mf-stack-cap">${t('mfIngested')}</div>
      ${stack}
    </div>
    <div class="mf-core">
      <div class="mf-core-badge">∑</div>
      <div class="mf-core-lbl">${t('mfMlDone')}</div>
      <svg class="mf-core-arrow" viewBox="0 0 40 12" aria-hidden="true"><path d="M0 6h34M28 1l6 5-6 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="mf-results-col">${results}</div>
  </div>`;
}

// Next-steps flow (Scene D).
function nextStepsView() {
  const stages = NEXT_STAGES.map((s, i) => `
    <div class="mf-ns-stage ${s.cls}" style="--si:${i}">
      <div class="mf-ns-ico">${s.icon}</div>
      <div class="mf-ns-lbl">${t(s.labelKey)}</div>
    </div>${i < NEXT_STAGES.length - 1 ? '<div class="mf-ns-arrow">→</div>' : ''}`).join('');
  const actions = NEXT_ACTIONS.map((a, i) => `
    <div class="mf-ns-action ${a.cls}" style="--ai:${i}">
      <div class="mf-ns-action-h">${t(a.titleKey)}</div>
      <div class="mf-ns-action-d">${t(a.descKey)}</div>
    </div>`).join('');
  return `<div class="mf-nextsteps" id="mfNext">
    <div class="mf-ns-flow">${stages}</div>
    <div class="mf-ns-fork">↳ ${t('mfNsActionsLbl')}</div>
    <div class="mf-ns-actions">${actions}</div>
  </div>`;
}

// ---- top-level stage renderer ----
export function renderMappingFlow(state) {
  // live counts from the store; fall back to storyboard numbers if empty
  const counts = {};
  for (const s of SOURCES) {
    const n = state?.store ? state.store.all(s.key).length : 0;
    counts[s.key] = n > 0 ? n : s.fallback;
  }
  const srcWins = SOURCES.map((s, i) => sourceWindow(s, counts[s.key], i)).join('');

  return `
    <p class="lead">${t('mfLead')}</p>
    <div class="mf-stagewrap">
      <div class="mf-toolbar">
        <div class="mf-caption" id="mfCaption">${t('mfCapA')}</div>
        <div class="mf-controls">
          <button class="btn ghost" id="mfReplay">↻ ${t('mfReplay')}</button>
          <button class="btn primary" id="mfNextBtn" disabled>${t('mfNextSteps')} →</button>
        </div>
      </div>

      <div class="mf-screen" id="mfScreen" data-scene="a">
        <!-- Scene A + C share the source windows; C parks them into the stack -->
        <div class="mf-collect" id="mfCollect">${srcWins}</div>

        <!-- Scene B: neural net -->
        ${neuralPanel()}

        <!-- Scene C: results -->
        ${resultsStage()}

        <!-- Scene D: next steps -->
        ${nextStepsView()}
      </div>
    </div>`;
}

// ---- animation driver ----
// Scene captions in order + the scenes' cumulative schedule. Drives the DOM the
// builder produced. Re-entrant: cancels any prior run on this host.
export function playMappingFlow(host) {
  const screen = host.querySelector('#mfScreen');
  if (!screen) return;
  if (screen.__mfTimers) screen.__mfTimers.forEach((tm) => clearTimeout(tm));
  const timers = []; screen.__mfTimers = timers;
  const after = (ms, fn) => timers.push(setTimeout(fn, ms));

  const caption = host.querySelector('#mfCaption');
  const nextBtn = host.querySelector('#mfNextBtn');
  const setCap = (key) => { if (caption) caption.textContent = t(key); };
  const setScene = (s) => { screen.dataset.scene = s; };

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // reset
  setScene('a');
  if (nextBtn) nextBtn.disabled = true;
  const wins = [...screen.querySelectorAll('.mf-srcwin')];
  wins.forEach((w) => { w.classList.remove('front', 'parked', 'collecting'); });
  screen.querySelectorAll('.mf-num').forEach((el) => { el.textContent = '0'; });

  // A run token: a fresh play() bumps it so any in-flight count-up loops stop.
  const runId = (screen.__mfRun = (screen.__mfRun || 0) + 1);
  const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : ((f) => setTimeout(() => f(Date.now()), 16));
  const now0 = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // count-up helper for a single window's number (eased, self-cancelling)
  const countUp = (el, target, ms) => {
    if (!el) return;
    const start = now0();
    const step = (now) => {
      if (screen.__mfRun !== runId) return;        // a newer run superseded us
      const p = Math.min(1, (now - start) / ms);
      el.textContent = nf(Math.round(target * (0.5 - 0.5 * Math.cos(Math.PI * p)))); // ease-in-out
      if (p < 1) raf(step); else el.textContent = nf(target);
    };
    raf(step);
  };

  if (reduced) {
    // snap straight to results
    wins.forEach((w) => w.classList.add('parked'));
    screen.querySelectorAll('.mf-num').forEach((el) => { el.textContent = nf(+el.dataset.count || 0); });
    setScene('c'); setCap('mfCapC');
    if (nextBtn) nextBtn.disabled = false;
    return;
  }

  // ---- Scene A: collect each source in sequence ----
  setCap('mfCapA');
  let clock = 200;
  wins.forEach((w, i) => {
    const s = SOURCES[i];
    const dur = s.collectMs;
    const front = clock;
    const park = clock + dur * 0.62;      // start shrinking/flying partway through
    after(front, () => {
      w.classList.add('front', 'collecting');
      countUp(w.querySelector('.mf-num'), +w.querySelector('.mf-num').dataset.count || 0, dur * 0.55);
    });
    after(park, () => { w.classList.remove('front', 'collecting'); w.classList.add('parked'); });
    clock += dur;
  });
  const endA = clock + 300;

  // ---- Scene B: machine learning (~8s) ----
  const endB = endA + 8000;
  after(endA, () => { setScene('b'); setCap('mfCapB'); });

  // ---- Scene C: results reveal ----
  after(endB, () => {
    setScene('c'); setCap('mfCapC');
    const rs = [...screen.querySelectorAll('.mf-result')];
    rs.forEach((r, i) => after(i * 700, () => r.classList.add('show')));
    after(rs.length * 700 + 400, () => { if (nextBtn) nextBtn.disabled = false; });
  });
}

// Reveal Scene D (next steps). Called by the "Next steps" button.
export function showNextSteps(host) {
  const screen = host.querySelector('#mfScreen');
  if (!screen) return;
  screen.dataset.scene = 'd';
  const caption = host.querySelector('#mfCaption');
  if (caption) caption.textContent = t('mfCapD');
  const stages = [...screen.querySelectorAll('.mf-ns-stage, .mf-ns-action')];
  stages.forEach((el, i) => setTimeout(() => el.classList.add('show'), 120 + i * 260));
}
