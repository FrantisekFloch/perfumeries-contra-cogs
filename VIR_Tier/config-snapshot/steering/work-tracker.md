# Work Tracker

## Purpose
Standalone HTML/JS daily work logging tool. Replaces manual Excel time tracking with a clean, catalogue-style UI. Users log hours per category daily, view stats over time, and export structured data (Excel + JSON) for manager aggregation.

## Location
- `Tracking Tool/` — root folder for the Work Tracker project

## Tech Stack
- Single-page HTML application (no server, no build step)
- Vanilla JavaScript with localStorage for persistence
- SheetJS (xlsx.js) CDN for Excel export
- JSON export for email/shared drive workflow
- No external frameworks — keep it lightweight and portable

## Design Language
Color palette inspired by aktin.sk / Vilgain:
- Primary background: `#1A1A1A` (dark charcoal nav/header)
- Card/content background: `#FFFFFF` (white)
- Page background: `#F5F5F5` (warm light gray)
- Accent color: `#00B67A` (vibrant green — buttons, highlights)
- Secondary text: `#6B6B6B` (neutral gray)
- Border/divider: `#E5E5E5`
- Error/warning: `#E74C3C`

UI style: catalogue/grid layout, rounded cards, generous whitespace, modern sans-serif (Inter or system font stack). Fresh and easy to scan.

## Architecture
- **Storage**: localStorage (primary) + file export (Excel/JSON)
- **First-use setup**: User chooses storage location (local folder path) and enters basic profile (name, team, manager email)
- **Windows user ID**: Captured via prompt or auto-detected if possible (stored in profile)
- **Categories**: Hierarchical — top-level groups (Customer, Internal, Admin, Research) with user-defined sub-categories
- **Hours**: Dropdown 0–8 per entry
- **Predefined list**: Users can save frequently-used entries (e.g., specific customer names) for quick reuse
- **Export**: 
  - Excel (.xlsx) — structured, updated on each save
  - JSON — lightweight, used for email notification payload
- **Email notification**: User-triggered from the tool, sends JSON summary to a dedicated mailbox
- **OneDrive integration**: Tool opens file explorer to the shared OneDrive folder so user can manually save; OR sends via email to a service account
- **Views**:
  - User view: daily entry, weekly/monthly summaries, charts
  - Manager view: aggregated team stats (reads from collected JSON/Excel files)

## Data Model
- `profile`: { name, windowsUser, team, managerEmail, storagePath }
- `categories`: [ { id, group, name, isPredefined } ]
- `entries`: [ { date, categoryId, hours, notes? } ]
- `predefinedItems`: [ { group, name } ] — quick-fill list

## Key Features
- Daily time entry (catalogue-style card grid)
- Category management (add/edit/remove, save to predefined)
- Weekly and monthly summary views with pivot-style tables
- Visual charts (bar/donut for category distribution)
- Excel export (auto-updated structured workbook)
- JSON export + email trigger
- OneDrive folder open helper (shell command to open explorer at path)
- User profile / first-use wizard

## Conventions
- All files in `Tracking Tool/` folder
- Main entry point: `index.html`
- Styles in `styles.css` (separate file)
- Logic in `app.js` (or split into modules if needed)
- No server dependencies — runs by double-clicking the HTML file

## Scale
- ~200 users across multiple managers (12–25 per manager)
- Each user operates independently; aggregation happens at manager level via collected exports

