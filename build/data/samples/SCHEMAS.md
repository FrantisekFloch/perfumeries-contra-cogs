# Data Schemas & Samples

> Defines the four document types the tool ingests, for **both contra COGS models**. Tiers/percentages/model are **data-driven per invoice/distributor** — the examples below are illustrative, not hard-coded rules.
> Live demo inbox: `build/data/inbox/{invoices,delivery_notes,storage_reports,credit_notes}`. These `samples/` mirror the shapes.

Matching chain: **Delivery Note (target warehouse)** → **GR/RECADV (per warehouse)** → **Invoice line (Stock ID + Invoice number)** → **Back-edge credit note (Model B, central monthly record)**.

---

## 1. Invoice (XML)
One invoice may be **per-warehouse** or a **summary** broken down by warehouse. `contraCogsModel` = `A` (direct/line-item, net price on line) or `B` (back-edge; standard price + monthly credit note). The `<discount>` block carries the **per-distributor tiers** (data-driven).

```xml
<invoice>
  <header>
    <invoiceNumber>INV-2026-0001</invoiceNumber>
    <type>proforma</type>                 <!-- proforma | final -->
    <distributor id="DIST-EU-01" name="Maison Aroma s.r.o."/>
    <contraCogsModel>B</contraCogsModel>   <!-- A | B -->
    <poReference>PO-7788</poReference>
    <invoiceDate>2026-01-28</invoiceDate>
    <shipDate>2026-01-27</shipDate>
    <incoterms>FOB_SHIPPING_POINT</incoterms>
    <currency>EUR</currency>
    <discount basis="total_volume">        <!-- data-driven tiers, vary per distributor -->
      <tier minQty="1" maxQty="5000" pct="1.0"/>
      <tier minQty="5001" maxQty="10000" pct="1.5"/>
      <tier minQty="10001" maxQty="" pct="2.0"/>
    </discount>
    <totalValueStandard>10000.00</totalValueStandard>
  </header>
  <lines>
    <line>
      <stockId>SKU-1001</stockId>
      <description>Eau de Parfum 50ml</description>
      <qtyInvoiced>5000</qtyInvoiced>
      <unitPriceStandard>2.00</unitPriceStandard>
      <!-- Model A only: net price already discounted -->
      <unitPriceNet></unitPriceNet>
      <targetStorage>WH-CENTRAL</targetStorage>  <!-- optional intended destination -->
    </line>
  </lines>
</invoice>
```
- **Model A variant:** `contraCogsModel=A`, `unitPriceNet` populated (e.g., `1.98`), no back-edge credit note expected.
- **Model B variant (shown):** standard price on lines; discount realized later via credit note (see §4).

---

## 2. Delivery Note (XML) — dodací list
One per physical delivery; **target warehouse code mandatory**.
```xml
<deliveryNote>
  <deliveryNoteId>DN-2026-0001-01</deliveryNoteId>
  <invoiceNumber>INV-2026-0001</invoiceNumber>
  <targetStorageId>WH-CENTRAL</targetStorageId>
  <shipDate>2026-01-27</shipDate>
  <lines>
    <line><stockId>SKU-1001</stockId><qtyShipped>1000</qtyShipped></line>
  </lines>
</deliveryNote>
```

---

## 3. Goods Receipt — GR / EDI RECADV (CSV, row-level)
Per-warehouse receipts; `receipt_datetime` drives the period. Header row:
```csv
invoice_number,stock_id,storage_id,qty_received,receipt_datetime,recadv_ref
INV-2026-0001,SKU-1001,WH-CENTRAL,1000,2026-01-30T09:15:00,RECADV-0001
INV-2026-0001,SKU-1001,WH-BA,500,2026-01-31T14:40:00,RECADV-0002
INV-2026-0001,SKU-1001,WH-KE,1500,2026-02-02T10:05:00,RECADV-0003
INV-2026-0001,SKU-1001,WH-ZA,1000,2026-02-04T11:20:00,RECADV-0004
INV-2026-0001,SKU-1001,WH-PO,900,2026-02-05T08:50:00,RECADV-0005
```
> Example totals: Jan = 1,500; Feb = 3,400; grand total received = **4,900 of 5,000** → 100-piece gap open (ties to `use_case_gap.md`), and delivery straddles Jan/Feb (ties to `use_case_timing.md`).

---

## 4. Back-edge Credit Note — dobropis / Co-op (XML, Model B only)
Settles the volume/marketing discount against the **central monthly delivery record**.
```xml
<creditNote>
  <creditNoteId>CN-2026-01-DIST-EU-01</creditNoteId>
  <distributor id="DIST-EU-01"/>
  <period>2026-01</period>
  <invoiceRef>INV-2026-0001</invoiceRef>
  <basisQty>1500</basisQty>            <!-- delivered volume in period -->
  <basisValueStandard>3000.00</basisValueStandard>
  <tierApplied>1.0</tierApplied>        <!-- resolved from delivered volume vs tiers -->
  <amount>30.00</amount>               <!-- contra COGS settled for the period -->
  <status>Pending</status>             <!-- Pending until full volume/period clears -->
</creditNote>
```
> Because only 1,500 delivered in January (< 5,000 threshold), the tier is provisional and the credit is **Pending** until the remaining volume is confirmed — the **pending contra COGS credit**.

---

## Notes
- All amounts illustrative. Real tiers/model come from each distributor's data.
- CSV chosen for RECADV (row-level, high volume, daily/hourly); XML for structured documents (invoice, delivery note, credit note). Confirm if you prefer a single format.
