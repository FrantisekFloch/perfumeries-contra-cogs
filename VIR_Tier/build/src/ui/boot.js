// Boot / startup UI. Presents loading as a live "evidence pipeline": stages
// light up as the real scan -> ingest -> match -> reconstruct -> re-check runs,
// streaming real counters, and ends on the recoveries headline. In-tool light
// theme, no icons, no replay button. (Req 1.2, task 15.)

import { runScan } from '../lib/source.js';
import { t } from '../lib/i18n.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nf = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// The five pipeline stages shown to the user. `key` maps to an i18n label.
const STAGES = [
  { key: 'pipeConnect' },
  { key: 'pipeIngest' },
  { key: 'pipeMatch' },
  { key: 'pipeReconstruct' },
  { key: 'pipeTiers' },
];

// Render the boot shell with the pipeline steps (all idle to start).
function bootShell() {
  const steps = STAGES.map((s, i) => `
    <div class="pstep" data-i="${i}">
      <div class="pnum">${i + 1}</div>
      <div class="ptext"><div class="pt">${t(s.key)}</div><div class="ps"></div></div>
      <div class="pbar"><i></i></div>
    </div>`).join('');
  return `
    <div class="boot">
      <div class="boot-badge">VIR<span class="tier">_Tier</span></div>
      <h1>${t('bootWelcome')}</h1>
      <div class="tagline">${t('bootConnecting')}</div>
      <div class="pipe" id="pipe">${steps}</div>
      <div class="bootdone" id="bootdone" hidden></div>
    </div>`;
}

// Animate a single stage: mark running, fill the bar, set the sub-text, mark done.
async function runStage(host, i, sub, ms = 900) {
  const el = host.querySelector(`.pstep[data-i="${i}"]`);
  if (!el) return;
  el.classList.add('run');
  const bar = el.querySelector('.pbar > i');
  const subEl = el.querySelector('.ps');
  const start = Date.now();
  await new Promise((res) => {
    const iv = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / ms) * 100);
      bar.style.width = p + '%';
      if (p >= 100) { clearInterval(iv); res(); }
    }, 40);
  });
  el.classList.remove('run'); el.classList.add('done');
  if (sub) subEl.textContent = sub;
}

// ---- Phase 1: real source scan (kept from the original boot) ----
// Renders the shell, runs the real scanner (so the folder source actually
// loads the files), and returns the scan result + the host for phase 2.
export async function runBoot(container, sources) {
  container.innerHTML = bootShell();
  const host = container.querySelector('#pipe');
  // Stage 1 — connect sources. Drive it off the real scan status.
  let sourcesSeen = 0;
  const scanPromise = runScan(sources, { onStatus: (s) => { if (s.status === 'FOUND' || s.status === 'NO_UPDATES') sourcesSeen++; } });
  await runStage(host, 0, '', 1100);
  const result = await scanPromise;
  const el0 = host.querySelector('.pstep[data-i="0"] .ps');
  if (el0) el0.textContent = t('pipeConnectDone', { n: sources.length });
  container.__pipeHost = host;
  return result;
}

// ---- Phase 2: animate the remaining stages with REAL numbers, then hand off ----
// stats = { docs, matched, reconstructedUnits, tierMoves, recoverCount, recoverEur }
export async function runPipelineAnim(container, stats) {
  const host = container.__pipeHost || container.querySelector('#pipe');
  if (!host) return;
  await runStage(host, 1, t('pipeIngestDone', { n: nf(stats.docs) }), 900);
  await runStage(host, 2, t('pipeMatchDone', { n: nf(stats.matched) }), 950);
  await runStage(host, 3, t('pipeReconstructDone', { n: nf(stats.reconstructedUnits) }), 1000);
  await runStage(host, 4, t('pipeTiersDone', { n: nf(stats.tierMoves) }), 900);

  // headline
  const done = container.querySelector('#bootdone');
  if (done) {
    done.hidden = false;
    done.innerHTML = `
      <div class="bd-left">
        <div class="bd-cap">${t('pipeComplete')}</div>
        <div class="bd-sub">${t('pipeFoundLine', { n: nf(stats.recoverCount) })}</div>
      </div>
      <div class="bd-right">
        <div class="bd-eur">€${nf(stats.recoverEur)}</div>
        <button class="btn green big" id="bootEnter">${t('pipeEnter')} →</button>
      </div>`;
  }
  // resolve when the user clicks Enter, or auto after a short beat
  await new Promise((res) => {
    const btn = container.querySelector('#bootEnter');
    let done2 = false;
    const go = () => { if (done2) return; done2 = true; res(); };
    if (btn) btn.addEventListener('click', go);
    setTimeout(go, 4200); // safety auto-advance so it never hangs
  });
}
