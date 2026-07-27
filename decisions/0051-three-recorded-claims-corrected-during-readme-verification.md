---
Status: accepted
Date: 2026-07-27T23:23:23.672Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0051. Three claims this thread recorded as fact are wrong and are corrected here

## Context

Writing the README forced every recorded risk statement to be pinned to a path:line or a fetched URL before it could be repeated. Three claims carried in the thread spine and in earlier decision records failed that check. First, the spine and 0036 both describe a constant LEDGER_REF hardcoded to '_ledger'. No such identifier exists in the codebase - rg LEDGER_REF returns no matches. It did exist at hooks/lib/pre-tool-use.mjs:9 until this session's own B7 refactor (1d3e835) replaced it with an import of DEFAULT_LEDGER_BRANCH from src/drivers/git-ledger.mjs:11, so the claim was true when written and was invalidated by our own change. What is actually fixed is the CONSTANT_TRIGGERS pair at hooks/lib/pre-tool-use.mjs:11. Second, the spine states that sandbox.filesystem.denyWrite takes an array of path GLOBS. The official sandboxing documentation, fetched this session at https://code.claude.com/docs/en/sandboxing (the docs.claude.com path 301-redirects there), consistently describes filesystem entries as literal paths resolved by prefix - / for absolute, ~/ for home-relative, ./ or bare for project-relative. Glob syntax appears only for network.allowedDomains. Third, the spine's claim that 68 formerly-allowed read-only commands now prompt is pinned by nothing in the repository - no test, no doc, no plan carries that count.

## Options

- Repeat the recorded claims as written - rejected, all three would have gone into the one document whose entire purpose is telling the user what is and is not protected
- Correct them against verified evidence and record the correction - chosen
- Quietly write the README correctly and leave the ledger uncorrected - rejected, the wrong claims would keep propagating into future sessions from the spine

## Outcome

All three corrected. (1) There is no LEDGER_REF constant. The fixed triggers are CONSTANT_TRIGGERS at hooks/lib/pre-tool-use.mjs:11, holding the literal '_ledger' and the literal 'refs/ledger/'. The SUBSTANCE of 0036 is unaffected and in fact sharpened: under the DEFAULT orphan-branch backend a custom ledger_branch resolves to refs/heads/<branch>, which the guard never checks, so git branch -D <branch> and git push origin :<branch> get no prompt; only the custom-ref backend is partially mitigated, because every branch under it still resolves inside the fixed refs/ledger/ namespace. (2) denyWrite takes an array of literal PATHS resolved by prefix, not globs. Every other sandbox claim in the spine survived verification unchanged: OS enforcement via Seatbelt and bubblewrap, cross-scope array merging, and unsupported platforms running unsandboxed unless failIfUnavailable is set. (3) The 68-command figure is unverified and was dropped rather than repeated; the README states the mechanism and gives one confirmed example instead of an unpinned count. The hooks-and-MCP-sandboxing question remains unverified exactly as 0037 requires, and the README now names the specific consequence: the plugin's recoverable-history writes happen from an MCP server process, so if MCP servers are subject to denyWrite, a denyWrite entry over the ledger root stops the plugin writing its own store.
