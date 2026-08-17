# Definition: Goods in Transit, Period Timing & "Losing Money"

> **Status:** Draft v1. Readable in-tool.
> **Why it matters here:** Split deliveries arrive across **different days and across month-end**, so part of an invoice is received in one period and part in the next. This creates timing gaps, split debits, and a real risk of **losing money**. External content paraphrased for compliance; sources linked.
> **Accuracy note:** The "losing money" outcome depends on two facts the tool must capture — **shipping terms (Incoterms)** and **discount conditionality**. Reasoning below is from general accounting principles; confirm these two per supplier.

---

## 1. The timing problem
Goods ship on one date, the invoice is issued at shipment, and the physical goods land at many storages on **different, later dates** — some before month-end, some after (and some misrouted, then redirected). So at close, only **part** of one invoice is verified as received.

**Goods in transit** are inventory that has left the seller but not yet arrived at the buyer. Who owns them (and bears loss) in transit is set by the shipping terms — see §2.

---

## 2. Who owns / bears the risk in transit — Incoterms (FOB)
Shipping terms define the point in the supply chain where the buyer or seller becomes **liable** for the goods, determining ownership, risk, and freight responsibility. [investopedia — FOB](https://www.investopedia.com/terms/f/fob.asp/)

- **FOB shipping point (a.k.a. FOB origin / Ex Works):** title and responsibility pass to the **buyer at the point of shipment**. [skynova — FOB accounting](https://www.skynova.com/learn/invoicing/fob-accounting) If goods are **damaged or lost in transit, the buyer bears that risk**. [jackcooper — FOB explained](https://www.jackcooper.com/fob-shipping-point-vs-fob-destination-explained/) → the in-transit goods are **already the buyer's inventory and liability**.
- **FOB destination:** the seller keeps responsibility until goods **reach the buyer**; while in transit the transfer is **not complete**, so the buyer records inventory only **on arrival**, and if goods are lost before delivery the **seller** carries the risk. [fiveable — FOB destination](https://fiveable.me/financial-accounting/key-terms/fob-destination)

> **This is the crux of "losing money":** under **FOB shipping point**, missing in-transit goods are the buyer's loss; under **FOB destination**, they're the seller's until delivered.

---

## 3. The month-end accrual mechanism (timing differences)
**Goods received but not invoiced (GRNI)** and **goods invoiced but not received (GINR / goods in transit)** are common timing differences between the physical flow and the invoice records; accounting treats them as **accruals/deferrals** to present a correct position and match periods. [Quora — GRNI vs invoiced not received](https://www.quora.com/What-is-the-accounting-for-goods-received-but-not-yet-invoiced-and-goods-invoiced-but-not-yet-received)

- **GRNI / GR-IR / goods-in-transit account** — a temporary clearing/liability account bridging the moment goods are received and the moment the invoice is processed; it clears to zero per line when receipt and invoice match. [qoblex — GR/IR explained](https://qoblex.com/blog/gr-ir-explained-reconciling-goods-receipts-and-supplier-invoices/) [stampli — GR/IR reconciliation](https://www.stampli.com/resources/grir-reconciliation/)
- It exists precisely because **goods may arrive on day 28 while the invoice arrives on day 5 of the next month** (or vice-versa). [tranquilbs — GRNI](https://www.tranquilbs.com/goods-received-not-invoiced/)
- **Our case is the mirror:** invoice is here, goods are **not yet received** → this is **goods invoiced not received (GINR)**. The unreceived value must be carried (accrued) and **flagged**, then cleared when the goods land. [planergy — GRNI reconciliation](https://planergy.com/blog/grni-reconciliation-process-benefits/)

---

## 4. Split debit across periods (Jan / Feb)
Because deliveries straddle month-end:
- **January close:** only part received (e.g., worth 10,000 of a 10,500 invoice). Record/settle what's verified; carry the **unreceived remainder as goods-in-transit (GINR), flagged**, not written off.
- **February:** as the remaining deliveries land (02/04/05 Feb) and any misroutes are redirected, clear the accrual and process the **second debit** for those amounts.
- **Never-arrived portion:** stays **flagged as "value missing — locate"** until found or formally resolved (write-off / supplier claim).

---

## 5. "How am I losing money?" — investigation
Scenario as given: invoice **10,500**, received **10,000**, buyer raised a **debit for 10,000**, but owes **10,500**; supplier says the delivery is costing the buyer money.

**Key point:** if the goods are eventually found and you pay 10,500 for 10,500 of goods, you are **not** losing money — that's just correct payment. The warning is about **risks the split/cross-period delivery makes likely**. Money is actually lost only if one of these crystallizes:

**Mechanism A — Volume-threshold discount forfeiture.** ❌ **Ruled out for this project.** The discount here is **fixed at invoice level** (not conditional on hitting a volume threshold), so a shortfall does **not** change the discount rate. Kept for reference only. (General case: if a discount were threshold-conditional, a shortfall dropping below the tier would forfeit the rate — but that is not our situation.)

**Mechanism B — In-transit loss under FOB shipping point. ✅ This is the real exposure here.** Terms are **FOB shipping point**, so title/risk passed to the buyer at ship-out (§2) — the missing 500 is **already your inventory**. If it's never found, you still owe/pay 10,500 but only physically hold 10,000 → **500 real loss** of goods you paid for. This is why the missing value must be flagged and chased, not forgotten.

**Mechanism C — Books misstatement / forgotten value.** If you **debit away** the 500 (reduce what you owe to 10,000) instead of carrying it as goods-in-transit, you remove value that may still be yours. Then either you still get billed/pay the 500 later (and the earlier debit has to be reversed), or the 500 becomes an **unexplained loss** at reconciliation. This is why the remainder must be **flagged and tracked**, not netted away.

**So the correct handling:** don't reduce the liability to 10,000. Keep the **full 10,500 obligation**, record the **500 as goods-in-transit / GINR**, **flag it to locate**, and settle it when the goods arrive. You pay 10,500 because you are receiving (or contractually responsible for) 10,500 of goods. You "lose money" only via A, B, or C — all of which the flag + correct accrual are designed to **prevent**.

> **✅ Resolved for this project:** Incoterms = **FOB shipping point** (buyer bears transit loss → Mechanism B applies). Discount = **fixed at invoice level** (not threshold-conditional → Mechanism A does not apply). So the loss risk is **B (lost in-transit goods you paid for)** and **C (mishandled/forgotten value)** — both mitigated by flagging and correctly accruing the missing value.

---

## 6. How the tool uses this
- Track a **delivery/receipt date per storage line**, independent of the invoice date.
- Detect when an invoice's receipts **straddle a period boundary**; carry the unreceived value as a **GINR accrual** and support **split debits** across months.
- **Flag "value missing — locate"** for any invoiced-not-received remainder, with age and owner; never auto-net it into a reduced liability.
- Compute **discount-threshold exposure**: warn if a shortfall risks dropping below a discount tier (Mechanism A).
- Capture **Incoterms** per order to know who bears in-transit loss (Mechanism B).
- Keep the audit trail: Jan debit, Feb debit, remaining flagged value, and final resolution.

## Sources
- investopedia — FOB / liability in shipping (https://www.investopedia.com/terms/f/fob.asp/)
- skynova — FOB accounting (shipping point vs destination) (https://www.skynova.com/learn/invoicing/fob-accounting)
- jackcooper — FOB shipping point vs destination (buyer bears transit risk) (https://www.jackcooper.com/fob-shipping-point-vs-fob-destination-explained/)
- fiveable — FOB destination (seller bears risk until delivery) (https://fiveable.me/financial-accounting/key-terms/fob-destination)
- Quora — GRNI vs goods invoiced not received (https://www.quora.com/What-is-the-accounting-for-goods-received-but-not-yet-invoiced-and-goods-invoiced-but-not-yet-received)
- qoblex — GR/IR / goods-in-transit account (https://qoblex.com/blog/gr-ir-explained-reconciling-goods-receipts-and-supplier-invoices/)
- stampli — GR/IR reconciliation (https://www.stampli.com/resources/grir-reconciliation/)
- tranquilbs — Goods received not invoiced (day 28 vs day 5) (https://www.tranquilbs.com/goods-received-not-invoiced/)
- planergy — GRNI reconciliation (current liability until invoice) (https://planergy.com/blog/grni-reconciliation-process-benefits/)
