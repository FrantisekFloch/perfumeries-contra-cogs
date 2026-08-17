import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseInvoiceXml, serializeInvoiceXml,
  parseDeliveryNoteXml, serializeDeliveryNoteXml,
  parseCreditNoteXml, serializeCreditNoteXml,
  parseRecadvCsv, serializeRecadvCsv,
} from '../src/lib/parsers.js';
import { parseCsv, serializeCsv } from '../src/lib/csv.js';
import { parseXml } from '../src/lib/xml.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');

// ---- CSV primitive ----
test('csv parser handles quoted fields, embedded commas and escaped quotes', () => {
  const { rows } = parseCsv('a,b\n"x,y","he said ""hi"""\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].a, 'x,y');
  assert.equal(rows[0].b, 'he said "hi"');
});

// ---- XML primitive error path (Req 3.7) ----
test('xml parser throws a descriptive error on mismatched tags', () => {
  assert.throws(() => parseXml('<a><b></a>'), /mismatched tag/);
});

// ---- Invoice ----
test('parseInvoiceXml parses the sample invoice with tiers and lines', () => {
  const { invoice, incomplete, missing } = parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml')), 'INV-2026-0001.xml');
  assert.equal(incomplete, false);
  assert.deepEqual(missing, []);
  assert.equal(invoice.invoiceNumber, 'INV-2026-0001');
  assert.equal(invoice.type, 'proforma');
  assert.equal(invoice.contraCogsModel, 'B');
  assert.equal(invoice.distributorId, 'DIST-EU-01');
  assert.equal(invoice.totalValueStandard, 10000);
  assert.equal(invoice.discountTiers.length, 3);
  assert.deepEqual(invoice.discountTiers[0], { minQty: 1, maxQty: 5000, pct: 1 });
  assert.equal(invoice.discountTiers[2].maxQty, null); // open-ended top tier
  assert.equal(invoice.lines[0].stockId, 'SKU-1001');
  assert.equal(invoice.lines[0].qtyInvoiced, 5000);
  assert.equal(invoice.lines[0].unitPriceNet, null); // Model B: no net price on line
  assert.equal(invoice.sourceFile, 'INV-2026-0001.xml');
});

test('parseInvoiceXml flags incomplete config when model/tiers missing (Req 2.6)', () => {
  const xml = `<invoice><header>
    <invoiceNumber>INV-X</invoiceNumber><distributor id="D1"/>
    <totalValueStandard>100</totalValueStandard></header>
    <lines><line><stockId>S</stockId><qtyInvoiced>1</qtyInvoiced><unitPriceStandard>1</unitPriceStandard></line></lines></invoice>`;
  const res = parseInvoiceXml(xml, 'INV-X.xml');
  assert.equal(res.incomplete, true);
  assert.equal(res.invoice, null); // model missing -> not built
  assert.ok(res.missing.includes('contraCogsModel'));
  assert.ok(res.missing.includes('discountTiers'));
});

test('parseInvoiceXml throws on wrong root element', () => {
  assert.throws(() => parseInvoiceXml('<notInvoice/>'), /not <invoice>/);
});

// ---- Delivery note / Credit note / RECADV from samples ----
test('parseDeliveryNoteXml reads target storage code', () => {
  const dn = parseDeliveryNoteXml(read(inbox('delivery_notes', 'DN-2026-0001-01.xml')), 'DN.xml');
  assert.equal(dn.deliveryNoteId, 'DN-2026-0001-01');
  assert.equal(dn.targetStorageId, 'WH-CENTRAL');
  assert.equal(dn.lines[0].qtyShipped, 1000);
});

test('parseCreditNoteXml reads Model B settlement, status Pending', () => {
  const cn = parseCreditNoteXml(read(inbox('credit_notes', 'CN-2026-01-DIST-EU-01.xml')), 'CN.xml');
  assert.equal(cn.creditNoteId, 'CN-2026-01-DIST-EU-01');
  assert.equal(cn.distributorId, 'DIST-EU-01');
  assert.equal(cn.status, 'Pending');
  assert.equal(cn.basisQty, 1500);
});

test('parseRecadvCsv reads all receipts totalling 4900 across 5 storages', () => {
  const receipts = parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')), 'recadv.csv');
  assert.equal(receipts.length, 5);
  const total = receipts.reduce((s, r) => s + r.qtyReceived, 0);
  assert.equal(total, 4900);
  const storages = new Set(receipts.map((r) => r.storageId));
  assert.equal(storages.size, 5);
});

// ---- Round-trip property (Req 3.8) ----
test('round-trip: invoice parse -> serialize -> parse yields equal model', () => {
  const a = parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice;
  const b = parseInvoiceXml(serializeInvoiceXml(a)).invoice;
  assert.deepEqual(b, a);
});

test('round-trip: delivery note', () => {
  const a = parseDeliveryNoteXml(read(inbox('delivery_notes', 'DN-2026-0001-01.xml')));
  const b = parseDeliveryNoteXml(serializeDeliveryNoteXml(a));
  assert.deepEqual(b, a);
});

test('round-trip: credit note', () => {
  const a = parseCreditNoteXml(read(inbox('credit_notes', 'CN-2026-01-DIST-EU-01.xml')));
  const b = parseCreditNoteXml(serializeCreditNoteXml(a));
  assert.deepEqual(b, a);
});

test('round-trip: RECADV csv', () => {
  const a = parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')));
  const b = parseRecadvCsv(serializeRecadvCsv(a));
  assert.deepEqual(b, a);
});
