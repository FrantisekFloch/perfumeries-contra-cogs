// Domain enumerations for VIR_Tier. All values are string constants so they
// serialize cleanly to JSON/CSV/XML and read well in the UI and audit trail.

export const Country = Object.freeze({ SK: 'SK', PL: 'PL', CZ: 'CZ' });

// Regulatory currency per country (SK→EUR, CZ→CZK, PL→PLN).
export const CountryCurrency = Object.freeze({ SK: 'EUR', CZ: 'CZK', PL: 'PLN' });

export const Currency = Object.freeze({ EUR: 'EUR', CZK: 'CZK', PLN: 'PLN' });

export const RebateStructure = Object.freeze({
  RETROSPECTIVE_TIERED: 'RETROSPECTIVE_TIERED', // achieved rate applies to entire volume
  SLIDING_INCREMENTAL: 'SLIDING_INCREMENTAL',   // each band's rate applies to units in that band
  FLAT_PERCENTAGE: 'FLAT_PERCENTAGE',           // single rate on all qualifying volume
  PER_UNIT: 'PER_UNIT',                         // fixed amount per unit
});

export const Basis = Object.freeze({ UNITS: 'UNITS', VALUE: 'VALUE', WEIGHT: 'WEIGHT' });

export const Period = Object.freeze({ MONTH: 'MONTH', QUARTER: 'QUARTER', YEAR: 'YEAR' });

export const Scope = Object.freeze({ PER_COUNTRY: 'PER_COUNTRY', PAN_EU: 'PAN_EU' });

export const RetrospectiveReach = Object.freeze({
  WITHIN_PERIOD: 'WITHIN_PERIOD',
  PRIOR_PERIODS: 'PRIOR_PERIODS',
});

export const LeakageDriver = Object.freeze({
  RETURN_REJECTION: 'RETURN_REJECTION',
  OVERAGE_SHIPMENT: 'OVERAGE_SHIPMENT',
  BACKORDERING: 'BACKORDERING',
  LATE_SHIPMENT: 'LATE_SHIPMENT',
  PAN_EU_SPLIT: 'PAN_EU_SPLIT',
  // --- new, real-world CCOGS-loss situations ---
  EXPIRED_WINDOW_LATE_DELIVERY: 'EXPIRED_WINDOW_LATE_DELIVERY', // ordered in-window, unloaded after contract end; engine dropped it
  FOUND_LATER_PALLET: 'FOUND_LATER_PALLET',                     // short-scanned then a pallet is found later
  FORGOTTEN_SKU: 'FORGOTTEN_SKU',                               // contract SKU never configured in internal engine
  REROUTE_SKIPPED_SCAN: 'REROUTE_SKIPPED_SCAN',                 // goods rerouted to town WH; main-WH scan skipped
});

// How a tier threshold is measured against the contract's SKU set.
export const TierMeasure = Object.freeze({
  COMBINED: 'COMBINED',   // sum of all contract SKUs' volume vs threshold
  PER_SKU: 'PER_SKU',     // each SKU measured against the threshold on its own
});

// Contract validity window length (drives the sample + display; eligibility uses explicit dates).
export const WindowType = Object.freeze({
  MONTH: 'MONTH', QUARTER: 'QUARTER', HALF_YEAR: 'HALF_YEAR', YEAR: 'YEAR', CUSTOM: 'CUSTOM',
});

// Process-journey steps (invoice visual). Ordered.
export const JourneyStep = Object.freeze({
  INVOICE: 'INVOICE',
  ORDER: 'ORDER',
  FULFILLMENT: 'FULFILLMENT',
  TRUCK_DRIVING: 'TRUCK_DRIVING',
  TRUCK_WAITING: 'TRUCK_WAITING',          // truck in depot, not yet unloaded (no delivery note yet)
  UNLOADED_SCANNED: 'UNLOADED_SCANNED',    // unloaded + scanned to Main WH => delivery note created
  DISTRIBUTED_TOWN: 'DISTRIBUTED_TOWN',    // onward to town WH (WH-PO, WH-ZA...)
});
export const JOURNEY_ORDER = Object.freeze([
  'INVOICE', 'ORDER', 'FULFILLMENT', 'TRUCK_DRIVING', 'TRUCK_WAITING', 'UNLOADED_SCANNED', 'DISTRIBUTED_TOWN',
]);

export const ChargeStatus = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPORTED: 'EXPORTED',
  INJECTED: 'INJECTED',
});

// Warehouse node kind in the hierarchy.
export const WarehouseKind = Object.freeze({ MAIN: 'MAIN', TOWN: 'TOWN' });

export const Role = Object.freeze({
  ANALYST: 'ANALYST',
  FINANCE_APPROVER: 'FINANCE_APPROVER',
  FINANCE_OVERVIEW: 'FINANCE_OVERVIEW',
});

export const ScanStatus = Object.freeze({
  SCANNING: 'SCANNING',
  NO_UPDATES: 'NO_UPDATES',
  FOUND: 'FOUND',
  ERROR: 'ERROR',
});

/** Membership check helper used by validators. */
export function isMember(enumObj, value) {
  return Object.prototype.hasOwnProperty.call(enumObj, value) || Object.values(enumObj).includes(value);
}
