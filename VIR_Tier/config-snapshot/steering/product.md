# Product Overview

This workspace contains tools and analytics for an Accounts Receivable (AR) operations team. The primary systems are:

## Atlas — Account Health Intelligence Platform
Deterministic scoring system that evaluates ~25,800 accounts on a 1–10 scale (10 = best) across 128 individual scores, 12 grouped health domains, and 8 analytical dimensions. No ML — all thresholds are fixed. Produces health categories, behavior flags, collection lever effectiveness (CLE) scores, automation recommendations, and escalation eligibility. The scoring pipeline has 5 layers: raw data → derived metrics → scoring → consolidation → analysis.

## ACM — Credit Memo Analysis
Tools for analyzing open credit memos: classifying them into offset, write-off, and reversal scenarios against original invoices. Operates on AR aging data from Redshift.

## Reconciliation
Transaction-level reconciliation for specific accounts. Matches credit notes to original invoices, identifies re-invoices (tax corrections), tracks disputed items, and produces aging/net position summaries.

## Company Product Demos
Static HTML/CSS demo sites for fictional companies (FixLine, NimbusLink, PawHaven, SteadyShield, TurboInterior) and a product analysis dashboard. These are presentation artifacts, not production applications.

## Resume
Personal portfolio site with interactive prototypes (career journey, radar charts, chat bubbles, game, etc.).
