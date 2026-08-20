# VIR_Tier — CCOGS Recovery Engine

A standalone sub-tool of the Perfumeries project. It detects **under-claimed Contra COGS (CCOGS)** — volume incentive rebates (VIR) the buyer failed to bill suppliers because operational events suppressed the qualifying volume — reconstructs the true volume, determines the tier that should have applied, computes the recoverable variance, and generates **supplementing charges** that a finance approver reviews before export or (simulated) billing injection.

Built from `PErfumeries.pptx` (slides 1–3). The existing reconciliation tool in `../build/` is untouched and independent.

## What it does (the flow)

```
Scan (DB→API→Folder) → Ingest & consolidate (SK/PL/CZ) → Reconstruct true volume
  (5 leakage drivers restored, pan-EU aggregation) → Rebate engine (tier that should apply)
  → Variance = Entitled − Claimed → Supplementing charge → Finance approval → Export / Inject
```

### The five leakage drivers (restore suppressed volume)
- **Return rejection** — rejected returns stay purchased volume.
- **Overage shipment** — retained extra units count.
- **Backordering** / **Late shipment** — units qualify in their *control period* (actual receipt, IFRS/GAAP transfer of control), with the timing miss flagged.
- **Pan-EU split** — volume across SK/PL/CZ is aggregated against one agreement so the combined volume can reach a higher tier.

### Selectable, real-time
Rebate structure (retrospective-tiered · sliding-incremental · flat % · per-unit), basis (units · value · weight), period (month · quarter · year), scope (per-country · pan-EU), and a "view all in EUR" FX toggle — all recompute live. Nothing is hard-coded; every value is read from the agreement.

### Timing & VAT
Rebate volume follows **transfer of control** (received period). The **EU VAT tax point** (shipment or upfront pre-payment) is tracked as a separate, optional attribute and flagged when it diverges — never assumed. Governing definitions appear on hover (IFRS/GAAP and EU VAT).

### Governance
Every supplementing charge carries a full **audit trace** (charge → variance → reconstructed volume → source events → agreement clause). One **finance approver** reviews the complete document; export/injection is blocked until approved. Injection is simulated in the demo.

## Run

```
cd "Perfumeries/VIR_Tier/build"
node --test                    # unit + e2e tests
node tools/generate_samples.js # regenerate the SK/PL/CZ sample dataset
node tools/serve.js            # http://localhost:8080
node tools/build_offline.js    # rebuild the single-file offline demo
```

Offline (no server, double-click): `build/offline/vir_tier_offline.html`.

## Layout

```
VIR_Tier/
├── CONCEPT.md              # locked concept + process map
├── README.md               # this file
├── RESUME.md               # resume point
└── build/
    ├── index.html
    ├── data/
    │   ├── inbox/{agreements,purchases,receipts,events,claimed}/
    │   ├── manifest.json   # enumerates inbox files (static-host friendly)
    │   └── fx_rates.json   # EUR-based FX table (non-sensitive)
    ├── src/
    │   ├── app.js          # entry
    │   ├── lib/            # pure engines (tested)
    │   └── ui/             # views
    ├── tools/              # generate_samples · serve · build_offline
    └── tests/
```

## Architecture notes
Layered so the demo and a future cloud version share the recovery engine + UI, differing only in data-source, persistence, and auth. Static-friendly (manifest-based folder scan, no secrets). Stack: vanilla JS + ES modules, no build step. Reused only proven primitives from the old tool (`xml.js`, `csv.js`) plus the StateStore/audit/i18n mechanisms (reconfigured); all recovery logic and UI are new.

Spec: `.kiro/specs/vir-tier-recovery/` (requirements · design · tasks).
