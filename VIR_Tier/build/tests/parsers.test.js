import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAgreementXml, serializeAgreementXml,
  parseAgreementCsv, serializeAgreementCsv,
  parsePurchaseCsv, serializePurchaseCsv,
  parseReceiptCsv, serializeReceiptCsv,
  parseEventCsv, serializeEventCsv,
  parseClaimedCsv, serializeClaimedCsv,
  parseInvoiceXml, serializeInvoiceXml,
  parseDeliveryNoteXml, serializeDeliveryNoteXml,
  parseCcogsEngineCsv, serializeCcogsEngineCsv,
} from '../src/lib/parsers.js';
import { createInvoice, createDeliveryNote, createCcogsEngineOutput } from '../src/lib/models.js';
import { ingestFiles } from '../src/lib/ingest.js';
import { createAgreement, createPurchase, createReceipt, createLeakageEvent, createClaimedCcogs } from '../src/lib/models.js';
import { RebateStructure, Basis, Period, Scope, LeakageDriver } from '../src/lib/enums.js';

function sampleAgreement() {
  return createAgreement({
    agreementId: 'AGR-9', supplierId: 'SUP-9', supplierName: 'Test Supplier',
    rebateStructure: RebateStructure.RETROSPECTIVE_TIERED, basis: Basis.UNITS,
    period: Period.YEAR, scope: Scope.PAN_EU, currencies: ['EUR', 'PLN'], countries: ['SK', 'PL', 'CZ'],
    tiers: [{ threshold: 0, rate: 0.01 }, { threshold: 10000, rate: 0.02 }],
    clauseRefs: { tier: 'Clause 4.2' }, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
  });
}

test('agreement XML round-trips', () => {
  const a = sampleAgreement();
  const xml = serializeAgreementXml(a);
  const back = parseAgreementXml(xml, 'agreements/AGR-9.xml');
  assert.equal(back.agreementId, 'AGR-9');
  assert.equal(back.rebateStructure, RebateStructure.RETROSPECTIVE_TIERED);
  assert.deepEqual(back.currencies, ['EUR', 'PLN']);
  assert.deepEqual(back.countries, ['SK', 'PL', 'CZ']);
  assert.equal(back.tiers.length, 2);
  assert.equal(back.clauseRefs.tier, 'Clause 4.2');
  assert.equal(back.provenance, 'agreements/AGR-9.xml');
});

test('agreement XML wrong root throws', () => {
  assert.throws(() => parseAgreementXml('<nope></nope>'), /root must be <agreement>/);
});

test('agreement CSV round-trips (bulk import) incl. tiers/currencies/countries/clauses', () => {
  const a = sampleAgreement();
  const csv = serializeAgreementCsv([a]);
  const [back] = parseAgreementCsv(csv, 'agreements/bulk.csv');
  assert.equal(back.agreementId, 'AGR-9');
  assert.equal(back.rebateStructure, RebateStructure.RETROSPECTIVE_TIERED);
  assert.deepEqual(back.currencies, ['EUR', 'PLN']);
  assert.deepEqual(back.countries, ['SK', 'PL', 'CZ']);
  assert.equal(back.tiers.length, 2);
  assert.equal(back.tiers[1].threshold, 10000);
  assert.equal(back.tiers[1].rate, 0.02);
  assert.equal(back.clauseRefs.tier, 'Clause 4.2');
  assert.equal(back.provenance, 'agreements/bulk.csv');
});

test('ingest routes a .csv agreement file to the CSV parser', () => {
  const csv = serializeAgreementCsv([sampleAgreement()]);
  const out = ingestFiles([{ category: 'agreements', name: 'agreements/bulk.csv', text: csv }]);
  assert.equal(out.errors.length, 0);
  assert.equal(out.agreements.length, 1);
  assert.equal(out.agreements[0].agreementId, 'AGR-9');
});

test('purchase CSV round-trips', () => {
  const rows = [createPurchase({ purchaseId: 'P1', agreementId: 'A1', supplierId: 'S1', country: 'PL', stockId: 'SKU1', orderDate: '2026-01-02', qty: 500, unitValue: 12.5, weightPerUnit: 0.3, currency: 'PLN' })];
  const csv = serializePurchaseCsv(rows);
  const back = parsePurchaseCsv(csv, 'purchases/x.csv');
  assert.equal(back[0].qty, 500);
  assert.equal(back[0].unitValue, 12.5);
  assert.equal(back[0].currency, 'PLN');
  assert.equal(back[0].provenance, 'purchases/x.csv');
});

test('receipt CSV round-trips incl. optional vat tax point', () => {
  const rows = [
    createReceipt({ receiptId: 'R1', purchaseId: 'P1', agreementId: 'A1', country: 'SK', stockId: 'SKU1', qtyReceived: 100, receiptDate: '2026-02-01', vatTaxPointDate: '2026-01-20' }),
    createReceipt({ receiptId: 'R2', purchaseId: 'P2', agreementId: 'A1', country: 'SK', stockId: 'SKU1', qtyReceived: 50, receiptDate: '2026-02-05' }),
  ];
  const csv = serializeReceiptCsv(rows);
  const back = parseReceiptCsv(csv);
  assert.equal(back[0].vatTaxPointDate, '2026-01-20');
  assert.equal(back[1].vatTaxPointDate, null);
});

