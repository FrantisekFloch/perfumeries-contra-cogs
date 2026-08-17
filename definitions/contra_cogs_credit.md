# Definition: Contra COGS Credit / Correcting Entry (Filling the Gap)

> **Status:** Draft v1. Readable in-tool.
> **Why it matters here:** This is the entry that **fills the gap** — aligning the contra COGS (already in the invoice) to **verified received quantity**. It's an umbrella for the specific mechanisms; the receiver chooses which applies. External content paraphrased for compliance; sources linked.

---

## What "create a contra COGS credit to fill the gap" means officially
There is **no single universal document** called a "contra COGS credit." In practice it is a **true-up correcting entry** whose exact form depends on the cause of the gap. The recognized contra COGS is corrected so it matches the **verified received quantity**, and the correction is documented for audit.

The correcting entry takes one of these forms:

| Cause | Correcting mechanism | Detail |
|-------|---------------------|--------|
| Supplier short-ship / over-bill | **Debit note → supplier credit note** reduces amount payable | `credit_and_debit_notes.md` |
| Received then damaged/incorrect/lost | **Inventory write-off** (contra account or COGS by materiality) | `inventory_write_off.md` |
| Count vs record mismatch | **Shrinkage adjustment** | `inventory_shrinkage.md` |
| Goods only relocated | **Stock transfer / reclass** (no financial correction) | `stock_transfer.md` |
| Not yet resolved at close | **Accrue, then true-up** when actuals land | `true_up_and_accruals.md` |

---

## Supporting basis
- Discounts/allowances received on purchases are **reductions of the cost to which they relate**; refunds of prior expense reduce that expense. [42 CFR 413.98](https://www.govinfo.gov/content/pkg/CFR-2013-title42-vol2/pdf/CFR-2013-title42-vol2-sec413-98.pdf) → so the contra COGS must track the cost of goods **actually received**.
- Inventory value elimination is booked to a **contra account or COGS** depending on significance; the contra account preserves both original and reduced value. [NetSuite — inventory write-off](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-write-off.shtml)
- In rebate systems, settlement recalculates on **actual cumulated volume** and creates a **credit memo**. [SAP — rebate credit memo](https://apps.support.sap.com/sap/support/knowledge/en/2635168)
- The whole correction is a **true-up** to actuals. [taxdome — true-up](https://taxdome.com/blog/true-up-accounting)

---

## Key rule for the tool
> **Discount tier % is driven by invoiced/ordered quantity; the contra COGS *amount* is driven by verified received quantity.** The correcting entry closes the difference between the two. Keep these two computations separate (see `use_case_gap.md` §2).

## How the tool uses this
- Resolution option **#6**: after the cause is set, generate/record the matching correcting entry and link the evidence document.
- Store: gap amount, chosen mechanism, correcting-entry reference, approver, date — a complete audit trail from detection → accrual → true-up → settlement.
- Never auto-book without the user's choice — the tool **proposes**, the user **selects** (per the "keep all options open" principle).

## Sources
- 42 CFR 413.98 (https://www.govinfo.gov/content/pkg/CFR-2013-title42-vol2/pdf/CFR-2013-title42-vol2-sec413-98.pdf)
- NetSuite — Inventory write-off (https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-write-off.shtml)
- SAP — Rebate credit memo on settlement (https://apps.support.sap.com/sap/support/knowledge/en/2635168)
- taxdome — True-up in accounting (https://taxdome.com/blog/true-up-accounting)
