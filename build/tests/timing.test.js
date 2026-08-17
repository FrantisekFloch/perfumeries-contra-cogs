import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  periodOf, periodsOf, straddles, splitDebits, ginrAccrual, inTransitRisk, analyzeTiming,
} from '../src/lib/timing.js';
import { matchInvoice } from '../src/lib/matching.js';
import { parseInvoiceXml, parseRecadvCsv } from '../src/lib/parsers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');
const sampleInvoice = () => parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice;
const sampleReceipts = () => parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')));

// Property 7: single period assignment
test('periodOf returns YYYY-MM from a datetime', () => {
  assert.equal(periodOf('2026-01-30T09:15:00'), '2026-01');
  assert.equal(periodOf('2026-02-05T08:50:00'), '2026-02');
  assert.equal(periodOf('bad'), null);
});

test('sample receipts straddle Jan and Feb', () => {
  const r = sampleReceipts();
  assert.deepEqual(periodsOf(r), ['2026-01', '2026-02']);
  assert.equal(straddles(r), true);
});

test('splitDebits: Jan 1500u and Feb 3400u valued at net 1.98', () => {
  const debits = splitDebits(sampleInvoice(), sampleReceipts());
  assert.equal(debits.length, 2);
  const jan = debits.find((d) => d.period === '2026-01');
  const feb = debits.find((d) => d.period === '2026-02');
  assert.equal(jan.amount, Number((1500 * 1.98).toFixed(2))); // 2970
  assert.equal(feb.amount, Number((3400 * 1.98).toFixed(2))); // 6732
  assert.equal(jan.amount + feb.amount, Number((4900 * 1.98).toFixed(2))); // 9702
});

// Property 3: liability preserved (not netted down); GINR carries the missing value
test('ginrAccrual: carries net value of missing 100 units, flagged, with age', () => {
  const inv = sampleInvoice();
  const match = matchInvoice(inv, sampleReceipts());
  const acc = ginrAccrual(inv, match, { period: '2026-01', owner: 'analyst1', asOf: '2026-02-01T00:00:00' });
  assert.equal(acc.value, 198); // 100 * 1.98
  assert.equal(acc.flag, 'value missing — locate');
  assert.equal(acc.owner, 'analyst1');
  assert.ok(acc.ageDays >= 4); // invoiceDate 2026-01-28 -> 2026-02-01
});

test('ginrAccrual returns null when fully matched', () => {
  const inv = sampleInvoice();
  const full = matchInvoice(inv, [
    { invoiceNumber: inv.invoiceNumber, stockId: 'SKU-1001', storageId: 'WH', qtyReceived: 5000, receiptDatetime: '2026-02-10T00:00:00' },
  ]);
  assert.equal(ginrAccrual(inv, full), null);
});

test('inTransitRisk: FOB shipping point -> receiver', () => {
  assert.equal(inTransitRisk(sampleInvoice()), 'receiver'); // sample uses FOB_SHIPPING_POINT
  assert.equal(inTransitRisk({ incoterms: 'FOB_DESTINATION' }), 'supplier');
});

test('analyzeTiming bundles periods, straddle, split debits, ginr, risk, retained liability', () => {
  const inv = sampleInvoice();
  const t = analyzeTiming(inv, sampleReceipts(), matchInvoice(inv, sampleReceipts()), { period: '2026-02', owner: 'a', asOf: '2026-02-06T00:00:00' });
  assert.deepEqual(t.periods, ['2026-01', '2026-02']);
  assert.equal(t.straddles, true);
  assert.equal(t.splitDebits.length, 2);
  assert.equal(t.ginr.value, 198);
  assert.equal(t.inTransitRisk, 'receiver');
  assert.equal(t.netPayableRetained, 9900); // 10000 - 100 discount, full liability retained
});
