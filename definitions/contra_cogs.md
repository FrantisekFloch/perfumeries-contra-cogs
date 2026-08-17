# Definition: Contra COGS

> **Status:** Draft v1 — scraped from multiple public sources, paraphrased.
> **Purpose:** Establish a shared, source-backed definition so the tool's inputs and outputs are anchored to correct accounting logic.
> **Compliance note:** All external content below was rephrased/summarized for licensing compliance; sources are linked inline.

> **⭐ Confirmed perspective (drives everything):** This tool is for the **RECEIVER (buyer)**. The receiver **owns many storage locations**, and it is the receiver's responsibility to **track the goods across storages, detect any gap, and fill it if needed**. The tool must keep **all resolution options open** so the user can later choose the appropriate action per case. See `glossary.md` for the full resolution-option catalogue.

> **⭐⭐ AUTHORITATIVE process:** See `official_process_sk.md` (company-provided, Slovak jurisdiction). It defines **two contra COGS models** the tool must support:
> - **Model A — Direct / line-item:** net (discounted) unit price already on the per-warehouse invoice.
> - **Model B — Back-edge allowance:** goods at standard price; volume/marketing (Co-op) discount settled **monthly, in bulk, via credit note (dobropis)** against the **central delivery record** → this is where a **pending contra COGS credit** is held until cleared.
> Matching basis = **GR per warehouse via EDI RECADV** + **delivery note (target warehouse code)**. This supersedes any earlier "discount is fixed at invoice level" note (that was only Model A).

---

## 1. Core definition

