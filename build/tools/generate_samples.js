// Deterministic sample-data generator. Produces a year of invoices (2026) across a
// few products, storages and two distributors (Model A + Model B) with varied
// outcomes (full / short / over / in-transit / cross-month straddle), plus matching
// delivery notes, RECADV receipt CSVs and Model-B credit notes. Writes the files and
// rebuilds data/manifest.json. The canonical INV-2026-0001 dataset is preserved.
//
// Run: node tools/generate_samples.js

import { writeFileSync, mkdirSync } from 'node:fs';
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

const PRODUCTS = [
  { sku: 'SKU-1001', name: 'Eau de Parfum 50ml', price: 2.00 },
  { sku: 'SKU-1002', name: 'Eau de Toilette 100ml', price: 1.50 },
  { sku: 'SKU-1003', name: 'Perfume Oil 30ml', price: 3.25 },
  { sku: 'SKU-1004', name: 'Body Mist 200ml', price: 0.90 },
  { sku: 'SKU-1005', name: 'Gift Set', price: 5.00 },
  { sku: 'SKU-1006', name: 'Travel Spray 15ml', price: 1.10 },
];
const STORAGES = ['WH-CENTRAL', 'WH-BA', 'WH-KE', 'WH-ZA', 'WH-PO'];
const DISTRIBUTORS = [
  { id: 'DIST-EU-01', name: 'Maison Aroma s.r.o.', model: 'B', tiers: [[1, 5000, 1], [5001, 10000, 1.5], [10001, null, 2]] },
  { id: 'DIST-EU-02', name: 'Nordic Scents AB', model: 'A', tiers: [[1, 3000, 0.5], [3001, null, 1]] },
];
const SCENARIOS = ['full', 'full', 'full', 'short', 'short', 'over', 'intransit', 'straddle'];

const pad = (n) => String(n).padStart(2, '0');
const tierPct = (tiers, qty) => { for (const [min, max, pct] of tiers) if (qty >= min && (max === null || qty <= max)) return pct; return 0; };
const round2 = (n) => Math.round(n * 100) / 100;

function distributeAcross(total, storages) {
  // split `total` into len(storages) roughly-even integer chunks
  const n = storages.length;
  const base = Math.floor(total / n);
  const parts = Array(n).fill(base);
  let rem = total - base * n;
  for (let i = 0; rem > 0; i = (i + 1) % n, rem--) parts[i] += 1;
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
for (const sub of ['invoices', 'delivery_notes', 'storage_reports', 'credit_notes']) {
  mkdirSync(join(INBOX, sub), { recursive: true });
}

const manifest = {
  description: 'File manifest for the FolderSource. Static hosts (GitHub Pages) have no directory listing, so the folder scan enumerates inbox files from here.',
  generatedFor: 'demo',
  inbox: {
    invoices: ['INV-2026-0001.xml'],
    delivery_notes: ['DN-2026-0001-01.xml'],
    storage_reports: ['recadv_2026-01_02.csv'],
    credit_notes: ['CN-2026-01-DIST-EU-01.xml'],
  },
  archive: [],
};

let seq = 1; // canonical INV-2026-0001 preserved; generated start at 0002
for (let month = 1; month <= 12; month++) {
  const perMonth = randInt(2, 3);
  for (let k = 0; k < perMonth; k++) {
    seq += 1;
    const num = `INV-2026-${pad(seq === 1 ? 2 : seq)}`; // never 0001
    const dist = pick(DISTRIBUTORS);
    const scenario = pick(SCENARIOS);
    const nLines = randInt(1, 3);
    const chosen = [];
    const usedSku = new Set();
    for (let i = 0; i < nLines; i++) {
      let p = pick(PRODUCTS);
      while (usedSku.has(p.sku)) p = pick(PRODUCTS);
      usedSku.add(p.sku);
      chosen.push({ ...p, qty: randInt(5, 40) * 100 }); // 500..4000
    }
    const totalQty = chosen.reduce((s, l) => s + l.qty, 0);
    const pct = tierPct(dist.tiers, totalQty);
    const lines = chosen.map((l) => ({ sku: l.sku, name: l.name, qty: l.qty, price: l.price, net: dist.model === 'A' ? round2(l.price * (1 - pct / 100)) : null }));
    const totalValue = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
    const invoiceDate = `2026-${pad(month)}-${pad(randInt(3, 9))}`;
    const shipDate = `2026-${pad(month)}-${pad(2)}`;

    const inv = {
      invoiceNumber: num, type: dist.model === 'B' ? 'proforma' : 'final',
      distributorId: dist.id, distributorName: dist.name, model: dist.model,
      po: `PO-${1000 + seq}`, invoiceDate, shipDate, tiers: dist.tiers, totalValue, lines,
    };
    writeFileSync(join(INBOX, 'invoices', `${num}.xml`), buildInvoiceXml(inv));
    manifest.inbox.invoices.push(`${num}.xml`);

    // receipts per scenario
    const rows = [];
    let deliveredQty = 0;
    let deliveredValue = 0;
    const firstStorages = STORAGES.slice(0, randInt(2, 4));
    for (const l of lines) {
      let target = l.qty;
      if (scenario === 'short') target = Math.round(l.qty * 0.9);
      else if (scenario === 'over') target = Math.round(l.qty * 1.05);
      else if (scenario === 'intransit') target = 0;
      if (target > 0) {
        const parts = distributeAcross(target, firstStorages);
        parts.forEach((pt, idx) => {
          // straddle: push some receipts into the next month
          const m2 = scenario === 'straddle' && idx % 2 === 1 ? month + 1 : month;
          const mm = m2 > 12 ? 12 : m2;
          const day = pad(randInt(10, 26));
          rows.push({ invoiceNumber: num, sku: l.sku, storageId: pt.storageId, qty: pt.qty, datetime: `2026-${pad(mm)}-${day}T09:00:00`, ref: `RECADV-${num}-${idx}` });
          deliveredQty += pt.qty;
          deliveredValue += pt.qty * l.price;
        });
      }
    }
    if (rows.length) {
      writeFileSync(join(INBOX, 'storage_reports', `recadv_${num}.csv`), buildRecadvCsv(rows));
      manifest.inbox.storage_reports.push(`recadv_${num}.csv`);
    }

    // delivery note (one, intended)
    const dnId = `DN-${num}`;
    writeFileSync(join(INBOX, 'delivery_notes', `${dnId}.xml`), buildDeliveryNoteXml({
      id: dnId, invoiceNumber: num, targetStorageId: firstStorages[0], shipDate, lines: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
    }));
    manifest.inbox.delivery_notes.push(`${dnId}.xml`);

    // credit note for Model B distributors (back-edge settlement)
    if (dist.model === 'B' && deliveredQty > 0) {
      const cnId = `CN-${num}`;
      const fully = deliveredQty >= totalQty;
      writeFileSync(join(INBOX, 'credit_notes', `${cnId}.xml`), buildCreditNoteXml({
        id: cnId, distributorId: dist.id, period: `2026-${pad(month)}`, invoiceRef: num,
        basisQty: deliveredQty, basisValue: round2(deliveredValue), tier: pct,
        amount: round2(deliveredValue * pct / 100), status: fully ? 'Cleared' : 'Pending',
      }));
      manifest.inbox.credit_notes.push(`${cnId}.xml`);
    }
  }
}

writeFileSync(join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const counts = Object.fromEntries(Object.entries(manifest.inbox).map(([k, v]) => [k, v.length]));
console.log('Generated sample data. Manifest counts:', counts);
