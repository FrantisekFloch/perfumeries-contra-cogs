# Perfumeries — Design (Draft v1)

> **Status:** Draft — built from intake answers. Perspective: **receiver (buyer)**, contra COGS = **purchase discount fixed at invoice level, already on the invoice**. Definitions live in `definitions/`; functionality in `FUNCTIONALITY.md`.

---

## 1. Confirmed facts (from intake + official process)
| Topic | Decision |
|-------|----------|
| Perspective | Receiver/buyer; owns many storages |
| **Contra COGS models** | **Two, both supported** (per `official_process_sk.md`): **A) Direct line-item** — net price already on the per-warehouse invoice; **B) Back-edge allowance** — standard price + monthly credit note (dobropis/Co-op) vs central delivery record, holding a **pending contra COGS credit** until cleared |
| Discount nature | Tiered on volume (user: 5,000→1% / 5,000–10,000→1.5% / >10,000→2% — **confirm**). Model B is threshold-conditional; recognized against **delivered** volume |
| Matching basis | **GR per warehouse via EDI RECADV** + **delivery note** (target warehouse code) |
| Invoice forms | **Per-warehouse invoice** OR **summary invoice** broken down by warehouse (line items/attachments) |
| Incoterms | **FOB shipping point** — buyer bears in-transit loss |
| "Losing money" | Back-edge (Model B) **discount-recognition timing** (threshold not met until delivery completes → pending credit; if never completed, discount not earned) + **B/C** in-transit loss & forgotten value |
| Invoice contents | Line-level: **stock id/SKU, qty, unit price**. Header-level only: **PO, total value, applied discount** |
| One invoice covers | **Multiple products AND multiple target storages** |
| Storage reports | Row-level GR/RECADV feed: product, storage, qty, datetime. Daily (maybe hourly) |
| Match key | **Stock ID + Invoice number** (PO not passed to storage — receiver owns storage) |
| Period close | **Calendar month** (user: SK legal invoice covers only goods delivered in the month — confirm) |
| Misroutes | **Not auto-detected** — resolved manually in the tool after identification |
| Documents | **Generate** a document for fully matched & closed invoices; **record** decision + next steps for open ones |
| Unresolvable items | **"Backdoor"** path for items lost forever; **1-manager approval** for write-off/resolution |
| Users | Accounting, Finance, Storage — **role-based login**, three views |
| Test hosting | **GitHub** (static-friendly). Cloud target later |

> **Pending confirmation (user-provided, not in official text):** exact tier %, the **proforma** step, and the "legal invoice only for delivered-in-month" rule. See `official_process_sk.md` §3.

---

## 2. Data sources & startup scan sequence
The tool scans **three sources** on startup, in order, with visible status messages:

1. **Database** → (demo: no connection) → shows `Scanning Database…` → `No new updates found`.
2. **API portal** → (demo: no connection) → shows `Scanning API…` → `No new updates found`.
3. **Folder** → (demo: real) → scans the repo data folder for **invoice files** and **storage reports/intakes**, lists what it found, and ingests them.

> Design principle: a **DataSource abstraction** with three adapters (`DatabaseSource`, `ApiSource`, `FolderSource`). In the demo only `FolderSource` returns data; the other two return "no updates." When moving to cloud, DB/API adapters get real implementations — **no change to the rest of the app**.

### Demo model selector
- At demo/test start, the user **chooses the Contra COGS model (A or B)**; the tool then works with (and the sample generator produces) test invoices/documents consistent with that model.
- **Discount config is data-driven per invoice/distributor** — tier bands, %, proforma vs final, and model are **read from the invoice/distributor data**, never hard-coded. Different manufacturers/distributors carry different tiers and models.

### Folder layout (in the repo, GitHub-friendly)
```
build/
├── data/
│   ├── inbox/
│   │   ├── invoices/          # XML invoices — per-warehouse OR summary broken down by warehouse
│   │   ├── delivery_notes/    # dodacie listy — per delivery, with target warehouse code
│   │   ├── storage_reports/   # GR / EDI RECADV — row-level receipts per warehouse
│   │   └── credit_notes/      # dobropis / Co-op — back-edge (Model B) monthly settlements
│   ├── archive/               # fully matched & PAID invoices land here
│   └── samples/               # example files documenting the expected schema
└── (app files)
```
- **Archive:** fully matched **and paid** invoices are moved to `data/archive/` (status = Archived).
- **GitHub/static caveat:** a static site (GitHub Pages) can **read** bundled files but cannot **write** back to the repo. For the demo, "archiving/scanning the folder" reads repo files; moving to archive = an **in-app status change** (+ optional file download). Real file movement/writes come at the **cloud stage** (backend) or via the browser **File System Access API** if we later run it locally with write permission. Flagged as a decision in §9.

