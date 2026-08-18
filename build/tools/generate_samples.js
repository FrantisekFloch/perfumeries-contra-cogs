// Deterministic sample-data generator. Produces a year of invoices (2026) across a
// few products, storages and two distributors (Model A + Model B) with varied
// outcomes (full / short / over / in-transit / cross-month straddle), plus matching
// delivery notes, RECADV receipt CSVs and Model-B credit notes. Writes the files and
// rebuilds data/manifest.json. The canonical INV-2026-0001 dataset is preserved.
//
// Run: node tools/generate_samples.js

import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const INBOX = join(DATA, 'inbox');

// --- deterministic PRNG ---
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const randInt = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
// Deterministic Fisher-Yates using the shared PRNG (so runs stay reproducible).
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

// Unit prices inflated ~15%+ over the original baseline so portfolio values read
// more substantial (e.g. 2.00 -> 2.35, 1.50 -> 1.75, 3.25 -> 3.80, ...).
const PRODUCTS = [
  { sku: 'SKU-1001', name: 'Eau de Parfum 50ml', price: 2.35 },
  { sku: 'SKU-1002', name: 'Eau de Toilette 100ml', price: 1.75 },
  { sku: 'SKU-1003', name: 'Perfume Oil 30ml', price: 3.80 },
  { sku: 'SKU-1004', name: 'Body Mist 200ml', price: 1.05 },
  { sku: 'SKU-1005', name: 'Gift Set', price: 5.90 },
  { sku: 'SKU-1006', name: 'Travel Spray 15ml', price: 1.30 },
];
const STORAGES = ['WH-CENTRAL', 'WH-BA', 'WH-KE', 'WH-ZA', 'WH-PO'];
// Contra COGS tiers (volume → discount): 1000u→1%, 2000u→1.5%, 5000u→2%. Below 1000u = 0%.
const CONTRA_TIERS = [[1, 999, 0], [1000, 1999, 1], [2000, 4999, 1.5], [5000, null, 2]];
const DISTRIBUTORS = [
  { id: 'DIST-EU-01', name: 'Maison Aroma s.r.o.', model: 'B', tiers: CONTRA_TIERS },
  { id: 'DIST-EU-02', name: 'Nordic Scents AB', model: 'A', tiers: CONTRA_TIERS },
];
const SCENARIOS = ['full', 'full', 'full', 'short', 'short', 'over', 'intransit', 'straddle'];

const pad = (n) => String(n).padStart(2, '0');
const tierPct = (tiers, qty) => { for (const [min, max, pct] of tiers) if (qty >= min && (max === null || qty <= max)) return pct; return 0; };
const round2 = (n) => Math.round(n * 100) / 100;

function distributeAcross(total, storages) {
  // Split `total` into UNEVEN integer chunks so per-storage quantities vary (no two
  // storages end up identical). Weights are deterministic via the shared PRNG.
  const n = storages.length;
  const weights = storages.map(() => 0.5 + rnd()); // 0.5..1.5
  const sumW = weights.reduce((s, w) => s + w, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sumW));
  let rem = total - parts.reduce((s, p) => s + p, 0);
  for (let i = 0; rem > 0; i = (i + 1) % n, rem--) parts[i] += 1; // hand out the remainder
  return storages.map((s, i) => ({ storageId: s, qty: parts[i] })).filter((p) => p.qty > 0);
}

