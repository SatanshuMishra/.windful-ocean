# No Comments (CRITICAL, all projects)

Claude must NEVER author comments, and must NEVER depend on comments for understanding.

## Why
Comments drift from the code they describe. Stale comments mislead humans and cause AI to hallucinate behavior the code does not implement. The code is the only reliable source of truth.

## Rules
- NEVER write a new comment in any language or project: explanatory comments, docstrings, block/inline comments, JSDoc/TSDoc prose, or "section header" comments.
- ALWAYS derive context from the raw code itself. Do not trust a comment; verify against code. If comment and code disagree, the code wins.
- When editing code that already has comments: do not add comments. If an existing comment directly CONTRADICTS the code you are changing, DELETE it (do not update it). Otherwise leave existing comments untouched unless the user asks.

## Functional carve-out (these are NOT "comments")
Directives/metadata required for code or tooling to function. Use ONLY when functionally required, never as explanation:
- Shebangs: #!/usr/bin/env bash, #!/usr/bin/env node, etc.
- Tooling pragmas: eslint-disable*, // @ts-expect-error, // @ts-nocheck, // @ts-ignore, # type: ignore, # noqa, # pylint: disable
- Codegen / legal markers required by tooling or license: "Code generated ... DO NOT EDIT.", SPDX / license headers when mandated.

Keep any tool-required reason string to the minimum the tool demands. Never expand into prose.
