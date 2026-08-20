// Currency + FX consolidation. (Req 4)
// - Amounts are {value, currency}; currencies are NEVER silently merged.
// - Units/Weight aggregate natively (no FX).
// - Value basis + pan-EU + mixed currencies REQUIRES FX consolidation to EUR;
//   the FX rate used is recorded (caller writes it to the audit trace).

import { Currency } from './enums.js';

/** Construct a money amount. */
export function money(value, currency) {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error('money: value must be a number');
  if (!Object.values(Currency).includes(currency)) throw new Error(`money: unknown currency "${currency}"`);
  return { value, currency };
}

/**
 * FX table shape: { base: 'EUR', rates: { EUR: 1, CZK: 0.0398, PLN: 0.233 }, asOf: '2026-01-01' }
 * rates are "1 unit of currency = X EUR" (i.e., multiply to get EUR).
 */
export function toEur(amount, fx) {
  if (!fx || fx.base !== 'EUR' || !fx.rates) throw new Error('money.toEur: FX table must be EUR-based with rates');
  const rate = fx.rates[amount.currency];
  if (typeof rate !== 'number') throw new Error(`money.toEur: no FX rate for ${amount.currency}`);
  return { value: round2(amount.value * rate), currency: Currency.EUR, fxRate: rate, fxAsOf: fx.asOf ?? null };
}

/** True when a set of currency codes contains more than one distinct value. */
export function isMixedCurrency(currencies) {
  return new Set(currencies).size > 1;
}

/**
 * Decide whether FX consolidation is required to aggregate by value.
 * Required only when basis is VALUE, scope is PAN_EU, and currencies are mixed.
 */
export function fxRequired({ basis, scope, currencies }) {
  return basis === 'VALUE' && scope === 'PAN_EU' && isMixedCurrency(currencies);
}

/**
 * Sum a list of {value, currency} amounts.
 * - If all share one currency, sum natively in that currency.
 * - Otherwise, require an FX table and consolidate to EUR (records rates used).
 * Returns { value, currency, converted: boolean, ratesUsed: {} }.
 */
export function sumAmounts(amounts, fx = null) {
  if (amounts.length === 0) return { value: 0, currency: Currency.EUR, converted: false, ratesUsed: {} };
  const currencies = amounts.map((a) => a.currency);
  if (!isMixedCurrency(currencies)) {
    const value = round2(amounts.reduce((s, a) => s + a.value, 0));
    return { value, currency: currencies[0], converted: false, ratesUsed: {} };
  }
  if (!fx) throw new Error('money.sumAmounts: mixed currencies require an FX table');
  const ratesUsed = {};
  let total = 0;
  for (const a of amounts) {
    const e = toEur(a, fx);
    ratesUsed[a.currency] = e.fxRate;
    total += e.value;
  }
  return { value: round2(total), currency: Currency.EUR, converted: true, ratesUsed };
}

export function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
