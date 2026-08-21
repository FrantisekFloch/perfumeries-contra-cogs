# Tech Stack & Tools

## Languages
- SQL (Redshift dialect) — primary language for the Atlas scoring pipeline and ACM analysis
- PowerShell — data analysis scripts, CSV processing, report generation
- JavaScript (Node.js, CommonJS) — CSV analysis, reconciliation reports, data transformation
- HTML/CSS — static demo sites and interactive prototypes

## Database
- Amazon Redshift — all SQL queries target Redshift (uses `LAST_DAY()`, `ADD_MONTHS()`, `CREATE TEMP TABLE`, Redshift-specific syntax)
- Schemas: `semantic`, `finops_dm`, `lake`, `booker`, `semantic_etl_aws`

## Runtime
- Node.js with CommonJS modules (`require`/`module.exports`)
- No package.json or npm dependencies — scripts use only Node.js built-in modules (`fs`, `path`, `readline`)
- PowerShell 5.1+ (Windows)

## Testing
- Jest for JavaScript unit tests (see `Atlas/analyze_data.test.js`)
- Run tests: `node --experimental-vm-modules node_modules/.bin/jest` or `npx jest`

## Key Patterns
- CSV parsing is hand-rolled (no Papa Parse or csv-parse) — both JS and PS1 scripts implement custom quoted-field CSV parsers
- PowerShell scripts use streaming `[System.IO.StreamReader]` for large CSV files rather than `Import-Csv` for performance
- SQL queries use numbered prefixes (`01_`, `03_`, `04_`, etc.) indicating pipeline execution order
- JavaScript analysis scripts export functions for testability and guard `main()` behind `require.main === module`

## Common Commands
```bash
# Run Atlas data analyzer
node Atlas/analyze_data.js

# Run Atlas tests
npx jest Atlas/analyze_data.test.js

# Run reconciliation report
node Reconciliation/reconciliation.js

# Run PowerShell analysis (from repo root)
powershell -File ACM/analyze_cm.ps1
powershell -File Reconciliation/reconciliation.ps1
```

## No Build System
There is no build step, bundler, or transpiler. All scripts run directly.
