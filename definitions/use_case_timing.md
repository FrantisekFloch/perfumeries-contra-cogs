# Use Case: Cross-Period Split Delivery (Month-End Timing)

> **Status:** Draft v1. Companion to `use_case_gap.md`, focused on **timing across a period boundary**.
> **Perspective:** Receiver (buyer). Contra COGS = purchase discount already on the invoice. Concepts defined in `goods_in_transit_and_timing.md`.

---

## 1. The scenario (as given)
- **27.01.2026** — supplier ships goods from the manufactory to **multiple storages across the country**; invoice generated at ship-out.
- **28.01.2026** — buyer receives the **invoice**.
- Goods arrive on **different days**:
  - Some **30.01** and **31.01** (still January).
  - Some **02.02, 04.02, 05.02** (February) — including a shipment that went to the **wrong store** and had to be **redirected**.
- **Month-end problem:** in January the buyer received only **part** of the goods.

## 2. The split-debit consequence
- **January:** buyer records/settles the portion received in January → raises a **debit for that amount**.
- **February:** the remaining deliveries land → a **second debit** goes out for those amounts.
- **Still-missing portion:** flagged as **"value missing — locate"**, kept open until found/resolved.

## 3. The confusing example (investigated)
- Invoice: **10,500**. Received (Jan): **10,000**. Buyer raised a **debit for 10,000**. Buyer still owes **10,500**.
- Buyer's question: *"I'll pay the 500 once I find the goods, so where's the loss?"*

**Answer (summary — full reasoning in `goods_in_transit_and_timing.md` §5):**
- If the 500 of goods **arrive** and you pay 10,500 for 10,500 of goods → **no loss**; that's correct payment.
- You **lose money** only if a risk crystallizes:
  - **A — Discount forfeiture:** ❌ **not applicable here** — the discount is **fixed at invoice level**, so a shortfall doesn't change the rate.
  - **B — In-transit loss (FOB shipping point): ✅ the real exposure** — terms are FOB shipping point, so risk passed at ship-out; if the 500 is never found, you paid for goods you never physically get → 500 real loss.
  - **C — Books misstatement:** if you **debit away** the 500 instead of carrying it as goods-in-transit, the value can be double-counted or lost track of at reconciliation.
- **Correct handling:** keep the **full 10,500 liability**, carry the **500 as goods-in-transit (GINR)**, **flag it to locate**, settle when it lands. Don't reduce the obligation to 10,000.

> **✅ Resolved:** Incoterms = **FOB shipping point**; discount = **fixed at invoice level**. So the exposure is **B + C**, both mitigated by flagging and correctly accruing the missing value.

## 4. What the tool must do (requirements seed)
1. Store **receipt date per storage line**, separate from **invoice date** and **ship date**.
2. Detect invoices whose receipts **straddle a month/period boundary**.
3. Support **split debits across periods** (Jan portion, Feb portion) tied to one invoice.
4. Carry unreceived value as a **GINR accrual** and **flag "value missing — locate"** with age + owner — never auto-net into a reduced liability.
5. **Discount-threshold warning:** flag when a shortfall risks dropping below a discount tier (Mechanism A).
6. Capture **Incoterms** per order (drives Mechanism B / who owns the loss).
7. Handle **misrouted → redirected** deliveries (a receipt at the wrong storage that later moves to the right one) without double counting.
8. Full audit trail: ship date → invoice → receipts by storage/date → Jan debit → Feb debit → remaining flagged value → resolution.

## 5. Open questions (for design)
1. What are the typical **Incoterms** (FOB shipping point vs destination)?
2. Is the purchase discount **conditional on hitting a volume/value threshold**, or fixed once invoiced?
3. Do storage reports carry a reliable **receipt date** and **storage id** per line?
4. How are **misroutes** identified in the storage data (wrong-store receipt + transfer)?
5. What is the **period-close cadence** (calendar month?) and cutoff rule for "received in period"?

## Sources
See `goods_in_transit_and_timing.md` for the full source list (FOB/Incoterms, GRNI/GINR, month-end accrual).
