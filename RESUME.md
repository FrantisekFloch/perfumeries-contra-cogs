# Perfumeries — Resume Point (pick up here tomorrow)

_Last saved: 2026-08-17 (end of day)_

## Where we are
The full tool is built, tested, and running. **114 tests passing.** Live on GitHub Pages (repo current; a Pages **deploy** may still be catching up due to GitHub's outage — re-run the Actions deploy when green).

## What's done (spec: all 16 tasks complete)
- **Engines (pure, tested):** parsers (XML/CSV), matching, gap (Model A/B + discount allocation), timing (periods, split debits, GINR, FOB), governance (resolution options, backdoor, immutable audit), lifecycle state machine.
- **Persistence:** `StateStore` (localStorage in browser, memory in tests), swappable for cloud.
- **Data sources:** DB/API/Folder abstraction; demo reads bundled files via `manifest.json`.
- **Full-year sample data:** 31 invoices across 2026 (generator: `tools/generate_samples.js`).
- **UI:** animated connect/boot sequence → 3 role dashboards (Storage / Accounting / Finance) + Inventory audit + About manual.
- **Finance:** KPI cards, by-status, storages with open shortfalls, bar chart (risk vs debits), line chart with a **clearly separated forecast** (shaded area + divider + legend + note).
- **i18n:** full EN/SK toggle (🇬🇧/🇸🇰).
- **Guided tour:** "Walk me through".
- **Offline build:** `build/offline/perfumeries_offline.html` (double-click, no server/git) via `tools/build_offline.js`.

## How to run / verify
```
cd "Perfumeries/build"
node --test              # 114 tests
node tools/serve.js      # http://localhost:8080
node tools/generate_samples.js   # regenerate sample data
node tools/build_offline.js      # rebuild the offline single-file
```
For fast visual tinkering: edit `build/offline/perfumeries_offline.html` `<style>` and refresh; port good changes back to `src/ui/styles.css` and re-run the offline build.

## Push (run when GitHub is healthy)
```
cd "c:\Users\fffloch\Desktop\Kiro Folder\Perfumeries"; git add .; git commit -m "About manual, forecast separation, EOD save"; git push
```
Note: `.kiro/specs/contra-cogs-reconciliation/` (requirements/design/tasks) lives at the workspace root, OUTSIDE this git repo — it's saved on disk but not pushed with the Perfumeries repo.

## Open / next-session ideas
1. **Boot sequence length** — currently ~1.5s/step (`BOOT_STEP_MS` in `src/app.js`); decide final pacing.
2. **Storage view** — add a "current situation" summary line; small polish.
3. **Finance** — optional: more chart types, per-distributor breakdown.
4. **Model filter** — confirm behavior feels right with the full dataset.
5. **Cloud stage (future)** — real DB/API adapters, real auth, persistent archive (layers already isolated).
6. **Accessibility pass** — keyboard/focus states, ARIA on tour + charts.

## Key files
- Logic: `build/src/lib/*` · UI: `build/src/ui/*` · Entry: `build/src/app.js`
- Spec: `.kiro/specs/contra-cogs-reconciliation/{requirements,design,tasks}.md`
- Definitions: `Perfumeries/definitions/*` · Design notes: `Perfumeries/DESIGN.md` · Decisions: `Perfumeries/DECISIONS.md`