---

## 3. Data model

### Invoice (header)
| Field | Notes |
|-------|-------|
| `invoice_number` | key |
| `po_reference` | header-level only |
| `ship_date` | goods left manufactory |
| `invoice_date` | invoice received |
| `incoterms` | e.g., FOB shipping point |
| `total_value` | gross before discount |
| `discount_applied` | **total-level**, fixed |
| `net_payable` | total_value − discount_applied |
| `currency` | |
| `status` | see lifecycle §6 |

### Invoice line
| Field | Notes |
|-------|-------|
| `invoice_number` | FK |
| `stock_id` / `sku` | product key |
| `qty_invoiced` | |
| `unit_price` | line has **no** discount/PO |
| `target_storage` (optional) | if invoice states intended destination(s) |

### Delivery Note (dodací list) — per physical delivery
| Field | Notes |
|-------|-------|
| `delivery_note_id` | key |
| `invoice_number` | link (if known) |
| `target_storage_id` | **target warehouse code** (mandatory per official process) |
| `stock_id` / `sku`, `qty_shipped` | line detail |
| `ship_date` | |

### Storage receipt — GR / EDI RECADV (row-level)
| Field | Notes |
|-------|-------|
| `invoice_number` | match key |
| `stock_id` / `sku` | match key |
| `storage_id` | where received (per-warehouse GR) |
| `qty_received` | |
| `receipt_datetime` | drives period/timing |
| `recadv_ref` / `source_file` | provenance (EDI message) |

### Back-edge settlement (Model B) — credit note / Co-op
| Field | Notes |
|-------|-------|
| `credit_note_id` | dobropis / Co-op invoice |
| `period` | central **monthly** delivery record it settles |
| `basis_qty` / `basis_value` | delivered volume the discount is computed on |
| `tier_applied` | resulting tier (e.g., 1% / 1.5% / 2%) |
| `amount` | contra COGS settled |
| `status` | Pending / Cleared |

> **Two models to value a gap:**
> - **Model A (direct line-item):** net (discounted) price is already on the invoice line → a short/missing qty means you were billed net for goods not fully received → reconcile the line.
> - **Model B (back-edge):** invoice at standard price; the contra COGS is a **pending credit** recognized against **delivered** volume via the monthly credit note → value the pending credit on confirmed-delivered qty, hold until the volume/period condition clears.
> Where discount is header-level, allocate proportionally by line value (`unit_price × qty`) for gap valuation.

---

## 4. Matching & reconciliation logic
- **Matching basis (per official process):** **GR / EDI RECADV per warehouse** is the received truth; **delivery notes** carry the target warehouse code; invoice lines are matched against them.
- **Join key:** `invoice_number` + `stock_id` (PO is not on storage feeds).
- **Aggregate** received qty per (`invoice_number`, `stock_id`) across **all storages** and dates.
- **Fulfilment per line:** `qty_invoiced` vs `Σ qty_received`.
  - Fully delivered / short / over.
- **Fulfilment per invoice:** roll lines up; invoice is fully matched only when **all lines** are fully delivered.
- **Value of a gap (missing units):**
  - Line gross gap = `unit_price × (qty_invoiced − qty_received)`.
  - Discount allocation to the line = `discount_applied × (line_value / total_value)`.
  - **Contra COGS value at risk** on the missing units = allocated share of discount + gross → i.e., the **net value** you'd pay/lose for those units.
- **Multiple storages per line:** normal; a line can be satisfied by receipts across several storages (4×1,000 + 900 style).

---

## 5. Timing / period handling
- Use `receipt_datetime` (not invoice date) to decide the **period** a receipt falls in; close is **calendar month**.
- An invoice whose receipts **straddle months** → part settled/debited in month 1, remainder carried.
- Unreceived value at close = **goods-in-transit / GINR accrual**, **flagged "value missing — locate"** (age + owner), never netted into a reduced liability.
- **Split debits:** support >1 debit per invoice across periods (Jan portion, Feb portion), each tied to the invoice with its own date/amount.
- **FOB shipping point:** missing-in-transit value is the buyer's risk → the flag exists to prevent Mechanism B/C losses.

---

## 6. Invoice lifecycle & statuses
```
Received (invoice ingested)
   → In Transit / Pending Delivery (some/all lines not yet received)
   → Partially Received (some lines/qty received; gaps open)
   → Fully Matched (all lines received in full)
   → Paid
   → Archived (moved to data/archive/)
Side paths from Partially Received / gaps:
   → Under Investigation (manual: misroute? damaged? lost?)
   → Resolved via: Stock transfer / Debit note / Write-off / Shrinkage / Contra COGS correction
   → Unresolvable (Backdoor) — lost forever, requires 1-manager approval
```
- Each status change is **audited** (who, when, evidence document).
- **Document generation:** on Fully Matched & Paid → generate a closure document. For open/unresolved → record decision + next steps.
- **Backdoor:** explicit terminal path for items lost forever; gated by **manager approval** (write-off or other).

