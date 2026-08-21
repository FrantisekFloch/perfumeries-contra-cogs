# Token Counter — Return of Investments

## Purpose
Tracking and analyzing AI token usage (input/output) across tools and sessions to calculate return on investment. Measures time saved, cost per interaction, and productivity gains from AI-assisted workflows versus manual alternatives.

## Location
- `Token_Counter_ROI/` — root folder for all ROI tracking artifacts

## Scope
- **Token tracking**: Log input/output tokens per session, per tool, per task type
- **Cost calculation**: Map token counts to dollar costs (model pricing tiers)
- **Time savings**: Compare AI-assisted task duration vs. estimated manual duration
- **ROI metrics**: Cost of AI usage vs. value of time saved, error reduction, throughput improvement
- **Reporting**: Summaries by period (daily, weekly, monthly), by task category, by team member

## Architecture
- Standalone HTML/JS dashboard (consistent with Work Tracker approach) OR Python scripts for analysis
- Data stored as CSV/JSON for portability
- No server dependencies unless explicitly needed

## Key Metrics
- Tokens consumed (input + output) per interaction
- Cost per interaction (based on model pricing)
- Estimated manual time for equivalent task
- Actual AI-assisted time (prompt + review)
- Net time saved
- ROI ratio: (value of time saved - AI cost) / AI cost
- Break-even analysis: at what usage level does AI pay for itself

## Conventions
- All files in `Token_Counter_ROI/` folder
- Use consistent date formats (ISO 8601: YYYY-MM-DD)
- Currency in USD unless specified otherwise
- Token counts as integers, costs as 2-decimal floats
