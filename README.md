# VIR_Tier — CCOGS Recovery Engine (default) · Perfumeries — Contra COGS Reconciliation (archived)

This repository now hosts **two standalone demo tools**. The **default page** (`index.html` at the repo root) is the newer **VIR_Tier** tool; the earlier **Perfumeries** tool is preserved and still reachable.

## The two tools

- **VIR_Tier — CCOGS Recovery Engine** — the current default. A single-file, offline-capable tool that detects under-claimed volume rebates (Contra-COGS), reconstructs the true qualifying volume, and prepares a recoverable True-Up. EN/SK/PL/CZ, light theme.
  - Served entry: **`index.html`** (repo root, self-contained).
  - Source + tests + generator: **`VIR_Tier/build/`** (`node --test`, `node tools/build_offline.js`).
- **Perfumeries — Contra COGS Reconciliation** — the earlier tool, kept for reference.
  - Reachable at **`perfumeries.html`** (repo root, self-contained), or from its full source tree at **`build/`** (`build/index.html`).

Everything below documents the original Perfumeries build workspace, which remains intact under `build/`.

---

A fresh, standalone project. **No connection** to the other workspace tools (Atlas, ACM, FinOps, Work Tracker, etc.) or their steering files. This tool is designed to run **online** and may use a **cloud environment** in its final stage.

## What this folder is for

This is a staging area for a long, step-by-step build. You feed information in over multiple prompts; I use it to suggest an approach and build the tool incrementally.

Nothing is assumed yet — the tech stack, hosting, and scope are all open until the intake below is filled in.

## How to work in here

1. **Fill in `INTAKE.md`** — the master questionnaire. Answer in any order, in as much or little detail as you want. Leave `TBD` where you're unsure.
2. **Drop raw material in `inputs/`** — screenshots, sample data, exports, brand lists, API docs, sketches, links. Anything I should look at.
3. **I record decisions in `DECISIONS.md`** as we lock them, so nothing gets lost across sessions.
4. **Build artifacts land in `build/`** once we start implementation.

## Folder layout

```
Perfumeries/
├── README.md          # this file — how the workspace operates
├── INTAKE.md          # master intake questionnaire (fill this in)
├── FUNCTIONALITY.md   # high-level functionality overview (what the tool does + modules)
├── DESIGN.md          # design: data sources, model, matching, lifecycle, roles, architecture
├── DECISIONS.md       # running log of locked-in decisions
├── definitions/       # source-backed definitions the tool's logic relies on
│   └── README.md      # index of definition files
├── inputs/            # your raw material (data, images, docs, links)
│   └── README.md      # what to put here
└── build/             # the actual tool gets built here (empty for now)
    └── README.md      # placeholder
```

## Guardrails for this project

- **Cloud-ready from the start** — avoid choices that only work on a single local machine unless we explicitly decide on a local-first phase.
- **Online-functional** — the tool must work over the web, not just by opening a file locally.
- **Decisions are explicit** — build vs. buy, hosting, and stack are recorded in `DECISIONS.md` before code is written.
- **Incremental** — we lock scope in phases; quick wins first.

## Build steps (the plan)

0. **Definition scraping** — establish source-backed definitions (`definitions/`). ✅ done
1. **Define functionality (high-level)** — what the tool does + module categories (`FUNCTIONALITY.md`). ✅ done
2. **Intake** — data sources, formats, users, hosting (`INTAKE.md`). ✅ mostly done
3. **Design** — data model, matching, lifecycle, roles, architecture (`DESIGN.md`). ✅ draft done
4. **Build** — implement in `build/`, phase by phase (quick win first). ← next, once schemas confirmed
5. **Deploy** — GitHub (demo) → cloud environment.

## Current status

- **Phase:** Step 3 — design updated to the **authoritative company process** (`definitions/official_process_sk.md`); confirming schemas + a few facts before build.
- **Confirmed:** receiver/buyer · **two contra COGS models** (A direct line-item, B back-edge allowance via monthly dobropis/Co-op vs central delivery record, holding a **pending contra COGS credit**) · matching via **GR/EDI RECADV per warehouse + delivery notes** · per-warehouse or summary invoices · FOB shipping point · 3-source scan (DB→API→Folder) + **archive** · calendar-month timing, split debits, GINR flag · lifecycle with **backdoor + 1-manager approval** · **3 role views** with login · test on **GitHub**, cloud later.
- **Still to confirm:** exact **tier %**, the **proforma** step, and the "legal invoice only for goods delivered in month" rule (user-provided, not in official text) — plus the **invoice/delivery-note/RECADV/credit-note schemas** (`DESIGN.md` §9).
- **Next step:** confirm the above, then I scaffold `build/`.
