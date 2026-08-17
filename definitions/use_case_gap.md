# Use Case: Contra COGS Gap from a Split Delivery

> **Status:** Draft v1 — worked example that drives the tool's core logic.
> **Purpose:** Make the "invoiced ≠ delivered → contra COGS gap" scenario concrete, and document the *official* way the gap is filled with a correcting credit.
> **Compliance note:** External accounting mechanics below are paraphrased for licensing compliance; sources linked inline.

---

## 1. The scenario (as given)

- **Ordered & invoiced:** 5,000 pieces.
- **Discount tiers:** 1% for exactly 5,000 pieces; 1.5% if **over** 5,000.
- **Delivery split across 5 storage locations:**
  - Storage A: 1,000
  - Storage B: 1,000
  - Storage C: 1,000
  - Storage D: 1,000
  - Storage E: **900**
  - **Total received: 4,900 → shortfall of 100 pieces.**
- **Investigation trigger:** the missing 100 must be explained. Either:
  - **(i)** Storage E actually received 1,000 and **transferred 100** to another storage (an internal stock movement, not a real loss), **or**
  - **(ii)** the 100 were **never received / incorrect / damaged** (a real shortfall).

The outcome of that investigation determines whether a **contra COGS gap** is real and, if so, how it is closed.

---

## 2. Where the gap comes from

The contra COGS (the 1% purchase discount) was earned/calculated on the **invoiced 5,000**. But only **4,900** are confirmed received. Until the 100 is explained, the recognized contra COGS is **based on a quantity that isn't fully verified** — that difference is the **gap**.

Two things are actually at stake and must not be conflated:

