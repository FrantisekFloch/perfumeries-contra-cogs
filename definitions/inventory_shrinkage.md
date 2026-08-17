# Definition: Inventory Shrinkage

> **Status:** Draft v1. Readable in-tool.
> **Why it matters here:** When a storage's **recorded** stock exceeds **actual** on-hand and the cause is unclear, the receiver corrects it as **shrinkage**. External content paraphrased for compliance; sources linked.

---

## Definition
Inventory shrinkage is the **discrepancy between recorded inventory levels and the actual physical inventory** on hand. [unleashed — inventory shrinkage](https://www.unleashedsoftware.com/blog/inventory-shrinkage/) It occurs when actual on-hand is **less than what's recorded**, stemming from theft, damage, obsolescence, or counting/record-keeping errors. [accountinginsights — shrinkage journal entry](https://accountinginsights.org/journal-entry-for-inventory-shrinkage-steps-and-accounting-impact/)

It is corrected with a **shrinkage journal entry** that reduces recorded inventory to match the physical count.

---

## Shrinkage vs write-off (how the tool distinguishes)
- **Write-off** → a **specific, identified** quantity is lost/damaged (you know which 100 units and why). See `inventory_write_off.md`.
- **Shrinkage** → a **count-vs-record mismatch** where the specific cause may be unknown; corrected during stock counts.

In the use case, if the 100 can't be pinned to a transfer or a specific damage event and only shows up as a count difference, it is treated as **shrinkage**.

---

## How the tool uses this
- Resolution option **#4**: gap cause = "count/record mismatch, cause unclear" → record a shrinkage adjustment for the variance.
- Prompt for a physical-count reference and reason (if known) to preserve the audit trail.
- Feed shrinkage frequency by storage into governance reporting (recurring shrinkage at one storage is a control signal).

## Sources
- unleashed — Inventory shrinkage (https://www.unleashedsoftware.com/blog/inventory-shrinkage/)
- accountinginsights — Journal entry for inventory shrinkage (https://accountinginsights.org/journal-entry-for-inventory-shrinkage-steps-and-accounting-impact/)