test('event CSV round-trips with pipe-joined refIds', () => {
  const rows = [createLeakageEvent({ eventId: 'E1', type: LeakageDriver.BACKORDERING, agreementId: 'A1', country: 'CZ', stockId: 'SKU1', qty: 300, refIds: ['P1', 'P2'], eventDate: '2026-02-08', intendedDate: '2026-01-28' })];
  const csv = serializeEventCsv(rows);
  const back = parseEventCsv(csv);
  assert.deepEqual(back[0].refIds, ['P1', 'P2']);
  assert.equal(back[0].type, LeakageDriver.BACKORDERING);
  assert.equal(back[0].intendedDate, '2026-01-28');
});

test('claimed CSV round-trips', () => {
  const rows = [createClaimedCcogs({ claimId: 'CL1', agreementId: 'A1', supplierId: 'S1', scopeKey: 'PAN_EU', period: '2026', basis: 'UNITS', amountClaimed: 1000, currency: 'EUR' })];
  const csv = serializeClaimedCsv(rows);
  const back = parseClaimedCsv(csv);
  assert.equal(back[0].amountClaimed, 1000);
  assert.equal(back[0].scopeKey, 'PAN_EU');
});

test('invoice XML round-trips (old-tool shape, new values)', () => {
  const inv = createInvoice({
    invoiceNumber: 'INV-9', type: 'final', agreementId: 'A1', supplierId: 'SUP-9', supplierName: 'Velvet & Co.',
    country: 'PL', poReference: 'PO-1', invoiceDate: '2026-03-12', shipDate: '2026-03-08',
    incoterms: 'FOB_SHIPPING_POINT', currency: 'PLN',
    discountTiers: [{ minQty: 1, maxQty: 5000, pct: 1.0 }, { minQty: 5001, maxQty: '', pct: 2.0 }],
    totalValue: 12345.6,
    lines: [{ stockId: 'EDP-100', description: 'Eau de Parfum 100ml', qtyInvoiced: 500, unitPrice: 24.69, targetStorage: 'WH-PL-01' }],
  });
  const back = parseInvoiceXml(serializeInvoiceXml(inv), 'invoices/INV-9.xml');
  assert.equal(back.invoiceNumber, 'INV-9');
  assert.equal(back.supplierName, 'Velvet & Co.');
  assert.equal(back.discountTiers.length, 2);
  assert.equal(back.discountTiers[1].maxQty, null); // open-ended top tier
  assert.equal(back.lines[0].qtyInvoiced, 500);
  assert.equal(back.lines[0].targetStorage, 'WH-PL-01');
  assert.equal(back.provenance, 'invoices/INV-9.xml');
});

test('invoice XML wrong root throws', () => {
  assert.throws(() => parseInvoiceXml('<nope/>'), /root must be <invoice>/);
});

test('delivery note XML round-trips with target storage + status', () => {
  const dn = createDeliveryNote({ deliveryNoteId: 'DN-9', invoiceNumber: 'INV-9', agreementId: 'A1', targetStorageId: 'WH-CZ-01', country: 'CZ', shipDate: '2026-03-08', deliveryStatus: 'Received', lines: [{ stockId: 'SRM-030', qtyShipped: 300 }] });
  const back = parseDeliveryNoteXml(serializeDeliveryNoteXml(dn));
  assert.equal(back.deliveryNoteId, 'DN-9');
  assert.equal(back.targetStorageId, 'WH-CZ-01');
  assert.equal(back.deliveryStatus, 'Received');
  assert.equal(back.lines[0].qtyShipped, 300);
});

test('ccogs engine output CSV round-trips with linkage refs + calc note', () => {
  const eng = createCcogsEngineOutput({ outputId: 'ENG-9', agreementId: 'A1', supplierId: 'S1', scopeKey: 'PAN_EU', period: '2026', basis: 'UNITS', engineVolume: 8000, tierApplied: 'per-country', amountClaimed: 112, currency: 'EUR', documentType: 'CCOGS_DEBIT_NOTE', invoiceRefs: ['INV-1', 'INV-2'], deliveryNoteRefs: ['DN-1'], receiptRefs: ['RCP-1', 'RCP-2'], calcNote: 'summed per-country' });
  const back = parseCcogsEngineCsv(serializeCcogsEngineCsv([eng]));
  assert.deepEqual(back[0].invoiceRefs, ['INV-1', 'INV-2']);
  assert.deepEqual(back[0].receiptRefs, ['RCP-1', 'RCP-2']);
  assert.equal(back[0].calcNote, 'summed per-country');
});

test('ingestFiles routes categories and collects per-file errors (continues)', () => {
  const files = [
    { category: 'agreements', name: 'ok.xml', text: serializeAgreementXml(sampleAgreement()) },
    { category: 'agreements', name: 'bad.xml', text: '<not-an-agreement/>' },
    { category: 'receipts', name: 'r.csv', text: serializeReceiptCsv([createReceipt({ receiptId: 'R1', agreementId: 'A1', country: 'SK', stockId: 'S1', qtyReceived: 10, receiptDate: '2026-01-01' })]) },
    { category: 'weird', name: 'w.csv', text: 'x' },
  ];
  const out = ingestFiles(files);
  assert.equal(out.agreements.length, 1);
  assert.equal(out.receipts.length, 1);
  assert.equal(out.errors.length, 2); // bad.xml + unknown category
  assert.ok(out.errors.some((e) => e.file === 'bad.xml'));
  assert.ok(out.errors.some((e) => e.file === 'w.csv'));
});
