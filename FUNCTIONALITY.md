# Perfumeries — Functionality Overview (High-Level)

> **Status:** Draft v1 — high-level and intentionally simple, for categorization. Details come later in design.
> **Perspective:** Receiver (buyer). Contra COGS (a **purchase discount**) is **already on the invoice**. Receiver owns **many storages** and must track goods, detect the contra COGS gap, and manage it to closure.

---

## What the tool does, in one line
Read the invoice, read what each storage actually received, put them together, measure **invoice vs delivery fulfilment** and any **contra COGS gap**, and show it all on a **dashboard of open vs closed** items.

---

## Functional flow (simple)

```
[Invoice source] ──┐
                   ├──▶ [Consolidate] ──▶ [Reconcile: invoice vs delivery] ──▶ [Contra COGS gap engine] ──▶ [Dashboard: Open / Closed]
[Storage reports] ─┘        (invoice-level and/or product/stock-id level)                 │
                                                                                          └──▶ [Resolution + Governance]
```

---

## Functional modules (categories)

### F0 — Source Scan (startup)
- On startup, scan **three sources in order**: **Database → API → Folder**, with visible status.
- Demo: DB and API show `Scanning… / No new updates found`; the **Folder** is the live source that ingests bundled files.
- Layered via a data-source abstraction so DB/API become real at the cloud stage. See `DESIGN.md` §2.

### F1 — Invoice Ingestion
- Read invoices from the active source (demo: XML files in `data/inbox/invoices/`).
- Capture: header (**PO, total value, applied discount** — all header-level), lines (**stock id/SKU, qty, unit price**), ship/invoice dates, Incoterms.
- One invoice typically spans **multiple products and multiple target storages**.

### F2 — Storage Ingestion
- Read **row-level** storage reports (demo: `data/inbox/storage_reports/`), one file or combined feed, daily/hourly.
- Capture per row: **invoice number, stock id, storage id, qty received, receipt datetime**.

### F-Archive — Archival
- Fully matched **and paid** invoices move to `data/archive/` (status Archived). Static-demo caveat in `DESIGN.md` §2.

### F3 — Consolidation
- Put everything together at **invoice level**, and where possible at **product level (stock id)**.
- Align invoice lines to received quantities across all storages (sum received per product).

### F4 — Reconciliation (Invoice vs Delivery Fulfilment)
- Compare **invoiced quantity** vs **total received quantity**.
- Produce fulfilment status per invoice and/or per product (fully delivered / short / over).

### F5 — Contra COGS Gap Engine
- Where fulfilment is short, compute the **contra COGS gap** (contra value tied to units not verified as received).
- Flag each gap, keep it **owned and open** until resolved (never silently dropped).
- Offer the **resolution options** from the definitions (transfer/reclass, debit note, write-off, shrinkage, accrue+true-up, contra COGS correcting entry) for the user to **choose** per case.

### F5b — Timing / Period Handling (cross-month deliveries)
- Track **ship date, invoice date, and receipt date per storage** separately.
- Detect invoices whose receipts **straddle a period boundary** (e.g., Jan/Feb) and support **split debits** per period tied to one invoice.
- Carry unreceived value as a **goods-in-transit / GINR accrual**, **flagged "value missing — locate"** — never auto-net into a reduced liability.
- Warn when a shortfall risks dropping **below a discount threshold** (discount-forfeiture exposure).
- Capture **Incoterms** per order (who bears in-transit loss).
- See `goods_in_transit_and_timing.md` and `use_case_timing.md`.

### F7 — Inventory (monthly audit detail)
- A sub-part giving **monthly details per invoice** for audit: delivered vs invoiced, contra COGS status (applied / pending / cleared), gaps, receipts by storage with dates, linked delivery notes & credit notes, and full audit trail.
- Exportable per month/invoice. See `DESIGN.md` §7b.

### F6 — Dashboard (Open / Closed) + Role Views
- Visualize **open** vs **closed** parts: open gaps (age, owner, amount at risk) and closed/resolved items (resolution + evidence).
- **Role-based login** with three views (see `DESIGN.md` §7):
  - **Storage** — "on-way" invoices, pending delivery, aged pending, historical trend + current situation.
  - **Accounting** — closed invoices + summary of not-fully-closed and open.
  - **Finance** — high-level portfolio summary, drill-down to a storage with pending issues.
- **Governance:** unresolvable-forever items go through a **backdoor** with **1-manager approval**; closure generates a document, open items record decision + next steps.

---

## Categorization summary
| Category | Modules | Purpose |
|----------|---------|---------|
| **Ingestion** | F1 Invoice, F2 Storage | Get data in from two sources |
| **Processing** | F3 Consolidation, F4 Reconciliation, F5 Gap Engine | Match, measure fulfilment, detect gaps |
| **Governance** | (within F5) Resolution + audit trail | Choose action, keep gaps tracked to closure |
| **Presentation** | F6 Dashboard | Open vs closed visibility |

---

## Grain (to confirm in design)
- Primary reconciliation grain: **invoice level**, with **product/stock-id level** where data allows.
- Match key candidates: PO ↔ invoice line ↔ product (stock id) ↔ storage receipt.

## Deliberately out of scope for this high-level pass
- Exact file formats / connectors for invoice and storage feeds (design phase).
- Whether the tool **posts** accounting entries or only **tracks/recommends** them.
- Hosting specifics (cloud target) — noted for later, tool must be online-functional.

## Open questions (for design)
1. What format/source is the **single invoice location** (file drop, DB, API, export)?
2. What do **storage reports** look like (one file per storage? one combined feed? columns available)?
3. Is a reliable **stock id / SKU** present on both the invoice and storage reports (enables product-level matching)?
4. Does the tool need to **generate documents** (debit note, write-off entry) or just **record the decision**?
5. Who are the **users** of the dashboard (single analyst, team, managers)?
