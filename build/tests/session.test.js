import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, createMemoryKV } from '../src/lib/session.js';
import { ContraCogsModel } from '../src/lib/enums.js';

test('model not selected initially', () => {
  const s = new Session(createMemoryKV());
  assert.equal(s.isModelSelected(), false);
  assert.equal(s.getModel(), null);
});

test('setModel stores and getModel returns it', () => {
  const s = new Session(createMemoryKV());
  s.setModel(ContraCogsModel.B);
  assert.equal(s.getModel(), 'B');
  assert.ok(s.isModelSelected());
});

test('invalid model throws', () => {
  const s = new Session(createMemoryKV());
  assert.throws(() => s.setModel('C'), /invalid model/);
});

test('selection persists across Session instances over the same backend', () => {
  const kv = createMemoryKV();
  new Session(kv).setModel('A');
  assert.equal(new Session(kv).getModel(), 'A');
});

test('clear resets the selection', () => {
  const s = new Session(createMemoryKV());
  s.setModel('A');
  s.clear();
  assert.equal(s.isModelSelected(), false);
});
