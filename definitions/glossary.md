# Glossary & Resolution-Option Catalogue

> **Status:** Draft v1. **Readable in-tool** — these definitions are meant to be surfaced to the user so they understand each option before choosing.
> **Compliance note:** External content paraphrased for licensing compliance; sources linked inline and in each dedicated file.

## Perspective & scope (confirmed)
- **Actor:** the **RECEIVER (buyer)**.
- **Contra COGS:** the discount is **already incorporated in the invoice** the receiver receives — the tool does **not** calculate the discount; it **verifies and governs** it against goods actually received.
- **Environment:** the receiver **owns many storage locations**; goods from one invoice may be **split across storages**.
- **Responsibility:** **track goods across storages → detect any gap → fill it if needed**, with full audit trail.
- **Design principle:** keep **all resolution options available** so the user can **choose** the right action per case. Nothing below is hard-wired; each is a selectable path.

---

## One-line glossary
| Term | One-liner | Detail file |
|------|-----------|-------------|
| **Contra COGS** | A credit-balance account that offsets COGS, so reported cost is shown net of vendor discounts/allowances. | `contra_cogs.md` |
| **Contra COGS gap** | The difference between the contra COGS baked into the invoice (on invoiced qty) and what's justified by **verified received** qty. | `contra_cogs.md`, `use_case_gap.md` |
| **Volume / tiered discount** | Bigger purchase volume unlocks a bigger discount rate (tiered %, incremental, retrospective). | `contra_cogs.md` §3 |
| **Goods Receipt Note (GRN)** | The document recording what was physically received at a storage; the "received" side of the match. | `goods_receipt_and_matching.md` |
| **Three-way match** | AP control comparing PO ↔ GRN ↔ invoice before accepting/paying. | `goods_receipt_and_matching.md` |
| **Stock transfer / reclass** | Moving inventory between the receiver's own storages; not a loss. | `stock_transfer.md` |
| **Inventory write-off** | Removing lost/damaged/obsolete stock from the books entirely. | `inventory_write_off.md` |
| **Inventory shrinkage** | Recorded stock exceeds actual on-hand (count/record mismatch). | `inventory_shrinkage.md` |
| **Debit note** | Buyer's document to the supplier to increase what the supplier owes / reduce what buyer pays (e.g., short delivery). | `credit_and_debit_notes.md` |
| **Credit note (memo)** | Supplier's document reducing the amount owed; the "negative invoice." | `credit_and_debit_notes.md` |
| **Accrual** | Holding an earned-but-unsettled / estimated amount until actuals arrive. | `true_up_and_accruals.md` |
| **True-up** | Correcting recorded estimates to actual figures, usually at period end. | `true_up_and_accruals.md` |
| **Contra COGS credit / correcting entry** | The entry that fills the gap — adjusts recognized contra COGS to verified received qty. | `contra_cogs_credit.md` |
| **Goods in transit / GINR** | Goods invoiced but not yet received; carried as an accrual and flagged until they land. | `goods_in_transit_and_timing.md` |
| **GRNI / GR-IR** | Clearing account for the timing gap between receipt and invoice. | `goods_in_transit_and_timing.md` |
| **Incoterms / FOB** | Shipping terms that set who owns/bears risk for in-transit goods (shipping point vs destination). | `goods_in_transit_and_timing.md` |
| **Split debit (cross-period)** | Debiting the received portion per period when one invoice's deliveries straddle month-end. | `use_case_timing.md` |
| **Model A — Direct / line-item** | Net (discounted) unit price already on the per-warehouse invoice. | `official_process_sk.md` |
| **Model B — Back-edge allowance** | Standard price + volume/marketing discount settled monthly via credit note against the central delivery record. | `official_process_sk.md` |
| **Delivery Note (dodací list)** | Document per physical delivery to a warehouse, with target warehouse code. | `official_process_sk.md` |
| **GR / RECADV (EDI)** | Per-warehouse goods-receipt confirmation; the basis for matching invoice lines. | `official_process_sk.md` |
| **Dobropis / Co-op invoice** | Credit note / summary marketing invoice that settles back-edge allowances. | `official_process_sk.md` |
| **Pending contra COGS credit** | Internal credit held until the volume/period condition clears (back-edge, cross-month). | `official_process_sk.md` |

---

## Resolution-option catalogue (what the receiver can choose to do about a gap)
Each option is a selectable path in the future tool. The **cause of the gap** points to the natural option, but the user retains the choice.

| # | Cause of gap | Recommended option | Books impact | Detail file |
|---|--------------|--------------------|--------------|-------------|
| 1 | Goods just moved to another of the receiver's storages | **Stock transfer / reclass** | None (relocation only) | `stock_transfer.md` |
| 2 | Supplier short-shipped / over-billed | **Raise a debit note** (claim credit from supplier) | Reduces payable; awaits supplier **credit note** | `credit_and_debit_notes.md` |
| 3 | Received then damaged / incorrect / lost | **Inventory write-off** | Loss booked (contra account or COGS) | `inventory_write_off.md` |
| 4 | Count vs record mismatch, cause unclear | **Shrinkage adjustment** | Adjusts inventory down | `inventory_shrinkage.md` |
| 5 | Timing — not yet resolved at period close | **Accrue + true-up** | Estimate held, reversed/settled next period | `true_up_and_accruals.md` |
| 6 | Any of the above → final contra correction | **Contra COGS credit / correcting entry** | Aligns contra COGS to verified qty | `contra_cogs_credit.md` |

> Governance rule across all options: the gap stays **flagged and owned** until a resolution option is applied and its **evidence document** is attached. See `contra_cogs.md` §4e.

## Files in this folder
- `contra_cogs.md` — core definition + main process + volume tiers + gap/governance
- `use_case_gap.md` — the 5,000-piece split-delivery worked example
- `use_case_timing.md` — cross-period (month-end) split delivery + the "how am I losing money" investigation
- `goods_in_transit_and_timing.md` — goods in transit, FOB/Incoterms, GRNI/GINR, period timing, "losing money" mechanisms
- `goods_receipt_and_matching.md` — GRN + three-way match
- `stock_transfer.md` — inter-storage transfer / reclass
- `inventory_write_off.md` — write-off mechanics
- `inventory_shrinkage.md` — shrinkage mechanics
- `credit_and_debit_notes.md` — debit note (buyer) vs credit note (supplier)
- `true_up_and_accruals.md` — accrual + auto-reversal + true-up discipline
- `contra_cogs_credit.md` — the gap-filling correcting entry
