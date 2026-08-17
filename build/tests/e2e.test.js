import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPipeline } from '../src/lib/pipeline.js';
import { defaultSources } from '../src/lib/source.js';
import { StateStore, createMemoryBackend } from '../src/lib/store.js';
import { analyzeInvoice } from '../src/lib/gap.js';
import { registerGap, resolveGap, openGaps } from '../src/lib/governance.js';
import { matchInvoice } from '../src/lib/matching.js';
import { InvoiceStatus, CreditNoteStatus } from '../src/lib/enums.js';
import { parseInvoiceXml, parseRecadvCsv } from '../src/lib/parsers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data') + '/';
const diskRead = (p) => readFileSync(p, 'utf8');
const folderOpts = { baseUrl: DATA, readText: diskRead };
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');
const newStore = () => new StateStore(createMemoryBackend(), 'e2e');

test('E2E: full pipeline over sample data yields the 100-unit gap and Partially Received status', async () => {
  const store = newStore();
  const { ingest, portfolio } = await runPipeline(store, defaultSources(folderOpts), { asOf: '2026-02-06T00:00:00' });

  // ingestion
  assert.equal(ingest.invoices.length, 1);
  assert.equal(ingest.goodsReceipts.length, 5);
  assert.equal(ingest.errors.length, 0);

  // lifecycle advanced from Received to Partially Received
  assert.equal(store.get('invoices', 'INV-2026-0001').status, InvoiceStatus.PARTIALLY_RECEIVED);

  // portfolio view of the scenario
  const v = portfolio[0];
  assert.equal(v.invoicedQty, 5000);
  assert.equal(v.receivedQty, 4900);
  assert.equal(v.missingQty, 100);
  assert.equal(v.valueAtRisk, 198);
  assert.equal(v.storages.length, 5);
});

test('E2E: Jan/Feb straddle with split debits and a GINR accrual', async () => {
  const store = newStore();
  const { portfolio } = await runPipeline(store, defaultSources(folderOpts), { asOf: '2026-02-06T00:00:00' });
  const t = portfolio[0].timing;
  assert.deepEqual(t.periods, ['2026-01', '2026-02']);
  assert.equal(t.straddles, true);
  const jan = t.splitDebits.find((d) => d.period === '2026-01');
  const feb = t.splitDebits.find((d) => d.period === '2026-02');
  assert.equal(jan.amount, 2970); // 1500 * 1.98
  assert.equal(feb.amount, 6732); // 3400 * 1.98
  assert.equal(t.ginr.value, 198); // 100 missing * 1.98
  assert.equal(t.inTransitRisk, 'receiver'); // FOB shipping point
});

test('E2E: Model B contra held Pending until fully delivered, then clears', async () => {
  const store = newStore();
  const { portfolio } = await runPipeline(store, defaultSources(folderOpts));
  assert.equal(portfolio[0].contra.creditStatus, CreditNoteStatus.PENDING);
  assert.equal(portfolio[0].contra.pendingCredit, 98);

  // now deliver the rest -> credit clears
  const inv = parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice;
  const full = [...parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv'))),
    { invoiceNumber: inv.invoiceNumber, stockId: 'SKU-1001', storageId: 'WH-KE', qtyReceived: 100, receiptDatetime: '2026-02-20T00:00:00' }];
  const { contra, match } = analyzeInvoice(inv, full);
  assert.equal(match.fullyMatched, true);
  assert.equal(contra.creditStatus, CreditNoteStatus.CLEARED);
  assert.equal(contra.pendingCredit, 0);
  assert.equal(contra.recognizedContra, 100); // full 5000 * 1%
});

test('E2E: Model A values the same 100-unit gap at net line price', () => {
  const inv = parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice;
  const modelA = { ...inv, contraCogsModel: 'A', lines: inv.lines.map((l) => ({ ...l, unitPriceNet: 1.98 })) };
  const receipts = parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')));
  const { gaps, contra } = analyzeInvoice(modelA, receipts);
  assert.equal(gaps[0].valueAtRisk, 198);
  assert.equal(contra.creditStatus, null); // Model A: no pending credit
  assert.equal(contra.pendingCredit, 0);
});

test('E2E: governance resolves the gap and closes it', async () => {
  const store = newStore();
  await runPipeline(store, defaultSources(folderOpts));
  const inv = store.get('invoices', 'INV-2026-0001');
  const gap = analyzeInvoice(inv, store.all('goodsReceipts')).gaps[0];
  registerGap(store, gap, { actor: 'analyst', owner: 'analyst' });
  assert.equal(openGaps(store).length, 1);
  resolveGap(store, gap.gapId, { option: 'StockTransfer', actor: 'analyst', note: 'redirected from WH-PO' });
  assert.equal(openGaps(store).length, 0);
  assert.ok(store.auditLog().length >= 1);
});
