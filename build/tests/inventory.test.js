import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  contraStatus, invoiceMonths, inventoryMonths, invoiceDetail, monthlyInventory, exportInventory,
  exportInvoicesCsv, exportDeliveryNotesCsv,
} from '../src/lib/inventory.js';
import { parseInvoiceXml, parseRecadvCsv, parseDeliveryNoteXml, parseCreditNoteXml } from '../src/lib/parsers.js';
import { InvoiceStatus } from '../src/lib/enums.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');

const invoiceWith = (status) => ({ ...parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml')), 'INV-2026-0001.xml').invoice, status });
const receipts = () => parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')), 'recadv.csv');
const dns = () => [parseDeliveryNoteXml(read(inbox('delivery_notes', 'DN-2026-0001-01.xml')), 'DN.xml')];
const cns = () => [parseCreditNoteXml(read(inbox('credit_notes', 'CN-2026-01-DIST-EU-01.xml')), 'CN.xml')];

const ctx = () => ({
  goodsReceipts: receipts(),
  deliveryNotes: dns(),
  creditNotes: cns(),
  auditLog: [{ entityId: 'INV-2026-0001', actor: 'sys', timestamp: 't', change: 'status Received -> PartiallyReceived' }],
});

test('inventoryMonths spans Jan (invoice date) and Feb (receipts)', () => {
  assert.deepEqual(inventoryMonths([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], receipts()), ['2026-01', '2026-02']);
});

test('invoiceMonths includes invoice date month and receipt months', () => {
  const m = invoiceMonths(invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED), receipts());
  assert.ok(m.includes('2026-01'));
  assert.ok(m.includes('2026-02'));
});

test('invoiceDetail: full audit detail with receipts by storage, notes, provenance', () => {
  const d = invoiceDetail(invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED), ctx());
  assert.equal(d.invoicedQty, 5000);
  assert.equal(d.receivedQty, 4900);
  assert.equal(d.missingQty, 100);
  assert.equal(d.contraStatus, 'Pending'); // Model B, not cleared
  assert.equal(d.recognizedContra, 98);
  assert.equal(d.receiptsByStorage.length, 5);
  const central = d.receiptsByStorage.find((r) => r.storageId === 'WH-CENTRAL');
  assert.equal(central.qty, 1000);
  assert.ok(central.receipts[0].datetime.startsWith('2026-01-30'));
  // Delivery notes are now folded into the per-storage rows (no separate section).
  assert.ok(central.deliverySource); // source XML shown as FYI on the storage row
  assert.equal(d.creditNotes.length, 1);
  assert.equal(d.creditNotes[0].status, 'Pending');
  assert.equal(d.provenance.invoiceSourceFile, 'INV-2026-0001.xml');
  assert.equal(d.audit.length, 1);
});

test('contraStatus: Model A shows Applied', () => {
  const inv = { ...invoiceWith(InvoiceStatus.FULLY_MATCHED), contraCogsModel: 'A' };
  // fully delivered so build a view via invoiceDetail using full receipts
  const full = [{ invoiceNumber: 'INV-2026-0001', stockId: 'SKU-1001', storageId: 'WH', qtyReceived: 5000, receiptDatetime: '2026-02-10T00:00:00' }];
  const d = invoiceDetail(inv, { goodsReceipts: full, deliveryNotes: [], creditNotes: [] });
  assert.equal(d.contraStatus, 'Applied');
});

test('monthlyInventory returns detail for invoices active in the month', () => {
  const list = monthlyInventory([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], ctx(), { month: '2026-02' });
  assert.equal(list.length, 1);
  assert.equal(list[0].invoiceNumber, 'INV-2026-0001');
  // not active in a month with no receipts/invoice
  assert.equal(monthlyInventory([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], ctx(), { month: '2026-05' }).length, 0);
});

test('exportInventory returns parseable JSON', () => {
  const list = monthlyInventory([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], ctx(), { month: '2026-01' });
  const json = exportInventory(list);
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].invoiceNumber, 'INV-2026-0001');
});

test('exportInvoicesCsv writes one row per invoice line with header', () => {
  const inv = invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED); // canonical has 1 line
  const csv = exportInvoicesCsv([inv]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'invoice_number,invoice_date,ship_date,type,distributor,contra_model,incoterms,status,sku,description,qty_invoiced,unit_price_standard,unit_price_net');
  assert.equal(lines.length, 1 + inv.lines.length);
  assert.ok(lines[1].startsWith('INV-2026-0001,'));
});

test('exportDeliveryNotesCsv writes one row per delivery-note line with header', () => {
  const dn = parseDeliveryNoteXml(read(inbox('delivery_notes', 'DN-2026-0001-01.xml')), 'DN.xml');
  const csv = exportDeliveryNotesCsv([dn]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'delivery_note_id,invoice_number,target_storage,ship_date,delivery_status,expected_date,sku,qty_shipped');
  assert.equal(lines.length, 1 + dn.lines.length);
});
