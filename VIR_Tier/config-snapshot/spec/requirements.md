# Requirements Document — VIR_Tier Recovery Engine

## Introduction

VIR_Tier is a new, standalone sub-tool in `Perfumeries/VIR_Tier/`. It serves the RECEIVER (buyer) — a large retailer operating in Slovakia (SK), Poland (PL), and Czechia (CZ) with a broad supplier base and many active Contra COGS (CCOGS) agreements. Unlike the existing reconciliation tool (kept as-is in `Perfumeries/build/`), which verifies whether contra baked into an invoice was justified, VIR_Tier is **recovery-focused**: it detects **under-claimed CCOGS** caused by operational events the current process fails to consolidate, reconstructs the true qualifying volume, determines the Volume Incentive Rebate (VIR) tier that should apply, captures the variance against what was actually claimed, and generates **supplementing charges** (debit-note/claim style) that a finance approver reviews before they are exported or injected into the buyer's billing.

The tool must be online-functional and hostable on GitHub in a static-friendly form for the demo, architected in layers (data-source, persistence, authentication) so a later cloud version reuses the same recovery engine and UI. The engine's rebate structure, measurement basis, period, and aggregation scope are all user-selectable and recompute in real time; none are hard-coded.

## Glossary

- **VIR_Tier_Tool**: The complete recovery application described by this document (the system).
- **Receiver**: The buyer/retailer operating across SK, PL, CZ who owns the purchasing data and operates the tool.
- **Country**: One of SK, PL, CZ — a jurisdiction with its own regulatory currency (SK→EUR, CZ→CZK, PL→PLN).
- **Supplier**: A manufacturer/vendor party to a CCOGS agreement with the Receiver.
- **CCOGS**: Contra Cost of Goods Sold — a supplier-funded reduction to cost (volume rebate/VIR, marketing allowance, advertising, co-op) that the Receiver is entitled to claim.
- **VIR**: Volume Incentive Rebate — a rebate earned by reaching purchase-volume thresholds over a period.
- **Agreement**: A supplier CCOGS agreement defining rebate structure, tier bands, measurement basis, period, aggregation scope, currency, retrospective reach, and effective dates.
- **Rebate_Structure**: The calculation method — Retrospective_Tiered, Sliding_Incremental, Flat_Percentage, or Per_Unit.
- **Measurement_Basis**: The quantity the tier is measured on — Units, Value, or Weight.
- **Period**: The measurement window — Month, Quarter, or Year.
- **Aggregation_Scope**: Per_Country or Pan_EU (SK+PL+CZ combined) — read from the Agreement.
- **Qualifying_Volume**: The true purchase volume that counts toward a tier after consolidating all events and corrections.
- **Reconstructed_Volume**: Qualifying_Volume as recomputed by VIR_Tier from source events, per Measurement_Basis and Aggregation_Scope.
- **Leakage_Driver**: One of the five operational event types that suppress Qualifying_Volume — Return_Rejection, Overage_Shipment, Backordering, Late_Shipment, Pan_EU_Split.
- **Control_Period**: The Period in which transfer of control occurs (goods shipped/received). Under IFRS/GAAP this is when the event is recorded; it drives tier qualification for rebate volume.
- **VAT_Tax_Point**: The EU VAT chargeable event — triggered by shipment or by upfront pre-payment, whichever occurs first. Tracked separately from Control_Period and only when the triggering data is present.
- **Regulatory_Note**: A short, source-referenced explanation (IFRS/GAAP control rule or EU VAT tax-point rule) surfaced on hover wherever a timing-sensitive value is displayed.
- **Consolidation_Engine**: The component that ingests and consolidates purchases, receipts, and the five Leakage_Driver event types across countries.
- **Volume_Reconstruction_Engine**: The component that recomputes Reconstructed_Volume per basis, period, and scope, applying each Leakage_Driver correction.
- **Rebate_Engine**: The component that computes Entitled_CCOGS from Reconstructed_Volume using the selected Rebate_Structure, and re-derives it in real time when selections change.
- **Entitled_CCOGS**: The CCOGS the Receiver should have claimed, given Reconstructed_Volume and the applicable tier.
- **Claimed_CCOGS**: The CCOGS actually claimed/booked by the existing CCOGS Engine.
- **Variance**: Entitled_CCOGS minus Claimed_CCOGS — the recoverable amount when positive.
- **Supplementing_Charge**: A debit-note/claim document line, per supplier and agreement, for a positive Variance.
- **Audit_Trace**: The full, immutable chain from a Supplementing_Charge to its Variance calculation, Reconstructed_Volume, source events, and the Agreement clause that grants the entitlement.
- **Finance_Approver**: The single finance role that reviews the full Supplementing_Charge document and approves before export/injection.
- **Billing_Injection**: The handoff that places an approved Supplementing_Charge into the Receiver's billing (simulated in the demo).
- **FX_Consolidation**: Optional conversion of multi-currency values to EUR for pan-EU value-based aggregation and viewing.
- **Data_Source_Adapter**: Abstraction with Database, API, and Folder implementations supplying documents without the engine depending on source type.

