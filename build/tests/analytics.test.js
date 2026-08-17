import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildInvoiceView, buildPortfolio, storageView, accountingView, financeView } from '../src/lib/analytics.js';
import { Session, createMemoryKV, ROLES } from '../src/lib/session.js';
import { parseInvoiceXml, parseRecadvCsv, parseDeliveryNoteXml } from '../src/lib/parsers.js';
import { InvoiceStatus } from '../src/lib/enums.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');

const opts = { period: '2026-02', owner: 'a', asOf: '2026-02-06T00:00:00' };
const invoiceWith = (status) => ({ ...parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice, status });
const receipts = () => parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')));
const dn = () => [parseDeliveryNoteXml(read(inbox('delivery_notes', 'DN-2026-0001-01.xml')))];

test('buildInvoiceView enriches sample invoice', () => {
  const v = buildInvoiceView(invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED), receipts(), dn(), opts);
  assert.equal(v.missingQty, 100);
  assert.equal(v.valueAtRisk, 198);
  assert.equal(v.receivedQty, 4900);
  assert.equal(v.storages.length, 5);
  assert.equal(v.contra.recognizedContra, 98);
  assert.equal(v.timing.straddles, true);
});

test('storageView buckets pending delivery + aged pending + period trend', () => {
  const pf = buildPortfolio([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], receipts(), dn(), opts);
  const sv = storageView(pf);
  assert.equal(sv.pendingDelivery.length, 1);
  assert.equal(sv.agedPending.length, 1);
  assert.equal(sv.agedPending[0].value, 198);
  assert.equal(sv.trendByPeriod.length, 2); // Jan + Feb
});

test('storageView scopes by storageId', () => {
  const pf = buildPortfolio([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], receipts(), dn(), opts);
  assert.equal(storageView(pf, { storageId: 'WH-PO' }).count, 1); // touches WH-PO
  assert.equal(storageView(pf, { storageId: 'WH-UNKNOWN' }).count, 0);
});

test('accountingView splits closed vs open', () => {
  const pf = buildPortfolio([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], receipts(), dn(), opts);
  const av = accountingView(pf);
  assert.equal(av.open.length, 1);
  assert.equal(av.closed.length, 0);
  assert.equal(av.summary.openValueAtRisk, 198);

  const pf2 = buildPortfolio([invoiceWith(InvoiceStatus.PAID)], receipts(), dn(), opts);
  assert.equal(accountingView(pf2).closed.length, 1);
});

test('financeView totals + storages with issues', () => {
  const pf = buildPortfolio([invoiceWith(InvoiceStatus.PARTIALLY_RECEIVED)], receipts(), dn(), opts);
  const fv = financeView(pf);
  assert.equal(fv.totals.invoices, 1);
  assert.equal(fv.totals.openValueAtRisk, 198);
  assert.equal(fv.totals.totalPendingCredit, 98);
  assert.equal(fv.storagesWithIssues.length, 5);
  assert.equal(fv.storagesWithIssues[0].count, 1); // one open invoice per touched storage
});

test('session role: set/get/validate', () => {
  const s = new Session(createMemoryKV());
  assert.equal(s.isRoleSelected(), false);
  s.setRole('finance');
  assert.equal(s.getRole(), 'finance');
  assert.ok(s.isRoleSelected());
  assert.throws(() => s.setRole('ceo'), /invalid role/);
  assert.deepEqual(ROLES, ['storage', 'accounting', 'finance']);
});
