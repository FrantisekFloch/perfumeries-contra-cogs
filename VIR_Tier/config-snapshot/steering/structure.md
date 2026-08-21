# Project Structure

```
├── Atlas/                          # Account Health Intelligence Platform
│   ├── SQL_Queries/                # Numbered pipeline queries (Redshift SQL)
│   │   ├── 00_pipeline_overview.md # Pipeline architecture documentation
│   │   ├── 01_preempt_table.sql   # Prereq: preempt restriction events
│   │   ├── 03_scoring.sql         # Layer 3: 128 individual scores
│   │   ├── 04_final_score.sql     # Layer 4: composite + suspension analysis
│   │   ├── 05_final_analysis.sql  # Layer 5: CLE, dimensions, profiles
│   │   └── 06_health_narrative.sql# Layer 5: human-readable narratives
│   ├── data/                       # Analysis outputs and data docs
│   │   ├── data_structure.md       # Column inventory (431 columns)
│   │   ├── behavior_analysis.md    # Account clustering results
│   │   └── query2_account_metrics.csv  # Raw data export (25K+ accounts)
│   ├── analyze_data.js             # Node.js CSV analyzer (generates data/ outputs)
│   ├── analyze_data.test.js        # Jest tests for analyzer
│   ├── atlas_ml_schema.json        # Machine-readable schema for ML consumers
│   ├── Atlas_Product_Documentation.md  # Full product documentation
│   ├── atlas-goals.md              # Strategy: collection levers + categorization
│   └── *.sql, *.md                 # Supporting queries and reference docs
│
├── ACM/                            # Credit Memo Analysis
│   ├── CM_simplified.sql           # Scenario classification query (offset/writeoff/reversal)
│   ├── analyze_cm.ps1              # PowerShell CM analysis (streaming CSV)
│   ├── analyze_offset_by_sc.ps1    # Offset analysis by service center
│   ├── analyze_offset_potential.ps1# Offset potential analysis
│   └── export_offset_excel.ps1     # Excel export for offset data
│
├── Reconciliation/                 # Account Reconciliation Tools
│   ├── reconciliation.js           # Node.js reconciliation report
│   ├── reconciliation.ps1          # PowerShell reconciliation report
│   ├── ReconTool/recon_tool.html   # Interactive HTML reconciliation tool
│   └── *.csv, *.xlsx, *.ps1       # Data files and supporting scripts
│
├── Company_Product/                # Static HTML demo sites
│   ├── FixLine/                    # Telecom company demo
│   ├── NimbusLink/                 # Cloud services demo
│   ├── PawHaven/                   # Pet services demo
│   ├── SteadyShield/              # Insurance demo
│   ├── TurboInterior/             # Interior design demo
│   └── Product/                    # Product analysis dashboard
│
├── Resume/                         # Personal portfolio site
│   ├── index.html                  # Main resume page
│   └── proto_*.html                # Interactive prototypes
│
├── SQL_Optimizer/                   # Standalone SQL optimization
└── Month_End_Documents/            # (empty — placeholder for reports)
```

## Key Conventions
- Atlas SQL queries are numbered by pipeline stage — execute in order (01 → 03 → 04 → 05 → 06). Queries 1 and 2 run as scheduled Redshift jobs and are not in this repo.
- JS and PS1 scripts often exist in parallel for the same task (e.g., `reconciliation.js` + `reconciliation.ps1`), providing the same logic in both runtimes.
- Data files (CSV, XLSX) live alongside the scripts that consume them.
- HTML demo sites are self-contained per folder with their own `styles.css`.