## Requirements

### Requirement 1: Data Ingestion and Consolidation Across Countries

**User Story:** As a Receiver, I want purchases, receipts, and operational events from SK, PL, and CZ consolidated into one dataset per supplier, so that rebate volume can be measured on complete data.

#### Acceptance Criteria

1. WHEN documents are ingested, THE Consolidation_Engine SHALL parse supplier Agreements, purchase records, receipt records, and the five Leakage_Driver event types, and SHALL record source-file provenance for every record.
2. THE Consolidation_Engine SHALL tag every purchase, receipt, and event record with its originating Country.
3. THE Consolidation_Engine SHALL consolidate records per Supplier and per Agreement across all Countries in scope.
4. IF a record cannot be parsed, THEN THE Consolidation_Engine SHALL record a descriptive error identifying the file and reason and SHALL continue processing remaining records.
5. THE VIR_Tier_Tool SHALL access all inputs through the Data_Source_Adapter abstraction so Database and API adapters can be implemented later without changing the Consolidation_Engine, Volume_Reconstruction_Engine, Rebate_Engine, or UI.
6. IF an Agreement omits a required configuration value (structure, tier bands, basis, period, scope, currency), THEN THE Consolidation_Engine SHALL flag the Agreement as incomplete and record each missing value.

### Requirement 2: Leakage Driver Detection and Volume Correction

**User Story:** As a Receiver, I want the tool to detect the five leakage drivers and correct the qualifying volume, so that suppressed volume is restored to the rebate base.

#### Acceptance Criteria

1. WHERE a Return_Rejection is present, THE Volume_Reconstruction_Engine SHALL keep the rejected-return units in Qualifying_Volume as purchased volume, rather than netting them out.
2. WHERE an Overage_Shipment is present, THE Volume_Reconstruction_Engine SHALL include received-and-retained overage units in Qualifying_Volume even when they exceed the ordered quantity.
3. WHERE Backordering causes units to be received in a later Period, THE Volume_Reconstruction_Engine SHALL attribute those units to their Control_Period (the period of actual receipt / transfer of control) for tier qualification and SHALL flag the cross-period movement.
4. WHERE a Late_Shipment causes a receipt to fall outside its intended Period, THE Volume_Reconstruction_Engine SHALL attribute the units to their Control_Period (actual receipt) for tier qualification and SHALL flag the timing miss for review.
5. WHERE an Agreement's Aggregation_Scope is Pan_EU, THE Volume_Reconstruction_Engine SHALL aggregate Qualifying_Volume across SK, PL, and CZ before tier determination.
6. WHERE an Agreement's Aggregation_Scope is Per_Country, THE Volume_Reconstruction_Engine SHALL keep Qualifying_Volume separate per Country.
7. FOR EACH applied correction, THE Volume_Reconstruction_Engine SHALL attach the identifying Leakage_Driver, the affected records, and the volume delta to the Audit_Trace.
8. THE Volume_Reconstruction_Engine SHALL NOT double count units that appear in more than one source record for the same physical goods.

### Requirement 3: Configurable Rebate Engine with Real-Time Recalculation

**User Story:** As a Receiver, I want to select the rebate structure, basis, period, and scope and see calculations update immediately, so that I can compute the correct entitlement for each use case.

#### Acceptance Criteria

