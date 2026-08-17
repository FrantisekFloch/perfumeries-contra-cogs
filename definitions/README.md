# definitions/

Source-backed definitions that anchor the tool's logic, inputs, and outputs. Each file is scraped/synthesized from multiple public sources with inline citations, then refined with your domain knowledge.

**These are designed to be readable inside the tool** — so a user can open any option and understand it before choosing. Keep all of them: the tool must let the user **choose** among resolution paths, not hard-wire one.

## Confirmed perspective
Receiver (buyer) view. Contra COGS is **already in the invoice**. The receiver owns **many storages** and must **track goods → detect gap → fill it if needed**, keeping every resolution option available. Full framing in `glossary.md`.

## Index
- `glossary.md` — one-line glossary + the **resolution-option catalogue** (what the receiver can choose to do about a gap) + confirmed perspective.
- `official_process_sk.md` — **AUTHORITATIVE** company process (Slovak + English): two contra COGS models (direct line-item vs back-edge allowance), delivery notes, GR/RECADV matching, per-warehouse vs summary invoicing.
- `contra_cogs.md` — core definition, main vendor-allowance/rebate process, volume/tiered discounts, and the invoiced-vs-delivered gap + governance.
- `use_case_gap.md` — the 5,000-piece split-delivery worked example (4×1,000 + 1×900), the 100-piece investigation, and how the gap is officially filled.
- `use_case_timing.md` — cross-period (month-end) split delivery: deliveries landing across Jan/Feb, split debits, flagged missing value, and the "how am I losing money" investigation.
- `goods_in_transit_and_timing.md` — goods in transit, FOB/Incoterms (who bears transit loss), GRNI vs goods-invoiced-not-received (GINR), month-end accrual, and the three "losing money" mechanisms.
- `goods_receipt_and_matching.md` — Goods Receipt Note (GRN) + three-way match (PO ↔ GRN ↔ invoice); how the gap is detected across storages.
- `stock_transfer.md` — inter-storage transfer / reclass (no loss; no financial correction).
- `inventory_write_off.md` — removing damaged/incorrect/lost stock (contra account or COGS).
- `inventory_shrinkage.md` — count-vs-record mismatch adjustment.
- `credit_and_debit_notes.md` — debit note (buyer claims) vs credit note (supplier grants).
- `true_up_and_accruals.md` — holding the gap as an accrual and truing-up to actuals ("don't forget the gap").
- `contra_cogs_credit.md` — the umbrella "fill the gap" correcting entry and which mechanism applies when.

## Conventions
- Every claim cites its source (link) inline.
- External text is paraphrased for licensing compliance, never copied at length.
- Definitions are **drafts** until you confirm them against your actual process — see the "Open questions" sections.
