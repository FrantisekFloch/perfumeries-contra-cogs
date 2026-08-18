// Demo company + product reference data for the printable invoice document.
// Purely presentational (made-up addresses/IDs) so the Inventory "view invoice"
// can render a realistic Slovak/English e-invoice. Not used by any engine.

// The RECEIVER (our company that owns the warehouses and buys the goods).
export const BUYER = {
  name: 'Perfumeries Distribúcia s.r.o.',
  street: 'Digital Park II, Einsteinova 25',
  city: '851 01 Bratislava',
  country: 'Slovensko / Slovakia',
  ico: '52 118 447',
  dic: '2120934771',
  icdph: 'SK2120934771',
  iban: 'SK89 1100 0000 0029 4812 7635',
  bank: 'Tatra banka, a.s.',
  reg: 'Obchodný register OS Bratislava I, odd. Sro, vl. 134582/B',
};

// SUPPLIERS keyed by distributorId (matches the sample data).
export const SUPPLIERS = {
  'DIST-EU-01': {
    name: 'Maison Aroma s.r.o.',
    street: 'Vajnorská 100/B',
    city: '831 04 Bratislava',
    country: 'Slovensko / Slovakia',
    ico: '47 993 210',
    dic: '2024188390',
    icdph: 'SK2024188390',
    iban: 'SK31 0900 0000 0051 2233 4455',
    bank: 'Slovenská sporiteľňa, a.s.',
  },
  'DIST-EU-02': {
    name: 'Nordic Scents AB',
    street: 'Sveavägen 44',
    city: '111 34 Stockholm',
    country: 'Švédsko / Sweden',
    ico: '556677-8899',
    dic: 'SE556677889901',
    icdph: 'SE556677889901',
    iban: 'SE45 5000 0000 0583 9825 7466',
    bank: 'Svenska Handelsbanken',
  },
};

export function supplierFor(distributorId) {
  return SUPPLIERS[distributorId] || {
    name: distributorId, street: '—', city: '—', country: '—',
    ico: '—', dic: '—', icdph: '—', iban: '—', bank: '—',
  };
}

// Creative product names keyed by stock id (perfume / drogéria goods). Falls back
// to the description carried on the invoice line if a SKU isn't listed here.
export const PRODUCT_NAMES = {
  'SKU-1001': 'Nuit de Velours — Eau de Parfum 50 ml',
  'SKU-1002': 'Aqua Fresca — Eau de Toilette 100 ml',
  'SKU-1003': 'Bois Précieux — Perfume Oil 30 ml',
  'SKU-1004': 'Lumière Body Mist 200 ml',
  'SKU-1005': 'Coffret Cadeau — Gift Set',
  'SKU-1006': 'Pocket Bloom — Travel Spray 15 ml',
};

export function productName(stockId, fallback) {
  return PRODUCT_NAMES[stockId] || fallback || stockId;
}