1. THE Rebate_Engine SHALL support Rebate_Structure values Retrospective_Tiered, Sliding_Incremental, Flat_Percentage, and Per_Unit.
2. THE Rebate_Engine SHALL support Measurement_Basis values Units, Value, and Weight.
3. THE Rebate_Engine SHALL support Period values Month, Quarter, and Year.
4. THE Rebate_Engine SHALL support Aggregation_Scope values Per_Country and Pan_EU.
5. WHEN a user changes any of Rebate_Structure, Measurement_Basis, Period, or Aggregation_Scope, THE Rebate_Engine SHALL recompute Entitled_CCOGS from the current Reconstructed_Volume without requiring re-ingestion.
6. WHERE Rebate_Structure is Retrospective_Tiered, THE Rebate_Engine SHALL apply the achieved tier's rate to the entire Qualifying_Volume once its threshold is crossed.
7. WHERE Rebate_Structure is Sliding_Incremental, THE Rebate_Engine SHALL apply each tier band's rate only to the units that fall within that band.
8. THE Rebate_Engine SHALL read tier bands, rates, basis, period, scope, currency, and retrospective reach from the Agreement and SHALL NOT hard-code them.
9. WHERE an Agreement defines retrospective reach as within-period, THE Rebate_Engine SHALL reclaim only within the current Period; WHERE it defines reach as prior-periods, THE Rebate_Engine SHALL reopen the affected prior closed Periods for recomputation.

### Requirement 4: Multi-Currency Handling

**User Story:** As a Receiver operating in three currencies, I want values kept in their regulatory currency and optionally consolidated to EUR, so that pan-EU aggregation and reporting are correct.

#### Acceptance Criteria

1. THE VIR_Tier_Tool SHALL record each monetary amount in the Country's regulatory currency (SK→EUR, CZ→CZK, PL→PLN).
2. WHERE an Agreement carries more than one currency, THE VIR_Tier_Tool SHALL retain each amount in its native currency and SHALL NOT silently merge currencies.
3. WHEN a user enables FX_Consolidation, THE VIR_Tier_Tool SHALL convert values to EUR using a recorded FX rate and SHALL display amounts in EUR while retaining the native values.
4. WHERE Measurement_Basis is Value AND Aggregation_Scope is Pan_EU AND currencies differ, THE Rebate_Engine SHALL require FX_Consolidation before aggregating and SHALL record the FX rate used in the Audit_Trace.
5. WHERE Measurement_Basis is Units or Weight, THE Rebate_Engine SHALL aggregate Pan_EU volume without FX conversion.

### Requirement 5: Variance Detection and Supplementing Charge Generation

**User Story:** As a Receiver, I want the tool to compute the recoverable variance and produce a supplementing charge, so that I can claim the under-collected CCOGS from the supplier.

#### Acceptance Criteria

1. THE VIR_Tier_Tool SHALL compute Variance as Entitled_CCOGS minus Claimed_CCOGS per Supplier and Agreement.
2. WHEN Variance is positive, THE VIR_Tier_Tool SHALL generate a Supplementing_Charge for that amount referencing the Supplier, Agreement, Period, and Aggregation_Scope.
3. WHEN Variance is zero or negative, THE VIR_Tier_Tool SHALL record no Supplementing_Charge and SHALL retain the calculation for audit.
4. THE VIR_Tier_Tool SHALL express each Supplementing_Charge in the Agreement's settlement currency and SHALL show the EUR equivalent when FX_Consolidation is enabled.
5. FOR EACH Supplementing_Charge, THE VIR_Tier_Tool SHALL construct an Audit_Trace linking the charge to its Variance calculation, the Reconstructed_Volume, the contributing source events, and the Agreement clause granting the entitlement.

### Requirement 6: Audit Trace Integrity

**User Story:** As an auditor, I want every supplementing charge fully traceable and immutable, so that each recovered amount is defensible.

#### Acceptance Criteria

1. THE Audit_Trace SHALL record, for each Supplementing_Charge, the actor, timestamp, selected Rebate_Structure, Measurement_Basis, Period, Aggregation_Scope, tier applied, and any FX rate used.
2. THE Audit_Trace SHALL be append-only and immutable once an entry is recorded.
3. THE VIR_Tier_Tool SHALL retain source-file provenance for every record contributing to a Supplementing_Charge.
4. WHEN a Supplementing_Charge is recomputed after a selection change, THE VIR_Tier_Tool SHALL append a new Audit_Trace entry rather than altering prior entries.
5. THE VIR_Tier_Tool SHALL NOT apply any adjustment to Qualifying_Volume, Entitled_CCOGS, or a Supplementing_Charge without a corresponding Audit_Trace entry.

### Requirement 7: Finance Approval Workflow

**User Story:** As a Finance_Approver, I want to review a complete supplementing-charge document before it is used, so that only validated claims proceed.

#### Acceptance Criteria

