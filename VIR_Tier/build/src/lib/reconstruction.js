// Volume_Reconstruction_Engine (Req 2 & 11).
// Recomputes the TRUE qualifying volume for an agreement by:
//   1. building base volume from receipts (assigned to Control_Period),
//   2. applying the five leakage-driver corrections that restore suppressed volume,
//   3. guarding against double-counting the same physical units,
//   4. aggregating pan-EU (across SK/PL/CZ) or keeping per-country.
// Every correction is recorded so the audit trace can explain each unit restored.

import { Basis, Scope, LeakageDriver } from './enums.js';
import { controlPeriod, timingInfo } from './periods.js';

/** Weight one receipt's quantity into the chosen basis. */
function basisWeight(qty, basis, { unitValue = null, weightPerUnit = null } = {}) {
  if (basis === Basis.UNITS) return qty;
  if (basis === Basis.VALUE) {
    if (unitValue == null) throw new Error('reconstruction: VALUE basis needs unitValue');
    return qty * unitValue;
  }
  if (basis === Basis.WEIGHT) {
    if (weightPerUnit == null) throw new Error('reconstruction: WEIGHT basis needs weightPerUnit');
    return qty * weightPerUnit;
  }
  throw new Error(`reconstruction: unknown basis "${basis}"`);
}

/**
 * Reconstruct qualifying volume.
 *
 * @param {object} args
 *  - agreement: the Agreement (drives basis default, scope, period, countries)
 *  - purchases: Purchase[] (for value/weight lookups by stockId when receipts lack them)
 *  - receipts:  Receipt[]  (received truth; carry controlPeriod)
 *  - events:    LeakageEvent[] (the five drivers)
 *  - selections: { basis, period, scope } overrides (UI real-time), else agreement defaults
 * @returns {object} reconstruction result with per-scopeKey/per-period volumes + corrections[]
 */
