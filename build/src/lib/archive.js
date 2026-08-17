// Archival. A fully matched & Paid invoice is moved to the archive: status set to
// Archived and an archive record stored. In the static demo this is an in-app status
// change (+ optional JSON download). A cloud stage supplies a real file-write hook.

import { InvoiceStatus } from './enums.js';
import { transition } from './lifecycle.js';

export function canArchive(invoice) {
  return invoice.status === InvoiceStatus.PAID;
}

export function buildArchiveRecord(invoice) {
  return {
    invoiceNumber: invoice.invoiceNumber,
    distributorId: invoice.distributorId,
    status: InvoiceStatus.ARCHIVED,
    totalValueStandard: invoice.totalValueStandard,
    archivedAt: new Date().toISOString(),
    snapshot: invoice,
  };
}

/**
 * Archive a Paid invoice. Transitions Paid -> Archived (validated + audited by the
 * lifecycle), stores an archive record, and calls the optional persistWrite hook
 * (real file write at the cloud stage). Returns the archive record.
 */
export function archiveInvoice(store, invoiceNumber, { actor = 'system', persistWrite = null } = {}) {
  const inv = store.get('invoices', invoiceNumber);
  if (!inv) throw new Error(`Archive: invoice "${invoiceNumber}" not found`);
  if (inv.status !== InvoiceStatus.PAID) {
    throw new Error('Archive: only fully matched & Paid invoices can be archived');
  }
  transition(store, invoiceNumber, InvoiceStatus.ARCHIVED, { actor });
  const record = buildArchiveRecord(store.get('invoices', invoiceNumber));
  store.put('archive', record);
  if (typeof persistWrite === 'function') persistWrite(record); // cloud hook (no-op in demo)
  return record;
}

export function exportArchive(record) {
  return JSON.stringify(record, null, 2);
}
