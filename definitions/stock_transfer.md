# Definition: Stock Transfer / Reclass (Inter-Storage)

> **Status:** Draft v1. Readable in-tool.
> **Why it matters here:** The receiver owns **many storages**. If a gap is caused by goods **moved between the receiver's own storages**, it is **not a loss** — no contra COGS credit is needed, only a relocation record. External content paraphrased for compliance; sources linked.

---

## Definition
A stock transfer (inter-warehouse transfer / reclass) is moving inventory between locations the receiver controls. The related issue is an **inventory discrepancy between the warehouse and the system** — the physical location differs from what the system records — which is resolved by correcting the records, not by writing off value. [webgility — resolving inventory discrepancies](https://www.webgility.com/blog/how-do-you-resolve-inventory-discrepancies)

Because total owned quantity is unchanged, there is **no gain or loss** — the correction is a **reclassification** across locations so each storage's on-hand reflects reality and the total reconciles back to the invoiced/received quantity.

---

## In the use case
If Storage E actually received 1,000 and sent 100 to another storage, the "900" is only a **location** issue. Resolution:
- Record the **transfer** from Storage E to the receiving storage (transfer note / corrected GRN).
- Total received returns to 5,000 → **no contra COGS gap remains**.
- Keep documentation so the 900-vs-1,000 at Storage E is explained for audit.

---

## How the tool uses this
- Resolution option **#1**: mark gap cause = "inter-storage transfer", capture source/destination storage + qty, attach the transfer document.
- After a transfer resolves the variance, the gap closes with **no financial correction** (distinct from write-off/shrinkage which do hit the books).
- If a transfer only **partially** explains the variance, the remainder stays open for another option.

## Sources
- webgility — How to resolve inventory discrepancies between warehouse & system (https://www.webgility.com/blog/how-do-you-resolve-inventory-discrepancies)
