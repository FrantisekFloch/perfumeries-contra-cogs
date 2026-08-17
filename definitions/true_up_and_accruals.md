# Definition: Accruals & True-Up

> **Status:** Draft v1. Readable in-tool.
> **Why it matters here:** A gap is rarely resolved instantly. The receiver **holds** it as an accrual and **trues it up** to actuals — this is the "don't forget the gap" discipline. External content paraphrased for compliance; sources linked.

---

## Accrual
An accrual records an amount that is **earned/owed but not yet settled** (for rebates: earned but not yet received; for costs: incurred but not yet invoiced). It keeps the estimate on the books in the correct period until the actual document arrives.

**Auto-reversing accrual:** books the estimated amount in the closing period and **automatically posts the opposite entry at the start of the next period**; when the actual posts, it **nets against the reversal** so the effect lands **once, in the right period**. [Stampli — auto-reversing accruals](https://www.stampli.com/resources/accrual-reversal-accuracy-audit/)

---

## True-up
A **true-up** reconciles **estimated or inaccurate amounts with actual, up-to-date figures**, typically at the end of an accounting period (quarter/year). [taxdome — true-up](https://taxdome.com/blog/true-up-accounting) It fixes cases where a transaction was recorded in one period but belongs to another, or where an estimate differed from actual. [mindspace — true-up](https://www.mindspaceoutsourcing.com/true-up-accounting/)

**Discipline:** run a **monthly true-up** — for each accrued item, compare accrual vs the actual document received, compute variance by category, and feed the misses back into next month's estimate. [Stampli](https://www.stampli.com/resources/accrual-reversal-accuracy-audit/)

---

## In the use case
> **Note:** The discount is a **purchase discount already applied on the invoice** (not a rebate settled later), so the discount amount itself is **not** accrued. What gets accrued is only the **unresolved gap correction** — the amount at risk until its resolution document lands.

Until the 100-piece investigation concludes, the contra COGS gap is **held as an accrual** (the amount at risk). When the resolution document lands (transfer note, debit/credit note, or write-off), the accrual is **trued-up** and the effect settles once, in the correct period.

---

## How the tool uses this
- Resolution option **#5**: at period close, unresolved gaps are **accrued** and flagged for **true-up** next period.
- Maintain an **estimate-vs-actual** log per gap so systematic bias is visible.
- Aging + reminders ensure no accrued gap is silently forgotten (ties to governance in `contra_cogs.md` §4e).

## Sources
- Stampli — Auto-reversing accruals & true-up accuracy (https://www.stampli.com/resources/accrual-reversal-accuracy-audit/)
- taxdome — True-up in accounting (https://taxdome.com/blog/true-up-accounting)
- mindspaceoutsourcing — True-up meaning (https://www.mindspaceoutsourcing.com/true-up-accounting/)
