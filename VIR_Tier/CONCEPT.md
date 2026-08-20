# VIR_Tier — Concept & Process Map (Draft for confirmation)

> **Status:** DRAFT v0 — awaiting user confirmation before any spec/code work.
> **Source of truth:** `Perfumeries/PErfumeries.pptx` (slides 1–3) + user answers (session 2026-08-19).
> **Relationship to existing tool:** This is a **new, standalone sub-tool** living in `Perfumeries/VIR_Tier/`. The existing Contra COGS reconciliation tool in `Perfumeries/build/` is **kept as-is** (may be reused later). VIR_Tier does not depend on it.

---

## 1. What VIR_Tier is, in one line
Detect **under-claimed Contra COGS (CCOGS)** caused by operational events the current process misses, and **generate supplementing charges** (debit-note/claim style) that get **injected into the buyer's billing** so the buyer recovers the full rebate entitlement (the correct VIR tier) from the supplier.

## 2. The reframe (vs. the old tool)
| | Old tool (`build/`) | **New VIR_Tier** |
|---|---|---|
| Posture | Defensive — "was contra on the invoice justified by receipts?" | **Offensive — "am I under-claiming what the supplier owes me?"** |
| Core question | Invoice vs. delivery gap | **Missed VIR tier → CCOGS leakage → recover it** |
| Output | Governed gap to closure | **Supplementing charge injected into buyer billing** |
| Geography | Slovakia only | **SK + PL + CZ, with pan-EU aggregation** |
| Direction of money | Buyer verifies what it pays | **Buyer claims more back from supplier** |

---

## 3. Process map — CURRENT (Slide 2, the problem)

```
Manufacturing / suppliers
        │  (many-to-many: factories cross-load onto trucks)
        ▼
     Transport
        │
        ▼
  Receiving process
        │
        ▼
 Buyer warehouses ──► SK
                 ──► PL
                 ──► CZ
        │ (all three feed operational data forward)
        ▼
 ┌─────────────────────────────┐
 │  "Missing data" (not captured / not fed to the rebate calc):
 │   • Return rejections
 │   • Overage shipments
 │   • Backordering
 │   • Late shipments
 │   • Pan-EU shipments
 │   ⇒ CAUSING MISSED VIR TIER
 └─────────────────────────────┘
        │
        ▼
   CCOGS Engine   ── (computes rebate on incomplete data)
        │
        ▼
  Undervalued CCOGS invoices & debit notes  =  CCOGS LEAKAGE
        │
        └──(loops back into the process, uncorrected)
```

**Root cause:** the CCOGS Engine computes the rebate on **incomplete volume data**. Because five operational event types aren't consolidated correctly, the buyer's counted volume is lower than the true qualifying volume, so the buyer lands in a **lower VIR tier than earned** → under-claims → leakage.

## 4. Process map — NEW (Slide 3, the fix)

```
 ... same goods flow: suppliers → transport → receiving → SK/PL/CZ ...
        │
        ▼
 "Missing data" (Return rejections, Overage, Backorder, Late, Pan-EU)
        │
        ▼
   CCOGS Engine  (existing rebate calc, still on its own data)
        │
        ▼
 ┌───────────────────────────────────────────────┐
 │   ★ KIRO AI AUDITING ENGINE  (VIR_Tier — NEW)  │
 │                                                │
 │   1. CONSOLIDATE all inputs across SK/PL/CZ    │
 │      (purchases, receipts, + the 5 event types)│
 │   2. RECONSTRUCT true qualifying volume         │
 │      per supplier agreement (pan-EU aggregate)  │
 │   3. DETERMINE the tier that SHOULD apply       │
 │   4. CAPTURE VARIANCE = entitled CCOGS           │
 │      − actually-claimed CCOGS                    │
 │   5. GENERATE SUPPLEMENTING CHARGES              │
 │      (debit note / claim per supplier)           │
 │   6. Full AUDIT TRACE: charge → events →         │
 │      agreement clause                            │
 └───────────────────────────────────────────────┘
        │
        ▼
  Injected into BUYER'S BILLING
  → becomes part of the buyer's invoice/debit note to the supplier
        │
        └──(loop-back arrows: corrections feed the billing process)
```

**The new engine sits AFTER the CCOGS Engine**, audits its output against the reconstructed truth, finds the variance, and produces the recovery document.

---

## 5. The five leakage drivers — how each causes a missed tier (my model, CONFIRM)

The tool must **consolidate the inputs and identify these itself**. My working hypothesis for each mechanism (this is the core logic — please correct):

