// Boot / startup scan UI (Req 1.2, task 15). Animates the DB -> API -> Folder
// scan using the real scanner, then resolves so app.js can move to login.

import { runScan } from '../lib/source.js';
import { ScanStatus } from '../lib/enums.js';
import { t } from '../lib/i18n.js';

const STEP_MS = 900;
const MIN_BOOT_MS = 6500; // keep the welcome/loading screen visible for a beat
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Friendly display labels for the scan sources (the underlying source .name
// values stay 'Database'/'API'/'Folder' — the scanner + tests rely on them).
const SOURCE_LABEL = {
  Database: '🗄️ Rebate agreement database',
  API: '🔌 Supplier & marketplace APIs',
  Folder: '🏭 Warehouse feeds & collected documents',
};

export async function runBoot(container, sources) {
  const startedAt = Date.now();
  container.innerHTML = `
    <div class="boot">
      <div class="boot-badge">VIR<span class="tier">_Tier</span></div>
      <h1>${t('bootWelcome')}</h1>
      <div class="tagline">${t('bootConnecting')}</div>
      <div id="scanlines"></div>
      <div class="boot-spinner"><span></span><span></span><span></span></div>
    </div>`;
  const host = container.querySelector('#scanlines');
  const lines = new Map();

  const ensureLine = (name) => {
    if (!lines.has(name)) {
      const el = document.createElement('div');
      el.className = 'scanline';
      el.innerHTML = `<span class="dot"></span><span class="name">${SOURCE_LABEL[name] || name}</span><span class="msg"></span>`;
      host.appendChild(el);
      lines.set(name, el);
    }
    return lines.get(name);
  };

  const onStatus = async (s) => {
    const el = ensureLine(s.name);
    const msg = el.querySelector('.msg');
    if (s.status === ScanStatus.SCANNING) {
      el.className = 'scanline scanning';
      msg.textContent = t('scanning', { name: s.name });
      await wait(STEP_MS);
    } else if (s.status === ScanStatus.NO_UPDATES) {
      el.className = 'scanline done';
      msg.textContent = t('noUpdates');
    } else if (s.status === ScanStatus.FOUND) {
      el.className = 'scanline found';
      msg.textContent = t('found', { count: s.count });
    } else if (s.status === ScanStatus.ERROR) {
      el.className = 'scanline'; el.querySelector('.dot').style.background = 'var(--danger)';
      msg.textContent = `Error: ${s.error}`;
    }
  };

  const result = await runScan(sources, { onStatus });
  await wait(STEP_MS);
  // hold the loading screen so the user actually sees the "connecting…" step
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_BOOT_MS) await wait(MIN_BOOT_MS - elapsed);
  return result;
}
