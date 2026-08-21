// Sample data generator (Req: task 14, scaled ≥3x per user request).
// Produces realistic SK/PL/CZ perfume & cosmetics retail data that demonstrably
// reproduces, MANY TIMES OVER, each recovery scenario the engine must handle:
//   - pan-EU aggregation wins (three countries each short; combined crosses a tier)
//   - each of the five leakage drivers restoring volume
//   - retrospective PRIOR_PERIODS reopening
//   - mixed-currency (PLN+EUR / CZK+EUR) value-basis FX cases
//   - zero / negative variance controls (no charge)
//   - all four rebate structures; units/value/weight bases; month/quarter/year periods
//
// Deterministic (seeded) so runs are reproducible. Writes files into
// build/data/inbox/{agreements,purchases,receipts,events,claimed}/ and updates
// build/data/manifest.json + a bundled fx_rates.json.
//
// Run: node tools/generate_samples.js

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  serializeAgreementXml, serializePurchaseCsv, serializeReceiptCsv,
  serializeEventCsv, serializeClaimedCsv, serializeCcogsEngineCsv,
  serializeInvoiceXml, serializeDeliveryNoteXml,
} from '../src/lib/parsers.js';
import { RebateStructure, Basis, Period, Scope, RetrospectiveReach, LeakageDriver, CountryCurrency, TierMeasure, WindowType } from '../src/lib/enums.js';
import { townWarehousesFor } from '../src/lib/companies.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INBOX = join(ROOT, 'data', 'inbox');
const CATEGORIES = ['agreements', 'invoices', 'delivery_notes', 'purchases', 'receipts', 'events', 'claimed', 'ccogs_engine'];

// ---- deterministic RNG (mulberry32) --------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260819);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => Math.floor(lo + rand() * (hi - lo + 1));

// ---- domain vocabulary (realistic perfume/cosmetics) ---------------------
const SUPPLIERS = [
  { id: 'SUP-MAISON', name: 'Maison Aroma Distribution' },
  { id: 'SUP-LUMIERE', name: 'Lumière Cosmetics SA' },
  { id: 'SUP-VELVET', name: 'Velvet & Co. Fragrances' },
  { id: 'SUP-NORD', name: 'Nordica Beauty Group' },
  { id: 'SUP-ORIENT', name: 'Orient Essence Trading' },
  { id: 'SUP-BOTANI', name: 'Botanika Naturals' },
];
const SKUS = [
  { id: 'EDP-050', desc: 'Eau de Parfum 50ml', wpu: 0.28 },
  { id: 'EDP-100', desc: 'Eau de Parfum 100ml', wpu: 0.46 },
  { id: 'EDT-075', desc: 'Eau de Toilette 75ml', wpu: 0.35 },
  { id: 'SRM-030', desc: 'Serum 30ml', wpu: 0.14 },
  { id: 'CRM-050', desc: 'Face Cream 50ml', wpu: 0.19 },
  { id: 'LIP-004', desc: 'Lipstick 4g', wpu: 0.03 },
  { id: 'MSC-200', desc: 'Body Mist 200ml', wpu: 0.55 },
  { id: 'GFT-SET', desc: 'Gift Set', wpu: 0.9 },
];
const COUNTRIES = ['SK', 'PL', 'CZ'];
const INSPECTORS = ['J. Horák', 'M. Kowalski', 'P. Novák', 'A. Szabó', 'L. Marek', 'K. Dvořák'];
// split a quantity into n roughly-even positive parts (last part takes remainder)
function splitQty(total, n) {
  const parts = [];
  let left = total;
  for (let i = 0; i < n - 1; i++) { const p = Math.max(1, Math.round(total / n)); parts.push(p); left -= p; }
  parts.push(Math.max(1, left));
  return parts;
}
const STRUCTURES = Object.values(RebateStructure);
const BASES = Object.values(Basis);
const PERIODS = Object.values(Period);

// standard tier ladder used for tiered structures (percent rates)
const TIER_LADDERS = [
  [{ threshold: 0, rate: 0.01 }, { threshold: 5000, rate: 0.015 }, { threshold: 10000, rate: 0.02 }, { threshold: 20000, rate: 0.025 }],
  [{ threshold: 0, rate: 0.008 }, { threshold: 8000, rate: 0.014 }, { threshold: 16000, rate: 0.022 }],
  [{ threshold: 0, rate: 0.012 }, { threshold: 6000, rate: 0.02 }, { threshold: 12000, rate: 0.03 }],
];

