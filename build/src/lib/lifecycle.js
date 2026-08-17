// Invoice lifecycle state machine. Enforces valid status transitions and audits
// each change. Also derives the natural status from a match result so ingestion
// can auto-advance an invoice (Received -> In Transit / Partially Received / Fully Matched).

import { InvoiceStatus } from './enums.js';
import { createAuditEntry } from './models.js';

// Allowed transitions per the design state diagram.
export const TRANSITIONS = Object.freeze({
  [InvoiceStatus.RECEIVED]: [
    InvoiceStatus.IN_TRANSIT_PENDING, InvoiceStatus.PARTIALLY_RECEIVED,
    InvoiceStatus.FULLY_MATCHED, InvoiceStatus.UNDER_INVESTIGATION,
  ],
  [InvoiceStatus.IN_TRANSIT_PENDING]: [
    InvoiceStatus.PARTIALLY_RECEIVED, InvoiceStatus.FULLY_MATCHED, InvoiceStatus.UNDER_INVESTIGATION,
  ],
  [InvoiceStatus.PARTIALLY_RECEIVED]: [
    InvoiceStatus.FULLY_MATCHED, InvoiceStatus.UNDER_INVESTIGATION,
  ],
  [InvoiceStatus.FULLY_MATCHED]: [InvoiceStatus.PAID],
  [InvoiceStatus.PAID]: [InvoiceStatus.ARCHIVED],
  [InvoiceStatus.ARCHIVED]: [],
  [InvoiceStatus.UNDER_INVESTIGATION]: [InvoiceStatus.RESOLVED, InvoiceStatus.UNRESOLVABLE],
  [InvoiceStatus.RESOLVED]: [InvoiceStatus.FULLY_MATCHED, InvoiceStatus.PARTIALLY_RECEIVED],
  [InvoiceStatus.UNRESOLVABLE]: [],
});

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** Transition an invoice's status, validating and auditing. Throws on invalid transition. */
export function transition(store, invoiceNumber, to, { actor = 'system' } = {}) {
  const inv = store.get('invoices', invoiceNumber);
  if (!inv) throw new Error(`Lifecycle: invoice "${invoiceNumber}" not found`);
  const from = inv.status;
  if (from === to) return inv; // no-op
  if (!canTransition(from, to)) {
    throw new Error(`Lifecycle: invalid transition ${from} -> ${to} for ${invoiceNumber}`);
  }
  const updated = store.setInvoiceStatus(invoiceNumber, to);
  store.appendAudit(createAuditEntry({ entityId: invoiceNumber, actor, change: `status ${from} -> ${to}` }));
  return updated;
}

/** Natural status implied by a match result. */
export function deriveStatus(matchResult) {
  if (matchResult.fullyMatched) return InvoiceStatus.FULLY_MATCHED;
  const anyReceived = matchResult.lines.some((l) => l.received > 0);
  return anyReceived ? InvoiceStatus.PARTIALLY_RECEIVED : InvoiceStatus.IN_TRANSIT_PENDING;
}

/**
 * Advance an invoice to the status implied by its match result, if that transition
 * is valid from the current status. Returns the (possibly unchanged) status.
 */
export function applyMatchStatus(store, invoiceNumber, matchResult, { actor = 'system' } = {}) {
  const inv = store.get('invoices', invoiceNumber);
  if (!inv) throw new Error(`Lifecycle: invoice "${invoiceNumber}" not found`);
  const target = deriveStatus(matchResult);
  if (inv.status === target) return inv.status;
  if (canTransition(inv.status, target)) {
    transition(store, invoiceNumber, target, { actor });
    return target;
  }
  return inv.status; // leave as-is if not a valid auto-advance
}
