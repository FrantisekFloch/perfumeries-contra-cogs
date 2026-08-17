import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  resolveTier, headerDiscountTotal, allocateDiscount, gapsForInvoice, computeContra, analyzeInvoice,
} from '../src/lib/gap.js';
import { matchInvoice } from '../src/lib/matching.js';
import { parseInvoiceXml, parseRecadvCsv } from '../src/lib/parsers.js';
import { createInvoice } from '../src/lib/models.js';
import { CreditNoteStatus } from '../src/lib/enums.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');
const sampleInvoice = () => parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice;
const sampleReceipts = () => parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')));

const TIERS = [
  { minQty: 1, maxQty: 5000, pct: 1 },
  { minQty: 5001, maxQty: 10000, pct: 1.5 },
  { minQty: 10001, maxQty: null, pct: 2 },
];

test('resolveTier picks the right band incl. open-ended top tier', () => {
  assert.equal(resolveTier(TIERS, 5000), 1);
  assert.equal(resolveTier(TIERS, 5001), 1.5);
  assert.equal(resolveTier(TIERS, 12000), 2);
  assert.equal(resolveTier(TIERS, 0), null);
});

test('headerDiscountTotal uses tier from invoiced qty', () => {
  const inv = sampleInvoice(); // 5000 qty, 10000 value, tier 1%
  assert.equal(headerDiscountTotal(inv), 100);
});

// Property 5: allocated discount sums to header total
test('allocateDiscount splits by line value and sums to header total', () => {
  const inv = createInvoice({
    invoiceNumber: 'INV-2', distributorId: 'D', contraCogsModel: 'B', totalValueStandard: 1000,
    discountTiers: [{ minQty: 1, maxQty: null, pct: 10 }],
    lines: [
      { stockId: 'A', qtyInvoiced: 100, unitPriceStandard: 6 }, // 600
      { stockId: 'B', qtyInvoiced: 100, unitPriceStandard: 4 }, // 400
    ],
  });
  const allocs = allocateDiscount(inv); // total discount = 1000*10% = 100
  const sum = allocs.reduce((s, a) => s + a.allocated, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
  assert.ok(Math.abs(allocs[0].allocated - 60) < 1e-9);
  assert.ok(Math.abs(allocs[1].allocated - 40) < 1e-9);
});

test('gapsForInvoice: sample short-by-100 valued at net price (1.98 * 100 = 198)', () => {
  const inv = sampleInvoice();
  const match = matchInvoice(inv, sampleReceipts());
  const gaps = gapsForInvoice(inv, match);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].missingQty, 100);
  assert.equal(gaps[0].valueAtRisk, 198); // (2.00 - 0.02) * 100
  assert.equal(gaps[0].gapId, 'INV-2026-0001:SKU-1001');
});

// Property 4: tier from invoiced qty; contra amount from received qty (separate)
test('computeContra: tier stable while recognized contra follows delivered volume', () => {
  const inv = sampleInvoice();
  const partial = computeContra(inv, matchInvoice(inv, sampleReceipts())); // delivered 4900
  assert.equal(partial.tierPct, 1);
  assert.equal(partial.deliveredValue, 9800);
  assert.equal(partial.recognizedContra, 98); // 9800 * 1%
  // full delivery -> tier unchanged, recognized rises to full 100
  const full = computeContra(inv, matchInvoice(inv, [
    { invoiceNumber: inv.invoiceNumber, stockId: 'SKU-1001', storageId: 'WH', qtyReceived: 5000, receiptDatetime: '2026-02-10T00:00:00' },
  ]));
  assert.equal(full.tierPct, 1);
  assert.equal(full.recognizedContra, 100);
});

// Property 10: Model B credit pending until fully delivered
test('computeContra: Model B credit is Pending while short, Cleared when fully matched', () => {
  const inv = sampleInvoice(); // Model B
  const pending = computeContra(inv, matchInvoice(inv, sampleReceipts()));
  assert.equal(pending.creditStatus, CreditNoteStatus.PENDING);
  assert.equal(pending.pendingCredit, 98);
  const cleared = computeContra(inv, matchInvoice(inv, [
    { invoiceNumber: inv.invoiceNumber, stockId: 'SKU-1001', storageId: 'WH', qtyReceived: 5000, receiptDatetime: '2026-02-10T00:00:00' },
  ]));
  assert.equal(cleared.creditStatus, CreditNoteStatus.CLEARED);
  assert.equal(cleared.pendingCredit, 0);
});

test('analyzeInvoice bundles match + gaps + contra', () => {
  const r = analyzeInvoice(sampleInvoice(), sampleReceipts());
  assert.equal(r.match.fullyMatched, false);
  assert.equal(r.gaps.length, 1);
  assert.equal(r.contra.recognizedContra, 98);
});
