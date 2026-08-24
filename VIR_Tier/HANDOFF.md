# VIR_Tier — Session Handoff

State snapshot for resuming in a fresh chat. Everything below is committed and pushed.

## Repo / deploy
- Repo root: `Perfumeries/` — remote `origin` = github.com/FrantisekFloch/perfumeries-contra-cogs, branch `main`.
- Working tree clean; `main` == `origin/main` at commit `93bfa46`.
- Only untracked file: `PErfumeries.pptx` (unrelated PowerPoint — intentionally NOT committed).
- **Deploy step:** the app is a single offline HTML. Build then copy to repo-root `index.html`:
  ```
  cd VIR_Tier/build
  node tools/build_offline.js            # -> offline/vir_tier_offline.html (~663 KB)
  cd ..\..                               # Perfumeries/
  Copy-Item "VIR_Tier\build\offline\vir_tier_offline.html" "index.html" -Force
  git add index.html "VIR_Tier/build"; git commit -m "..."; git push origin main
  ```
- GitHub Pages serves `index.html`. Demo login: user `Finance`, pass `Pegasus` (case-sensitive, user trimmed; `DEMO_CREDS` in app.js).

## Project shape
- `VIR_Tier/build/` is the app root. Vanilla-JS ES modules, no build step, no deps.
- Tests: `node --test` (currently **59 pass, 0 fail**) in `VIR_Tier/build/`.
- Sample data: `node tools/generate_samples.js` (deterministic seed) writes `data/inbox/**` + `data/manifest.json` (currently 26 agreements, 189 data files).
- Offline bundler: `tools/build_offline.js` — has a `MODULES` list (must include any new `ui/*` module).
- i18n: 4 languages EN/SK/PL/**CS** (Czech code is `cs`, NOT `cz`). `t(key,{vars})` with `{var}` interpolation; `STRINGS` object per lang; unknown code falls back to `en`.
- Throwaway smoke scripts: write to build ROOT (relative imports break under tools/), then delete.

## Key source files (`VIR_Tier/build/src/`)
- `app.js` — entry: STAGES array, sidebar, render(), bind(), main(). No roles anymore. `playIngestFlow()` drives the summary animation; `state.ingestDone` gates it (animate once). `openReviewReadOnly()` opens read-only review from Consolidated Debit.
- `ui/ingestflow.js` — horizontal ingest-flow infographic (6 source nodes alternating top/bottom, spinners, random 2–8s finish, filling wave, clickable to open a doc category). `renderIngestFlow(counts,{done})` + `animateIngestFlow(host,counts,{onDone})`.
- `ui/stages.js` — `renderInputs` (doc category list + green Back-to-summary button), `renderInputsSummary` (ingest flow + KPI results revealed after animation via `.sum-result-hidden`/`#sumResult`), `renderMl`/`mlFindingCard` (ML Discovery — HIDDEN from sidebar but code kept; story uses `mlStoryTierMove`/`mlStorySameTier`), `INPUT_CATS`.
- `ui/consolidated.js` — `renderConsolidatedDebit` (per-supplier grouped charges, live contra-COGS preview, itemized lines with single Rate% col), `chargesBySupplier`. Pins: Maison Aroma slot1, Velvet slot3 (`PINNED_SUPPLIERS`).
- `ui/dashboards.js` — `renderOverview` (Finance Overview: before/after band, Claim builder Summary per-supplier boxes, journey, charts), `reviewModalHtml(charge,group,rec,opts)` (opts.readOnly hides actions; opts.finding adds story + "Where the volume came from" table; single Rate% col), `renderAbout` (Manual — rewritten for no-roles / ingest-flow / Consolidated Debit; ML section retitled "Reconstruction engine").
- `ui/doc.js` — 7 document renderers (invoice, contra-COGS invoice, delivery note, GRN receipt, OSD event, agreement, engine). Fully localized (labels + enum values via dstLabel/drvLabel/basisLabel/rsLabel/wtLabel/rrLabel/engDocTypeLabel + labelOr fallback). Rate cells show single achieved rate. `lineItemStorageSplit` renders per-SKU × storage.
- `lib/ml.js` — `runDiscovery`/`scoreOpportunities`. Derivation per finding (engineVolume, baseVolume, restoredUnits, reconstructedVolume, driverContributions, tierBefore/tierAfter). **tierBefore is derived from the engine's effective claimed rate** (claimed/engineVolume) via `tierByRate` with relative tolerance `rate*1.005`, so genuine tier jumps show for pan-EU per-country under-tiering.
- `lib/trueup.js` — `buildTrueUp`: entitled = valueBase × rateAfter; variance = entitled − claimed; itemized lines. Invariant enforced by test: agreement-level entitled >= claimed.
- `lib/i18n.js` — all strings (4 langs). Big file.
- `tools/generate_samples.js` — scenario matrix. TIER_LADDERS thresholds scaled to realistic pan-EU cosmetics volumes (60k–240k units). `unitValueFor` EUR 15–40. Tier-move scenarios are UNITS basis (honest "units" wording). Delivery notes carry ALL contract SKUs (per-SKU `skuLines`).

## Current behavior / recent decisions
- **Total recoverable ≈ €22k**, spread across findings; flagship AGR-001 ≈ €4.4k (deliberately NOT dominant). ~14 tier-move / ~3 same-tier findings.
- **Story sentence** has two variants: tier-move ("lifting from tier N (x%) up to tier M (y%) — retrospective reprices whole volume") vs same-tier ("all qualifies at x%, engine under-counted by Z units").
- **Rate display**: single achieved Rate% everywhere (no `from% → to%` arrows).
- **Roles removed** entirely (single open-access workspace).
- **ML Discovery hidden** from sidebar; its key info (story + volume build-up) reproduced in Consolidated Debit "View details".
- **Summary** = animated ingest flow (replaces old welcome/boot); results revealed after animation; animate-once per session.
- AGR-001 = single-cause `tt_sku` (forgotten SKU), AGR-002 = single-cause `tt_pallet` (found-later pallet).

## Commit history (recent)
- `93bfa46` delivery notes carry all SKUs (fix blank storage-split rows)
- `87bf3cb` clearer rate display, tier-move vs same-tier story, realistic amounts
- `d6697df` animated ingest-flow summary, Consolidated Debit, localized documents, remove roles

## Next
Awaiting a large feedback/changes batch from the user (to be analyzed in a fresh chat). Nothing pending in-flight; all prior tasks complete and deployed.
