// End-to-end pipeline orchestrator: scan -> ingest -> persist -> advance lifecycle
// -> build portfolio. Shared by the app UI and the integration test so both drive
// the exact same flow.

import { SourceScanner } from './source.js';
import { ingestFiles, persistIngest } from './ingest.js';
import { matchInvoice } from './matching.js';
import { applyMatchStatus } from './lifecycle.js';
import { buildPortfolio } from './analytics.js';

export async function runPipeline(store, sources, { onStatus, asOf } = {}) {
  const { files, results } = await new SourceScanner(sources, { onStatus }).scanAll();
  // A scan reflects the current source truth. Reset first so re-scans / page
  // reloads are idempotent (goodsReceipts is a list and would otherwise pile up).
  store.clearAll();
  const ingest = ingestFiles(files);
  persistIngest(store, ingest);

  const receipts = store.all('goodsReceipts');
  const dns = store.all('deliveryNotes');
  for (const inv of store.all('invoices')) {
    applyMatchStatus(store, inv.invoiceNumber, matchInvoice(inv, receipts, dns), { actor: 'system' });
  }

  const invoices = store.all('invoices');
  const portfolio = buildPortfolio(invoices, receipts, dns, { asOf: asOf || new Date().toISOString() });
  return { scanResults: results, ingest, invoices, portfolio };
}