**Contra COGS** (contra cost of goods sold) is an accounting mechanism that records reductions or recoveries related to COGS. Rather than lowering the COGS line directly, the reduction is booked to a separate offsetting account, so the reported figure is a **net COGS** (gross COGS minus the contra amount). [Quora — What is Contra COGS?](https://www.quora.com/What-is-Contra-COGS)

It is a type of **contra expense account**: an account paired with and offsetting a specific expense account. It carries a natural **credit balance** (the opposite of a normal expense account's debit balance). [AccountingTools — Contra expense definition](https://accountingtools.com/articles/contra-expense-definition-and-usage.html)

**Why book it separately instead of just reducing COGS?** To keep gross spend visible while tracking adjustments (rebates, reimbursements) on their own line. This improves transparency, audit trails, and variance analysis; directly netting it into COGS would hide the true level of spend. [AccountingTools](https://accountingtools.com/articles/contra-expense-definition-and-usage.html)

**Presentation:** the expense and its paired contra account are usually combined into a single line on the income statement, so readers may not see the contra account exists. [AccountingTools](https://accountingtools.com/articles/contra-expense-definition-and-usage.html)

### Related contra-expense types (all reduce cost of purchases/COGS)
- **Purchase discounts** — for early payment to suppliers.
- **Purchase returns & allowances** — returned inventory or price reductions for damaged/defective goods.
- **Vendor rebates** — refunds from suppliers after purchase, often tied to volume thresholds or promotions.
[AccountingTools](https://accountingtools.com/articles/contra-expense-definition-and-usage.html)

> **Boundary — don't confuse with contra revenue:** contra revenue (sales returns, trade discounts, volume rebates *owed to customers*) reduces the **top line**, never touches COGS or gross profit as an outflow. Contra COGS reduces the **cost** side. [parikh.financial — Contra revenue](https://www.parikh.financial/glossary/contra-revenue/)

---

## 2. Main process — vendor allowances / rebates that offset COGS

The dominant driver of contra COGS is **vendor-funded incentives**: allowances, credits, and rebates that suppliers/manufacturers give buyers, usually in exchange for volume commitments, promotions, or advertising. [Ryan — Vendor-funded incentives](https://ryan.com/about-ryan/news-and-insights/2016/vendor-funded-incentives-may-be-used-to-reduce-cost-of-goods-sold-for-texas-franchise-tax-purposes/)

Accounting principle: **discounts and allowances received on purchases are reductions of the cost to which they relate**; refunds of prior expense payments reduce the related expense. [42 CFR 413.98 (govinfo)](https://www.govinfo.gov/content/pkg/CFR-2013-title42-vol2/pdf/CFR-2013-title42-vol2-sec413-98.pdf)

**Typical flow (main path):**
1. Buyer purchases inventory from vendor at gross invoice cost → recorded in purchases/COGS.
2. A rebate/allowance is earned (per agreement) — for volume, promotion, early payment, freight, or damaged goods.
3. The earned amount is booked to a **contra COGS** account (credit), reducing net COGS.
4. Settlement arrives as a **supplier credit**, cash refund, or **deduction** against amounts owed.

---

## 3. Situational process A — more discount for more products (volume / tiered)

"More products → bigger discount" is a **volume rebate / volume discount**: suppliers grant price reductions once defined purchase volumes are reached; a core lever of strategic procurement. [tacto.ai — Volume Rebate](https://www.tacto.ai/en/procurement-glossary/volume-rebate) The per-unit price falls above a defined quantity threshold — the seller accepts lower per-unit margin for a larger total order. [vistaar — Volume Discount](https://www.vistaar.com/glossary/volume-discount)

**Common structures the tool must model:**
- **Tiered percentage rebate** — rate rises at each volume tier (illustrative: 1% above $500K, 2% above $1M, 3% above $2M). Actual rebate depends on the tier annual purchases reach. [finofo](https://www.finofo.com/blog/volume-rebates-earned-discounts-credits)
- **Hierarchical / incremental pricing** — incrementally lower prices at predefined thresholds for *additional* purchases. [revenuehub — Volume Discounts in ASC 606](https://www.revenuehub.org/article/volume-discounts)
- **Retrospective refunds** — once a threshold is hit, a partial refund applies to *earlier* purchases too. [revenuehub](https://www.revenuehub.org/article/volume-discounts)
- **Sliding-rate vs single-rate** — tiered bands each get their own rate (e.g., no discount on units 1–4, 10% on 5–10, 20% on 11–20). [Oracle — Creating Volume Discounts](https://docs.oracle.com/cd/F14158_13/books/PriceAdm/creating-volume-discounts.html) Volume-incentive adjustments can be based on amount, quantity, or weight, over multiple orders in a period. [Oracle JD Edwards](https://docs.oracle.com/en/applications/jd-edwards/customer-relationship/9.2/eoapg/understanding-volume-level-adjustments-for-procurement-release-9.html)

**Accounting nuance:** retrospective volume rebates are **variable consideration** — the final amount can change based on actual volume purchased, so estimates must be trued-up. [pitcher.com.au](https://www.pitcher.com.au/insights/accounting-for-customer-incentives-volume-rebates-and-loyalty-programs/)

**Implication for inputs/outputs:** the tool needs, per agreement: threshold definition, rate structure (tier bands + rates), calculation basis (qty / amount / weight), scope (which products/SKUs), period, and whether it applies prospectively or retrospectively.

---

## 4. Situational process B — invoiced ≠ delivered → the contra COGS gap

The scenario: **a quantity of units is invoiced, but not all are delivered**, opening a **contra COGS gap** that must be filled and governed.

### 4a. Why the gap exists
A **discrepancy** is a mismatch between what was ordered, received, and billed; partial shipments, unit-of-measure gaps, and price changes make it routine. [procuredesk](https://www.procuredesk.com/how-manufacturers-handle-vendor-invoice-discrepancies/) Without a receipt capturing the true received quantity, you only have the vendor's number — and **short-ships get paid in full**. [Stampli — partial receipts](https://www.stampli.com/resources/partial-receipts-receiving-exceptions/)

If a rebate/contra amount was calculated on **invoiced** volume but only part was **delivered**, the earned contra COGS is overstated until reconciled — the "gap."

### 4b. The accrual mechanism (how the gap is held)
A **rebate accrual** is the value of rebates **earned but not yet received** (for customer rebates, owed but not yet paid). [Enable — rebate accruals](https://www.enable.com/resources/articles/year-end-revenue-recognition-rebate-accruals/) The accrual tracks earned-but-unreceived rebates based on billing documents like invoices and credit memos. [SAP Vendor Rebates (Scribd)](https://www.scribd.com/document/618352199/SAP-Vendor-Rebates) Under ASC 606 these are **variable consideration**; accurate accrual prevents misstatement. [level6 — Distributor rebate accrual](https://www.level6.com/blog/distributor-rebate-accrual/)

So the gap is initially carried as an **accrual / receivable from vendor**, then trued-up to actuals.

### 4c. Filling the gap — correct document per case
Every supplier discrepancy has one correct document behind it — short delivery, overcharge, return, or deposit refund — and picking the wrong one quietly breaks stock counts and month-end reconciliation. [supy.io — credit note vs GRN](https://supy.io/blog/learn-credit-note-vs-grn-supplier-discrepancy-guide) Recommended handling for a short shipment: hold the disputed portion, pay only for what arrived (if partial payment is allowed), and route the variance to the buyer to resolve with the vendor via credit, reshipment, or corrected invoice. [Stampli](https://www.stampli.com/resources/partial-receipts-receiving-exceptions/)

### 4d. Governance
- **Reconciliation** — match ordered vs received vs billed; find payments posted incorrectly, duplicated invoices, unapplied credit memos, or missing write-offs before they compound. [alguna — reconciling AR](https://blog.alguna.com/reconciling-accounts-receivable/) [beancount.io — invoice reconciliation](https://beancount.io/blog/2026/04/24/invoice-reconciliation-complete-guide-process-best-practices)
- **Dispute / true-up** — where invoiced volume is challenged (short/damaged), the variance is formally disputed and resolved via a corrected invoice, credit note, or write-off before the contra amount is finalized. [supy.io — supplier discrepancy](https://supy.io/blog/learn-credit-note-vs-grn-supplier-discrepancy-guide)

### 4e. Governance controls the tool should enforce
- Track each gap with: invoiced qty, delivered/received qty, variance, contra amount at risk, status, owner, and resolution document.
- Age the open gaps; flag ones nearing dispute deadlines/waiting periods.
- Keep an audit trail from accrual → true-up → settlement.
- Separate **earned** (delivered) from **accrued/estimated** (invoiced-not-delivered) contra COGS so net COGS isn't overstated.

---

## 5. Working definition for the tool (synthesized)

> **Contra COGS** = any vendor-side reduction to cost of goods sold, booked to an offsetting (credit-balance) account so reported COGS is shown net. It arises mainly from **vendor allowances/rebates** (volume, promotional, freight, damaged-goods). Two situations drive the tool's logic:
> 1. **Volume/tiered incentives** — larger purchase volumes unlock larger discounts (tiered %, incremental pricing, retrospective refunds), often variable consideration requiring true-up.
> 2. **Invoiced-vs-delivered gap** — when contra amounts are computed on invoiced units but not all units are delivered, the difference is carried as an **accrual/receivable**, must be **filled** via the correct document (credit note, corrected invoice, reshipment, or write-off), and **governed** via reconciliation, dispute/true-up workflows, aging, and audit trail.

---

## 6. Open questions to confirm before building
These shape the data model and I/O — answer in `INTAKE.md`:
1. ✅ **Answered:** Receiver/buyer perspective; contra COGS already incorporated in the received invoice.
2. ✅ **Answered:** It is a **purchase discount** applied upfront on the invoice (known, not estimated). The discount is fixed at invoice time; only the **gap correction** may be accrued/trued-up until resolved.
3. What's the **matching key** — PO, SKU/ASIN, shipment, invoice line?
4. What systems provide invoiced vs delivered quantities (feeds for the gap calc)?
5. What are the **governance thresholds** (materiality, dispute deadlines, approval levels)?

## Sources
- Quora — What is Contra COGS? (https://www.quora.com/What-is-Contra-COGS)
- AccountingTools — Contra expense definition (https://accountingtools.com/articles/contra-expense-definition-and-usage.html)
- parikh.financial — Contra revenue (https://www.parikh.financial/glossary/contra-revenue/)
- Ryan — Vendor-funded incentives / TX franchise tax (https://ryan.com/about-ryan/news-and-insights/2016/vendor-funded-incentives-may-be-used-to-reduce-cost-of-goods-sold-for-texas-franchise-tax-purposes/)
- 42 CFR 413.98 (https://www.govinfo.gov/content/pkg/CFR-2013-title42-vol2/pdf/CFR-2013-title42-vol2-sec413-98.pdf)
- tacto.ai — Volume Rebate (https://www.tacto.ai/en/procurement-glossary/volume-rebate)
- vistaar — Volume Discount (https://www.vistaar.com/glossary/volume-discount)
- finofo — Volume rebates / supplier credits (https://www.finofo.com/blog/volume-rebates-earned-discounts-credits)
- revenuehub — Volume Discounts in ASC 606 (https://www.revenuehub.org/article/volume-discounts)
- Oracle — Creating Volume Discounts (https://docs.oracle.com/cd/F14158_13/books/PriceAdm/creating-volume-discounts.html)
- Oracle JD Edwards — Volume-Level Adjustments (https://docs.oracle.com/en/applications/jd-edwards/customer-relationship/9.2/eoapg/understanding-volume-level-adjustments-for-procurement-release-9.html)
- pitcher.com.au — Accounting for customer incentives (https://www.pitcher.com.au/insights/accounting-for-customer-incentives-volume-rebates-and-loyalty-programs/)
- Enable — Year-end rebate accruals (https://www.enable.com/resources/articles/year-end-revenue-recognition-rebate-accruals/)
- SAP Vendor Rebates (https://www.scribd.com/document/618352199/SAP-Vendor-Rebates)
- level6 — Distributor rebate accrual (https://www.level6.com/blog/distributor-rebate-accrual/)
- procuredesk — Vendor invoice discrepancies (https://www.procuredesk.com/how-manufacturers-handle-vendor-invoice-discrepancies/)
- Stampli — Partial receipts / receiving exceptions (https://www.stampli.com/resources/partial-receipts-receiving-exceptions/)
- supy.io — Credit note vs GRN (https://supy.io/blog/learn-credit-note-vs-grn-supplier-discrepancy-guide)
- alguna — Reconciling accounts receivable (https://blog.alguna.com/reconciling-accounts-receivable/)
- beancount.io — Invoice reconciliation (https://beancount.io/blog/2026/04/24/invoice-reconciliation-complete-guide-process-best-practices)
