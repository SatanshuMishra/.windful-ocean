---
Status: accepted
Date: 2026-07-27T20:45:11.344Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0035. Build A is SAST-clean under the re-vendored ruleset; the SAST-UNEVALUATED risk is closed with evidence, not aged out

## Context

0033 carried forward an explicit unknown: because sast aborted at the pin-verify step before scanning, Build A was SAST-UNEVALUATED rather than SAST-clean, and merge-boundary-preflight.mjs -- which constructs gh argv and parses untrusted JSON -- was named as exactly the shape semgrep has rules for. The brief's item 2 therefore warned that re-running PR #5's checks "may surface real findings needing changes to c59ca79". That unknown has now been discharged locally, ahead of CI, using the same semgrep version CI pins (1.170.0) against a clean `git clone --local` checkout at c59ca79 (413 tracked files, 294 scanned) rather than the dirty working tree. Three scans: (A) --disable-nosem over the full tree returned 25 findings, ALL 25 at the 21 known pragma lines and ZERO anywhere else; (B) a normal full-tree scan returned 0 findings, proving every finding is already covered by an existing pragma; (C) --baseline-commit cd5c65d, which is precisely what CI runs on PR #5, returned 0 findings over 4 scanned paths. The ruleset used was validated first: its canonical hash reproduced CI's freshly-computed d9f73571... exactly on a different OS and Python, and all four suppressed rule IDs are still present among the new set's 1074 rules.

## Options

- Wait for CI to answer item 2 after the pin PR merges -- REJECTED: leaves the unknown open across a merge boundary and would surface findings only after the pin change had already landed, conflating two adjudications
- Treat the risk as stale and assume Build A is clean -- REJECTED: assumption is what 0033 explicitly refused; the thread's whole premise is that unevaluated is not the same as clean
- CHOSEN: discharge the unknown locally before CI, by replicating CI's exact scan (same semgrep version, clean checkout, same diff baseline) against the validated new ruleset

## Outcome

Build A requires NO code change for sast. merge-boundary-preflight.mjs and mitosis-git.mjs produce zero findings under the new ruleset, so 0033's named worry is refuted rather than deferred, and c59ca79 stands as reviewed. Item 2 of the brief is closed. Also established and reusable: all 21 pragmas are LIVE (each rule still fires at its line), none is dead by rule-deletion, and every one is rule-ID-scoped with zero bare pragmas -- which structurally forecloses the "a suppression silently covers a different rule" risk 0033 raised, because an ID-scoped pragma cannot swallow a newly added rule. SCOPE LIMIT, explicitly not covered by this record: what is verified is that each rule exists, still fires, and is ID-scoped; whether each pragma's WRITTEN JUSTIFICATION still holds against the code was NOT verified and remains the outstanding human step 0033 reserves. Two honest caveats: 9 pre-existing PartialParsing warnings mean semgrep's coverage of six .claude/hooks/*.sh files, one HTML doc and receipts.yml is incomplete and always has been; and four lines report the same rule twice at identical column spans, harmless but unexplained.
