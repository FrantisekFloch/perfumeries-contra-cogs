// Mapping Logic — animated model workflow (nav stage #5, currently hidden).
//
// A single-screen, self-explanatory animation of HOW the tool turns raw source
// documents into the findings shown on the summary. Pure SVG + CSS + a small
// timeline driver (setTimeout). Offline-safe, no libraries. Light theme, sized
// to fit one monitor screen (roughly Finance-Overview height).
//
// Storyboard (rev 2):
//   Scene A — Collect: the Invoices window loads first (counter 0->N, ~5s),
//     then delivery notes (~1s faster). Every source AFTER that just appears and
//     flies straight to the right-hand stack (no long collect) to save time. As
//     each parks it shrinks from a big window into a SMALL window; once stacked
//     the text fades and only the ICON remains.
//   Scene B — Messy ML web: an ML core drops at a random spot (mid->right of the
//     screen), the source icons scatter around it, and arrows connect them every
//     which way (~25 links) — a spider web. It fades, a second smaller cluster
//     forms elsewhere (~15 links), then a third big messy one (~45 links). The
//     point: the model tries to combine every input with every combination of
//     inputs. Then the whole mess clears.
//   Scene C — Results: the big source windows return on the left, an ML core in
//     the middle, and the high-level result windows on the right, stacked below
//     each other, each naming which inputs combined to produce it.
//   Scene D — Next steps (button): Data -> ML analysis -> Results -> the manual
//     actions the user can take (generate invoice, contact supplier, audit export).
//
// Pure string builder + playMappingFlow() that animates the DOM it produced.

import { t } from '../lib/i18n.js';

const nf = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// tiny monoline glyphs so each source reads at a glance
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

// order + metadata for the six collected sources.
//   collectMs = how long its "collect" phase lasts in Scene A.
//   flyOnly   = true: skip the count-up collect, just appear + fly to the stack.
const SOURCES = [
  { key: 'invoices', icon: 'invoice', sys: 'DB', labelKey: 'subInvoices', collectMs: 5000, flyOnly: false, fallback: 42 },
  { key: 'deliveryNotes', icon: 'delivery', sys: 'EDI', labelKey: 'subDeliveryNotes', collectMs: 4000, flyOnly: false, fallback: 28 },
  { key: 'receipts', icon: 'goods', sys: 'DB', labelKey: 'subReceipts', collectMs: 900, flyOnly: true, fallback: 36 },
  { key: 'ccogsEngine', icon: 'engine', sys: 'DB', labelKey: 'subEngine', collectMs: 900, flyOnly: true, fallback: 30 },
  { key: 'events', icon: 'missing', sys: 'EDI', labelKey: 'subMissing', collectMs: 900, flyOnly: true, fallback: 12 },
  { key: 'agreements', icon: 'agreement', sys: 'DB', labelKey: 'subAgreements', collectMs: 900, flyOnly: true, fallback: 18 },
];

// The high-level results (Scene C). Each names the inputs that combine to
// produce it (source chips) + a plain-language "why".
const RESULTS = [
  { key: 'late', titleKey: 'mfResLate', srcs: ['invoices', 'receipts', 'ccogsEngine'], whyKey: 'mfResLateWhy', cls: 'r-late' },
  { key: 'paneu', titleKey: 'mfResPanEu', srcs: ['receipts', 'agreements', 'ccogsEngine'], whyKey: 'mfResPanEuWhy', cls: 'r-paneu' },
  { key: 'scan', titleKey: 'mfResScan', srcs: ['ccogsEngine', 'agreements'], whyKey: 'mfResScanWhy', cls: 'r-scan' },
  { key: 'missing', titleKey: 'mfResMissing', shortKey: 'mfResMissingShort', srcs: ['deliveryNotes', 'receipts', 'events'], whyKey: 'mfResMissingWhy', cls: 'r-missing' },
  { key: 'complete', titleKey: 'mfResComplete', srcs: ['invoices', 'receipts'], whyKey: 'mfResCompleteWhy', cls: 'r-complete' },
];

