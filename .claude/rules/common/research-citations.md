# Research Citation Discipline

This rule governs citations specifically. For the full research workflow (delegation, objectivity, token budgets, report output), see research.md.

Every research deliverable (a doc, report, comparison table, decision rec) must cite a verifiable source URL inline with each claim that depends on external information. The format:

> Claim — [source title or domain](https://url).

For claims about the project's own code or config (in-repo claims), use a `path:line` citation form alongside the URL form:

> Claim — `path/to/file.ext:line`.

Confirm the path and line at claim time with Read/Grep. If the reference cannot be pinned to a location, mark it `[unverified]`. NEVER fabricate a path or a line number.

This applies to:
- Doc updates that introduce a new framework, API, or pattern.
- Decision recommendations that cite "best practice" or "industry standard."
- Comparisons between tools, libraries, or vendors.
- Any "Anthropic says…" / "Microsoft says…" / similar attribution.

Tools that satisfy this discipline (no external API keys required):
- `context7` MCP — official library docs, version-aware.
- `WebFetch` tool — fetch a known URL and extract content.
- `WebSearch` tool — built-in web search when available.

When you cannot find a verifiable source for a claim, mark it `[unverified]` inline. NEVER fabricate a citation.

Anti-pattern: "X is the industry standard." Correct: "X is recommended in [Anthropic engineering blog post](url) and adopted by [N specific orgs cited from <source>](url)."