export function reconstructVolume({ agreement, purchases = [], receipts = [], events = [], selections = {} }) {
  const basis = selections.basis ?? agreement.basis;
  const period = selections.period ?? agreement.period;
  const scope = selections.scope ?? agreement.scope;
  if (!basis || !period || !scope) throw new Error('reconstruction: basis/period/scope must be resolved');

  // index purchases by stockId for value/weight lookups
  const purchaseByStock = new Map();
  for (const p of purchases) if (!purchaseByStock.has(p.stockId)) purchaseByStock.set(p.stockId, p);

  const lookup = (stockId) => purchaseByStock.get(stockId) ?? {};

  // scopeKey: PAN_EU collapses all countries; PER_COUNTRY keeps the country code
  const scopeKeyOf = (country) => (scope === Scope.PAN_EU ? Scope.PAN_EU : country);

  // buckets keyed by `${scopeKey}||${periodKey}`
  const buckets = new Map();
  const corrections = [];
  const seen = new Set(); // de-dup guard on physical unit identity

  const bucket = (scopeKey, per) => {
    const k = `${scopeKey}||${per}`;
    if (!buckets.has(k)) buckets.set(k, { scopeKey, period: per, volume: 0, byCountry: {}, unitCount: 0 });
    return buckets.get(k);
  };

  const addVolume = (b, country, amount, units) => {
    b.volume += amount;
    b.unitCount += units;
    b.byCountry[country] = (b.byCountry[country] ?? 0) + amount;
  };

  // ---- 1) base volume from receipts (transfer of control) ----
  for (const r of receipts) {
    const identity = `${r.stockId}|${r.purchaseId ?? r.receiptId}|${r.receiptId}`;
    if (seen.has(identity)) continue; // de-dup (Req 2.8)
    seen.add(identity);

    const cp = controlPeriod(r.receiptDate, period);
    const ti = timingInfo(r.receiptDate, period, r.vatTaxPointDate);
    const info = lookup(r.stockId);
    const amount = basisWeight(r.qtyReceived, basis, { unitValue: info.unitValue, weightPerUnit: info.weightPerUnit });
    const b = bucket(scopeKeyOf(r.country), cp);
    addVolume(b, r.country, amount, r.qtyReceived);

    if (ti.divergence) {
      corrections.push({
        driver: 'VAT_DIVERGENCE', recordRefs: [r.receiptId], volumeDelta: 0,
        note: `VAT tax point ${ti.vatTaxPoint} differs from control period ${ti.controlPeriod}`,
        controlPeriod: ti.controlPeriod, vatTaxPoint: ti.vatTaxPoint,
      });
    }
  }

  // ---- 2) leakage-driver corrections ----
  for (const ev of events) {
    const info = lookup(ev.stockId ?? '');
    const dateForPeriod = pickEventPeriodDate(ev);
    const per = dateForPeriod ? controlPeriod(dateForPeriod, period) : anyPeriodKey(buckets) ;
    const scopeKey = scopeKeyOf(ev.country);
    const b = bucket(scopeKey, per);

    let delta = 0;
    let note = '';
    switch (ev.type) {
      case LeakageDriver.RETURN_REJECTION:
        // rejected return -> units stay purchased; add back to volume (Req 2.1)
        delta = safeWeight(ev.qty, basis, info);
        note = `Return rejected: ${ev.qty} units remain purchased volume`;
        break;
      case LeakageDriver.OVERAGE_SHIPMENT:
        // received & retained beyond ordered qty -> include (Req 2.2)
        delta = safeWeight(ev.qty, basis, info);
        note = `Overage retained: +${ev.qty} units included in volume`;
        break;
      case LeakageDriver.BACKORDERING:
        // units count in their CONTROL period (actual receipt); flag movement (Req 2.3)
        delta = safeWeight(ev.qty, basis, info);
        note = `Backorder received in control period ${per}${ev.intendedDate ? ` (intended ${ev.intendedDate})` : ''}`;
        break;
      case LeakageDriver.LATE_SHIPMENT:
        // same control-period rule; flag timing miss (Req 2.4)
        delta = safeWeight(ev.qty, basis, info);
        note = `Late shipment counted in control period ${per}${ev.intendedDate ? ` (intended ${ev.intendedDate})` : ''}`;
        break;
      case LeakageDriver.PAN_EU_SPLIT:
        // only meaningful when aggregating pan-EU; ensures the split unit contributes
        // to the combined base. When scope is PAN_EU this is already handled by the
        // scopeKey collapse, so we record it as informational (no double add).
        delta = scope === Scope.PAN_EU ? 0 : 0;
        note = scope === Scope.PAN_EU
          ? `Pan-EU split reconciled into combined ${Scope.PAN_EU} base`
          : `Pan-EU split present but scope is PER_COUNTRY (no cross-country aggregation)`;
        break;
      case LeakageDriver.EXPIRED_WINDOW_LATE_DELIVERY:
        // ordered in-window, unloaded after contract end — engine dropped it because
        // the delivery-note date was out of window. Entitlement follows the ORDER date.
        delta = safeWeight(ev.qty, basis, info);
        note = `Ordered in-window, delivered late: +${ev.qty} units restored (order date governs, not unload date${ev.intendedDate ? `; ordered ${ev.intendedDate}` : ''})`;
        break;
      case LeakageDriver.FOUND_LATER_PALLET:
        // short-scanned at receipt, pallet located later — same in-window order.
        delta = safeWeight(ev.qty, basis, info);
        note = `Found-later pallet: +${ev.qty} units located after initial short-scan`;
        break;
      case LeakageDriver.FORGOTTEN_SKU:
        // a contract SKU never configured in the internal engine — its whole volume missing.
        delta = safeWeight(ev.qty, basis, info);
        note = `Forgotten contract SKU${ev.stockId ? ` ${ev.stockId}` : ''}: +${ev.qty} units never counted by the internal engine`;
        break;
      case LeakageDriver.REROUTE_SKIPPED_SCAN:
        // goods loaded onto town-WH truck at the DC without the main-WH scan.
        delta = safeWeight(ev.qty, basis, info);
        note = `Reroute / skipped scan: +${ev.qty} units delivered to town WH without the main-WH unload scan`;
        break;
      case LeakageDriver.MISSING_INVOICE:
        // Goods physically received (delivery note + GRN exist) but the supplier
        // invoice never arrived — or was rejected by ERP as corrupt/incomplete — so
        // the internal CCOGS engine never processed it and claimed ZERO.
        //
        // The received units are ALREADY in the base volume via their GRN receipts,
        // so this correction must NOT add volume again (delta = 0) or we would
        // double-count. The recoverable True-Up arises purely because the engine
        // claimed nothing (claimed = 0) against that qualifying base. This entry is
        // an explanatory MARKER that flags the case for manual check and records the
        // reason the invoice is absent.
        delta = 0;
        note = `Goods received but no supplier invoice / no CCOGS generated — ${ev.qty} units delivered under the agreement yet never billed (manual check: ${ev.reason === 'ERP_REJECTED' ? 'invoice submitted but rejected by ERP as corrupt/incomplete' : 'invoice never arrived — may still arrive after agreement validity'})`;
        break;
      default:
        throw new Error(`reconstruction: unknown leakage driver "${ev.type}"`);
    }

    if (delta !== 0) addVolume(b, ev.country, delta, basis === Basis.UNITS ? ev.qty : ev.qty);
    corrections.push({
      driver: ev.type, recordRefs: [ev.eventId, ...(ev.refIds || [])], volumeDelta: delta,
      country: ev.country, scopeKey, period: per, note,
    });
  }

  // ---- 3) shape result ----
  const volumes = [...buckets.values()].map((b) => ({
    agreementId: agreement.agreementId,
    scopeKey: b.scopeKey,
    period: b.period,
    basis,
    qualifyingVolume: round(b.volume),
    unitCount: b.unitCount,
    byCountry: b.byCountry,
  }));

  return { agreementId: agreement.agreementId, basis, period, scope, volumes, corrections };
}

function safeWeight(qty, basis, info) {
  try { return qtyWeight(qty, basis, info); }
  catch { return basis === Basis.UNITS ? qty : 0; }
}
function qtyWeight(qty, basis, info) {
  if (basis === Basis.UNITS) return qty;
  if (basis === Basis.VALUE) { if (info.unitValue == null) throw new Error('no unitValue'); return qty * info.unitValue; }
  if (basis === Basis.WEIGHT) { if (info.weightPerUnit == null) throw new Error('no weightPerUnit'); return qty * info.weightPerUnit; }
  return qty;
}

function pickEventPeriodDate(ev) {
  // For backorder/late, the CONTROL date is the actual event/receipt date (post-slip).
  return ev.eventDate ?? ev.intendedDate ?? null;
}

function anyPeriodKey(buckets) {
  const first = buckets.values().next().value;
  return first ? first.period : 'UNSCHEDULED';
}

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