function sysBadge(sys) { return `<span class="mf-sys mf-sys-${sys.toLowerCase()}">${t('sys' + sys)}</span>`; }

// One collected-source window (Scene A). Big + centered to start; animation adds
// .front (pop to front), then .parked (shrink to a small right-hand stack slot),
// then .iconly (text fades, only the icon remains).
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

// Scene C stage: big source windows (left) -> ML core -> stacked results (right).
function resultsStage() {
  const bigs = SOURCES.map((s) => `<div class="mf-bigsrc" data-src="${s.key}">
    <span class="mf-bigsrc-ico">${srcGlyph(s.icon)}</span>
    <span class="mf-bigsrc-t">${t(s.labelKey)}</span>
  </div>`).join('');
  const results = RESULTS.map((r, i) => resultWindow(r, i)).join('');
  return `<div class="mf-resultstage" id="mfResults">
    <div class="mf-bigcol">
      <div class="mf-col-cap">${t('mfIngested')}</div>
      ${bigs}
    </div>
    <div class="mf-core">
      <div class="mf-core-badge">∑</div>
      <div class="mf-core-lbl">${t('mfMlDone')}</div>
      <svg class="mf-core-arrow" viewBox="0 0 40 12" aria-hidden="true"><path d="M0 6h34M28 1l6 5-6 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="mf-results-col">
      <div class="mf-col-cap">${t('mfLayerOut')}</div>
      ${results}
    </div>
  </div>`;
}

// ---- top-level stage renderer ----
export function renderMappingFlow(state) {
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
        <div class="mf-caption" id="mfCaption">${t('mfCapB')}</div>
        <div class="mf-controls">
          <button class="btn ghost" id="mfReplay">↻ ${t('mfReplay')}</button>
          <button class="btn primary" id="mfContinue">${t('mfContinue')} →</button>
        </div>
      </div>

      <div class="mf-screen" id="mfScreen" data-scene="b">
        <!-- Scene A (collect) is SKIPPED for now — markup kept, hidden, for later. -->
        <div class="mf-collect" id="mfCollect">${srcWins}</div>

        <!-- Scene B: model chain. SVG draws blocks/outputs/packets; the six input
             tiles are HTML overlays (robust — no SVG-icon sizing surprises). -->
        <div class="mf-web" id="mfWeb">
          <svg class="mf-web-svg" id="mfWebSvg" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="mf-ch-tiles" id="mfChTiles"></div>
        </div>

        <!-- Scene C: results (final scene) -->
        ${resultsStage()}
      </div>

      ${modelsSection()}
    </div>`;
}

// ---- Below the animation: the THREE ML models the pipeline uses, explained.
// Realistic, business-credible models that read the heterogeneous inputs and
// produce the CCOGS true-ups: entity resolution (link records) → volume
// reconstruction (regression) → true-up classification (supervised).
const MF_MODELS = [
  { key: 'match', glyph: 'link', badgeKey: 'mfMdlMatchType' },
  { key: 'recon', glyph: 'wave', badgeKey: 'mfMdlReconType' },
  { key: 'class', glyph: 'target', badgeKey: 'mfMdlClassType' },
];
const MF_MODEL_GLYPH = {
  // link / record-matching
  link: '<path d="M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1"/><path d="M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1"/>',
  // converging signal / reconstruction
  wave: '<path d="M3 12c3 0 3-6 6-6s3 12 6 12 3-6 6-6"/>',
  // classification target
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
};
function modelsSection() {
  const cards = MF_MODELS.map((m, i) => `
    <div class="mf-mdl" style="--mi:${i}">
      <div class="mf-mdl-h">
        <span class="mf-mdl-ico">${srcGlyphRaw(MF_MODEL_GLYPH[m.glyph])}</span>
        <span class="mf-mdl-step">${i + 1}</span>
      </div>
      <div class="mf-mdl-name">${t('mfMdl' + cap1(m.key) + 'Name')}</div>
      <div class="mf-mdl-type">${t(m.badgeKey)}</div>
      <div class="mf-mdl-desc">${t('mfMdl' + cap1(m.key) + 'Desc')}</div>
      <div class="mf-mdl-in"><span class="mf-mdl-in-l">${t('mfMdlUses')}</span> ${t('mfMdl' + cap1(m.key) + 'In')}</div>
    </div>`).join('<div class="mf-mdl-arrow">→</div>');
  return `<div class="mf-models">
    <div class="mf-models-head">
      <h3>${t('mfModelsTitle')}</h3>
      <p class="muted small">${t('mfModelsLead')}</p>
    </div>
    <div class="mf-models-grid">${cards}</div>
  </div>`;
}

// (Removed: the per-model "In action" worked-example panels.)
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// raw monoline glyph (path string) → sized SVG
function srcGlyphRaw(pathStr) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pathStr}</svg>`;
}