function buildInvoiceXml(inv) {
  const tiers = inv.tiers.map(([min, max, pct]) => `      <tier minQty="${min}" maxQty="${max ?? ''}" pct="${pct}"/>`).join('\n');
  const lines = inv.lines.map((l) => `    <line>
      <stockId>${l.sku}</stockId>
      <description>${l.name}</description>
      <qtyInvoiced>${l.qty}</qtyInvoiced>
      <unitPriceStandard>${l.price.toFixed(2)}</unitPriceStandard>
      <unitPriceNet>${l.net != null ? l.net.toFixed(4) : ''}</unitPriceNet>
      <targetStorage>MULTI</targetStorage>
    </line>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<invoice>
  <header>
    <invoiceNumber>${inv.invoiceNumber}</invoiceNumber>
    <type>${inv.type}</type>
    <distributor id="${inv.distributorId}" name="${inv.distributorName}"/>
    <contraCogsModel>${inv.model}</contraCogsModel>
    <poReference>${inv.po}</poReference>
    <invoiceDate>${inv.invoiceDate}</invoiceDate>
    <shipDate>${inv.shipDate}</shipDate>
    <incoterms>FOB_SHIPPING_POINT</incoterms>
    <currency>EUR</currency>
    <discount basis="total_volume">
${tiers}
    </discount>
    <totalValueStandard>${inv.totalValue.toFixed(2)}</totalValueStandard>
  </header>
  <lines>
${lines}
  </lines>
</invoice>
`;
}

function buildDeliveryNoteXml(dn) {
  const lines = dn.lines.map((l) => `    <line><stockId>${l.sku}</stockId><qtyShipped>${l.qty}</qtyShipped></line>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<deliveryNote>
  <deliveryNoteId>${dn.id}</deliveryNoteId>
  <invoiceNumber>${dn.invoiceNumber}</invoiceNumber>
  <targetStorageId>${dn.targetStorageId}</targetStorageId>
  <shipDate>${dn.shipDate}</shipDate>
  <deliveryStatus>${dn.deliveryStatus || 'OnTime'}</deliveryStatus>
  <expectedDate>${dn.expectedDate || ''}</expectedDate>
  <lines>
${lines}
  </lines>
</deliveryNote>
`;
}

function buildRecadvCsv(rows) {
  const header = 'invoice_number,stock_id,storage_id,qty_received,receipt_datetime,recadv_ref';
  const body = rows.map((r) => `${r.invoiceNumber},${r.sku},${r.storageId},${r.qty},${r.datetime},${r.ref}`).join('\n');
  return `${header}\n${body}\n`;
}

function buildCreditNoteXml(cn) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<creditNote>
  <creditNoteId>${cn.id}</creditNoteId>
  <distributor id="${cn.distributorId}"/>
  <period>${cn.period}</period>
  <invoiceRef>${cn.invoiceRef}</invoiceRef>
  <basisQty>${cn.basisQty}</basisQty>
  <basisValueStandard>${cn.basisValue.toFixed(2)}</basisValueStandard>
  <tierApplied>${cn.tier}</tierApplied>
  <amount>${cn.amount.toFixed(2)}</amount>
  <status>${cn.status}</status>
</creditNote>
`;
}

// --- generate ---
// Canonical files kept across regenerations (referenced by tests). Everything else in
// the inbox is cleared first so stale files from previous runs don't accumulate.
const KEEP = {
  invoices: ['INV-2026-0001.xml'],
  delivery_notes: ['DN-2026-0001-01.xml', 'DN-2026-0001-02.xml', 'DN-2026-0001-03.xml', 'DN-2026-0001-04.xml', 'DN-2026-0001-05.xml'],
  storage_reports: ['recadv_2026-01_02.csv'],
  credit_notes: ['CN-2026-01-DIST-EU-01.xml'],
};
for (const sub of ['invoices', 'delivery_notes', 'storage_reports', 'credit_notes']) {
  mkdirSync(join(INBOX, sub), { recursive: true });
  for (const f of readdirSync(join(INBOX, sub))) {
    if (!KEEP[sub].includes(f)) unlinkSync(join(INBOX, sub, f));
  }
}

const manifest = {
  description: 'File manifest for the FolderSource. Static hosts (GitHub Pages) have no directory listing, so the folder scan enumerates inbox files from here.',
  generatedFor: 'demo',
  inbox: {
    invoices: ['INV-2026-0001.xml'],
    delivery_notes: ['DN-2026-0001-01.xml', 'DN-2026-0001-02.xml', 'DN-2026-0001-03.xml', 'DN-2026-0001-04.xml', 'DN-2026-0001-05.xml'],
    storage_reports: ['recadv_2026-01_02.csv'],
    credit_notes: ['CN-2026-01-DIST-EU-01.xml'],
  },
  archive: [],
};

// Anchor to "today" so the dataset is year-to-date with no future dates.
const now = new Date();
const CUR_Y = now.getFullYear();
const CUR_M = now.getMonth() + 1;
const CUR_D = now.getDate();
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoDT = (d) => `${iso(d)}T09:00:00`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

let seq = 1; // canonical INV-2026-0001 preserved; generated start at 0002
for (let month = 1; month <= CUR_M; month++) {
  const isCurrent = month === CUR_M;
  const perMonth = isCurrent ? randInt(1, 2) : randInt(2, 3);
  for (let k = 0; k < perMonth; k++) {
    seq += 1;
    const num = `INV-${CUR_Y}-${pad(seq)}`;
    const dist = pick(DISTRIBUTORS);
    // Recency-weighted scenarios. Only the current + previous month carry OPEN items
    // (short / in-transit) so open-item aging stays realistic (~0–40 days). Older
    // months are fully resolved (full / over), which close the invoice — no stale aging.
    // Only the CURRENT month leaves invoices open (short / in-transit); every earlier
    // month is fully resolved. Bias toward MISSING goods (short/in-transit) so several
    // open invoices show shortfalls; over-delivery is rare (mostly resolved as 'full').
    // Current month → open items (short / in-transit). Past months resolve fully, except
    // exactly ONE over-delivery example kept for the demo (the first generated invoice).
    let scenario;
    if (isCurrent) scenario = pick(['short', 'short', 'short', 'intransit', 'intransit']);
    else if (seq === 2) scenario = 'over'; // the single over-delivery demo case
    else scenario = 'full';

    const nLines = randInt(1, 3);
    const chosen = [];
    const usedSku = new Set();
    for (let i = 0; i < nLines; i++) {
      let p = pick(PRODUCTS);
      while (usedSku.has(p.sku)) p = pick(PRODUCTS);
      usedSku.add(p.sku);
      chosen.push({ ...p, qty: randInt(5, 40) * 100 });
    }
    const totalQty = chosen.reduce((s, l) => s + l.qty, 0);
    const pct = tierPct(dist.tiers, totalQty);
    const lines = chosen.map((l) => ({ sku: l.sku, name: l.name, qty: l.qty, price: l.price, net: dist.model === 'A' ? round2(l.price * (1 - pct / 100)) : null }));
    const totalValue = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));

    // Invoice date: past months anywhere; current month within the last ~week (never future).
    let invDay;
    if (isCurrent) { const lo = Math.max(1, CUR_D - 6); const hi = Math.max(1, CUR_D - 1); invDay = hi <= lo ? lo : randInt(lo, hi); }
    else invDay = randInt(3, 25);
    const invoiceDateObj = new Date(CUR_Y, month - 1, invDay);
    const shipDateObj = addDays(invoiceDateObj, -randInt(1, 3));
    const invoiceDate = iso(invoiceDateObj);
    const shipDate = iso(shipDateObj);

    const inv = {
      invoiceNumber: num, type: dist.model === 'B' ? 'proforma' : 'final',
      distributorId: dist.id, distributorName: dist.name, model: dist.model,
      po: `PO-${1000 + seq}`, invoiceDate, shipDate, tiers: dist.tiers, totalValue, lines,
    };
    writeFileSync(join(INBOX, 'invoices', `${num}.xml`), buildInvoiceXml(inv));
    manifest.inbox.invoices.push(`${num}.xml`);

    // Plan delivery across a RANDOM subset of storages (each included independently,
    // min 2) so no two storages end up with identical invoice counts/values. Receive
    // per scenario, skipping any portion whose receipt date is still in the future.
    let intended = shuffle([...STORAGES]).filter(() => rnd() < 0.55);
    if (intended.length < 2) intended = shuffle([...STORAGES]).slice(0, randInt(2, 3));
    const factor = scenario === 'short' ? 0.9 : scenario === 'over' ? 1.05 : scenario === 'intransit' ? 0 : 1.0;
    const rows = [];
    const plannedByStorage = {};
    let deliveredQty = 0; let deliveredValue = 0;
    for (const l of lines) {
      distributeAcross(l.qty, intended).forEach((pt, idx) => {
        (plannedByStorage[pt.storageId] ||= []).push({ sku: l.sku, qty: pt.qty });
        const actual = Math.round(pt.qty * factor);
        if (actual > 0) {
          // Realistic delivery lead time: mostly 2–12 days; straddle legs a bit longer (14–20).
          const extra = scenario === 'straddle' && idx % 2 === 1 ? randInt(14, 20) : randInt(2, 12);
          const rdate = addDays(shipDateObj, extra);
          if (rdate <= now) {
            rows.push({ invoiceNumber: num, sku: l.sku, storageId: pt.storageId, qty: actual, datetime: isoDT(rdate), ref: `RECADV-${num}-${idx}` });
            deliveredQty += actual; deliveredValue += actual * l.price;
          }
        }
      });
    }
    if (rows.length) {
      writeFileSync(join(INBOX, 'storage_reports', `recadv_${num}.csv`), buildRecadvCsv(rows));
      manifest.inbox.storage_reports.push(`recadv_${num}.csv`);
    }

    // Which storages actually got goods (used to flag logistics status on unreceived legs).
    const receivedStorages = new Set(rows.map((r) => r.storageId));
    const etaDate = iso(addDays(now, randInt(2, 9))); // future ETA for delayed/rerouted legs

    // One delivery note per intended storage (defines the invoice's target storages).
    Object.entries(plannedByStorage).forEach(([storageId, dlines], di) => {
      const dnId = `DN-${num}-${pad(di + 1)}`;
      // Assign a logistics status. Received legs are OnTime. Unreceived legs get a
      // realistic problem status, weighted by recency (recent invoices more troubled).
      let deliveryStatus = 'OnTime'; let expectedDate = '';
      if (!receivedStorages.has(storageId)) {
        const pool = isCurrent
          ? ['Delayed', 'Delayed', 'Rerouted', 'Lost', 'OnTime']
          : (month >= CUR_M - 1 ? ['Delayed', 'Rerouted', 'OnTime', 'OnTime'] : ['OnTime', 'OnTime', 'OnTime', 'Delayed']);
        deliveryStatus = pick(pool);
        if (deliveryStatus === 'Delayed' || deliveryStatus === 'Rerouted') expectedDate = etaDate;
      }
      writeFileSync(join(INBOX, 'delivery_notes', `${dnId}.xml`), buildDeliveryNoteXml({
        id: dnId, invoiceNumber: num, targetStorageId: storageId, shipDate, lines: dlines,
        deliveryStatus, expectedDate,
      }));
      manifest.inbox.delivery_notes.push(`${dnId}.xml`);
    });

    // Credit note for Model B distributors (back-edge settlement).
    if (dist.model === 'B' && deliveredQty > 0) {
      const cnId = `CN-${num}`;
      const fully = deliveredQty >= totalQty;
      writeFileSync(join(INBOX, 'credit_notes', `${cnId}.xml`), buildCreditNoteXml({
        id: cnId, distributorId: dist.id, period: `${CUR_Y}-${pad(month)}`, invoiceRef: num,
        basisQty: deliveredQty, basisValue: round2(deliveredValue), tier: pct,
        amount: round2(deliveredValue * pct / 100), status: fully ? 'Cleared' : 'Pending',
      }));
      manifest.inbox.credit_notes.push(`${cnId}.xml`);
    }
  }
}

// --- Guaranteed brand-new IN-TRANSIT invoices (1–3 days ago, nothing received yet) ---
// These always exist so the "In transit" filter has content. No receipt rows are written,
// so the lifecycle marks them InTransitPending; delivery notes carry an ETA a few days out.
for (let n = 0; n < 2; n++) {
  seq += 1;
  const num = `INV-${CUR_Y}-${pad(seq)}`;
  const dist = DISTRIBUTORS[n % DISTRIBUTORS.length];
  const p = PRODUCTS[n % PRODUCTS.length];
  const qtyLine = randInt(12, 30) * 100;
  const pct = tierPct(dist.tiers, qtyLine);
  const line = { sku: p.sku, name: p.name, qty: qtyLine, price: p.price, net: dist.model === 'A' ? round2(p.price * (1 - pct / 100)) : null };
  const totalValue = round2(p.price * qtyLine);
  const invDay = Math.max(1, CUR_D - (n === 0 ? 1 : 4)); // one ~1 day ago (just shipped), one ~4 days ago (in transit)
  const invoiceDateObj = new Date(CUR_Y, CUR_M - 1, invDay);
  const shipDateObj = addDays(invoiceDateObj, -1);
  const invoiceDate = iso(invoiceDateObj); const shipDate = iso(shipDateObj);
  writeFileSync(join(INBOX, 'invoices', `${num}.xml`), buildInvoiceXml({
    invoiceNumber: num, type: dist.model === 'B' ? 'proforma' : 'final',
    distributorId: dist.id, distributorName: dist.name, model: dist.model,
    po: `PO-${1000 + seq}`, invoiceDate, shipDate, tiers: dist.tiers, totalValue, lines: [line],
  }));
  manifest.inbox.invoices.push(`${num}.xml`);
  // Two intended storages, both still in transit (no receipts), ETA a few days out.
  const stores = shuffle([...STORAGES]).slice(0, 2);
  const eta = iso(addDays(now, randInt(2, 6)));
  distributeAcross(qtyLine, stores).forEach((pt, di) => {
    const dnId = `DN-${num}-${pad(di + 1)}`;
    writeFileSync(join(INBOX, 'delivery_notes', `${dnId}.xml`), buildDeliveryNoteXml({
      id: dnId, invoiceNumber: num, targetStorageId: pt.storageId, shipDate,
      lines: [{ sku: p.sku, qty: pt.qty }], deliveryStatus: 'Delayed', expectedDate: eta,
    }));
    manifest.inbox.delivery_notes.push(`${dnId}.xml`);
  });
}

writeFileSync(join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const counts = Object.fromEntries(Object.entries(manifest.inbox).map(([k, v]) => [k, v.length]));
console.log('Generated sample data. Manifest counts:', counts);
