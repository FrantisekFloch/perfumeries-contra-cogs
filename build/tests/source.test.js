import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createDatabaseSource, createApiSource, createFolderSource, SourceScanner, defaultSources,
} from '../src/lib/source.js';
import { ingestFiles, persistIngest } from '../src/lib/ingest.js';
import { StateStore, createMemoryBackend } from '../src/lib/store.js';
import { ScanStatus } from '../src/lib/enums.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data') + '/';
const diskRead = (p) => readFileSync(p, 'utf8');
const folderOpts = { baseUrl: DATA, readText: diskRead };

test('stub sources report no updates with no files', async () => {
  const db = await createDatabaseSource().scan();
  const api = await createApiSource().scan();
  assert.equal(db.status, ScanStatus.NO_UPDATES);
  assert.equal(api.status, ScanStatus.NO_UPDATES);
  assert.equal(db.files.length, 0);
});

test('folder source reads manifest and all inbox files with categories', async () => {
  const res = await createFolderSource(folderOpts).scan();
  assert.equal(res.status, ScanStatus.FOUND);
  assert.equal(res.files.length, 4);
  const byCat = res.files.reduce((m, f) => ((m[f.category] = (m[f.category] || 0) + 1), m), {});
  assert.deepEqual(byCat, { invoices: 1, delivery_notes: 1, storage_reports: 1, credit_notes: 1 });
});

test('scanner scans DB -> API -> Folder in order and emits statuses', async () => {
  const events = [];
  const scanner = new SourceScanner(defaultSources(folderOpts), {
    onStatus: (id, status) => events.push([id, status]),
  });
  const { results, files } = await scanner.scanAll();
  assert.deepEqual(results.map((r) => r.id), ['database', 'api', 'folder']);
  assert.equal(files.length, 4);
  // each source emits Scanning then a terminal status
  assert.deepEqual(events.filter(([, s]) => s === ScanStatus.SCANNING).map(([id]) => id), ['database', 'api', 'folder']);
  assert.equal(events.at(-1)[1], ScanStatus.FOUND); // folder terminal
});

test('scanner reports error for a failing source and continues', async () => {
  const boom = { id: 'boom', label: 'Boom', async scan() { throw new Error('kaboom'); } };
  const events = [];
  const scanner = new SourceScanner([boom, createDatabaseSource()], { onStatus: (id, s, m) => events.push([id, s, m]) });
  const { results } = await scanner.scanAll();
  assert.equal(results[0].status, ScanStatus.ERROR);
  assert.match(results[0].message, /kaboom/);
  assert.equal(results[1].status, ScanStatus.NO_UPDATES); // continued
});

test('ingestFiles routes files to the right parsers', async () => {
  const { files } = await new SourceScanner(defaultSources(folderOpts)).scanAll();
  const r = ingestFiles(files);
  assert.equal(r.invoices.length, 1);
  assert.equal(r.deliveryNotes.length, 1);
  assert.equal(r.creditNotes.length, 1);
  assert.equal(r.goodsReceipts.length, 5);
  assert.equal(r.goodsReceipts.reduce((s, g) => s + g.qtyReceived, 0), 4900);
  assert.equal(r.errors.length, 0);
  assert.equal(r.incomplete.length, 0);
});

test('ingestFiles captures per-file errors and continues (Req 3.7)', () => {
  const files = [
    { name: 'bad.xml', category: 'invoices', content: '<invoice><header></invoice>' }, // mismatched tag
    { name: 'ok.csv', category: 'storage_reports', content: 'invoice_number,stock_id,storage_id,qty_received,receipt_datetime,recadv_ref\nINV-1,S,WH-1,10,2026-01-01T00:00:00,R1\n' },
  ];
  const r = ingestFiles(files);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].file, 'bad.xml');
  assert.equal(r.goodsReceipts.length, 1); // the good file still ingested
});

test('ingestFiles flags incomplete invoices', () => {
  const files = [{
    name: 'inc.xml', category: 'invoices',
    content: '<invoice><header><invoiceNumber>INV-X</invoiceNumber><distributor id="D1"/><totalValueStandard>100</totalValueStandard></header><lines><line><stockId>S</stockId><qtyInvoiced>1</qtyInvoiced><unitPriceStandard>1</unitPriceStandard></line></lines></invoice>',
  }];
  const r = ingestFiles(files);
  assert.equal(r.invoices.length, 0);
  assert.equal(r.incomplete.length, 1);
  assert.ok(r.incomplete[0].missing.includes('contraCogsModel'));
});

test('persistIngest stores ingested records into a StateStore', async () => {
  const { files } = await new SourceScanner(defaultSources(folderOpts)).scanAll();
  const store = new StateStore(createMemoryBackend(), 'test');
  persistIngest(store, ingestFiles(files));
  assert.equal(store.all('invoices').length, 1);
  assert.equal(store.all('goodsReceipts').length, 5);
  assert.equal(store.all('creditNotes').length, 1);
  assert.equal(store.all('deliveryNotes').length, 1);
});
