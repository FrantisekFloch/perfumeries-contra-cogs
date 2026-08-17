import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StateStore, createMemoryBackend, COLLECTION_NAMES } from '../src/lib/store.js';

const newStore = () => new StateStore(createMemoryBackend(), 'test');

test('keyed collection upserts by id and lists values', () => {
  const s = newStore();
  s.put('invoices', { invoiceNumber: 'INV-1', status: 'Received' });
  s.put('invoices', { invoiceNumber: 'INV-2', status: 'Received' });
  s.put('invoices', { invoiceNumber: 'INV-1', status: 'Paid' }); // upsert
  assert.equal(s.all('invoices').length, 2);
  assert.equal(s.get('invoices', 'INV-1').status, 'Paid');
});

test('keyed put without a key throws', () => {
  const s = newStore();
  assert.throws(() => s.put('invoices', { status: 'x' }), /without a key/);
});

test('list collection appends and preserves order', () => {
  const s = newStore();
  s.put('goodsReceipts', { stockId: 'S', qtyReceived: 1000 });
  s.put('goodsReceipts', { stockId: 'S', qtyReceived: 900 });
  const all = s.all('goodsReceipts');
  assert.equal(all.length, 2);
  assert.equal(all[1].qtyReceived, 900);
});

test('accruals use composite invoiceNumber|period key', () => {
  const s = newStore();
  s.put('accruals', { invoiceNumber: 'INV-1', period: '2026-01', value: 200 });
  s.put('accruals', { invoiceNumber: 'INV-1', period: '2026-02', value: 300 });
  assert.equal(s.all('accruals').length, 2);
  assert.equal(s.get('accruals', 'INV-1|2026-02').value, 300);
});

test('remove deletes a keyed item', () => {
  const s = newStore();
  s.put('gaps', { gapId: 'G1', invoiceNumber: 'INV-1' });
  assert.equal(s.remove('gaps', 'G1'), true);
  assert.equal(s.remove('gaps', 'G1'), false);
  assert.equal(s.all('gaps').length, 0);
});

test('audit is append-only via appendAudit / auditLog', () => {
  const s = newStore();
  s.appendAudit({ entityId: 'INV-1', actor: 'a', change: 'created' });
  s.appendAudit({ entityId: 'INV-1', actor: 'a', change: 'paid' });
  assert.equal(s.auditLog().length, 2);
});

test('setInvoiceStatus updates in place; missing invoice throws', () => {
  const s = newStore();
  s.put('invoices', { invoiceNumber: 'INV-1', status: 'Received' });
  const updated = s.setInvoiceStatus('INV-1', 'Paid');
  assert.equal(updated.status, 'Paid');
  assert.equal(s.get('invoices', 'INV-1').status, 'Paid');
  assert.throws(() => s.setInvoiceStatus('NOPE', 'Paid'), /not found/);
});

test('persistence survives a new store over the same backend', () => {
  const backend = createMemoryBackend();
  const s1 = new StateStore(backend, 'test');
  s1.put('invoices', { invoiceNumber: 'INV-1', status: 'Received' });
  const s2 = new StateStore(backend, 'test');
  assert.equal(s2.get('invoices', 'INV-1').status, 'Received');
});

test('unknown collection throws; clearAll wipes everything', () => {
  const s = newStore();
  assert.throws(() => s.put('nope', {}), /unknown collection/);
  s.put('invoices', { invoiceNumber: 'INV-1' });
  s.clearAll();
  for (const c of COLLECTION_NAMES) assert.equal(s.all(c).length, 0);
});
