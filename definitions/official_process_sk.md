# Official Process — Contra COGS at Perfumerie (Slovak jurisdiction)

> **Status:** AUTHORITATIVE — provided by the company. This governs the tool's core over any earlier assumption.
> **Note:** Original Slovak preserved verbatim below; English is an interpretation for the build. Where the two differ, the **Slovak original wins**.

---

## 1. Original (Slovak) — as provided
> Pri uplatnení Contra COGS (zníženie nákladov predaného tovaru, resp. započítanie maržových/marketingových príspevkov voči fakturácii za tovar) dodávateľ fakturuje tovar firme Perfumerie tak, že základná faktúra za dodaný tovar sa buď vystavuje so zníženou jednotkovou cenou už priamo pri expedícii, alebo dodávateľ dodáva tovar za štandardné ceny a zľavy/bonifikácie vyrovnáva formou dobropisov alebo súhrnných marketingových/kooperačných faktúr (Co-op), ktoré reálne znižujú konečný obstarávací náklad tovaru.
>
> V prípade doručovania tovaru do viacerých skladov (centrálny sklad vs. lokálne huby/pobočky) prebieha fakturácia a logistika nasledovne:
>
> **Dodávky a logistika**
> - **Deliace doklady (Delivery Notes):** Každá jedna fyzická dodávka do konkrétneho skladu firmy Perfumerie musí byť sprevádzaná samostatným dodacím listom s presnou špecifikáciou tovaru, množstva a identifikačným kódom cieľového skladu.
> - **Príjem na sklade (GR - Goods Receipt):** firma Perfumerie potvrdzuje príjem tovaru systémovo pre každý sklad zvlášť cez EDI správy (napr. RECADV), čo slúži ako podklad pre párovanie položiek na faktúre.
>
> **Postup fakturácie**
> - **Rozdelenie podľa skladov / miesta dodania:** Dodávateľ buď vystavuje samostatnú faktúru ku každej dodávke/skladu, alebo (v prípade centrálnej fakturácie) vystaví jednu súhrnnú faktúru za fakturačné obdobie, kde sú dodávky striktne rozpísané po jednotlivých strediskách/skladoch prostredníctvom položiek alebo príloh.
> - **Aplikácia Contra COGS:**
>   - **Položková úprava:** Ak je Contra COGS uplatnený priamo, čistá nákupná cena na faktúre pre jednotlivé sklady už zohľadňuje dohodnutý zľavový koeficient.
>   - **Zúčtovanie pozadia (Back-edge allowances):** Zľavy viazané na objemy či marketing pre viaceré sklady sa často vyúčtujú hromadne dobropisom voči centrálnej evidencii dodávok za daný mesiac.

---

## 2. English interpretation

### Two Contra COGS application models
- **Model A — Direct / line-item (Položková úprava):** the base invoice per warehouse is issued with a **reduced unit price at shipment**; the **net purchase price already reflects** the agreed discount coefficient.
- **Model B — Back-edge allowances (Zúčtovanie pozadia):** goods invoiced at **standard prices**; volume/marketing (Co-op) discounts are settled **in bulk via a credit note (dobropis) or summary Co-op invoice** against the **central monthly delivery record**, which really lowers the final acquisition cost.

### Deliveries & logistics
- **Delivery Notes (dodacie listy):** every physical delivery to a specific warehouse has its **own delivery note** — goods spec, quantity, and **target warehouse code**.
- **Goods Receipt (GR):** Perfumerie confirms receipt **per warehouse** via **EDI messages (e.g., RECADV)** — this is the **basis for matching invoice line items**.

### Invoicing procedure
- **Split by warehouse / place of delivery:** either a **separate invoice per delivery/warehouse**, or one **summary invoice per billing period** with deliveries **strictly broken down per warehouse** (line items or attachments).
- **Applying Contra COGS:** via **Model A** (net price on invoice) or **Model B** (bulk monthly credit note against central delivery record).

---

## 3. What this confirms vs. what remains to confirm
**Confirmed by this document:**
- Two contra COGS models (direct line-item **and** back-edge volume/marketing allowance).
- Volume/marketing discounts for multiple warehouses are settled **monthly, in bulk, via credit note (dobropis) / Co-op invoice** against the **central delivery record** → this is where a **pending internal contra COGS credit** lives until cleared.
- Matching basis = **GR per warehouse (EDI RECADV)** + **delivery note with target warehouse code**.
- Invoices may be **per-warehouse** or **summary broken down by warehouse**.

**Still user-provided (confirm; NOT stated in this text):**
- Exact **tier percentages** (5,000→1% / 5,000–10,000→1.5% / >10,000→2%).
- The **proforma invoice** step.
- The rule that the **legal invoice covers only goods delivered within the month** (Slovak law) — plausible and consistent, but not written here.

---

## 4. Implications for the tool (core)
1. **Support BOTH models** (A direct line-item, B back-edge allowance) — user chooses/records which applies per supplier/invoice. This **supersedes** the earlier "discount is fixed at invoice level" assumption (that was only Model A).
2. **Ingest delivery notes** (per delivery, with target warehouse code) as a distinct document from the invoice.
3. **Ingest GR / RECADV** per warehouse as the **matching basis** (received confirmation).
4. **Support invoice types:** per-warehouse invoice **and** summary invoice broken down by warehouse.
5. **Back-edge settlement object:** model the **monthly credit note (dobropis) / Co-op invoice** against the central monthly delivery record; hold a **pending contra COGS credit** until the volume/period condition is cleared.
6. **Matching chain:** Delivery Note (warehouse code) → GR/RECADV (per warehouse) → Invoice line (Stock ID + Invoice number) → back-edge credit note (central monthly record).

## Sources
- Company-provided official process (Slovak), pasted 2026-08-17 — authoritative internal source (no external URL).