| Item | What it is | Affected by the 100 pieces? |
|------|-----------|------------------------------|
| **Discount tier** | 5,000 → 1%. Still 5,000 ordered/invoiced, so the **tier stays 1%** (you're not *over* 5,000). Going *over* 5,000 would move it to 1.5%. | Tier unchanged in this case, but the tool must recompute if invoiced qty changes. |
| **Contra COGS base** | The cost reduction applies to goods actually received into inventory. If 100 are permanently missing, the contra COGS tied to those 100 is **overstated** and must be corrected. | Yes — this is the gap to fill. |

> The tool must keep these separate: **tier % is driven by invoiced/ordered volume**, while the **contra COGS amount is driven by verified received volume**.

---

## 3. Two resolution paths

### Path (i): 100 were transferred to another storage (no real loss)
- This is an **inter-warehouse stock transfer / inventory discrepancy between warehouse and system**, not a loss. [webgility — resolving inventory discrepancies](https://www.webgility.com/blog/how-do-you-resolve-inventory-discrepancies)
- Resolution: **reclassify** the 100 to the receiving storage so total received reconciles back to 5,000. **No contra COGS credit needed** — nothing was lost, only mislocated.
- Governance: the transfer must be documented (transfer note / corrected GRN) so the audit trail explains the 900 vs 1,000 at Storage E.

### Path (ii): 100 never received / incorrect / damaged (real shortfall)
- This is a genuine variance → the contra COGS on those 100 units must be corrected via a **credit**. See §4 for the official mechanism.

---

## 4. How the gap-filling credit is officially done

The user was unsure how the correcting "contra COGS credit" is formally recorded. Based on standard accounting practice, there are **two distinct mechanisms** depending on *whose* error caused the shortfall — the tool should support both.

### 4a. If it's a supplier short-ship / billing mismatch → correcting document from the supplier
Every supplier discrepancy has **one correct document** behind it (short delivery, overcharge, return, deposit refund); picking the wrong one breaks stock counts and month-end reconciliation. [supy.io — credit note vs GRN](https://supy.io/blog/learn-credit-note-vs-grn-supplier-discrepancy-guide)
- The supplier issues a **credit note / corrected invoice** for the 100 undelivered units, **or** re-ships them.
- This is a **true-up**: reconciling estimated/recorded amounts to actual figures, typically at period end. [taxdome — true-up](https://taxdome.com/blog/true-up-accounting) [mindspace — true-up](https://www.mindspaceoutsourcing.com/true-up-accounting/)
- In rebate systems, settlement recalculates the rebate on **cumulated actual volume** and creates a **rebate credit memo**. [SAP — rebate credit memo](https://apps.support.sap.com/sap/support/knowledge/en/2635168)

### 4b. If the goods were received then lost/damaged → inventory write-off (a contra entry)
When inventory value is eliminated, the loss is recorded either in a **contra account** or directly in **COGS**, depending on the write-off's significance; a contra account shows both the original value and the reduced value. [NetSuite — inventory write-off](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-write-off.shtml)
- **Damaged/incorrect (case ii):** book an **inventory write-off** — remove the 100 units from stock-on-hand. [unleashed — inventory write-offs](https://www.unleashedsoftware.com/blog/inventory-write-offs-everything-you-need-to-know/)
- **Count/record mismatch:** this is **inventory shrinkage** — actual on-hand is less than recorded — corrected with a shrinkage journal entry. [accountinginsights — shrinkage journal entry](https://accountinginsights.org/journal-entry-for-inventory-shrinkage-steps-and-accounting-impact/)

### 4c. The accrual/true-up discipline (how the gap is held until resolved)
- Hold the gap as an **accrual** (earned-but-not-received / estimate) and **auto-reverse** it: book the estimate in the closing period, post the opposite entry at the start of the next, and when the actual credit posts it nets against the reversal so the effect lands once, in the right period. [Stampli — auto-reversing accruals](https://www.stampli.com/resources/accrual-reversal-accuracy-audit/)
- Run a **monthly true-up**: compare each accrued item to the actual document received, compute variance by category, and feed misses back into next month's estimate. [Stampli](https://www.stampli.com/resources/accrual-reversal-accuracy-audit/)

> **What "create a contra COGS credit to fill the gap" means officially:** it is a **true-up correcting entry**. If the supplier owes it → a **credit note / rebate credit memo** reduces the amount payable (adjusting the contra COGS to verified volume). If the goods were received then lost → an **inventory write-off / shrinkage entry** removes the value. Either way the recognized contra COGS is corrected to match **verified received quantity**, and the correction is documented for audit.

---

## 5. What the tool must do with this (requirements seed)

1. **Track invoiced vs received per storage**, roll up to a total, and compute the **variance** (here: 5,000 vs 4,900 = 100).
2. **Highlight the gap and never let it drop** — persistent open flag, owner, and age until resolved (the "don't forget about it" requirement).
3. **Route the investigation** — prompt for the cause: transfer (reclass) vs shortfall (credit/write-off).
4. **Keep tier logic separate from contra base** — tier % from invoiced/ordered qty; contra amount from verified received qty.
5. **Generate/record the correcting action** — link the resolution document (transfer note, credit note, corrected invoice, or write-off) to the gap.
6. **Governance & audit trail** — status workflow (Open → Investigating → Resolved), evidence attached, true-up at period end, aging report of open gaps.

---

## 6. Open questions (confirm in `INTAKE.md`)
1. ✅ **Answered:** The **receiver (buyer)** owns the books. The contra COGS discount is **already in the invoice**. Both §4a (claim from supplier) and §4b (write-off) stay available — the tool must let the user **choose** per case.
2. ✅ **Answered:** It is a **purchase discount** (already applied on the invoice), **not** a rebate settled later. So the discount amount itself is fixed at invoice time; the accrual/true-up applies only to **holding an unresolved gap** until its correcting document lands — not to earning the discount.
3. What is the **unit of matching** — PO line, SKU, shipment, storage/GRN?
4. Where do **invoiced** and **received** quantities come from (which systems/feeds)?
5. What are the **materiality thresholds** and **approval levels** for writing off vs disputing a gap?
6. Is inventory tracked **per storage location** in the source system (needed for the split logic)?

## Sources
- webgility — Resolving inventory discrepancies (https://www.webgility.com/blog/how-do-you-resolve-inventory-discrepancies)
- supy.io — Credit note vs GRN / supplier discrepancy (https://supy.io/blog/learn-credit-note-vs-grn-supplier-discrepancy-guide)
- taxdome — True-up in accounting (https://taxdome.com/blog/true-up-accounting)
- mindspaceoutsourcing — True-up meaning (https://www.mindspaceoutsourcing.com/true-up-accounting/)
- SAP — Rebate credit memo on settlement (https://apps.support.sap.com/sap/support/knowledge/en/2635168)
- NetSuite — Inventory write-off (contra account or COGS) (https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-write-off.shtml)
- Unleashed — Inventory write-offs (https://www.unleashedsoftware.com/blog/inventory-write-offs-everything-you-need-to-know/)
- accountinginsights — Journal entry for inventory shrinkage (https://accountinginsights.org/journal-entry-for-inventory-shrinkage-steps-and-accounting-impact/)
- Stampli — Auto-reversing accruals & true-up (https://www.stampli.com/resources/accrual-reversal-accuracy-audit/)
