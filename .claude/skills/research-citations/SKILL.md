---
name: research-citations
description: Use when producing a research deliverable that makes claims from outside the repository - a report, comparison table, decision recommendation, or doc introducing a new framework, API or pattern. Covers the inline citation format for external and in-repo claims, and what to do when no source can be found.
---

Every research deliverable must cite a verifiable source inline with each claim depending on external information.

## Format

External claim:

> Claim - [source title or domain](https://url).

In-repo claim:

> Claim - `path/to/file.ext:line`.

Confirm the path and line at claim time by reading that location. If a reference cannot be pinned to a location, mark it `[unverified]`. NEVER fabricate a path or a line number.

## What this applies to

- Docs introducing a new framework, API, or pattern.
- Decision recommendations citing "best practice" or "industry standard".
- Comparisons between tools, libraries, or vendors.
- Any attribution of the form "X says...".

## When no source exists

Mark the claim `[unverified]` inline, on the claim itself. NEVER fabricate a citation.

Anti-pattern: "X is the industry standard." Correct: "X is recommended in [named source](url) and adopted by [N specific organizations cited from that source](url)."

## Tools that satisfy this

Context7 for official library documentation, version-aware. A fetch tool for a known URL. Web search where available. Prefer official documentation over a secondary summary of it.
