# VIR_Tier — config & steering snapshot

This folder is a **point-in-time backup** of the Kiro configuration that governs this
tool, copied into the repo so it is versioned alongside the code. It was saved
before a session restart.

> The **live** originals live OUTSIDE this git repo, at:
> `C:\Users\fffloch\Desktop\Kiro Folder\.kiro\`
> (the workspace root is one level above the `Perfumeries/` git repo, so `.kiro/`
> is not tracked by git — hence this snapshot).

## Contents

- `spec/` — the VIR_Tier feature spec (`requirements.md`, `design.md`, `tasks.md`),
  copied from `.kiro/specs/vir-tier-recovery/`.
- `steering/` — the steering rules most relevant to this workspace/tool
  (`product`, `structure`, `tech`, `accuracy-guardrails`, `customer-projects`,
  `forecast-receivables`, `token-counter-roi`, `work-tracker`), copied from
  `.kiro/steering/`.

## On restart

1. Read `VIR_Tier/RESUME.md` (top "RESTART POINTER" block) for full status.
2. If the live `.kiro/` config was lost, restore from here by copying back into
   `.kiro/specs/vir-tier-recovery/` and `.kiro/steering/`.
3. The open decision is the Contra-COGS "where is it generated" rework — see the
   concept gallery at `VIR_Tier/concepts/contra_cogs_flow_concepts.html`.

_This is a snapshot; if the live `.kiro/` files change, re-copy them here._