| # | Driver | Hypothesized mechanism that suppresses qualifying volume |
|---|--------|-----------------------------------------------------------|
| 1 | **Return rejections** | Buyer returned goods; supplier **rejected the return** (goods stay with buyer / still purchased). Those units are legitimately purchased volume but got **netted out** of the rebate base as if returned → volume undercounted. |
| 2 | **Overage shipments** | Supplier shipped **more than ordered**; the extra units were received and (often) paid, but **not counted** toward rebate volume (no PO line) → undercounted. |
| 3 | **Backordering** | Ordered units delayed; when they finally arrive they may be **booked in a later period** and fall **outside the tier measurement window** → the period's volume misses the threshold. |
| 4 | **Late shipments** | Similar timing issue — receipt date slips past period close, so volume lands in the wrong period and neither period reaches its tier. |
| 5 | **Pan-EU shipments** | Volume is **split across SK/PL/CZ** and measured **per country**; each country falls short of the threshold, but the **combined** volume would have qualified for a higher tier. **Aggregating pan-EU volume** against one supplier agreement is the key recovery. |

**Question C:** Are these five mechanisms correct? Especially #1 (return rejection) and #3 vs #4 (backorder vs late) — I want the exact accounting treatment so the variance math has no gaps.

---

## 6. VIR calculation engine (selectable, real-time)

All of these are **user-selectable** and recalc live (per your answer B):

**Rebate structure**
- Tiered % (retrospective) — once threshold crossed, the higher rate applies to the **entire** volume.
- Tiered % (sliding/incremental) — each tier band's rate applies only to units **within** that band.
- Flat % — single rate on all qualifying volume.
- Per-unit — fixed amount per unit.
- (Extensible: marketing allowance, advertising, co-op — flagged for later.)

**Measurement basis** — units · purchase value · weight.

**Period** — month · quarter · year.

**Aggregation scope** — per country · **pan-EU (SK+PL+CZ combined)**.

The engine computes: **entitled CCOGS** (on reconstructed true volume, at the tier that should apply) vs **claimed CCOGS** (what the CCOGS Engine actually booked) → **variance = the recoverable amount**.

## 7. Supplementing charge & billing injection
- A **supplementing charge** = a debit-note/claim line for the CCOGS shortfall (variance) against a specific supplier and agreement.
- The tool **shows** the proposed charges (review/approve), then **sends them to the buyer's billing engine** so they become part of the buyer's invoice/debit note to the supplier.
- **Demo scope (assumption, CONFIRM):** the tool **generates + exports** the charges and simulates the "inject into billing" handoff (no live billing system in the demo). Real posting is a cloud-stage integration.

## 8. Audit trace (mandatory)
Every supplementing charge is fully traceable:
```
Supplementing charge
   └─ variance calculation (entitled − claimed, with the tier + structure + basis + period used)
        └─ reconstructed qualifying volume
             └─ source events (purchases, receipts, returns, overages, backorders, late, pan-EU rollup)
                  └─ agreement clause / tier table that grants the entitlement
```
Immutable log, source-file provenance, exportable for auditors. No silent adjustments.

## 9. Data (synthetic, to be generated — precise to real world)
No real samples exist. I'll generate realistic data covering the scope:
- **Supplier CCOGS agreements** — tier tables, structure, basis, period, scope (per-country vs pan-EU), effective dates.
- **Purchase orders + receipts** per country (SK/PL/CZ) with dates.
- **Operational event logs** — return rejections, overages, backorders, late shipments, pan-EU splits.
- **The CCOGS Engine's claimed amounts** (what was under-claimed) so the tool has something to audit against.
Designed so the dataset **demonstrably reproduces each of the five leakage drivers** and a pan-EU aggregation win.

---

## 10. Open questions before I lock the spec
1. **C (the five drivers):** confirm/correct the mechanisms in §5 — this is the heart of the audit logic.
2. **Agreement scope:** is one supplier agreement typically **pan-EU** (covers SK+PL+CZ together), **per-country**, or **both exist** and the tool must detect which? (This decides whether aggregation is always-on or conditional.)
3. **Retrospective reach:** when retrospective, does hitting a tier reclaim on **all prior purchases in the period**, or also **prior closed periods** (reopening)? Any limit?
4. **Currencies:** SK/CZ (EUR/CZK) and PL (PLN) — do agreements settle in one currency, or must the tool convert to aggregate pan-EU volume by value? (Units/weight aggregate cleanly; value needs FX.)
5. **"Injected into billing":** confirm demo = generate + export + simulated handoff (no live billing integration yet).
6. **Approval:** should supplementing charges require review/approval before "injection" (audit control), like the old tool's manager approval?
7. **Reuse:** may I reuse proven engine patterns from the old tool (parsers, StateStore, audit trail, i18n EN/SK — add PL/CZ?, charts) even though VIR_Tier is standalone, to move faster?

Once you confirm §5 and answer these, I'll turn this into a formal spec (requirements → design → tasks), then generate the sample data and build incrementally.

---

