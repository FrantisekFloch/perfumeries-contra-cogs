// Canonical enumerations for the reconciliation domain.
// Frozen objects; use the exported *_VALUES arrays for membership checks.

export const ContraCogsModel = Object.freeze({ A: 'A', B: 'B' });
export const CONTRA_COGS_MODEL_VALUES = Object.freeze(Object.values(ContraCogsModel));

export const FulfilmentStatus = Object.freeze({
  FULLY_DELIVERED: 'FullyDelivered',
  SHORT: 'Short',
  OVER: 'Over',
});
export const FULFILMENT_STATUS_VALUES = Object.freeze(Object.values(FulfilmentStatus));

export const InvoiceStatus = Object.freeze({
  RECEIVED: 'Received',
  IN_TRANSIT_PENDING: 'InTransitPending',
  PARTIALLY_RECEIVED: 'PartiallyReceived',
  FULLY_MATCHED: 'FullyMatched',
  PAID: 'Paid',
  ARCHIVED: 'Archived',
  UNDER_INVESTIGATION: 'UnderInvestigation',
  RESOLVED: 'Resolved',
  UNRESOLVABLE: 'Unresolvable',
});
export const INVOICE_STATUS_VALUES = Object.freeze(Object.values(InvoiceStatus));

export const ResolutionOption = Object.freeze({
  STOCK_TRANSFER: 'StockTransfer',
  DEBIT_NOTE: 'DebitNote',
  WRITE_OFF: 'WriteOff',
  SHRINKAGE: 'Shrinkage',
  ACCRUE_TRUE_UP: 'AccrueTrueUp',
  CONTRA_COGS_CORRECTION: 'ContraCogsCorrection',
});
export const RESOLUTION_OPTION_VALUES = Object.freeze(Object.values(ResolutionOption));

export const ScanStatus = Object.freeze({
  SCANNING: 'Scanning',
  NO_UPDATES: 'NoUpdates',
  FOUND: 'Found',
  ERROR: 'Error',
});
export const SCAN_STATUS_VALUES = Object.freeze(Object.values(ScanStatus));

export const CreditNoteStatus = Object.freeze({ PENDING: 'Pending', CLEARED: 'Cleared' });
export const CREDIT_NOTE_STATUS_VALUES = Object.freeze(Object.values(CreditNoteStatus));

// Per-delivery (per storage) logistics status. Optional on a delivery note; defaults
// to ON_TIME when not supplied. Drives the Inventory received-situation chips and the
// Finance issue indicators.
export const DeliveryStatus = Object.freeze({
  ON_TIME: 'OnTime',       // moving/received normally
  DELAYED: 'Delayed',      // on the way, but late (has expectedDate)
  REROUTED: 'Rerouted',    // sent to wrong storage, now re-routed to the correct one
  LOST: 'Lost',            // no signal — potential loss in transit, needs investigation
});
export const DELIVERY_STATUS_VALUES = Object.freeze(Object.values(DeliveryStatus));

/** True if `value` is a member of the given *_VALUES array. */
export function isEnumValue(values, value) {
  return values.includes(value);
}
