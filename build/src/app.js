// Perfumeries — Contra COGS Reconciliation
// Entry point (scaffold). Wiring of scan -> ingest -> engines -> UI is added in later tasks.

import { VERSION } from './lib/version.js';

function boot() {
  const status = document.getElementById('build-status');
  if (status) status.textContent = `scaffold ready · v${VERSION}`;

  // Placeholder scan panel content until Task 5 (SourceScanner) is implemented.
  const scan = document.getElementById('scan-status');
  if (scan) {
    scan.innerHTML = '';
    for (const src of ['Database', 'API', 'Folder']) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="src">${src}</span><span class="state">idle</span>`;
      scan.appendChild(li);
    }
  }
}

document.addEventListener('DOMContentLoaded', boot);
