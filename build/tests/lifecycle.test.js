import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, transition, deriveStatus, applyMatchStatus, TRANSITIONS } from '../src/lib/lifecycle.js';
import { StateStore, createMemoryBackend } from '../src/lib/store.js';
import { InvoiceStatus } from '../src/lib/enums.js';

const newStore = () => new StateStore(createMemoryBackend(), 'test');
const seed = (s, status = InvoiceStatus.RECEIVED) => s.put('invoices', { invoiceNumber: 'INV-1', status });

test('canTransition matches the allowed graph', () => {
  assert.ok(canTransition(InvoiceStatus.RECEIVED, InvoiceStatus.PARTIALLY_RECEIVED));
  assert.ok(canTransition(InvoiceStatus.FULLY_MATCHED, InvoiceStatus.PAID));
  assert.ok(canTransition(InvoiceStatus.PAID, InvoiceStatus.ARCHIVED));
  assert.ok(!canTransition(InvoiceStatus.RECEIVED, InvoiceStatus.PAID));
  assert.ok(!canTransition(InvoiceStatus.ARCHIVED, InvoiceStatus.PAID));
});

test('transition updates status and audits; invalid throws', () => {
  const s = newStore();
  seed(s);
  transition(s, 'INV-1', InvoiceStatus.PARTIALLY_RECEIVED, { actor: 'a' });
  assert.equal(s.get('invoices', 'INV-1').status, InvoiceStatus.PARTIALLY_RECEIVED);
  assert.equal(s.auditLog().at(-1).change, 'status Received -> PartiallyReceived');
  assert.throws(() => transition(s, 'INV-1', InvoiceStatus.PAID), /invalid transition/);
});

test('full happy path Received -> ... -> Archived', () => {
  const s = newStore();
  seed(s);
  transition(s, 'INV-1', InvoiceStatus.PARTIALLY_RECEIVED);
  transition(s, 'INV-1', InvoiceStatus.FULLY_MATCHED);
  transition(s, 'INV-1', InvoiceStatus.PAID);
  transition(s, 'INV-1', InvoiceStatus.ARCHIVED);
  assert.equal(s.get('invoices', 'INV-1').status, InvoiceStatus.ARCHIVED);
});

test('investigation branch: -> UnderInvestigation -> Resolved / Unresolvable', () => {
  const s = newStore();
  seed(s, InvoiceStatus.PARTIALLY_RECEIVED);
  transition(s, 'INV-1', InvoiceStatus.UNDER_INVESTIGATION);
  assert.ok(canTransition(InvoiceStatus.UNDER_INVESTIGATION, InvoiceStatus.RESOLVED));
  transition(s, 'INV-1', InvoiceStatus.UNRESOLVABLE);
  assert.equal(s.get('invoices', 'INV-1').status, InvoiceStatus.UNRESOLVABLE);
  assert.deepEqual(TRANSITIONS[InvoiceStatus.UNRESOLVABLE], []); // terminal
});

test('deriveStatus from match results', () => {
  assert.equal(deriveStatus({ fullyMatched: true, lines: [{ received: 5000 }] }), InvoiceStatus.FULLY_MATCHED);
  assert.equal(deriveStatus({ fullyMatched: false, lines: [{ received: 4900 }] }), InvoiceStatus.PARTIALLY_RECEIVED);
  assert.equal(deriveStatus({ fullyMatched: false, lines: [{ received: 0 }] }), InvoiceStatus.IN_TRANSIT_PENDING);
});

test('applyMatchStatus auto-advances Received -> PartiallyReceived for the sample shortfall', () => {
  const s = newStore();
  seed(s);
  const status = applyMatchStatus(s, 'INV-1', { fullyMatched: false, lines: [{ received: 4900 }] }, { actor: 'sys' });
  assert.equal(status, InvoiceStatus.PARTIALLY_RECEIVED);
  assert.equal(s.get('invoices', 'INV-1').status, InvoiceStatus.PARTIALLY_RECEIVED);
});

test('applyMatchStatus leaves status unchanged when no valid auto-advance', () => {
  const s = newStore();
  seed(s, InvoiceStatus.PAID);
  const status = applyMatchStatus(s, 'INV-1', { fullyMatched: true, lines: [{ received: 5000 }] });
  assert.equal(status, InvoiceStatus.PAID); // Paid -> FullyMatched is not allowed; left as-is
});
