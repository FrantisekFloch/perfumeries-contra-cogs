import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aggregateReceipts, lineFulfilment, matchInvoice, matchAll, receiptKey } from '../src/lib/matching.js';
import { FulfilmentStatus } from '../src/lib/enums.js';
import { parseInvoiceXml, parseRecadvCsv, parseDeliveryNoteXml } from '../src/lib/parsers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');

const sampleInvoice = () => parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice;
const sampleReceipts = () => parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')));
const sampleDN = () => parseDeliveryNoteXml(read(inbox('delivery_notes', 'DN-2026-0001-01.xml')));

// Property 1: conservative aggregation across storages, no double counting
test('aggregateReceipts sums per (invoice, stock) across storages', () => {
  const agg = aggregateReceipts(sampleReceipts());
  const a = agg.get(receiptKey('INV-2026-0001', 'SKU-1001'));
  assert.equal(a.totalReceived, 4900);
  assert.equal(Object.keys(a.byStorage).length, 5);
  assert.equal(a.count, 5);
  // sum of byStorage equals totalReceived
  assert.equal(Object.values(a.byStorage).reduce((s, v) => s + v, 0), 4900);
});

test('lineFulfilment classifies short / exact / over', () => {
  assert.equal(lineFulfilment(5000, 4900), FulfilmentStatus.SHORT);
  assert.equal(lineFulfilment(5000, 5000), FulfilmentStatus.FULLY_DELIVERED);
  assert.equal(lineFulfilment(5000, 5200), FulfilmentStatus.OVER);
});

test('matchInvoice: sample invoice is short by 100 and not fully matched', () => {
  const m = matchInvoice(sampleInvoice(), sampleReceipts(), [sampleDN()]);
  assert.equal(m.fullyMatched, false);
  assert.equal(m.anyShort, true);
  const line = m.lines[0];
  assert.equal(line.received, 4900);
  assert.equal(line.missingQty, 100);
  assert.equal(line.status, FulfilmentStatus.SHORT);
  assert.equal(Object.keys(line.byStorage).length, 5);
  // delivery note associates WH-CENTRAL as an expected storage
  assert.ok(line.expectedStorages.includes('WH-CENTRAL'));
});

test('matchInvoice: fully delivered when receipts equal invoiced', () => {
  const inv = sampleInvoice();
  const receipts = [
    { invoiceNumber: inv.invoiceNumber, stockId: 'SKU-1001', storageId: 'WH-A', qtyReceived: 5000, receiptDatetime: '2026-01-30T00:00:00' },
  ];
  const m = matchInvoice(inv, receipts);
  assert.equal(m.fullyMatched, true);
  assert.equal(m.lines[0].status, FulfilmentStatus.FULLY_DELIVERED);
});

test('matchInvoice: no receipts -> short by full quantity', () => {
  const m = matchInvoice(sampleInvoice(), []);
  assert.equal(m.lines[0].received, 0);
  assert.equal(m.lines[0].missingQty, 5000);
  assert.equal(m.fullyMatched, false);
});

test('matchInvoice: over-delivery detected', () => {
  const inv = sampleInvoice();
  const receipts = [
    { invoiceNumber: inv.invoiceNumber, stockId: 'SKU-1001', storageId: 'WH-A', qtyReceived: 5200, receiptDatetime: '2026-01-30T00:00:00' },
  ];
  const m = matchInvoice(inv, receipts);
  assert.equal(m.lines[0].status, FulfilmentStatus.OVER);
  assert.equal(m.lines[0].overQty, 200);
});

test('matchAll returns one result per invoice', () => {
  const results = matchAll([sampleInvoice()], sampleReceipts());
  assert.equal(results.length, 1);
  assert.equal(results[0].invoiceNumber, 'INV-2026-0001');
});
