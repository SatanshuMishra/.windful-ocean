---
Status: accepted
Date: 2026-07-27T20:24:52.056Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0033. The semgrep p/default pin re-vendor ships as its own PR with human re-adjudication, never bundled into a feature PR

## Context

PR #5's `sast` check failed, but NOT because of Build A. The job aborted in 20s at a supply-chain integrity step, "Fetch and verify p/default ruleset", before scanning any code: the canonical SHA256 of semgrep's p/default ruleset no longer matches the pin in .semgrep/p-default.sha256 (expected 39e9e106..., actual d9f73571...). Evidence it is environmental, not diff-specific: the pin was vendored 2026-07-20, the last green sast run was also 2026-07-20, nothing ran in the seven days since, and this is the first PR after the drift — it would fail identically on main or any branch. test, secret-scan, sca and label all pass. The CI's own message prescribes the fix: re-vendor the pin AND re-adjudicate the nosemgrep pragmas before updating it. The codebase carries adjudicated suppressions (e.g. run-engine.mjs:22 for non-literal regex construction) that were justified against a specific rule set; when rules change upstream a suppression can silently cover a different rule, or a new rule can go unexamined.

## Options

- Bump the hash inside PR #5 to turn CI green — REJECTED: conflates a security adjudication with a feature change and defeats the control, which exists precisely to force a human look. Same fabricated-consent shape this thread exists to eliminate.
- Merge PR #5 with sast red — REJECTED: defeats the check
- CHOSEN: re-vendor the pin and re-adjudicate every nosemgrep pragma as its own small PR, merge that first, then re-run PR #5's checks

## Outcome

Build A needs NO code change for this failure. The pin re-vendor is a separate, deliberate maintenance PR whose load-bearing step is the HUMAN re-adjudication of every nosemgrep pragma against the new rule set, not the hash bump. Never auto-bump the hash to clear a red build. IMPORTANT UNKNOWN CARRIED FORWARD: because sast aborted before scanning, Build A is SAST-UNEVALUATED, not SAST-clean. merge-boundary-preflight.mjs constructs gh argv and parses untrusted JSON, exactly the shape semgrep has rules for. Once the pin is re-vendored, that scan runs against this diff for the first time and may surface genuine findings that DO require changes to c59ca79.