1. WHEN a Supplementing_Charge is generated, THE VIR_Tier_Tool SHALL set its status to Pending_Approval.
2. WHEN the Finance_Approver opens a Supplementing_Charge, THE VIR_Tier_Tool SHALL present a full document containing the Variance calculation, Reconstructed_Volume, contributing source events, applied Leakage_Driver corrections, the Agreement clause, and the Audit_Trace.
3. WHEN the Finance_Approver approves a Supplementing_Charge, THE VIR_Tier_Tool SHALL set its status to Approved and SHALL append the approval to the Audit_Trace.
4. WHEN the Finance_Approver rejects a Supplementing_Charge, THE VIR_Tier_Tool SHALL set its status to Rejected, SHALL record the reason, and SHALL append the rejection to the Audit_Trace.
5. THE VIR_Tier_Tool SHALL NOT export or inject a Supplementing_Charge that is not in status Approved.

### Requirement 8: Billing Injection and Export (Show-First)

**User Story:** As a Receiver, I want to review charges first and then choose how to export or inject them, so that I control what enters billing.

#### Acceptance Criteria

1. WHEN Supplementing_Charges exist, THE VIR_Tier_Tool SHALL display them for review before any export or injection.
2. AFTER review, THE VIR_Tier_Tool SHALL prompt the user to choose between exporting the charge and injecting it into billing.
3. WHEN the user chooses export, THE VIR_Tier_Tool SHALL export the approved Supplementing_Charge with its Audit_Trace in a documented format.
4. WHEN the user chooses injection, THE VIR_Tier_Tool SHALL perform Billing_Injection and SHALL append the injection to the Audit_Trace.
5. WHERE the tool runs as a static demo, THE VIR_Tier_Tool SHALL simulate Billing_Injection as an in-app state change plus an exportable payload, deferring live billing posting to the cloud stage.

### Requirement 9: Roles and Views

**User Story:** As a user with a specific role, I want a view suited to my responsibilities, so that I see the relevant recovery information.

#### Acceptance Criteria

1. WHEN a user logs in, THE VIR_Tier_Tool SHALL determine the user's role and present the matching view.
2. WHERE the role is Analyst, THE VIR_Tier_Tool SHALL show detected leakage, Reconstructed_Volume, tier determination, and draft Supplementing_Charges with the selectable rebate controls.
3. WHERE the role is Finance_Approver, THE VIR_Tier_Tool SHALL show the approval queue and the full review document per charge.
4. WHERE the role is Finance overview, THE VIR_Tier_Tool SHALL show portfolio recovery totals by Supplier, Country, and Period with drill-down to the underlying charges.
5. WHERE the tool runs as a static demo, THE VIR_Tier_Tool SHALL provide client-side role selection and SHALL defer real authentication to the cloud stage.

### Requirement 10: Layered Architecture and Static-Friendly Demo

**User Story:** As a Receiver, I want the demo to run online on GitHub with no secrets while sharing its core with the future cloud version, so that the same recovery engine and UI serve both stages.

#### Acceptance Criteria

1. THE VIR_Tier_Tool SHALL run as a static-friendly, online-functional demo hostable on GitHub.
2. THE VIR_Tier_Tool SHALL exclude secrets and credentials from the demo build and repository.
3. THE VIR_Tier_Tool SHALL separate the data-source, persistence, and authentication layers from the recovery engine and UI so the demo and cloud versions share the recovery engine and UI and differ only in those three layers.
4. WHERE the tool moves to the cloud stage, THE VIR_Tier_Tool SHALL replace the data-source, persistence, and authentication layers without changing the recovery engine or UI.
5. THE VIR_Tier_Tool SHALL be independent of the existing reconciliation tool in `Perfumeries/build/` and SHALL NOT require it to run.

### Requirement 13: CCOGS Engine Output and Before/After

**User Story:** As a Receiver, I want to audit against what the CCOGS Engine actually produced and see the before/after, so that the recovery and the cost of doing nothing are explicit.

#### Acceptance Criteria

1. THE Consolidation_Engine SHALL ingest a CCOGS_Engine_Output document per agreement/scope/period as a distinct input, recording the engine volume, tier applied, claimed amount, document type, currency, and provenance.
2. THE VIR_Tier_Tool SHALL use the CCOGS_Engine_Output as the "before" (Claimed_CCOGS) baseline that recovery is audited against, falling back to a Claimed_CCOGS record when no engine output is present.
3. FOR EACH agreement/scope/period, THE VIR_Tier_Tool SHALL present a Before (engine claimed) and After (tool reconstructed entitled) comparison.
4. THE VIR_Tier_Tool SHALL compute a Cost_Of_Inaction equal to the recoverable Variance (the leakage left on the table if no action is taken) and SHALL display it per agreement and in portfolio totals.

