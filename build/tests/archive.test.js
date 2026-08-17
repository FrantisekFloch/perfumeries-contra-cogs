import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canArchive, buildArchiveRecord, archiveInvoice, exportArchive } from '../src/lib/archive.js';
import { StateStore, createMemoryBackend } from '../src/lib/store.js';
import { InvoiceStatus } from '../src/lib/enums.js';

const newStore = () => new StateStore(createMemoryBackend(), 'test');
const paidInvoice = () => ({ invoiceNumber: 'INV-1', distributorId: 'D1', totalValueStandard: 100, status: InvoiceStatus.PAID, lines: [] });

test('canArchive only for Paid', () => {
  assert.equal(canArchive({ status: InvoiceStatus.PAID }), true);
  assert.equal(canArchive({ status: InvoiceStatus.FULLY_MATCHED }), false);
  assert.equal(canArchive({ status: InvoiceStatus.PARTIALLY_RECEIVED }), false);
});

test('archiveInvoice moves Paid -> Archived, stores record, audits, calls hook', () => {
  const s = newStore();
  s.put('invoices', paidInvoice());
  let hookRecord = null;
  const record = archiveInvoice(s, 'INV-1', { actor: 'accounting', persistWrite: (r) => { hookRecord = r; } });
  assert.equal(s.get('invoices', 'INV-1').status, InvoiceStatus.ARCHIVED);
  assert.equal(record.status, InvoiceStatus.ARCHIVED);
  assert.equal(s.all('archive').length, 1);
  assert.equal(hookRecord.invoiceNumber, 'INV-1'); // cloud write hook invoked
  assert.equal(s.auditLog().at(-1).change, 'status Paid -> Archived');
});

test('archiveInvoice rejects non-Paid invoices and missing invoice', () => {
  const s = newStore();
  s.put('invoices', { ...paidInvoice(), status: InvoiceStatus.FULLY_MATCHED });
  assert.throws(() => archiveInvoice(s, 'INV-1'), /only fully matched & Paid/);
  assert.throws(() => archiveInvoice(s, 'NOPE'), /not found/);
});

test('buildArchiveRecord + exportArchive JSON', () => {
  const rec = buildArchiveRecord(paidInvoice());
  assert.equal(rec.invoiceNumber, 'INV-1');
  const parsed = JSON.parse(exportArchive(rec));
  assert.equal(parsed.status, InvoiceStatus.ARCHIVED);
});