const CLAUSES = {
  tier: 'Clause 4.2 — Volume incentive tiers (VIR) measured over the agreement period.',
  panEu: 'Clause 4.5 — Pan-EU aggregation: qualifying volume is combined across SK, PL and CZ.',
  retro: 'Clause 4.7 — Retrospective true-up: achieving a tier reprices prior qualifying periods.',
  control: 'Clause 6.1 — Volume recognised on transfer of control (goods received).',
};
const SIGNATORIES = ['Mgr. Jana Kučerová', 'Ing. Tomáš Blocal', 'Anna Wiśniewska', 'Dr. Martin Svoboda'];
const GOV_LAWS = ['Slovak Republic', 'Poland', 'Czech Republic'];
// map WindowType -> [from, to] within a base year
function windowDates(windowType, year) {
  switch (windowType) {
    case WindowType.MONTH: { const m = between(1, 9); const mm = String(m).padStart(2, '0'); const last = new Date(year, m, 0).getDate(); return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, '0')}`, mm]; }
    case WindowType.QUARTER: { const q = between(1, 3); const sm = (q - 1) * 3 + 1; const em = sm + 2; return [`${year}-${String(sm).padStart(2, '0')}-01`, `${year}-${String(em).padStart(2, '0')}-${String(new Date(year, em, 0).getDate()).padStart(2, '0')}`, String(sm).padStart(2, '0')]; }
    case WindowType.HALF_YEAR: { const h = between(0, 1); const sm = h ? 7 : 1; const em = h ? 12 : 6; return [`${year}-${String(sm).padStart(2, '0')}-01`, `${year}-${String(em).padStart(2, '0')}-${String(new Date(year, em, 0).getDate()).padStart(2, '0')}`, String(sm).padStart(2, '0')]; }
    default: return [`${year}-01-01`, `${year}-12-31`, '01'];
  }
}
// return "YYYY-MM" that is `n` months after the given ISO date's month
function monthAfter(isoDate, n) {
  const y = Number(isoDate.slice(0, 4)); const m = Number(isoDate.slice(5, 7));
  const total = (y * 12 + (m - 1)) + n; const ny = Math.floor(total / 12); const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
// pick 2-4 SKUs for the contract set
function pickSkuSet() {
  const n = between(2, 4);
  const pool = [...SKUS];
  const chosen = [];
  for (let i = 0; i < n && pool.length; i++) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return chosen;
}

// ---- helpers to build one "case" -----------------------------------------
let AG = 0, PU = 0, RC = 0, EV = 0, CL = 0, EN = 0, IN = 0, DN = 0;
const agId = () => `AGR-${String(++AG).padStart(3, '0')}`;
const puId = () => `PUR-${String(++PU).padStart(4, '0')}`;
const rcId = () => `RCP-${String(++RC).padStart(4, '0')}`;
const evId = () => `EVT-${String(++EV).padStart(4, '0')}`;
const clId = () => `CLM-${String(++CL).padStart(4, '0')}`;
const engId = () => `ENG-${String(++EN).padStart(4, '0')}`;
const invId = () => `INV-${String(++IN).padStart(4, '0')}`;
const dnId = () => `DN-${String(++DN).padStart(4, '0')}`;

// resolve tier rate for a volume (retrospective: highest threshold <= q)
function rateFor(tiers, q) {
  let r = 0;
  for (const t of tiers) { if (q >= t.threshold) r = t.rate; else break; }
  return r;
}
// entitled amount for a volume under a structure (mirrors rebate.js math)
function entitledFor(tiers, q, structure) {
  if (structure === RebateStructure.SLIDING_INCREMENTAL) {
    let sum = 0;
    for (let i = 0; i < tiers.length; i++) {
      const start = tiers[i].threshold;
      const end = i + 1 < tiers.length ? tiers[i + 1].threshold : Infinity;
      if (q <= start) break;
      sum += (Math.min(q, end) - start) * tiers[i].rate;
    }
    return sum;
  }
  if (structure === RebateStructure.FLAT_PERCENTAGE || structure === RebateStructure.PER_UNIT) {
    return q * (tiers[0] ? tiers[0].rate : 0);
  }
  return q * rateFor(tiers, q); // retrospective tiered
}

function unitValueFor(currency) {
  // rough per-unit purchase values by currency (realistic-ish)
  if (currency === 'EUR') return Number((8 + rand() * 20).toFixed(2));
  if (currency === 'CZK') return Number((200 + rand() * 500).toFixed(2));
  if (currency === 'PLN') return Number((35 + rand() * 90).toFixed(2));
  return 10;
}

// Build a fully-formed case (agreement + purchases + receipts + events + claimed)
function buildCase({ scenario, year, structure, basis, period, scope, countries, currencies }) {
  const supplier = pick(SUPPLIERS);
  const ladder = pick(TIER_LADDERS);
  const isTiered = structure === RebateStructure.RETROSPECTIVE_TIERED || structure === RebateStructure.SLIDING_INCREMENTAL;
  const tiers = isTiered ? ladder
    : structure === RebateStructure.FLAT_PERCENTAGE ? [{ threshold: 0, rate: pick([0.02, 0.025, 0.03]) }]
    : [{ threshold: 0, rate: pick([0.4, 0.5, 0.75]) }]; // PER_UNIT amount/unit

  const agreementId = agId();
  const retrospectiveReach = scenario === 'retro' ? RetrospectiveReach.PRIOR_PERIODS : RetrospectiveReach.WITHIN_PERIOD;
  const clauseRefs = { ...CLAUSES };

  // Contract SKU set (= ASINs). backorder/late/expired use a monthly window.
  const skuSetObjs = pickSkuSet();
  const skuSet = skuSetObjs.map((s) => s.id);
  // forgotten-SKU scenario: the internal engine was configured with a subset only.
  const engineConfiguredSkus = scenario === 'forgotten_sku' || scenario === 'both_causes' || scenario === 'tt_sku'
    ? skuSet.slice(0, Math.max(1, skuSet.length - 1))  // exactly ONE SKU missing for tt_sku
    : skuSet.slice();

  const windowType = (scenario === 'backorder' || scenario === 'late' || scenario === 'expired_late') ? WindowType.MONTH
    : (period === Period.QUARTER ? WindowType.QUARTER : period === Period.MONTH ? WindowType.MONTH : pick([WindowType.YEAR, WindowType.HALF_YEAR, WindowType.YEAR]));
  const [effFrom, effTo, winMonth] = windowDates(windowType, year);

  const agreement = {
    agreementId, contractRef: `CTR-${year}-${String(AG).padStart(4, '0')}`,
    supplierId: supplier.id, supplierName: supplier.name,
    rebateStructure: structure, basis, period, scope, retrospectiveReach,
    tierMeasure: skuSet.length > 1 ? (rand() < 0.8 ? TierMeasure.COMBINED : TierMeasure.PER_SKU) : TierMeasure.COMBINED,
    tiers, currencies, countries, skuSet, engineConfiguredSkus, windowType,
    effectiveFrom: effFrom, effectiveTo: effTo,
    signatory: pick(SIGNATORIES), signatoryTitle: 'Head of Procurement', signedDate: effFrom,
    governingLaw: pick(GOV_LAWS),
    clauseRefs,
  };

  const purchases = [];
  const receipts = [];
  const events = [];
  const claimed = [];
  const ccogsEngine = [];
  const invoices = [];
  const deliveryNotes = [];
  const invoiceRefs = [];
  const deliveryNoteRefs = [];
  const receiptRefs = [];
  const perCountryDelivery = [];

  const sku = pick(SKUS);
  const currencyOf = (c) => (currencies.length === 1 ? currencies[0] : CountryCurrency[c]);
  const storageOf = (c) => `WH-${c}-01`;
  // track the base (engine-visible) volume per country and unit value for the "before"
  const baseByCountry = {};
  let sampleUnitValue = null;

  // target base (engine-seen) volume.
  const topThreshold = tiers[tiers.length - 1].threshold || 10000;
  const tier1 = tiers[1] ? tiers[1].threshold : topThreshold; // first threshold above base tier
  // Tier-movement scenarios: base sits in the LOWEST tier so restored units lift it.
  const tierMove = ['both_causes', 'forgotten_sku', 'found_pallet', 'expired_late', 'reroute', 'tt_sku', 'tt_pallet'].includes(scenario);
  let perCountryBase;
  if (scenario === 'tt_sku' || scenario === 'tt_pallet') {
    // single-cause pan-EU headline: base just inside tier 1 so the one correction
    // (across 3 countries combined) lifts it one tier.
    perCountryBase = Math.max(200, Math.floor(tier1 * 0.85));
  } else if (tierMove) {
    // put the engine-seen base just inside tier 1 (below the 2nd threshold); the
    // restored units from the scenario events then push it to a higher tier.
    perCountryBase = Math.max(200, Math.floor(tier1 * 0.85));
  } else if (scope === Scope.PAN_EU || scenario === 'mixed_fx') {
    // pan-EU (incl. mixed_fx): each country short alone; combined crosses a tier,
    // and the found-later pallet adds a bit more headroom.
    perCountryBase = Math.floor((tier1 + between(200, 1200)) / countries.length);
  } else {
    perCountryBase = topThreshold + between(1000, 4000);
  }

  // reroute: goods go to a town WH, main-WH scan skipped (for this scenario).
  const isReroute = scenario === 'reroute';
  for (const country of countries) {
    const cur = currencyOf(country);
    const uv = unitValueFor(cur);
    const baseQty = perCountryBase + between(-400, 400);

    const pid = puId();
    // order/receipt dates within the contract window month (order date = eligibility anchor)
    const wm = Number(winMonth);
    const orderMonth = String(wm).padStart(2, '0');
    const orderDate = `${year}-${orderMonth}-${String(between(3, 20)).padStart(2, '0')}`;
    const po = `PO-${year}-${between(1000, 9999)}`;
    const storage = storageOf(country);
    const townWh = (townWarehousesFor(country)[0] || { code: `WH-${country}-TWN` }).code;
    // distribute the base quantity across the contract SKU set (combined-tier realism)
    const perSku = splitQty(baseQty, skuSetObjs.length);
    skuSetObjs.forEach((skuObj, si) => {
      purchases.push({ purchaseId: `${pid}-${si}`, agreementId, supplierId: supplier.id, country, stockId: skuObj.id, orderDate, qty: perSku[si], unitValue: uv, weightPerUnit: skuObj.wpu, currency: cur });
    });
    baseByCountry[country] = (baseByCountry[country] ?? 0) + baseQty;
    if (sampleUnitValue == null) sampleUnitValue = uv;

    // supplier invoice for this delivery (reuses old tool's XML shape; new values)
    const iid = invId();
    const tierXml = tiers.map((t, i) => ({ minQty: t.threshold + 1, maxQty: i + 1 < tiers.length ? tiers[i + 1].threshold : '', pct: Math.round(t.rate * 1000) / 10 }));
    invoices.push({
      invoiceNumber: iid, type: 'final', agreementId,
      supplierId: supplier.id, supplierName: supplier.name, country,
      poReference: po, invoiceDate: orderDate, shipDate: orderDate,
      incoterms: 'FOB_SHIPPING_POINT', currency: cur, discountTiers: tierXml, totalValue: round2(baseQty * uv),
      lines: skuSetObjs.map((skuObj, si) => ({ stockId: skuObj.id, description: skuObj.desc, qtyInvoiced: perSku[si], unitPrice: uv, targetStorage: isReroute ? townWh : storage })),
    });
    invoiceRefs.push(iid);

    // GOODS RECEIPTS: one receipt per contract SKU (matching the per-SKU purchase
    // split), so weight/value reconstruction lines up exactly with the engine base.
    // Reroute => receipts land at the TOWN WH with scannedAtMain=false (skipped scan).
    const grnIdsForCountry = [];
    // for expired-late: unload happens AFTER the contract window ends
    const lateReceiptBase = scenario === 'expired_late' ? monthAfter(effTo, between(1, 2)) : null;
    skuSetObjs.forEach((skuObj, k) => {
      const qtyPart = perSku[k];
      const rid = rcId();
      const grn = `GRN-${country}-${year}-${String(RC).padStart(4, '0')}`;
      const rejected = rand() < 0.15 ? between(1, Math.max(1, Math.round(qtyPart * 0.03))) : 0;
      const accepted = qtyPart - rejected;
      const day = 14 + k * 3;
      const receiptDate = lateReceiptBase ? `${lateReceiptBase}-${String(10 + k * 3).padStart(2, '0')}` : `${year}-${orderMonth}-${String(day).padStart(2, '0')}`;
      receipts.push({
        receiptId: rid, grnNumber: grn, poRef: po, invoiceRef: iid, purchaseId: `${pid}-${k}`,
        agreementId, country, storageId: isReroute ? townWh : storage,
        warehouseKind: isReroute ? 'TOWN' : 'MAIN',
        scannedAtMain: isReroute ? false : true,
        reachedStep: isReroute ? 'DISTRIBUTED_TOWN' : 'UNLOADED_SCANNED',
        stockId: skuObj.id,
        qtyOrdered: qtyPart, qtyReceived: qtyPart, qtyAccepted: accepted, qtyRejected: rejected,
        condition: rejected > 0 ? 'Partial' : 'Good', inspectedBy: pick(INSPECTORS),
        orderDate, receiptDate,
        vatTaxPointDate: (k === 0 && rand() < 0.3) ? `${year}-${orderMonth}-05` : null,
      });
      receiptRefs.push(rid);
      grnIdsForCountry.push(rid);
    });

    // remember per-country delivery facts so we can CONSOLIDATE delivery notes below
    perCountryDelivery.push({ country, storage: isReroute ? townWh : storage, iid, po, sku: skuSetObjs[0].id, qty: baseQty, shipDate: orderDate, grnIds: grnIdsForCountry });

    // scenario-specific leakage event(s) that RESTORE suppressed volume.
    const ev0 = skuSetObjs[0].id;
    const first = country === countries[0];
    if (scenario === 'return_rejection' && first) {
      events.push({ eventId: evId(), type: LeakageDriver.RETURN_REJECTION, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: between(150, 500), refIds: [pid], eventDate: `${year}-${orderMonth}-20` });
    }
    if (scenario === 'overage' && first) {
      events.push({ eventId: evId(), type: LeakageDriver.OVERAGE_SHIPMENT, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: between(100, 400), refIds: [pid], eventDate: `${year}-${orderMonth}-14` });
    }
    if (scenario === 'backorder' && first) {
      events.push({ eventId: evId(), type: LeakageDriver.BACKORDERING, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: between(200, 600), refIds: [pid], eventDate: monthAfter(orderDate, 1) + '-08', intendedDate: orderDate });
    }
    if (scenario === 'late' && first) {
      events.push({ eventId: evId(), type: LeakageDriver.LATE_SHIPMENT, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: between(150, 500), refIds: [pid], eventDate: monthAfter(orderDate, 1) + '-12', intendedDate: orderDate });
    }
    if (scenario === 'pan_eu' || scenario === 'mixed_fx') {
      events.push({ eventId: evId(), type: LeakageDriver.PAN_EU_SPLIT, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: baseQty, refIds: [pid], eventDate: `${year}-${orderMonth}-14` });
    }
    // mixed_fx also gets a found-later pallet so a positive True-Up exists to FX-convert
    if (scenario === 'mixed_fx' && first) {
      events.push({ eventId: evId(), type: LeakageDriver.FOUND_LATER_PALLET, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: between(400, 900), refIds: [pid], eventDate: monthAfter(orderDate, 1) + '-05', intendedDate: orderDate });
    }
    // --- new real-world CCOGS-loss situations ---
    if (scenario === 'found_pallet' && first) {
      const band = (tiers[1] ? tiers[1].threshold : 2000);
      events.push({ eventId: evId(), type: LeakageDriver.FOUND_LATER_PALLET, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: Math.round(band * 0.4) + between(0, 400), refIds: [pid], eventDate: monthAfter(orderDate, 1) + '-05', intendedDate: orderDate });
    }
    if ((scenario === 'forgotten_sku' || scenario === 'both_causes') && first) {
      // the forgotten SKU(s) — units the internal engine never counted. Sized to
      // reliably lift the combined volume across a tier threshold.
      const missing = skuSet.filter((s) => !engineConfiguredSkus.includes(s));
      const band = (tiers[1] && tiers[0]) ? (tiers[1].threshold) : 2000;
      for (const ms of missing) {
        events.push({ eventId: evId(), type: LeakageDriver.FORGOTTEN_SKU, agreementId, supplierId: supplier.id, country, stockId: ms, qty: Math.round(band * 0.5) + between(0, 400), refIds: [pid], eventDate: orderDate });
      }
    }
    if (scenario === 'both_causes' && first) {
      // second cause layered on: a found-later pallet — together push 1% -> 2%.
      const band = tiers[2] ? (tiers[2].threshold - tiers[1].threshold) : 3000;
      events.push({ eventId: evId(), type: LeakageDriver.FOUND_LATER_PALLET, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: Math.round(band * 0.7) + between(0, 400), refIds: [pid], eventDate: monthAfter(orderDate, 1) + '-06', intendedDate: orderDate });
    }
    if (scenario === 'expired_late' && first) {
      events.push({ eventId: evId(), type: LeakageDriver.EXPIRED_WINDOW_LATE_DELIVERY, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: between(300, 900), refIds: [pid], eventDate: monthAfter(effTo, 1) + '-10', intendedDate: orderDate });
    }
    // Single-cause pan-EU headline cases — exactly ONE correction each so the
    // finding stays compact (one row in the derivation table).
    // AGR-001 (tt_sku): a contract SKU missing from the internal engine.
    if (scenario === 'tt_sku' && first) {
      const band = (tiers[1] ? tiers[1].threshold : 4000);
      const missing = skuSet.filter((s) => !engineConfiguredSkus.includes(s));
      const ms = missing[0];
      if (ms) events.push({ eventId: evId(), type: LeakageDriver.FORGOTTEN_SKU, agreementId, supplierId: supplier.id, country, stockId: ms, qty: Math.round(band * 0.6) + between(0, 400), refIds: [pid], eventDate: orderDate });
    }
    // AGR-002 (tt_pallet): a pallet located after an initial short-scan.
    if (scenario === 'tt_pallet' && first) {
      const band = (tiers[1] ? tiers[1].threshold : 4000);
      events.push({ eventId: evId(), type: LeakageDriver.FOUND_LATER_PALLET, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: Math.round(band * 0.6) + between(0, 400), refIds: [pid], eventDate: monthAfter(orderDate, 1) + '-05', intendedDate: orderDate });
    }
    if (scenario === 'reroute' && first) {
      events.push({ eventId: evId(), type: LeakageDriver.REROUTE_SKIPPED_SCAN, agreementId, supplierId: supplier.id, country, stockId: ev0, qty: between(200, 700), refIds: [pid], eventDate: `${year}-${orderMonth}-16` });
    }
  }

  // CONSOLIDATED delivery notes (breaks the artificial 1:1):
  //  - Multi-country (pan-EU) shipments consolidate into ONE delivery note that
  //    covers several invoices/warehouses (a single consolidated dispatch).
  //  - Single-country cases get one delivery note per warehouse.
  // Goods receipts still out-number delivery notes (partial receipts above).
  if (perCountryDelivery.length > 1) {
    const did = dnId();
    const invoiceNumbers = [...new Set(perCountryDelivery.map((d) => d.iid))];
    deliveryNotes.push({
      deliveryNoteId: did, invoiceNumber: invoiceNumbers[0], invoiceRefs: invoiceNumbers,
      agreementId, targetStorageId: perCountryDelivery.map((d) => d.storage).join('+'),
      country: perCountryDelivery[0].country, shipDate: perCountryDelivery[0].shipDate, deliveryStatus: 'Received',
      lines: perCountryDelivery.map((d) => ({ stockId: d.sku, qtyShipped: d.qty, invoiceRef: d.iid, targetStorage: d.storage })),
    });
    deliveryNoteRefs.push(did);
  } else {
    for (const d of perCountryDelivery) {
      const did = dnId();
      deliveryNotes.push({
        deliveryNoteId: did, invoiceNumber: d.iid, invoiceRefs: [d.iid],
        agreementId, targetStorageId: d.storage, country: d.country,
        shipDate: d.shipDate, deliveryStatus: 'Received',
        lines: [{ stockId: d.sku, qtyShipped: d.qty, invoiceRef: d.iid, targetStorage: d.storage }],
      });
      deliveryNoteRefs.push(did);
    }
  }

  // claimed CCOGS: deliberately UNDER-claimed (computed on a lower/earlier tier
  // or per-country) so a positive recovery variance exists — except zero-variance controls.
  // ---- CCOGS Engine output (the "BEFORE": computed on INCOMPLETE data) ----
  // The engine sees only the base receipts (no leakage-driver units) and, for
  // per-country agreements or when it fails to aggregate pan-EU, lands on a
  // lower volume => lower tier => under-claim. The reconstruction later adds the
  // driver units and (for pan-EU) the combined volume => higher entitlement.
  const isClean = scenario === 'clean';
  const cur0 = currencies[0];
  // Convert a country's UNIT base into the agreement basis using the SAME per-SKU
  // weights/values the reconstruction will use (purchases carry qty + wpu + unitValue),
  // so the engine baseline never diverges from the reconstructed base volume.
  const purchByCountry = {};
  for (const p of purchases) { (purchByCountry[p.country] ||= []).push(p); }
  const countryBasisVolume = (cc) => {
    const ps = purchByCountry[cc] || [];
    if (basis === Basis.VALUE) return ps.reduce((s, p) => s + p.qty * (p.unitValue || 0), 0);
    if (basis === Basis.WEIGHT) return ps.reduce((s, p) => s + p.qty * (p.weightPerUnit || 0), 0);
    return ps.reduce((s, p) => s + p.qty, 0);
  };
  const volToBasis = (units, cc) => (cc != null ? countryBasisVolume(cc)
    : (basis === Basis.VALUE ? units * (sampleUnitValue ?? 10) : basis === Basis.WEIGHT ? units * (skuSetObjs[0]?.wpu ?? 0.3) : units));
  const claimBasisNote = basis;

  const links = { invoiceRefs, deliveryNoteRefs, receiptRefs };
  if (scenario === 'zero_variance' || isClean) {
    // engine already claimed the correct amount on the full combined volume -> no recovery
    const engV = countries.reduce((s, c) => s + countryBasisVolume(c), 0);
    const amt = round2(entitledFor(tiers, engV, structure));
    ccogsEngine.push({ outputId: engId(), agreementId, supplierId: supplier.id, scopeKey: scope === Scope.PAN_EU ? 'PAN_EU' : countries[0], period: `${year}`, basis: claimBasisNote, engineVolume: engV, tierApplied: String(rateFor(tiers, engV)), amountClaimed: amt, currency: cur0, documentType: 'CCOGS_INVOICE', ...links, calcNote: `${Math.round(engV)} ${basis.toLowerCase()} @ ${(rateFor(tiers, engV)*100).toFixed(2)}% = ${amt} ${cur0} (full combined volume; no leakage)` });
  } else if (scope === Scope.PAN_EU) {
    // engine claimed each country standalone at its (lower) tier, then summed —
    // missing the pan-EU aggregation uplift (and the driver units).
    let amt = 0;
    for (const c of countries) { const engV = countryBasisVolume(c); amt += entitledFor(tiers, engV, structure); }
    const totV = countries.reduce((s, c) => s + countryBasisVolume(c), 0);
    ccogsEngine.push({ outputId: engId(), agreementId, supplierId: supplier.id, scopeKey: 'PAN_EU', period: `${year}`, basis: claimBasisNote, engineVolume: totV, tierApplied: 'per-country', amountClaimed: round2(amt), currency: cur0, documentType: 'CCOGS_DEBIT_NOTE', ...links, calcNote: `Summed per-country tiers (NOT aggregated pan-EU): ${round2(amt)} ${cur0}. Missed the combined-volume tier + leakage-driver units.` });
  } else {
    // per-country: engine claimed on base volume only (missing driver units)
    const engV = countryBasisVolume(countries[0]);
    const amt = round2(entitledFor(tiers, engV, structure));
    ccogsEngine.push({ outputId: engId(), agreementId, supplierId: supplier.id, scopeKey: countries[0], period: `${year}`, basis: claimBasisNote, engineVolume: engV, tierApplied: String(rateFor(tiers, engV)), amountClaimed: amt, currency: cur0, documentType: 'CCOGS_INVOICE', ...links, calcNote: `${Math.round(engV)} ${basis.toLowerCase()} @ ${(rateFor(tiers, engV)*100).toFixed(2)}% = ${amt} ${cur0} (base receipts only; missing leakage-driver units)` });
  }

  return { agreement, invoices, deliveryNotes, purchases, receipts, events, claimed, ccogsEngine, meta: { scenario, structure, basis, period, scope, supplier: supplier.name } };
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// ---- scenario matrix (scaled ≥3x) ----------------------------------------
// Each scenario is generated multiple times across suppliers/structures/countries.
function buildAll() {
  const cases = [];
  // Volume reduced ~60% (was 48). One base year, 2 reps per scenario (16), plus a
  // 3rd rep for the three headline scenarios (pan_eu, mixed_fx, retro) => 19 cases.
  const scenarios = [
    // headline single-cause pan-EU cases (one clear correction each):
    //   tt_sku    -> AGR-001: a contract SKU missing from the engine
    //   tt_pallet -> AGR-002: a pallet located after an initial short-scan
    'tt_sku', 'tt_pallet', 'found_pallet', 'forgotten_sku', 'both_causes', 'expired_late', 'reroute',
    // original coverage
    'pan_eu', 'return_rejection', 'overage', 'backorder', 'late', 'retro', 'mixed_fx', 'zero_variance',
    // clean, fully-closed deliveries with NO issue found (padding realism so the
    // portfolio is not 100% problems — feeds the "Skipped — no issue" figure)
    'clean',
  ];
  // clean gets the most reps so most deliveries are healthy; a few headline
  // loss scenarios repeat so the suggestions list stays rich.
  const repCount = { clean: 7, tt_sku: 1, tt_pallet: 1, both_causes: 2, reroute: 2, expired_late: 2, pan_eu: 2 };
  const year = 2026;
  let rot = 0;
  for (const scenario of scenarios) {
    const reps = repCount[scenario] || 1;
    for (let rep = 0; rep < reps; rep++) {
      rot++;
      // scenarios whose whole point is a TIER MOVEMENT must use a tiered structure
      const tierMoveScenario = ['tt_sku', 'tt_pallet', 'both_causes', 'forgotten_sku', 'found_pallet', 'expired_late', 'reroute', 'pan_eu', 'mixed_fx'].includes(scenario);
      const structure = tierMoveScenario ? RebateStructure.RETROSPECTIVE_TIERED : STRUCTURES[rot % STRUCTURES.length];
      // mixed_fx: UNITS basis (avoids value-scale ambiguity) but mixed currencies
      // on a pan-EU deal so the recovered amount is FX-converted to EUR.
      const basis = tierMoveScenario ? Basis.UNITS : BASES[rot % BASES.length];
      const period = scenario === 'backorder' || scenario === 'late' ? Period.MONTH : PERIODS[rot % PERIODS.length];
      let scope, countries, currencies;
      if (scenario === 'pan_eu' || scenario === 'mixed_fx' || scenario === 'tt_sku' || scenario === 'tt_pallet') {
        scope = Scope.PAN_EU; countries = ['SK', 'PL', 'CZ'];
        currencies = scenario === 'mixed_fx' ? ['PLN', 'EUR'] : ['EUR'];
      } else if (scenario === 'clean') {
        // clean, fully-closed deliveries: keep them PER_COUNTRY standalone so the
        // engine's matched claim never diverges from the reconstruction.
        scope = Scope.PER_COUNTRY; countries = [pick(COUNTRIES)]; currencies = ['EUR'];
      } else {
        scope = rep === 0 ? Scope.PER_COUNTRY : Scope.PAN_EU;
        countries = rep === 0 ? [pick(COUNTRIES)] : ['SK', 'PL', 'CZ'];
        currencies = ['EUR'];
      }
      // give retro a prior-year sibling so PRIOR_PERIODS reopening has data
      const useYear = (scenario === 'retro' && rep === 2) ? year - 1 : year;
      cases.push(buildCase({ scenario, year: useYear, structure, basis, period, scope, countries, currencies }));
    }
  }
  return cases;
}

// ---- write out -----------------------------------------------------------
function resetInbox() {
  for (const c of CATEGORIES) {
    const dir = join(INBOX, c);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
}

function main() {
  resetInbox();
  const cases = buildAll();
  const manifest = { generatedAt: new Date().toISOString(), categories: {} };
  for (const c of CATEGORIES) manifest.categories[c] = [];

  for (const cse of cases) {
    const a = cse.agreement;
    // agreement: one XML per file
    const aName = `${a.agreementId}.xml`;
    writeFileSync(join(INBOX, 'agreements', aName), serializeAgreementXml(a));
    manifest.categories.agreements.push(aName);

    // per-agreement CSVs
    const base = a.agreementId;
    const files = [
      ['purchases', `${base}_purchases.csv`, serializePurchaseCsv(cse.purchases)],
      ['receipts', `${base}_receipts.csv`, serializeReceiptCsv(cse.receipts)],
      ['ccogs_engine', `${base}_ccogs_engine.csv`, serializeCcogsEngineCsv(cse.ccogsEngine)],
    ];
    // one XML file per invoice and per delivery note
    for (const inv of cse.invoices) { const nm = `${inv.invoiceNumber}.xml`; writeFileSync(join(INBOX, 'invoices', nm), serializeInvoiceXml(inv)); manifest.categories.invoices.push(nm); }
    for (const dn of cse.deliveryNotes) { const nm = `${dn.deliveryNoteId}.xml`; writeFileSync(join(INBOX, 'delivery_notes', nm), serializeDeliveryNoteXml(dn)); manifest.categories.delivery_notes.push(nm); }
    if (cse.claimed && cse.claimed.length) files.push(['claimed', `${base}_claimed.csv`, serializeClaimedCsv(cse.claimed)]);
    if (cse.events.length) files.push(['events', `${base}_events.csv`, serializeEventCsv(cse.events)]);
    for (const [cat, name, text] of files) {
      writeFileSync(join(INBOX, cat, name), text);
      manifest.categories[cat].push(name);
    }
  }

  // bundled FX table (EUR-based) — non-sensitive, documented
  const fx = { base: 'EUR', asOf: '2026-01-02', rates: { EUR: 1, CZK: 0.0398, PLN: 0.2329 } };
  writeFileSync(join(ROOT, 'data', 'fx_rates.json'), JSON.stringify(fx, null, 2) + '\n');

  writeFileSync(join(ROOT, 'data', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // summary
  const byScenario = {};
  for (const c of cases) byScenario[c.meta.scenario] = (byScenario[c.meta.scenario] ?? 0) + 1;
  const counts = CATEGORIES.map((c) => `${c}=${manifest.categories[c].length}`).join(', ');
  console.log(`Generated ${cases.length} cases across ${SUPPLIERS.length} suppliers.`);
  console.log(`Files: ${counts}`);
  console.log('Scenario coverage:', byScenario);
}

main();
