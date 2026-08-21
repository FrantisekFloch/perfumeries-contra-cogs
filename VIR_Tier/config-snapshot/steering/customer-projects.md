# Customer Projects — Solution Architecture & Automation

## Purpose
This chat is dedicated to **customer solution proposals**. We take a theoretical customer requirement, map out the current state, identify data sources and tools, design the integration architecture, and propose an automation approach to deliver the end result.

## Scope of Work
Each project follows this structure:
1. **Current State** — Where does the data live today? What systems produce it? What manual steps exist?
2. **Data Sources & Access** — Which tools/APIs/databases hold the information? How is it accessed (API, SFTP, DB query, UI export)?
3. **Desired Outcome** — What does the customer need as a final product (report, dashboard, automated workflow, reconciliation)?
4. **Solution Design** — How to connect the pieces: ETL pipelines, API integrations, scheduling, transformation logic.
5. **Tool Selection** — Pick the most suitable tools for each layer (ingestion, processing, orchestration, presentation).
6. **Automation Strategy** — What can be fully automated vs. semi-automated vs. manual checkpoints.

## Research Approach
- **Use web search** to look up tool capabilities, API documentation, integration options, pricing models, and backend architectures for common auditing, accounting, and finance platforms.
- Common platforms to research: SAP, Oracle ERP, NetSuite, QuickBooks, Xero, Sage, Workday, BlackLine, HighRadius, Billtrust, Esker, Basware, Coupa, Zuora, Stripe, Avalara, Thomson Reuters, CCH, ADP, Concur, and others as needed.
- Focus on: API availability, data export formats, webhook support, authentication methods, rate limits, and integration patterns (REST, SOAP, SFTP, EDI, flat file).

## Deliverable Format
Each proposal should produce:
- **Architecture diagram description** (text-based, mermaid-compatible if needed)
- **Data flow map** — source → transform → destination
- **Tool comparison matrix** when multiple options exist
- **Implementation roadmap** — phased approach with quick wins first
- **Risk & dependency notes** — what could block or complicate the solution

## Conventions
- Keep proposals tool-agnostic where possible, then recommend specific tools with justification.
- When multiple approaches exist, present 2–3 options with trade-offs (cost, complexity, time-to-value, maintenance burden).
- Always note whether a proposed integration requires paid licenses, specific API tiers, or partner access.
- Folder structure: `Customer_Projects/<project_name>/` — one subfolder per engagement/proposal.

## Key Principles
- Favor **pragmatic automation** over over-engineering — start with what delivers value fastest.
- Distinguish between **build vs. buy** decisions explicitly.
- Consider **scalability** — will this solution work for 10 customers? 1,000?
- Note **security & compliance** implications (data residency, PII handling, SOC2, GDPR) when relevant.