## 11. Locked answers (session 2026-08-19)
1. **Five driver mechanisms — CONFIRMED** as written in §5 (return rejections, overages, backordering, late shipments, pan-EU splits).
2. **Agreement scope = BOTH.** Agreements can be pan-EU **or** per-country. The tool must **detect the scope per agreement** and aggregate accordingly (pan-EU rolls SK+PL+CZ; per-country stays separate).
3. **Retrospective reach = BOTH**, decided **per use case / per invoice**: some reclaim only within the period, some **reopen prior closed periods**. Configurable on the agreement/invoice.
4. **Multi-currency.** Currencies follow country regulation (SK → EUR, CZ → CZK, PL → PLN). An agreement can carry **two currencies at once** (e.g., PLN + EUR). The tool supports an optional **"view all in EUR"** consolidation (FX conversion) so pan-EU value-based aggregation works; units/weight aggregate natively.
5. **Billing injection = show first, then ask.** Present the supplementing charges for review; then prompt the user how to **export** or whether to **inject** into billing. (Demo simulates the handoff; live posting is cloud-stage.)
6. **Approval path with ONE finance final approver.** The approver reviews a **full document** containing all relevant information (variance calc, reconstructed volume, source events, agreement clause, audit trace) before a charge can be injected/exported.
7. **Reuse only genuinely proven, non-adapting patterns.** Reuse from the old tool is allowed **only** where a component works here **without bending the new VIR logic to fit it** (e.g., low-level CSV/XML parsing utilities, immutable audit-log primitive, StateStore persistence interface, i18n mechanism). Anything that would force the new recovery logic to conform to old reconciliation assumptions is **rebuilt fresh**.

## 12. Next step
Concept locked. Proceed to formal spec for VIR_Tier: `requirements.md` → `design.md` → `tasks.md` (new spec folder), then generate realistic SK/PL/CZ sample data, then build incrementally with tests.

## 12b. Full-flow extension — 2026-08-19 (the "steps before" the output)
The first build produced only the OUTPUT end. Extended to the whole slide flow:
- **Inputs / "before":** the **CCOGS Engine output** is now a distinct input file (per agreement/scope/period) — the under-claim on incomplete data the tool audits against.
- **Before vs After + cost-of-inaction:** engine-claimed vs tool-reconstructed entitled, with the **leakage left on the table** shown explicitly per agreement and portfolio.
- **ML discovery stage:** explainable in-JS scoring (magnitude vs peers, under-claim lift, driver pressure, tier proximity) → score + confidence + reason per finding, plus computed/illustrative pattern insights. Runs **before** the deterministic suggestions; findings are opt-in.
- **Flow of stages:** Inputs & Before/After → ML Discovery → Suggestions → Approval.
- **Theme:** rebuilt in the standard **light** palette (no black).
- **Export:** **CSV** (billing-ingestible) is now primary, with a companion audit CSV; JSON dropped as primary.

## 13. Build status — 2026-08-19 (BUILT)
> **Status: BUILT & TESTED.** See `README.md` and `RESUME.md`.
- Spec written: `.kiro/specs/vir-tier-recovery/` (requirements/design/tasks).
- All engines + UI implemented under `build/`; **50 tests passing**.
- Sample data: 48 cases (6 suppliers, 6 each of 8 scenarios).
- Runs served and as an offline single-file (`build/offline/vir_tier_offline.html`).
- Verified: 42 recoverable charges, 6 zero-variance controls (no charge), 6 FX EUR-equivalents, approval gating, audit trace, pan-EU aggregation win.

## 14. Build status — 2026-08-19 (FULL FLOW, updated)
- Added CCOGS engine output input, before/after + cost-of-inaction, ML discovery (`lib/ml.js`), light theme, CSV export. **55 tests passing.** 48 before/after rows, 29 recoverable charges, ML findings ranked with reasons + insights. Offline single-file rebuilt and runtime-verified.

## 15. Workspace expansion — 2026-08-19 (left-nav, full pipeline navigable)
Turned the app into a **left-nav workspace** (sidebar with 2-level nav + wide working area) exposing the whole pipeline as navigable stages:
- **Stage 1 Inputs & Collection** — per-category file browser (Invoices, Delivery Notes, Goods Receipts, Missing-Data events, CCOGS Engine files, Agreements). Click a document → modal with **View / Print / Download** (raw XML/CSV). Reuses the old tool's invoice/delivery-note XML formats (new perfume values).
- **Stage 2 Consolidation** — every consolidated total is an **expandable drill-down** (reconstructed volume → by-country → leakage events → receipts).
- **Stage 3 ML Discovery** — a **Visio-like SVG flow** (Inputs → Feature signals → Scoring model → Ranked findings); each node hovers a regulatory note and is clickable to a detail panel; a **"How it works"** button opens the full method (signals + weighted formula). Model honestly labelled "Transparent Opportunity Ranker — explainable heuristic ensemble".
- **Stages 4–6** Analyst / Finance Approver / Finance Overview in the shell; Analyst sections separated by blank row + horizontal divider.
- **Data:** invoices + delivery notes are now real inputs (120 each); CCOGS engine files enriched with invoice/DN/receipt refs + a calc-trail note. **59 tests passing.**
- Roles: free browsing of all stages; approve/reject/export/inject gated to Finance Approver (role selector in sidebar).
