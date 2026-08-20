// Regulatory notes — single source of truth for the on-hover explanations
// (Req 12). The UI tooltip layer reads from here so wording stays consistent.
// Each note: { short, regulation, sourceLabel }.

export const REG_NOTES = Object.freeze({
  CONTROL_PERIOD: {
    short: 'Volume is recognised in the period the goods are actually received (transfer of control), not when ordered or paid.',
    regulation: 'IFRS 15 / US GAAP ASC 606 — revenue and related volume recorded on transfer of control.',
    sourceLabel: 'IFRS/GAAP — transfer of control',
  },
  VAT_TAX_POINT: {
    short: 'The EU VAT chargeable event is triggered by shipment OR by upfront pre-payment, whichever occurs first — tracked separately from the control period.',
    regulation: 'EU VAT Directive 2006/112/EC — tax point on supply or on receipt of payment on account.',
    sourceLabel: 'EU VAT — tax point',
  },
  VAT_DIVERGENCE: {
    short: 'The VAT tax point falls in a different period than the control period; both are retained for audit and neither is merged.',
    regulation: 'Financial (control) timing vs VAT (chargeable event) timing are recorded independently.',
    sourceLabel: 'Timing divergence',
  },
  RETURN_REJECTION: {
    short: 'The supplier rejected the return, so the units remain purchased volume and stay in the rebate base.',
    regulation: 'Rejected returns are not deducted from qualifying purchase volume.',
    sourceLabel: 'Leakage driver — return rejection',
  },
  OVERAGE_SHIPMENT: {
    short: 'Units received beyond the ordered quantity were retained and count toward qualifying volume.',
    regulation: 'Retained overage is included in the rebate base.',
    sourceLabel: 'Leakage driver — overage',
  },
  BACKORDERING: {
    short: 'Back-ordered units qualify in the period they are actually received (transfer of control), with the cross-period movement flagged.',
    regulation: 'IFRS/GAAP transfer of control governs the qualifying period.',
    sourceLabel: 'Leakage driver — backordering',
  },
  LATE_SHIPMENT: {
    short: 'Late-arriving units qualify in their actual receipt period (transfer of control); the timing miss is flagged for review.',
    regulation: 'IFRS/GAAP transfer of control governs the qualifying period.',
    sourceLabel: 'Leakage driver — late shipment',
  },
  PAN_EU_SPLIT: {
    short: 'Volume split across SK/PL/CZ is aggregated against one agreement, so combined volume can reach a higher tier than any country alone.',
    regulation: 'Pan-EU aggregation clause combines qualifying volume across covered countries.',
    sourceLabel: 'Leakage driver — pan-EU split',
  },
  EXPIRED_WINDOW_LATE_DELIVERY: {
    short: 'Goods were ORDERED while the contract was valid but unloaded/scanned after it ended. Entitlement follows the order date, so the rebate is still claimable — the current engine wrongly drops it because the delivery-note date is out of window.',
    regulation: 'Eligibility keys off the order/invoice date within the contract term; delivery may fall later.',
    sourceLabel: 'Loss — ordered in-window, delivered late',
  },
  FOUND_LATER_PALLET: {
    short: 'A pallet short-scanned at receipt was located later. Those units belong to the same in-window order and lift the qualifying volume — often crossing into a higher tier (a True-Up).',
    regulation: 'Located goods from an in-window order are added to qualifying volume.',
    sourceLabel: 'Loss — found-later pallet',
  },
  FORGOTTEN_SKU: {
    short: 'A SKU covered by the contract was never configured in the internal CCOGS engine, so its volume was never counted. Adding it raises the combined volume and the applicable tier.',
    regulation: 'All contract SKUs count toward the tier; a mis-configured engine understates volume.',
    sourceLabel: 'Loss — forgotten contract SKU',
  },
  REROUTE_SKIPPED_SCAN: {
    short: 'Under high demand the goods were loaded onto a town-warehouse truck at the country DC without the main-warehouse unload/delivery-note scan. The goods were delivered — only a scan step was skipped, which the current engine treats as non-delivery.',
    regulation: 'A skipped internal scan does not negate delivery; goods reached the destination.',
    sourceLabel: 'Loss — reroute / skipped scan',
  },
  ML_INPUTS: {
    short: 'The consolidated source data the model reads: invoices, delivery notes, goods receipts, missing-data events and CCOGS engine outputs.',
    regulation: 'Features are derived only from ingested, provenance-tracked records.',
    sourceLabel: 'ML — inputs',
  },
  ML_SIGNALS: {
    short: 'Four transparent signals per agreement: magnitude (vs peers), under-claim lift, leakage-driver pressure, and tier proximity.',
    regulation: 'Each signal is a normalised 0–1 heuristic, fully reproducible from the data.',
    sourceLabel: 'ML — feature signals',
  },
  ML_MODEL: {
    short: 'A transparent weighted composite (not a black box): 0.40·magnitude + 0.30·lift + 0.20·driverPressure + 0.10·tierProximity.',
    regulation: 'Explainable heuristic ensemble; every score is auditable and reproducible.',
    sourceLabel: 'ML — scoring model',
  },
  ML_FINDINGS: {
    short: 'Ranked recovery opportunities with score, confidence and a plain-language reason. Suggestions only — the analyst decides.',
    regulation: 'Findings are never auto-applied; they direct human review.',
    sourceLabel: 'ML — ranked findings',
  },
});

export function regNote(key) {
  return REG_NOTES[key] ?? { short: key, regulation: '', sourceLabel: key };
}

/** All keys the UI is expected to be able to explain. */
export const REG_NOTE_KEYS = Object.freeze(Object.keys(REG_NOTES));
