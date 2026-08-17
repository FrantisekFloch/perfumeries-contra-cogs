# Definition: Goods Receipt Note (GRN) & Three-Way Match

> **Status:** Draft v1. Readable in-tool.
> **Why it matters here:** For the receiver, the GRN is the **"received" truth** per storage, and the three-way match is the control that surfaces the contra COGS gap. External content paraphrased for compliance; sources linked.

---

## Goods Receipt Note (GRN)
The GRN documents what was **physically received** at a location. Beyond recording delivery, it acts as a **control point between procurement and accounts payable**, and is one of the three documents used in 3-way matching alongside the PO and supplier invoice, so payment is only issued for goods properly received. [ramp — goods receipt](https://ramp.com/blog/accounts-payable/goods-receipt)

**Receiver relevance:** with **many storages**, each storage's GRN is a separate "received" record. Summing GRNs across storages gives total received — the number compared against the invoiced quantity to expose a gap (in the use case: 4×1,000 + 900 = 4,900 vs 5,000 invoiced).

---

## Three-way match
An **accounts payable control** that verifies a vendor invoice against the **purchase order (PO)** and the **goods receipt note (GRN)** before payment is released — so you pay only for what was ordered, received, and agreed. [corpay — three-way matching](https://www.corpay.com/resources/blog/three-way-matching) The check typically covers the PO reference, **quantity**, unit price, and totals. [codebridge — 3-way match](https://www.codebridge.tech/articles/3-way-match-accounts-payable)

When all three align, it validates that the expected goods were received at the agreed price, avoiding payment for unrequested items, overcharges, or goods never received. [paylocity — three-way matching](https://www.paylocity.com/resources/learn/articles/three-way-matching/)

**The three documents:**
1. **Purchase Order (PO)** — what was ordered/authorized.
2. **Goods Receipt Note (GRN) / receiving report** — what was received.
3. **Invoice** — what is billed (with contra COGS already applied, in our case).
[sage — 3-way matching](https://www.sage.com/en-us/blog/3-way-matching-in-accounts-payable/) [procurementtactics — three-way matching](https://procurementtactics.com/three-way-matching/)

---

## How the tool uses this
- **Match key:** PO/invoice line ↔ GRN(s) across storages ↔ invoiced qty.
- **Gap detection:** `invoiced_qty − Σ(received_qty per storage) = variance`. A non-zero variance opens a gap.
- **Contra impact:** the contra COGS in the invoice is justified only up to **matched received qty**; the variance is the amount at risk.

## Sources
- corpay — Three-way matching (https://www.corpay.com/resources/blog/three-way-matching)
- ramp — Goods receipt / 3-way matching (https://ramp.com/blog/accounts-payable/goods-receipt)
- codebridge — 3-way match in AP (https://www.codebridge.tech/articles/3-way-match-accounts-payable)
- paylocity — Importance of three-way matching (https://www.paylocity.com/resources/learn/articles/three-way-matching/)
- sage — 3-way matching in AP (https://www.sage.com/en-us/blog/3-way-matching-in-accounts-payable/)
- procurementtactics — Three-way matching (https://procurementtactics.com/three-way-matching/)
