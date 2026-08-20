// Presentational reference data for realistic documents (invoices, delivery
// notes, GRNs). Made-up but plausible addresses / tax IDs / IBANs. Not used by
// any engine — purely for the document views. New perfume/cosmetics values
// (distinct from the old tool), spanning SK / PL / CZ.

// The RECEIVER (buyer): a pan-EU perfumeries retailer operating SK/PL/CZ.
export const BUYER = {
  name: 'Perfumé Retail Group SE',
  street: 'Mlynské Nivy 5',
  city: '821 09 Bratislava',
  country: 'Slovensko / Slovakia',
  ico: '54 771 209',
  dic: '2121778450',
  vat: 'SK2121778450',
  iban: 'SK47 1100 0000 0026 1548 9032',
  bank: 'Tatra banka, a.s.',
  reg: 'Obchodný register OS Bratislava III, odd. Sa, vl. 7781/B',
};

// Per-country receiving entities (used on delivery notes / GRNs).
export const BUYER_ENTITIES = {
  SK: { name: 'Perfumé Retail SK s.r.o.', city: '821 09 Bratislava', vat: 'SK2121778450', wh: 'WH-SK-01 — Bratislava DC' },
  PL: { name: 'Perfumé Retail Polska sp. z o.o.', city: '02-676 Warszawa', vat: 'PL5273056118', wh: 'WH-PL-01 — Warszawa DC' },
  CZ: { name: 'Perfumé Retail CZ s.r.o.', city: '150 00 Praha 5', vat: 'CZ29145877', wh: 'WH-CZ-01 — Praha DC' },
};

// SUPPLIERS keyed by supplierId (matches the sample generator's SUPPLIERS ids).
export const SUPPLIERS = {
  'SUP-MAISON': { name: 'Maison Aroma Distribution SAS', street: '18 Rue Saint-Honoré', city: '75001 Paris', country: 'Francúzsko / France', ico: '—', dic: 'FR76512994411', vat: 'FR76512994411', iban: 'FR76 3000 4000 0512 3456 7890 143', bank: 'BNP Paribas' },
  'SUP-LUMIERE': { name: 'Lumière Cosmetics SA', street: 'Route de Genève 12', city: '1003 Lausanne', country: 'Švajčiarsko / Switzerland', ico: '—', dic: 'CHE-116.281.710', vat: 'CHE-116.281.710', iban: 'CH93 0076 2011 6238 5295 7', bank: 'UBS Switzerland AG' },
  'SUP-VELVET': { name: 'Velvet & Co. Fragrances Ltd', street: '221B Baker Street', city: 'London NW1 6XE', country: 'Spojené kráľovstvo / UK', ico: '—', dic: 'GB428574922', vat: 'GB428574922', iban: 'GB29 NWBK 6016 1331 9268 19', bank: 'NatWest' },
  'SUP-NORD': { name: 'Nordica Beauty Group AB', street: 'Sveavägen 44', city: '111 34 Stockholm', country: 'Švédsko / Sweden', ico: '—', dic: 'SE556914203301', vat: 'SE556914203301', iban: 'SE35 5000 0000 0549 1000 0003', bank: 'Handelsbanken' },
  'SUP-ORIENT': { name: 'Orient Essence Trading LLC', street: 'Sheikh Zayed Rd, Trade Centre', city: 'Dubai', country: 'SAE / UAE', ico: '—', dic: 'AE100234567800003', vat: 'AE100234567800003', iban: 'AE07 0331 2345 6789 0123 456', bank: 'Emirates NBD' },
  'SUP-BOTANI': { name: 'Botanika Naturals s.r.o.', street: 'Českomoravská 2420/15', city: '190 00 Praha 9', country: 'Česko / Czechia', ico: '28912437', dic: 'CZ28912437', vat: 'CZ28912437', iban: 'CZ65 0800 0000 1920 0014 5399', bank: 'Česká spořitelna' },
};

export function supplierFor(supplierId) {
  return SUPPLIERS[supplierId] || { name: supplierId, street: '—', city: '—', country: '—', ico: '—', dic: '—', vat: '—', iban: '—', bank: '—' };
}

// Key-account contacts per supplier (presentational).
export const SUPPLIER_CONTACTS = {
  'SUP-MAISON': { rep: 'Camille Léon', role: 'Key Account Manager', email: 'c.leon@maison-aroma.fr', phone: '+33 1 44 55 66 77' },
  'SUP-LUMIERE': { rep: 'Andreas Meier', role: 'Trade Marketing Lead', email: 'a.meier@lumiere-cosmetics.ch', phone: '+41 21 555 22 10' },
  'SUP-VELVET': { rep: 'Olivia Bennett', role: 'National Account Director', email: 'o.bennett@velvet-co.co.uk', phone: '+44 20 7946 0102' },
  'SUP-NORD': { rep: 'Erik Lindqvist', role: 'Partner Manager', email: 'e.lindqvist@nordicabeauty.se', phone: '+46 8 555 010 20' },
  'SUP-ORIENT': { rep: 'Layla Haddad', role: 'Regional Sales Manager', email: 'l.haddad@orient-essence.ae', phone: '+971 4 555 8899' },
  'SUP-BOTANI': { rep: 'Petra Marková', role: 'Obchodní zástupce', email: 'p.markova@botanika.cz', phone: '+420 234 567 890' },
};
export function contactFor(supplierId) {
  return SUPPLIER_CONTACTS[supplierId] || { rep: '—', role: '—', email: '—', phone: '—' };
}

