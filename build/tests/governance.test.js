import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  availableResolutionOptions, registerGap, openGaps, resolveGap, applyBackdoor,
  recordDecision, generateClosureDocument, alignRecognizedContra, GapStatus,
} from '../src/lib/governance.js';
import { StateStore, createMemoryBackend } from '../src/lib/store.js';
import { RESOLUTION_OPTION_VALUES, InvoiceStatus } from '../src/lib/enums.js';
import { parseInvoiceXml, parseRecadvCsv } from '../src/lib/parsers.js';
import { gapsForInvoice } from '../src/lib/gap.js';
import { matchInvoice } from '../src/lib/matching.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const inbox = (sub, file) => join(HERE, '..', 'data', 'inbox', sub, file);
const read = (p) => readFileSync(p, 'utf8');
const sampleInvoice = () => parseInvoiceXml(read(inbox('invoices', 'INV-2026-0001.xml'))).invoice;
const sampleReceipts = () => parseRecadvCsv(read(inbox('storage_reports', 'recadv_2026-01_02.csv')));
const newStore = () => new StateStore(createMemoryBackend(), 'test');

function seedGap(store) {
  const inv = sampleInvoice();
  const gap = gapsForInvoice(inv, matchInvoice(inv, sampleReceipts()))[0];
  return registerGap(store, gap, { actor: 'analyst', owner: 'analyst' });
}

test('all six resolution options are always available', () => {
  assert.deepEqual(availableResolutionOptions().sort(), [...RESOLUTION_OPTION_VALUES].sort());
  assert.equal(availableResolutionOptions().length, 6);
});

test('registerGap opens + owns the gap and audits it', () => {
  const s = newStore();
  const g = seedGap(s);
  assert.equal(g.status, GapStatus.OPEN);
  assert.equal(openGaps(s).length, 1);
  assert.equal(s.auditLog().length, 1);
});

// Property 9: gap cannot close without a recorded resolution
test('resolveGap records a resolution and closes the gap', () => {
  const s = newStore();
  const g = seedGap(s);
  const res = resolveGap(s, g.gapId, { option: 'StockTransfer', actor: 'analyst', note: 'moved to WH-KE' });
  assert.equal(res.option, 'StockTransfer');
  assert.equal(s.all('resolutions').length, 1);
  assert.equal(openGaps(s).length, 0);
  assert.equal(s.get('gaps', g.gapId).status, GapStatus.RESOLVED);
});

test('resolveGap rejects unknown option and missing gap', () => {
  const s = newStore();
  const g = seedGap(s);
  assert.throws(() => resolveGap(s, g.gapId, { option: 'Nope' }), /unknown resolution option/);
  assert.throws(() => resolveGap(s, 'no-such-gap', { option: 'WriteOff' }), /not found/);
});

// Property 9: Unresolvable requires manager approval
test('applyBackdoor requires an approver and marks Unresolvable', () => {
  const s = newStore();
  const g = seedGap(s);
  assert.throws(() => applyBackdoor(s, g.gapId, { actor: 'analyst' }), /requires 1-manager approval/);
  applyBackdoor(s, g.gapId, { actor: 'analyst', approver: 'manager1', option: 'WriteOff', note: 'lost in transit' });
  assert.equal(s.get('gaps', g.gapId).status, GapStatus.UNRESOLVABLE);
  assert.equal(s.all('resolutions')[0].approver, 'manager1');
});

test('recordDecision appends a decision + next steps to audit', () => {
  const s = newStore();
  const entry = recordDecision(s, 'INV-2026-0001', { decision: 'investigate WH-PO', nextSteps: 'call storage', actor: 'analyst' });
  assert.match(entry.change, /investigate WH-PO/);
  assert.match(entry.change, /next: call storage/);
});

test('generateClosureDocument only for Paid invoices', () => {
  const s = newStore();
  const inv = sampleInvoice();
  s.put('invoices', inv); // status Received
  assert.throws(() => generateClosureDocument(s, inv.invoiceNumber), /only for fully matched & Paid/);
  s.setInvoiceStatus(inv.invoiceNumber, InvoiceStatus.PAID);
  const doc = generateClosureDocument(s, inv.invoiceNumber, { actor: 'accounting' });
  assert.equal(doc.type, 'closure');
  assert.equal(doc.invoiceNumber, inv.invoiceNumber);
});

// Property 8: audit is append-only / immutable
test('audit trail is append-only; earlier entries are unchanged', () => {
  const s = newStore();
  const g = seedGap(s);
  const first = s.auditLog()[0];
  const snapshot = JSON.stringify(first);
  resolveGap(s, g.gapId, { option: 'DebitNote', actor: 'analyst' });
  assert.equal(s.auditLog().length, 2);
  assert.equal(JSON.stringify(s.auditLog()[0]), snapshot); // first entry untouched
});

// Req 7.5: aligning recognized contra to received qty
test('alignRecognizedContra recomputes contra on received volume', () => {
  const contra = alignRecognizedContra(sampleInvoice(), sampleReceipts());
  assert.equal(contra.recognizedContra, 98); // 4900 delivered * 1%
});
