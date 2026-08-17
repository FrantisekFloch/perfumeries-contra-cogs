# Definition: Inventory Write-Off

> **Status:** Draft v1. Readable in-tool.
> **Why it matters here:** When the gap is goods **received then damaged/incorrect/lost**, the receiver removes that value via a **write-off** — one of the ways a contra/COGS correction is officially booked. External content paraphrased for compliance; sources linked.

---

## Definition
An inventory write-off formally recognizes that some inventory has **lost its value** (loss, damage, deterioration, obsolescence) and is **no longer a saleable asset**. [freshbooks — inventory write-off](https://www.freshbooks.com/hub/accounting/inventory-write-off) It **removes items from the stock-on-hand list**. [unleashed — inventory write-offs](https://www.unleashedsoftware.com/blog/inventory-write-offs-everything-you-need-to-know/)

**Where the loss lands:** when inventory value is eliminated, the loss is recorded in a **contra account** or directly in **COGS**, depending on the write-off's significance; a **contra account shows both the original value and the reduced value**. [NetSuite — inventory write-off](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-write-off.shtml)

> **Write-off vs write-down:** a write-**off** eliminates value entirely (item unsaleable); a write-**down** reduces value when market value falls below book but the item is still sellable. [wallstreetprep — write-down](https://www.wallstreetprep.com/knowledge/inventory-write-down/)

---

## In the use case
If the 100 pieces were **received then found damaged/incorrect**, the receiver writes them off — removing 100 units of value from inventory. This is a **real loss** path (contrast with a stock transfer, which is not).

---

## How the tool uses this
- Resolution option **#3**: gap cause = "damaged/incorrect/lost after receipt" → record a write-off for the affected qty, choosing **contra account vs COGS** per materiality (see `contra_cogs_credit.md`).
- Attach evidence (damage report, disposal record) and link to the gap for audit.
- Capture materiality so small write-offs vs significant ones can route differently.

## Sources
- freshbooks — Inventory write-off (https://www.freshbooks.com/hub/accounting/inventory-write-off)
- unleashed — Inventory write-offs (https://www.unleashedsoftware.com/blog/inventory-write-offs-everything-you-need-to-know/)
- NetSuite — Inventory write-offs (contra account or COGS) (https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-write-off.shtml)
- wallstreetprep — Inventory write-down (https://www.wallstreetprep.com/knowledge/inventory-write-down/)
