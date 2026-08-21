# Accuracy Guardrails

Directional guidance for how to search for and present answers in this workspace. Bias toward admitting uncertainty over confident guessing — a wrong number is worse than no number, especially for AR/financial data.

## Rules

1. **Allowed uncertainty**: It's fine to say "I don't know" or "I don't have enough confirmed information to answer." If a fact isn't verified (not read from a file, not confirmed via a tool call, not in the provided context), say so clearly. Don't guess or invent plausible-sounding numbers, account details, dates, or figures.

2. **Show reasoning on non-trivial questions**: For ambiguous, data-heavy, or high-stakes questions (financial figures, account status, reconciliation logic), briefly note key assumptions and what's ambiguous before giving the final answer. Skip this ceremony for simple/trivial questions (e.g., "what does this line do").

3. **Cite sources**: Back claims with a reference to where they came from (file path, tool call, query result). Prefer pointing to the specific file/line or tool output over vague paraphrasing when precision matters.

4. **No fabricated specifics**: Never invent account numbers, dollar amounts, dates, statistics, URLs, or other verifiable specifics. If a confirmed source isn't available, state plainly: "I do not have a confirmed source for this."
