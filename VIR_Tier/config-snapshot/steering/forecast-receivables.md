# Forecast Receivables

## Purpose
Receivables forecasting analysis — static account lists, RLS (Row-Level Security) views, and sales hierarchy queries used to project future AR positions and manage Tableau/QuickSight access control for a defined set of payer accounts.

## Location
- `Forecast_Receivables/` — root folder
- `Forecast_Receivables/SQL_Queries/` — Redshift SQL queries

## Key Files
- `SQL_Queries/payer_list.sql` — Static CTE containing 658 payer account numbers. Used as a base filter for downstream queries that join against SOT/aging/transaction tables.
- `SQL_Queries/rls_summary_view.sql` — RLS view (`v_tab_aws_opal_rls_summary`) mapping permission groups to BU/SUB BU/Sales Region/Segment/GTM Sectors/Customer Type/Sales Geo.
- `SQL_Queries/rls_group_view.sql` — Simplified RLS view (`v_tab_aws_opal_rls_group`) with GroupName → column1 (BU) + column2 (geo/industry).
- `SQL_Queries/rls_cfo_view.sql` — RLS CFO view (`v_tab_aws_opal_rls_cfo`) mapping permission groups to "Sales Geo Code" (industry verticals).
- `SQL_Queries/sales_hierarchy_leads.sql` — Resolves the deepest unique lead from the sales hierarchy (L13→L01) with BU/SUB_BU/GEO/Sales_Region.

## Conventions
- SQL queries use `WITH payer_list AS (...)` CTE pattern with `UNION ALL SELECT` for static account lists
- Column alias for account numbers: `sot_number`
- All queries target Amazon Redshift
- Account numbers are stored as VARCHAR (quoted strings), not integers — preserves leading zeros
- RLS views use `CREATE OR REPLACE VIEW ... WITH NO SCHEMA BINDING` pattern
- Views live in schema `semantic_aws`

## Sales Hierarchy Logic
- Source table: `galaxi_eps_galaxi_byod_group_saleshierarchy.saleshierarchy_flatalllevels_iy`
- Hierarchy levels: L01 (top/BU) through L13 (bottom/territory)
- Data quirk: when a hierarchy ends at e.g. L10, that person's name is repeated in L11–L13
- To find the real owner at each level, compare each level to the one above — only pick a level if it **differs** from its parent
- `'aws-ua'` is a placeholder meaning "unassigned" — always treat as NULL via `NULLIF(lXX_primary_lead, 'aws-ua')`