// Settlement / co-op terms per contra COGS model. Deterministic-ish variety.
export const SETTLEMENT_TERMS = {
  A: { method: 'Net price at invoice (line-item)', frequency: 'Per invoice', instrument: 'Reduced unit price', reconciliation: 'At goods receipt (GR/RECADV)' },
  B: { method: 'Back-edge allowance', frequency: 'Monthly', instrument: 'Credit note (dobropis) / Co-op invoice', reconciliation: 'Central monthly delivery record' },
};

// Product names keyed by the generator's SKU ids (perfume / cosmetics).
export const PRODUCT_NAMES = {
  'EDP-050': 'Velours Nocturne — Eau de Parfum 50 ml',
  'EDP-100': 'Velours Nocturne — Eau de Parfum 100 ml',
  'EDT-075': 'Brise Marine — Eau de Toilette 75 ml',
  'SRM-030': 'Éclat Serum — Facial Serum 30 ml',
  'CRM-050': 'Hydra Lumière — Face Cream 50 ml',
  'LIP-004': 'Rouge Couture — Lipstick 4 g',
  'MSC-200': 'Fleur de Jour — Body Mist 200 ml',
  'GFT-SET': 'Coffret Prestige — Gift Set',
};
export function productName(stockId, fallback) { return PRODUCT_NAMES[stockId] || fallback || stockId; }

// ---- Warehouse hierarchy -------------------------------------------------
// MAIN (country DC): WH-SK-01 / WH-PL-01 / WH-CZ-01.
// TOWN (regional): fed FROM the country main WH. Reroute = goods loaded onto a
// town-WH truck at the main DC without the main-WH unload/delivery-note scan.
export const MAIN_WAREHOUSES = {
  SK: { code: 'WH-SK-01', kind: 'MAIN', city: 'Bratislava', label: 'Bratislava Central DC' },
  PL: { code: 'WH-PL-01', kind: 'MAIN', city: 'Warszawa', label: 'Warszawa Central DC' },
  CZ: { code: 'WH-CZ-01', kind: 'MAIN', city: 'Praha', label: 'Praha Central DC' },
};
export const TOWN_WAREHOUSES = {
  // SK
  'WH-PO': { code: 'WH-PO', kind: 'TOWN', country: 'SK', city: 'Poprad', label: 'Poprad Town WH' },
  'WH-ZA': { code: 'WH-ZA', kind: 'TOWN', country: 'SK', city: 'Žilina', label: 'Žilina Town WH' },
  'WH-KE': { code: 'WH-KE', kind: 'TOWN', country: 'SK', city: 'Košice', label: 'Košice Town WH' },
  // PL
  'WH-KR': { code: 'WH-KR', kind: 'TOWN', country: 'PL', city: 'Kraków', label: 'Kraków Town WH' },
  'WH-WR': { code: 'WH-WR', kind: 'TOWN', country: 'PL', city: 'Wrocław', label: 'Wrocław Town WH' },
  // CZ
  'WH-BR': { code: 'WH-BR', kind: 'TOWN', country: 'CZ', city: 'Brno', label: 'Brno Town WH' },
  'WH-OS': { code: 'WH-OS', kind: 'TOWN', country: 'CZ', city: 'Ostrava', label: 'Ostrava Town WH' },
};
export function townWarehousesFor(country) {
  return Object.values(TOWN_WAREHOUSES).filter((w) => w.country === country);
}

// Warehouse label + receiving entity per storage code (main or town).
export function warehouseInfo(storageId) {
  if (TOWN_WAREHOUSES[storageId]) {
    const w = TOWN_WAREHOUSES[storageId]; const ent = BUYER_ENTITIES[w.country] || {};
    return { code: storageId, kind: 'TOWN', country: w.country, city: w.city, label: w.label, entity: ent.name || BUYER.name, vat: ent.vat || BUYER.vat };
  }
  const cc = (String(storageId).match(/WH-([A-Z]{2})/) || [])[1];
  const ent = BUYER_ENTITIES[cc];
  const main = MAIN_WAREHOUSES[cc];
  return ent ? { code: storageId, kind: 'MAIN', country: cc, city: ent.city, label: main ? main.label : ent.wh, entity: ent.name, vat: ent.vat } : { code: storageId, kind: 'MAIN', city: '—', entity: BUYER.name, vat: BUYER.vat };
}
