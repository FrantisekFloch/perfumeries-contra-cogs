import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContraCogsModel, InvoiceStatus, CreditNoteStatus,
  FULFILMENT_STATUS_VALUES, RESOLUTION_OPTION_VALUES, isEnumValue,
} from '../src/lib/enums.js';
import {
  createInvoice, createInvoiceLine, createDeliveryNote, createGoodsReceipt,
  createCreditNote, createGap, createGinrAccrual, createResolution, createAuditEntry,
} from '../src/lib/models.js';

// ---- enums ----
test('enum membership check works', () => {
  assert.ok(isEnumValue(FULFILMENT_STATUS_VALUES, 'Short'));
  assert.ok(!isEnumValue(FULFILMENT_STATUS_VALUES, 'Nope'));
  assert.ok(isEnumValue(RESOLUTION_OPTION_VALUES, 'WriteOff'));
});

// ---- invoice ----
test('createInvoice builds a valid frozen invoice with default status Received', () => {
  const inv = createInvoice({
    invoiceNumber: 'INV-1', distributorId: 'D1', contraCogsModel: ContraCogsModel.B,
    totalValueStandard: 10000,
    lines: [{ stockId: 'SKU-1', qtyInvoiced: 5000, unitPriceStandard: 2 }],
  });
  assert.equal(inv.invoiceNumber, 'INV-1');
  assert.equal(inv.status, InvoiceStatus.RECEIVED);
  assert.equal(inv.lines.length, 1);
  assert.ok(Object.isFrozen(inv));
  assert.throws(() => { inv.invoiceNumber = 'x'; }, TypeError);
});

test('createInvoice rejects missing required fields and bad model', () => {
  assert.throws(() => createInvoice({ distributorId: 'D1', contraCogsModel: 'B', totalValueStandard: 1, lines: [{ stockId: 's', qtyInvoiced: 1, unitPriceStandard: 1 }] }), /missing required field "invoiceNumber"/);
  assert.throws(() => createInvoice({ invoiceNumber: 'X', distributorId: 'D1', contraCogsModel: 'C', totalValueStandard: 1, lines: [{ stockId: 's', qtyInvoiced: 1, unitPriceStandard: 1 }] }), /must be one of A\|B/);
  assert.throws(() => createInvoice({ invoiceNumber: 'X', distributorId: 'D1', contraCogsModel: 'B', totalValueStandard: 1, lines: [] }), /at least one line/);
});

test('createInvoiceLine keeps unitPriceNet null when absent (Model B) and number when present (Model A)', () => {
  const b = createInvoiceLine({ stockId: 'S', qtyInvoiced: 10, unitPriceStandard: 2 });
  assert.equal(b.unitPriceNet, null);
  const a = createInvoiceLine({ stockId: 'S', qtyInvoiced: 10, unitPriceStandard: 2, unitPriceNet: 1.98 });
  assert.equal(a.unitPriceNet, 1.98);
});

// ---- delivery note ----
test('createDeliveryNote requires target storage code', () => {
  assert.throws(() => createDeliveryNote({ deliveryNoteId: 'DN1', lines: [] }), /missing required field "targetStorageId"/);
  const dn = createDeliveryNote({ deliveryNoteId: 'DN1', targetStorageId: 'WH-1', lines: [{ stockId: 'S', qtyShipped: 100 }] });
  assert.equal(dn.targetStorageId, 'WH-1');
  assert.equal(dn.lines[0].qtyShipped, 100);
});

// ---- goods receipt ----
test('createGoodsReceipt validates numeric qty and required keys', () => {
  const gr = createGoodsReceipt({ invoiceNumber: 'INV-1', stockId: 'S', storageId: 'WH-1', qtyReceived: 900, receiptDatetime: '2026-02-05T08:50:00' });
  assert.equal(gr.qtyReceived, 900);
  assert.throws(() => createGoodsReceipt({ invoiceNumber: 'INV-1', stockId: 'S', storageId: 'WH-1', qtyReceived: 'x', receiptDatetime: 't' }), /must be a number/);
});

// ---- credit note ----
test('createCreditNote defaults status Pending', () => {
  const cn = createCreditNote({ creditNoteId: 'CN1', distributorId: 'D1', period: '2026-01', basisQty: 1500, basisValue: 3000, amount: 30 });
  assert.equal(cn.status, CreditNoteStatus.PENDING);
});

// ---- derived models ----
test('createGap / accrual / resolution / audit build and validate', () => {
  const gap = createGap({ gapId: 'G1', invoiceNumber: 'INV-1', stockId: 'S', missingQty: 100, valueAtRisk: 200 });
  assert.equal(gap.missingQty, 100);
  const acc = createGinrAccrual({ invoiceNumber: 'INV-1', period: '2026-01', value: 200 });
  assert.equal(acc.flag, 'value missing — locate');
  const res = createResolution({ gapId: 'G1', option: 'WriteOff' });
  assert.equal(res.option, 'WriteOff');
  assert.ok(res.timestamp);
  assert.throws(() => createResolution({ gapId: 'G1', option: 'Nope' }), /must be one of/);
  const audit = createAuditEntry({ entityId: 'INV-1', actor: 'tester', change: 'created' });
  assert.equal(audit.actor, 'tester');
});