// small deterministic-ish RNG so replays look varied but not seizure-y
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// Short "real information" tokens for the travelling chips (EDI-style), so it
// looks like actual documents/records are streaming through the model. Mix of
// invoice numbers, delivery notes, goods receipts, EDI transaction codes and
// unit counts drawn from the sources the tool ingests.
const PACKET_PREFIX = ['INV', 'DN', 'GRN', 'PO', 'ASN', 'AGR'];
const PACKET_EDI = ['850', '810', '856', '820', '855', '997'];
function packetToken() {
  const r = Math.random();
  if (r < 0.5) return `${PACKET_PREFIX[(Math.random() * PACKET_PREFIX.length) | 0]}-${(10000 + ((Math.random() * 89999) | 0))}`;
  if (r < 0.78) return `${PACKET_EDI[(Math.random() * PACKET_EDI.length) | 0]} · ${(1 + ((Math.random() * 480) | 0))}u`;
  return `${(1 + ((Math.random() * 1200) | 0))} units`;
}

// Build the MODEL CHAIN (gallery idea "H"): six named source tiles on the left
// feed a chain of THREE model blocks in series — Ingest → Reconstruct →
// Classify — each holding its own little "combining web" of nodes. Five named
// output cards sit on the right. This function returns the STATIC svg plus the
// geometry the play loop needs to drive travelling packets:
//   { svg, inPts:[{x,y}], webs:[[{x,y}...] x3], outPts:[{x,y}] }
// Coordinate space matches the #mfWebSvg viewBox (1000 x 560).
function buildModelChain(rand) {
  const W = 1000, H = 560;
  // blocks shifted left by ~57 viewBox units (~1.5cm on screen) for better balance.
  // Labels reflect the three ML models: Match (entity resolution) → Reconstruct
  // (volume regression) → Classify (supervised true-up classification).
  const blocks = [
    { x: 243, key: 'mfChainMatch' },
    { x: 433, key: 'mfChainReconstruct' },
    { x: 623, key: 'mfChainClassify' },
  ];
  // ---- vertical layout, centred in the 560-tall canvas (TEXT ONLY, no icons) ----
  const inW = 150, inH = 46, inGap = 24;      // input tiles: narrower, hard left
  const inN = SOURCES.length;
  const inTotal = inN * inH + (inN - 1) * inGap;
  const inTop = (H - inTotal) / 2;
  const inLeft = 16;                          // hug the left edge → more gap to the middle

  const bw = 150, bh = 380;                    // model blocks
  const by = (H - bh) / 2;

  const outW = 160, outH = 62, outGap = 18;    // output cards: WIDER on the right
  const outN = RESULTS.length;
  const outTotal = outN * outH + (outN - 1) * outGap;
  const outTop = (H - outTotal) / 2;
  const outLeft = 838;                         // starts just right of the last block (820)

  // input tiles — rendered as HTML OVERLAY tiles (same button style as the
  // Scene C source tiles), positioned as % of the 1000x560 canvas. This avoids
  // any SVG-icon sizing bug. inPts (SVG coords) mark the right edge of each tile.
  const inPts = [];
  let tilesHtml = '';
  SOURCES.forEach((s, i) => {
    const y = inTop + i * (inH + inGap);
    tilesHtml += `<div class="mf-ch-intile" style="left:${(inLeft / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%;width:${(inW / W * 100).toFixed(2)}%;height:${(inH / H * 100).toFixed(2)}%">${t(s.labelKey)}</div>`;
    inPts.push({ x: inLeft + inW, y: y + inH / 2 });
  });

  // three model blocks, each with an internal combining web (dots + links only)
  let blockSvg = '';
  const webs = [];
  blocks.forEach((bk, bi) => {
    const nodes = [];
    for (let k = 0; k < 9; k++) nodes.push({ x: bk.x + 20 + rand() * (bw - 40), y: by + 26 + rand() * (bh - 52) });
    webs.push(nodes);
    let links = '';
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (rand() < 0.34) links += `<line class="mf-ch-weblink" x1="${nodes[i].x.toFixed(1)}" y1="${nodes[i].y.toFixed(1)}" x2="${nodes[j].x.toFixed(1)}" y2="${nodes[j].y.toFixed(1)}" />`;
    }
    const dots = nodes.map((n) => `<circle class="mf-ch-webnode" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="4" />`).join('');
    blockSvg += `<g class="mf-ch-block" style="--bi:${bi}">
      <rect class="mf-ch-box" x="${bk.x}" y="${by}" width="${bw}" height="${bh}" rx="18" />
      <text class="mf-ch-blbl" x="${bk.x + bw / 2}" y="${by - 16}" text-anchor="middle">${t(bk.key)}</text>
      ${links}${dots}
    </g>`;
  });

  // output cards — HTML OVERLAY tiles (single line, auto-shrinking font), same
  // button style as inputs; left-edge connection point returned in SVG coords.
  const outPts = [];
  let outTilesHtml = '';
  RESULTS.forEach((r, i) => {
    const y = outTop + i * (outH + outGap);
    const outLabel = r.shortKey ? t(r.shortKey) : t(r.titleKey);
    outTilesHtml += `<div class="mf-ch-outtile ${r.cls}" style="left:${(outLeft / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%;width:${(outW / W * 100).toFixed(2)}%;height:${(outH / H * 100).toFixed(2)}%">${outLabel}</div>`;
    outPts.push({ x: outLeft, y: y + outH / 2 });
  });
  const outSvg = '';

  const svg = `<g class="mf-chain">${blockSvg}${outSvg}</g>`;
  return { svg, tilesHtml: tilesHtml + outTilesHtml, inPts, webs, outPts, blocks: blocks.map((b) => b.x) };
}

