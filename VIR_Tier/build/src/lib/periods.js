// Period bucketing + timing model.
// Rebate volume follows TRANSFER OF CONTROL (IFRS/GAAP): a unit counts in the
// period of actual receipt/shipment (its Control_Period), regardless of order or
// payment date. The EU VAT tax point (shipment OR upfront pre-payment) is a
// SEPARATE, optional attribute — never assumed, flagged when it diverges.
// See regnotes.js for the on-hover regulatory explanations. (Req 11)

import { Period } from './enums.js';

/** Parse an ISO-ish date string (YYYY-MM-DD or full ISO) into {y, m}. */
function ymOf(dateStr) {
  if (typeof dateStr !== 'string' || dateStr.length < 7) {
    throw new Error(`periods: invalid date "${dateStr}"`);
  }
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`periods: invalid date "${dateStr}"`);
  }
  return { y, m };
}

/**
 * Bucket a date into a period key for the chosen granularity.
 *   MONTH   -> "2026-03"
 *   QUARTER -> "2026-Q1"
 *   YEAR    -> "2026"
 */
export function periodKey(dateStr, period) {
  const { y, m } = ymOf(dateStr);
  switch (period) {
    case Period.MONTH: return `${y}-${String(m).padStart(2, '0')}`;
    case Period.QUARTER: return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case Period.YEAR: return `${y}`;
    default: throw new Error(`periods: unknown period "${period}"`);
  }
}

/**
 * Control_Period: the period a receipt qualifies in, derived from the actual
 * receipt date (transfer of control). This is what tier qualification uses.
 */
export function controlPeriod(receiptDate, period) {
  return periodKey(receiptDate, period);
}

/**
 * Given a Control_Period and an optional VAT tax point date, return timing
 * info. `vatTaxPointDate` may be null/undefined (unknown → not assumed).
 * Sets `divergence: true` when a known VAT tax point falls in a different
 * period than the Control_Period. (Req 11.5)
 */
export function timingInfo(receiptDate, period, vatTaxPointDate = null) {
  const control = controlPeriod(receiptDate, period);
  let vat = null;
  let divergence = false;
  if (vatTaxPointDate) {
    vat = periodKey(vatTaxPointDate, period);
    divergence = vat !== control;
  }
  return { controlPeriod: control, vatTaxPoint: vat, divergence };
}

/** Compare two period keys of the SAME granularity for ordering (‑1/0/1). */
export function comparePeriodKeys(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
