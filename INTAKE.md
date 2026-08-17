# Perfumeries — Intake Questionnaire

Fill this in over as many prompts as you like. Answer what you can, mark the rest `TBD`. You don't need to go in order. When you paste a long prompt, I'll map it onto these sections and update this file.

> Legend: `TBD` = not decided yet · `N/A` = doesn't apply · leave blank to skip.

---

## 0. One-liner
What is this tool, in one sentence?

- **Elevator pitch:** TBD

---

## 1. Problem & Goal
- **What problem does it solve?** TBD
- **Who has this problem?** TBD
- **What does success look like?** (the concrete end result) TBD
- **What happens today without the tool?** (current manual process) TBD

---

## 2. Users & Access
- **Primary users:** Accounting, Finance, Storage teams.
- **Public or private?** Private, **logged-in only**.
- **Do users need accounts / login?** Yes — role-based.
- **Roles & permissions:** 3 role views — **Storage** (on-way/pending/aged + trends), **Accounting** (closed + open summary), **Finance** (high-level + drill-down). See `DESIGN.md` §7.
- **Expected scale:** TBD (invoices/storages/lines per month).

---

## 3. Core Features
> High-level functionality is captured in `FUNCTIONALITY.md` (modules F1–F6). Summary below.

1. **F1 Invoice ingestion** — read the invoice from one source.
2. **F2 Storage ingestion** — read inputs/reports from the storages (many locations).
3. **F3 Consolidation** — combine at invoice level and/or product level (stock id).
4. **F4 Reconciliation** — invoice vs delivery fulfilment.
5. **F5 Contra COGS gap engine** — detect, flag, and offer resolution options.
6. **F6 Dashboard** — open vs closed items.

---

## 4. Data
This is the "clear path to insert information." Describe what data flows through the tool.

- **What data does it hold?** Invoices (header + lines) and storage receipt rows; derived gaps/resolutions. See `DESIGN.md` §3.
- **Where does the data come from?** Three sources scanned on startup: **Database, API, Folder**. Demo uses the **Folder** (XML invoices + row-level storage reports); DB/API stubbed. 
- **Sample data available?** To be generated in `build/data/samples/` once schemas confirmed.
- **Rough data volume:** TBD.
- **Sensitive data?** Financial/AR data — private, logged-in only. No PII expected in demo.
- **Data model sketch:** Invoice header (PO, total value, discount — header-level) → lines (stock id, qty, unit price) → storage receipts (stock id, storage, qty, datetime). Match on **Stock ID + Invoice number**. Full model in `DESIGN.md` §3.

---

## 5. Integrations
- **External systems to connect:** (payment, email, marketplaces, ERP, catalog feeds…) TBD
- **APIs / accounts you already have:** TBD
- **Auth methods available for those:** TBD

---

## 6. Hosting & Cloud
The tool must be online-functional and may run in the cloud.

- **Test hosting:** **GitHub** (static-friendly, no secrets). Real DB/API/auth/persistent archive at cloud stage.
- **Cloud preference:** TBD (drives backend adapters later — `DESIGN.md` §8).
- **Existing accounts or constraints:** TBD
- **Budget sensitivity:** TBD
- **Domain / branding needs:** TBD
- **Region / data residency requirements:** TBD

---

## 7. Look & Feel
- **Visual style:** (clean/minimal, luxury, playful, catalogue…) TBD
- **Brand colors / fonts / logo:** (drop assets in `inputs/`) TBD
- **Reference sites you like:** TBD
- **Device targets:** (desktop, mobile, both) TBD

---

## 8. Constraints
- **Deadline / timeline:** TBD
- **Team / who maintains it:** TBD
- **Technical constraints:** (must use X, can't use Y) TBD
- **Compliance:** (GDPR, PCI, SOC2, etc.) TBD

---

## 9. Nice-to-haves / Future
Things that are out of scope for v1 but worth noting.

- TBD

---

## 10. Open Questions
Anything you're unsure about and want me to weigh in on.

- TBD

---

### Notes / scratchpad
Freeform space — paste anything here and I'll organize it.