// ---- animation driver ----
export function playMappingFlow(host) {
  const screen = host.querySelector('#mfScreen');
  if (!screen) return;
  if (screen.__mfTimers) screen.__mfTimers.forEach((tm) => clearTimeout(tm));
  const timers = []; screen.__mfTimers = timers;
  const after = (ms, fn) => timers.push(setTimeout(fn, ms));

  const caption = host.querySelector('#mfCaption');
  const contBtn = host.querySelector('#mfContinue');
  const setCap = (key) => { if (caption) caption.textContent = t(key); };
  const setScene = (s) => { screen.dataset.scene = s; };

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const runId = (screen.__mfRun = (screen.__mfRun || 0) + 1);
  const NS = 'http://www.w3.org/2000/svg';

  // Scene A (collect) is skipped for now. We start at Scene B (the model chain).
  const wins = [...screen.querySelectorAll('.mf-srcwin')];
  wins.forEach((w) => { w.classList.remove('front', 'parked', 'iconly', 'collecting'); });
  const webSvg = screen.querySelector('#mfWebSvg'); if (webSvg) webSvg.innerHTML = '';
  const tilesHost = screen.querySelector('#mfChTiles'); if (tilesHost) tilesHost.innerHTML = '';

  // ---- Scene B: model chain (Ingest → Reconstruct → Classify) with packets ----
  const rand = rng(0x9e3779b9 ^ (Date.now() & 0xffff));
  const chain = buildModelChain(rand);
  setScene('b'); setCap('mfCapB');
  if (contBtn) contBtn.disabled = false;
  if (webSvg) webSvg.innerHTML = chain.svg;
  if (tilesHost) tilesHost.innerHTML = chain.tilesHtml;

  // drive travelling packets: input tile → a node in each block → an output.
  // Each packet is an EDI-style labelled CHIP (rounded pill + short doc token),
  // so it reads as real documents/records streaming through the model.
  // For the first 8s, packets are labelled EDI chips (real records streaming);
  // after that they become plain dots — calmer on the eyes. Movement is gentle.
  const bStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const TEXT_WINDOW_MS = 8000;
  const SPEED = 0.03;   // per-tick progress along a segment (lower = slower)
  const spawn = () => {
    if (screen.__mfRun !== runId || screen.dataset.scene !== 'b') return;
    const svg = screen.querySelector('#mfWebSvg'); if (!svg) return;
    const stops = [chain.inPts[(Math.random() * chain.inPts.length) | 0]];
    chain.webs.forEach((web) => stops.push(web[(Math.random() * web.length) | 0]));
    stops.push(chain.outPts[(Math.random() * chain.outPts.length) | 0]);

    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const asText = (nowMs - bStart) < TEXT_WINDOW_MS;

    let g;
    if (asText) {
      const label = packetToken();
      const halfW = 24 + label.length * 3.4;   // pill sized to the text
      g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'mf-ch-packet');
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', (-halfW).toFixed(1)); rect.setAttribute('y', '-11');
      rect.setAttribute('width', (halfW * 2).toFixed(1)); rect.setAttribute('height', '22');
      rect.setAttribute('rx', '8'); rect.setAttribute('class', 'mf-ch-packet-box');
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
      txt.setAttribute('class', 'mf-ch-packet-t'); txt.textContent = label;
      g.appendChild(rect); g.appendChild(txt);
    } else {
      // plain dot phase
      g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'mf-ch-packet mf-ch-packet-dot');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', '5'); dot.setAttribute('class', 'mf-ch-packet-dotc');
      g.appendChild(dot);
    }
    g.setAttribute('transform', `translate(${stops[0].x},${stops[0].y})`);
    svg.appendChild(g);

    let seg = 0, tt = 0;
    const iv = setInterval(() => {
      if (screen.__mfRun !== runId) { clearInterval(iv); g.remove(); return; }
      tt += SPEED; const a = stops[seg], b = stops[seg + 1];
      if (!b) { clearInterval(iv); g.remove(); return; }
      const x = a.x + (b.x - a.x) * tt, y = a.y + (b.y - a.y) * tt;
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      g.setAttribute('data-stage', seg === 0 ? 'in' : (seg < stops.length - 2 ? 'mix' : 'out'));
      if (tt >= 1) { tt = 0; seg++; }
    }, 26);
    timers.push(iv);
  };
  if (!reduced) { const streamer = setInterval(spawn, 340); timers.push(streamer); }

  // ---- Scene C: auto-advances after 20s, or on the Continue click ----
  const goResults = () => {
    if (screen.__mfRun !== runId || screen.dataset.scene === 'c') return;
    setScene('c'); setCap('mfCapC');
    const rs = [...screen.querySelectorAll('.mf-result')];
    rs.forEach((r, i) => after(i * 650, () => r.classList.add('show')));
    const live = host.querySelector('#mfContinue'); if (live) live.disabled = true;   // final scene
  };
  // rebind Continue each play (clone to drop stale listeners from a prior run)
  if (contBtn) {
    const fresh = contBtn.cloneNode(true);
    contBtn.parentNode.replaceChild(fresh, contBtn);
    fresh.addEventListener('click', goResults);
  }

  // auto-advance to the results after 20 seconds (Continue still skips ahead)
  if (reduced) { goResults(); } else { after(20000, goResults); }
}