### Requirement 14: ML Discovery Stage

**User Story:** As an Analyst, I want an explainable ML discovery stage that surfaces the outliers and ranks opportunities before I decide, so that I can focus on what matters without weeks of manual review.

#### Acceptance Criteria

1. THE VIR_Tier_Tool SHALL run an ML_Discovery stage on the before/after results BEFORE the deterministic suggestions and the human decision.
2. THE ML_Discovery stage SHALL rank recovery opportunities using transparent, auditable signals (magnitude vs peers, under-claim lift, leakage-driver pressure, tier proximity) and SHALL emit a score, a confidence, and a plain-language reason for each finding.
3. THE ML_Discovery stage SHALL emit pattern insights, each flagged as computed or illustrative, to direct the analyst's attention (concentration, near-miss clusters, pan-EU aggregation, and illustrative model-style anomaly flags).
4. THE VIR_Tier_Tool SHALL present ML_Discovery findings as suggestions the user MAY choose to act on, and SHALL NOT auto-apply them.
5. THE ML_Discovery stage SHALL NOT be a black box: every score SHALL be reproducible from the displayed signals.

### Requirement 15: CSV Export (Billing-Ingestible)

**User Story:** As a Receiver, I want approved charges exported as CSV, so that the buyer's billing system can ingest them.

#### Acceptance Criteria

1. WHEN an approved Supplementing_Charge is exported, THE VIR_Tier_Tool SHALL produce a CSV row per charge with a documented header suitable for billing ingestion.
2. THE VIR_Tier_Tool SHALL produce a companion audit-trail CSV for each exported charge.
3. THE VIR_Tier_Tool SHALL use CSV as the primary export format rather than JSON.
4. WHEN a charge is injected into billing, THE VIR_Tier_Tool SHALL hand off the CSV payload (simulated in the demo).

### Requirement 16: Light Theme

**User Story:** As a user, I want the tool in the standard light theme, so that it matches our other tools and is comfortable to scan.

#### Acceptance Criteria

1. THE VIR_Tier_Tool SHALL use a light theme: warm light-gray page, white content cards, a green accent, and charcoal reserved for the top navigation only.
2. THE VIR_Tier_Tool SHALL NOT use a dark/black page background.

### Requirement 11: Timing — Transfer of Control vs VAT Tax Point

**User Story:** As a Receiver, I want rebate volume timed by transfer of control while any VAT tax point is tracked separately, so that tier qualification is correct and VAT events are not conflated with volume.

#### Acceptance Criteria

1. FOR EACH receipt, THE Volume_Reconstruction_Engine SHALL record a Control_Period derived from the actual receipt/shipment date (transfer of control).
2. THE Rebate_Engine SHALL determine tier qualification using Control_Period, independent of order date or payment date.
3. WHERE pre-payment or shipment data establishes a VAT_Tax_Point, THE VIR_Tier_Tool SHALL record the VAT_Tax_Point as a separate attribute and SHALL NOT merge it with Control_Period.
4. WHERE no data establishes a VAT_Tax_Point, THE VIR_Tier_Tool SHALL leave it unset and SHALL NOT assume one.
5. WHEN Control_Period and VAT_Tax_Point fall in different Periods, THE VIR_Tier_Tool SHALL flag the divergence and SHALL retain both values in the Audit_Trace.

### Requirement 12: Regulatory Explanations on Display (Hover)

**User Story:** As a user reviewing timing-sensitive figures, I want the governing definition and regulation available on hover, so that I understand why a value is timed the way it is.

#### Acceptance Criteria

1. WHERE the UI displays a Control_Period, a VAT_Tax_Point, or a Leakage_Driver correction, THE VIR_Tier_Tool SHALL provide a Regulatory_Note on hover explaining the applicable definition and regulation.
2. THE Regulatory_Note for Control_Period SHALL state the IFRS/GAAP transfer-of-control basis for recording the event.
3. THE Regulatory_Note for VAT_Tax_Point SHALL state the EU VAT rule that the tax point is triggered by shipment or upfront pre-payment, whichever occurs first.
4. THE VIR_Tier_Tool SHALL source Regulatory_Note text from a single maintained definitions source so wording stays consistent across the UI.
