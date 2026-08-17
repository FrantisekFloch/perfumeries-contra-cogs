// Governance engine + audit trail. Manages gap ownership, resolution options,
// the closure document, the lost-forever "backdoor" (1-manager approval), and an
// append-only audit trail. All six resolution options stay available regardless
// of cause. A gap cannot close without a recorded resolution; Unresolvable
// requires a recorded manager approval (Property 9). Audit is append-only (Property 8).

import { RESOLUTION_OPTION_VALUES, InvoiceStatus, isEnumValue } from './enums.js';
import { createResolution, createAuditEntry } from './models.js';
import { computeContra } from './gap.js';
import { matchInvoice } from './matching.js';

export const GapStatus = Object.freeze({ OPEN: 'open', RESOLVED: 'resolved', UNRESOLVABLE: 'unresolvable' });

/** All resolution options, always available regardless of the gap's cause (Req 7.1, 7.2). */
export function availableResolutionOptions() {
  return [...RESOLUTION_OPTION_VALUES];
}

/** Persist a gap as open + owned, and audit it. */
export function registerGap(store, gap, { actor = 'system', owner = null } = {}) {
  const g = { ...gap, status: GapStatus.OPEN, owner: owner ?? gap.owner ?? null };
  store.put('gaps', g);
  store.appendAudit(createAuditEntry({ entityId: gap.gapId, actor, change: `gap opened (missing ${gap.missingQty})` }));
  return g;
}

/** Gaps still open (flagged/owned until resolved) — Req 8.1. */
export function openGaps(store) {
  return store.all('gaps').filter((g) => g.status === GapStatus.OPEN);
}

/**
 * Resolve a gap with a chosen option (records a Resolution first, then closes it).
 * Misroute handling is manual: pass option StockTransfer with a note; we record the
 * decision without injecting phantom receipts, so nothing is double counted (Req 7.4).
 */
export function resolveGap(store, gapId, { option, evidenceDocRef = null, actor = 'system', approver = null, note = null } = {}) {
  if (!isEnumValue(RESOLUTION_OPTION_VALUES, option)) {
    throw new Error(`Governance: unknown resolution option "${option}"`);
  }
  const gap = store.get('gaps', gapId);
  if (!gap) throw new Error(`Governance: gap "${gapId}" not found`);

  const resolution = createResolution({ gapId, option, evidenceDocRef, approver });
  store.put('resolutions', resolution);
  store.put('gaps', { ...gap, status: GapStatus.RESOLVED });
  store.appendAudit(createAuditEntry({
    entityId: gapId, actor,
    change: `resolved via ${option}${note ? `: ${note}` : ''}`,
    evidenceRef: evidenceDocRef,
  }));
  return resolution;
}

/**
 * Backdoor: mark a lost-forever item Unresolvable. REQUIRES a manager approver
 * before the terminal state (Req 8.4 / Property 9). Records a resolution + audit.
 */
export function applyBackdoor(store, gapId, { actor = 'system', approver = null, option = 'WriteOff', note = null } = {}) {
  if (!approver) throw new Error('Governance: backdoor requires 1-manager approval (approver required)');
  if (!isEnumValue(RESOLUTION_OPTION_VALUES, option)) {
    throw new Error(`Governance: unknown resolution option "${option}"`);
  }
  const gap = store.get('gaps', gapId);
  if (!gap) throw new Error(`Governance: gap "${gapId}" not found`);

  const resolution = createResolution({ gapId, option, approver, evidenceDocRef: note });
  store.put('resolutions', resolution);
  store.put('gaps', { ...gap, status: GapStatus.UNRESOLVABLE });
  store.appendAudit(createAuditEntry({
    entityId: gapId, actor,
    change: `backdoor: marked Unresolvable via ${option} (approved by ${approver})`,
  }));
  return resolution;
}

/** Record a decision + next steps for an open item (Req 8.3). */
export function recordDecision(store, entityId, { decision, nextSteps = null, actor = 'system' } = {}) {
  store.appendAudit(createAuditEntry({
    entityId, actor,
    change: `decision: ${decision}${nextSteps ? `; next: ${nextSteps}` : ''}`,
  }));
  return store.auditLog().at(-1);
}

/**
 * Generate a closure document — only when the invoice is fully matched AND paid.
 * (Lifecycle sets status Paid only after Fully Matched, so Paid implies matched.) Req 8.2.
 */
export function generateClosureDocument(store, invoiceNumber, { actor = 'system' } = {}) {
  const inv = store.get('invoices', invoiceNumber);
  if (!inv) throw new Error(`Governance: invoice "${invoiceNumber}" not found`);
  if (inv.status !== InvoiceStatus.PAID) {
    throw new Error('Governance: closure document only for fully matched & Paid invoices');
  }
  const doc = {
    type: 'closure',
    invoiceNumber,
    distributorId: inv.distributorId,
    totalValueStandard: inv.totalValueStandard,
    generatedAt: new Date().toISOString(),
  };
  store.appendAudit(createAuditEntry({ entityId: invoiceNumber, actor, change: 'closure document generated' }));
  return doc;
}

/** Align recognized contra COGS to verified received quantity (Req 7.5). */
export function alignRecognizedContra(invoice, goodsReceipts) {
  return computeContra(invoice, matchInvoice(invoice, goodsReceipts));
}
