# Design Document — VIR_Tier Recovery Engine

## Overview

VIR_Tier is a standalone recovery-focused sub-tool at `Perfumeries/VIR_Tier/`. It reconstructs the true qualifying purchase volume for each supplier CCOGS agreement across SK/PL/CZ, determines the Volume Incentive Rebate (VIR) tier that should apply, computes the variance against what was actually claimed, and generates auditable supplementing charges that a single finance approver signs off before export or (simulated) billing injection.

The build mirrors the proven layering of the existing tool — pure, unit-tested engines under `src/lib/`, UI under `src/ui/`, a swappable persistence `StateStore`, and a data-source abstraction — but the domain logic is **rebuilt fresh** for recovery. This document defines the data model, the engine pipeline, the exact rebate/variance math, multi-currency handling, the timing (control vs VAT) model, the approval/injection flow, the regulatory-tooltip mechanism, and the reuse boundary.

Stack: vanilla JS + ES modules, no build step, static/GitHub-Pages friendly (matches Req 10 and the existing tool's proven approach).

## Architecture

### Engine pipeline (left to right, mirrors slide 3)

```
Data sources (DB stub / API stub / Folder live)
   │
   ▼  Data_Source_Adapter  ──────────────────────────────────────────
   │
   ▼  Consolidation_Engine        (Req 1, 2 ingest)
   │    parse → tag Country → group per Supplier/Agreement → provenance
   │
   ▼  Volume_Reconstruction_Engine (Req 2, 11)
   │    apply 5 leakage-driver corrections; assign Control_Period;
   │    record optional VAT_Tax_Point; pan-EU vs per-country aggregation
   │
   ▼  Rebate_Engine               (Req 3, 4)
   │    Entitled_CCOGS from Reconstructed_Volume, selected structure/
   │    basis/period/scope; retrospective reach; FX when needed
   │
   ▼  Variance + Charge builder    (Req 5)
   │    Variance = Entitled − Claimed; Supplementing_Charge when > 0
   │
   ▼  Governance / Approval        (Req 6, 7)
   │    Audit_Trace (immutable); Finance_Approver review → Approved/Rejected
   │
   ▼  Export / Billing_Injection   (Req 8)   → UI role views (Req 9)
```

### Layer boundaries (Req 10)

| Layer | Demo implementation | Cloud swap |
|-------|---------------------|-----------|
| Data source | `FolderSource` reads bundled files via `manifest.json`; DB/API stubs return "no updates" | Real DB/API adapters |
| Persistence | `StateStore` over localStorage (memory in tests) | Cloud store, same interface |
| Auth | Client-side role selection | Real auth + roles |
| **Recovery engine + UI** | **Shared, unchanged across stages** | **Shared, unchanged** |

### Module layout (`Perfumeries/VIR_Tier/build/`)

```
build/
├── index.html
├── manifest.json                     # lists demo inbox files
├── src/
│   ├── app.js                        # entry: scan → consolidate → reconstruct → rebate → charges → UI
│   ├── lib/
│   │   ├── xml.js        (REUSE)     # low-level XML parse/serialize
│   │   ├── csv.js        (REUSE)     # low-level CSV parse/serialize
│   │   ├── store.js      (REUSE*)    # StateStore interface + backends (collections redefined)
│   │   ├── audit.js      (REUSE*)    # immutable append-only audit primitive
│   │   ├── i18n.js       (REUSE*)    # i18n mechanism (strings rebuilt: EN/SK/PL/CZ)
│   │   ├── enums.js                  # NEW domain enums
│   │   ├── money.js                  # NEW currency + FX consolidation
│   │   ├── periods.js                # NEW month/quarter/year + Control_Period
│   │   ├── models.js                 # NEW domain factories/validators
│   │   ├── parsers.js                # NEW: agreement/purchase/receipt/event/claimed parsers
│   │   ├── source.js                 # NEW: DataSource adapters + scanner
│   │   ├── consolidation.js          # NEW: Consolidation_Engine
│   │   ├── reconstruction.js         # NEW: Volume_Reconstruction_Engine (5 drivers)
│   │   ├── rebate.js                 # NEW: Rebate_Engine (4 structures, retro reach)
│   │   ├── variance.js               # NEW: variance + Supplementing_Charge builder
│   │   ├── approval.js               # NEW: approval workflow + statuses
│   │   ├── injection.js              # NEW: export + simulated billing injection
│   │   ├── regnotes.js               # NEW: Regulatory_Note definitions (single source)
│   │   └── pipeline.js               # NEW: composes the engines end to end
│   └── ui/
│       ├── boot.js, login.js, dashboards.js, review.js, charts.js, tooltip.js, styles.css
├── data/
│   ├── inbox/{agreements,purchases,receipts,events,claimed}/
│   └── samples/SCHEMAS.md
├── tools/{generate_samples.js, serve.js, build_offline.js}
└── tests/
```

`REUSE` = copied unchanged. `REUSE*` = the mechanism/primitive is reused but its configuration/content is redefined for VIR_Tier (e.g., `store.js` keeps the class and backends but declares new collections; `i18n.js` keeps the lookup/interpolation but ships new strings and adds PL/CZ).

## Reuse boundary (Req 7 answer #7 — only proven, non-adapting)

**Reused unchanged (primitives):**
- `xml.js` — controlled-schema XML parse/serialize. Proven, no domain assumptions.
- `csv.js` — RFC-4180-ish quoted-field CSV parse/serialize. Proven, no domain assumptions.

**Reused as mechanism, re-configured (no old logic leaks in):**
- `store.js` — the `StateStore` class + memory/localStorage backends and the keyed/list collection pattern are kept; `COLLECTIONS` is redefined for VIR_Tier entities (agreements, purchases, receipts, events, claimed, reconstructions, charges, audit).
- audit append-only primitive (extracted from the old store's `appendAudit`/`auditLog` idea) → its own `audit.js`.
- `i18n.js` — lookup + `{var}` interpolation mechanism kept; strings rebuilt; languages extended to EN/SK/PL/CZ.
- data-source **pattern** (adapter + ordered scanner + `manifest.json` for static hosting) is reproduced, but the adapter code is re-authored for the new document set.

**Rebuilt fresh (all domain logic):**
- consolidation, volume reconstruction, rebate math, variance, approval, injection, all domain models/enums, parsers for the new document types, and all UI views. None of the old reconciliation logic (invoice-vs-receipt gap, Model A/B contra, GINR) carries over — it would bend the new recovery logic.

## Components and Interfaces

### Data model

#### Agreement (supplier CCOGS agreement)
| Field | Notes |
|-------|-------|
| `agreementId` | key |
| `supplierId`, `supplierName` | |
| `rebateStructure` | `RETROSPECTIVE_TIERED` \| `SLIDING_INCREMENTAL` \| `FLAT_PERCENTAGE` \| `PER_UNIT` (default/base value; UI can override for what-if per Req 3.5) |
| `basis` | `UNITS` \| `VALUE` \| `WEIGHT` |
| `period` | `MONTH` \| `QUARTER` \| `YEAR` |
| `scope` | `PER_COUNTRY` \| `PAN_EU` |
| `retrospectiveReach` | `WITHIN_PERIOD` \| `PRIOR_PERIODS` (only meaningful for retrospective structures) |
| `tiers[]` | ordered bands: `{ threshold, rate }` (rate = % for tiered/flat, amount/unit for per-unit) |
| `currencies[]` | one or two ISO codes (e.g., `["EUR"]`, `["PLN","EUR"]`) |
| `countries[]` | subset of `[SK,PL,CZ]` the agreement covers |
| `effectiveFrom`, `effectiveTo` | |
| `clauseRefs{}` | map tier/rule → human-readable clause text (for Audit_Trace + review doc) |
| `provenance` | source file |
| `incompleteFields[]` | populated by Consolidation when required config missing (Req 1.6) |

#### Purchase record
`{ purchaseId, agreementId, supplierId, country, stockId, orderDate, qty, unitValue, weightPerUnit, currency, provenance }`

#### Receipt record
`{ receiptId, purchaseId, agreementId, country, stockId, qtyReceived, receiptDate, controlPeriod, vatTaxPoint|null, provenance }`
- `controlPeriod` derived from `receiptDate` (transfer of control, Req 11.1).
- `vatTaxPoint` set only when supporting data present (Req 11.3/11.4); otherwise `null`.

#### Leakage event (one shape, typed)
`{ eventId, type, agreementId, supplierId, country, stockId, qty, refIds[], eventDate, provenance }`
- `type ∈ { RETURN_REJECTION, OVERAGE_SHIPMENT, BACKORDERING, LATE_SHIPMENT, PAN_EU_SPLIT }`.

#### Claimed-CCOGS record (what the existing CCOGS Engine booked)
`{ claimId, agreementId, supplierId, country|PAN_EU, period, basis, amountClaimed, currency, provenance }`

#### Reconstructed volume (engine output)
`{ agreementId, scopeKey, period, basis, qualifyingVolume, byCountry{}, corrections[] }`
- `corrections[]`: `{ driver, recordRefs[], volumeDelta, note }` (feeds Audit_Trace, Req 2.7).

#### Supplementing charge
| Field | Notes |
|-------|-------|
| `chargeId` | key |
| `agreementId`, `supplierId` | |
| `scope`, `period` | context of the claim |
| `entitledCcogs`, `claimedCcogs`, `variance` | variance = entitled − claimed |
| `currency`, `eurEquivalent|null` | native + optional EUR (Req 4/5.4) |
| `tierApplied`, `structure`, `basis` | how it was computed |
| `status` | `PENDING_APPROVAL` \| `APPROVED` \| `REJECTED` \| `EXPORTED` \| `INJECTED` |
| `auditTrace[]` | ordered, immutable entries |
| `clauseRef` | agreement clause granting entitlement |

#### Audit entry (immutable)
`{ seq, timestamp, actor, action, details{}, evidenceRefs[] }` — append-only; recompute appends, never edits (Req 6.2/6.4).

### Enumerations (`enums.js`)
`Country`, `RebateStructure`, `Basis`, `Period`, `Scope`, `RetrospectiveReach`, `LeakageDriver`, `ChargeStatus`, `Role` (`ANALYST`, `FINANCE_APPROVER`, `FINANCE_OVERVIEW`), `ScanStatus`, `Currency`.

## Core algorithms

### Volume reconstruction (Volume_Reconstruction_Engine, Req 2 & 11)

For an agreement + period + basis + scope:

1. **Base volume** = Σ receipts' `qtyReceived` (basis-weighted: ×`unitValue` for VALUE, ×`weightPerUnit` for WEIGHT), assigned to each receipt's `controlPeriod`.
2. **Apply driver corrections** (each records a `correction` with `volumeDelta`):
   - **RETURN_REJECTION**: add back rejected-return units — they remain purchased volume (Req 2.1).
   - **OVERAGE_SHIPMENT**: include retained overage units even beyond ordered qty (Req 2.2).
   - **BACKORDERING**: ensure units count in their `controlPeriod` (actual receipt), flag cross-period movement (Req 2.3).
   - **LATE_SHIPMENT**: same control-period rule, flag timing miss (Req 2.4).
   - **PAN_EU_SPLIT**: only relevant when scope = PAN_EU; ensures a unit received in one country still contributes to the combined base (Req 2.5).
3. **De-dup guard**: each physical unit is counted once even if it appears in multiple source records (match on `stockId`+`purchaseId`/`refIds`), Req 2.8.
4. **Aggregation**: PAN_EU sums `byCountry` into one `qualifyingVolume`; PER_COUNTRY keeps them separate (Req 2.5/2.6).
5. Output `Reconstructed_Volume` with `corrections[]`.

### Rebate math (Rebate_Engine, Req 3)

Given `qualifyingVolume Q`, ordered `tiers[]`, and `structure`:

- **RETROSPECTIVE_TIERED**: find highest tier whose `threshold ≤ Q`; `entitled = Q × tier.rate` (rate applied to the **entire** volume). Req 3.6.
- **SLIDING_INCREMENTAL**: sum over bands: each band contributes `(units within band) × band.rate`. Req 3.7.
- **FLAT_PERCENTAGE**: `entitled = Q × flatRate`.
- **PER_UNIT**: `entitled = Q × amountPerUnit` (Q in units).

**Tier vs amount separation:** the qualifying tier is derived from `Q` (reconstructed/qualifying volume). This is deliberately the reconstructed volume, since the whole point is that the *true* volume qualifies for a higher tier than the claimed data reflected.

**Retrospective reach (Req 3.9):**
- `WITHIN_PERIOD`: recompute entitlement for the current period only.
- `PRIOR_PERIODS`: reopen affected prior closed periods, recompute each, and sum the additional entitlement; each reopened period gets its own audit entry.

**Real-time recompute (Req 3.5):** the engine is a pure function `computeEntitled(reconstructedVolume, selections)`. UI holds `selections` (structure/basis/period/scope) in state; any change re-invokes the pure function against the already-consolidated data — no re-ingestion.

### Variance & charge (Req 5)
`variance = entitledCcogs − claimedCcogs` per agreement+scope+period. If `> 0`, build a `Supplementing_Charge` (status `PENDING_APPROVAL`) with full `auditTrace` and `clauseRef`. If `≤ 0`, record the calculation only (Req 5.3).

### Multi-currency & FX (money.js, Req 4)
- Amounts stored `{ value, currency }`. No implicit merging (Req 4.2).
- `Basis = UNITS|WEIGHT` → aggregate natively, no FX (Req 4.5).
- `Basis = VALUE` + `Scope = PAN_EU` + mixed currencies → require FX consolidation to EUR before summing; record the `fxRate` and rate date in the audit entry (Req 4.4). FX rates come from a bundled `fx_rates.json` in the demo (documented, no secrets).
- "View all in EUR" toggle converts display values while retaining native values (Req 4.3).

### Timing model (periods.js, Req 11)
- `controlPeriod(receiptDate, period)` → `YYYY-MM` / `YYYY-Qn` / `YYYY`.
- `vatTaxPoint` optional; when both exist and differ, set a `divergence` flag stored with the receipt and echoed in the audit trace (Req 11.5).

### Regulatory notes (regnotes.js, Req 12)
Single exported map keyed by note id (`CONTROL_PERIOD`, `VAT_TAX_POINT`, `RETURN_REJECTION`, …) → `{ short, regulation, sourceLabel }`. The UI `tooltip.js` renders these on hover wherever timing-sensitive or driver-corrected values appear. One source of truth so wording is consistent (Req 12.4).

## Governance & approval (Req 6, 7)

- Charge lifecycle: `PENDING_APPROVAL → APPROVED → (EXPORTED | INJECTED)` or `PENDING_APPROVAL → REJECTED`.
- Finance_Approver review document assembles: variance calc, reconstructed volume + corrections, contributing source events (with provenance), agreement clause, and the full audit trace (Req 7.2).
- Export/injection gated on `APPROVED` (Req 7.5 / 8.4). Injection in the demo = state change to `INJECTED` + exportable payload; a hook marks where the real billing post goes at cloud stage (Req 8.5).
- Every state change, approval, rejection (with reason), recompute, and FX application appends an immutable audit entry (Req 6).

## UI & roles (Req 9)

- Boot: three-source scan animation (DB/API "no updates" → Folder live), consistent with the proven pattern.
- Login: client-side role selection → Analyst / Finance_Approver / Finance_Overview.
- **Analyst view**: detected leakage by driver, reconstructed volume, tier determination, draft charges, and the live selectable controls (structure/basis/period/scope + EUR toggle) with real-time recompute.
- **Finance_Approver view**: approval queue + full review document + approve/reject.
- **Finance_Overview view**: recovery totals by supplier/country/period, drill-down to charges; charts (recovered vs at-risk).
- Hover tooltips (regnotes) on all timing/driver values.
- i18n EN/SK/PL/CZ.

## Data sources & static demo (Req 1.5, 10)
- `Data_Source_Adapter` with `DatabaseSource`/`ApiSource` (stub "no updates") and `FolderSource` (reads `manifest.json`, fetches inbox files). Ordered scanner emits status events; failures are reported and scanning continues.
- No secrets; `fx_rates.json` and all sample data are non-sensitive synthetic files.

## Sample data plan (feeds task: generate_samples)
Synthetic but realistic for SK/PL/CZ perfume/cosmetics retail. The dataset SHALL demonstrably produce, at minimum:
- one **pan-EU aggregation win** (three countries each below threshold; combined crosses a higher tier),
- one case per **leakage driver** that measurably restores volume,
- one **retrospective PRIOR_PERIODS** reopening,
- one **mixed-currency (PLN+EUR)** value-basis agreement requiring FX,
- at least one **zero/negative variance** (no charge) case for control.
Each sample carries provenance and a claimed-CCOGS counterpart so variance is computable.

## Testing strategy
Pure engines unit-tested in isolation (Node `--test`, matching the existing tool):
- reconstruction: each of the 5 drivers; de-dup; pan-EU vs per-country.
- rebate: all 4 structures; retrospective within-period vs prior-periods reopening; tier-from-Q.
- money/FX: native retention; EUR consolidation; FX required only for value+pan-EU+mixed.
- periods: control period; VAT divergence flag.
- variance: positive → charge, non-positive → none.
- approval: status gating (no export/inject unless approved); immutable audit (append on recompute).
- regnotes: every displayed driver/timing key has a note.
- e2e: full pipeline over sample data reproduces the pan-EU win, each driver, the retro reopening, and the FX case.

## Requirements coverage map
| Req | Covered by |
|-----|-----------|
| 1 | Consolidation_Engine, DataSource, provenance, incomplete flag |
| 2 | Volume_Reconstruction_Engine (5 drivers, de-dup, scope) |
| 3 | Rebate_Engine (4 structures, selections, retro reach, no hard-coding) |
| 4 | money.js FX rules |
| 5 | variance.js + charge builder |
| 6 | audit.js immutable trace + provenance |
| 7 | approval.js workflow + review doc |
| 8 | injection.js show-first, export/inject, demo simulation |
| 9 | UI role views |
| 10 | layer separation, static demo, independence from old tool |
| 11 | periods.js control vs VAT |
| 12 | regnotes.js + tooltip.js |