---

## 7. Roles & views (login required)
The tool detects the logged-in user's role and shows the matching view.

| Role | Sees | Key widgets |
|------|------|-------------|
| **Storage** | "On-way" invoices, pending delivery, aged pending | Current situation + historical trend dashboards for their storage(s) |
| **Accounting** | Closed invoices + summary of not-fully-closed and open | Reconciliation status, closure documents |
| **Finance** | Overall high-level summary, drill-down to a storage with pending issues | Portfolio KPIs, aging, drill-through |

- **Auth:** real login with roles. Demo caveat: a static GitHub Pages build can only do **mock/client-side** role selection (or hardcoded demo users); **real authentication requires the cloud/backend stage** (§9).

---

## 7b. Inventory sub-module (audit)
A dedicated **Inventory** section giving **monthly detail per invoice** for audit purposes.
- **Monthly view:** for a selected calendar month, list invoices with their delivered vs invoiced quantities, contra COGS status (applied / pending credit / cleared), and gap/resolution state.
- **Drill-down per invoice:** lines, receipts by storage (GR/RECADV) with dates, delivery notes, any back-edge credit notes, and the audit trail (status changes, approvals, evidence documents).
- **Audit-friendly:** immutable history, source-file provenance, exportable per month/invoice for auditors.
- Complements the dashboards (F6): dashboards = operational open/closed; Inventory = **month-by-month record of truth** for audit.

## 8. Proposed architecture & stack

### Demo (GitHub, static)
- **Single-page app** with a clear **data-source abstraction** (Folder adapter active; DB/API adapters stubbed to "no updates").
- Reads bundled **XML invoices** (browser `DOMParser`) and **row-level storage reports** (CSV/XML) from `data/inbox/`.
- **Client-side role selector** to demo the three views.
- Archival/close = in-app state + optional **download** of the generated document/JSON.
- Hostable on **GitHub Pages**; no secrets committed.

### Cloud stage (later)
- Add a **backend** (e.g., serverless API + database) implementing the real `DatabaseSource`/`ApiSource` adapters.
- **Real authentication** + role management.
- Persistent **archive** and audit log (write operations).
- Same UI and reconciliation core — only the data-source and persistence layers change.

> **Stack decision is still open** (see §9). The design is deliberately layered so the demo and the cloud version share the reconciliation engine and UI, differing only in data-source + persistence + auth.

---

## 9. Open decisions (before/for build)
1. **Frontend stack:** framework-light vanilla JS (simplest for GitHub Pages) vs a small build (e.g., Vite + a light framework) for the 3-view app. Recommend: pick based on how rich the dashboards need to be.
2. **Demo persistence:** in-browser only (localStorage) vs File System Access API (local read/write) — affects whether "archive" physically moves files in the demo.
3. **Invoice XML schema:** ✅ drafted — see `build/data/samples/SCHEMAS.md` §1 + sample `build/data/inbox/invoices/INV-2026-0001.xml`. Confirm/tweak.
4. **Storage/document schemas:** ✅ drafted — delivery note (§2), RECADV CSV (§3), back-edge credit note (§4), with coherent sample files in `build/data/inbox/`. Confirm formats (XML vs single CSV).
5. **Cloud target** for the later stage (AWS/Azure/GCP) — not needed for the demo but shapes the backend adapters.
6. **Incoterm confirmation:** you answered "yes" to FOB shipping point — please confirm that's the exact term.
7. **Document format** for closure/decision docs (PDF, HTML, JSON?).

## 10. Next step
Schemas + a coherent sample dataset are ready in `build/data/` (one Model B proforma invoice for 5,000 pcs, delivery note, RECADV receipts across 5 storages spanning Jan→Feb totalling 4,900, and a Pending back-edge credit note). This deliberately exercises **both** the 100-piece gap (`use_case_gap.md`) and the cross-month timing (`use_case_timing.md`).

Ready to scaffold the app in `build/`: startup 3-source scan (DB/API "no updates" → Folder live), **model selector (A/B)**, ingestion + parsing, matching engine, gap/recognition + pending-credit logic, the **3 role views** (Storage/Accounting/Finance) with login, the **Inventory** monthly-audit sub-module, and archive. Say the word — and if you want, I can run this as a formal spec (requirements → design → tasks).
