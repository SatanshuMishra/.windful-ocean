---
Status: accepted
Date: 2026-07-27T21:28:16.569Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0039. globToRegExp becomes a linear matcher in the pin PR; the 2 REFUTED suppressions are deleted, not relabelled

## Context

USER-LOCKED after the orchestrator surfaced that the user's first two answers were mutually unsatisfiable. User initially chose (a) pin PR = bump + honest pragma text with code fixes deferred, AND (b) delete the 2 REFUTED suppressions outright. A semgrep probe with a local replica rule proved these cannot both hold: removing the pragma makes the finding fire (2 results vs 1), and lowering GLOB_MAX_WILDCARDS CANNOT clear the rule, because the rule matches the CONSTRUCTION not the complexity -- proven by run-engine.mjs:98, a bounded, literal-derived, entirely safe construction that still fires. So "delete the suppression" necessarily implies eliminating new RegExp from globToRegExp, which is a code fix.

## Options

- Rewrite globToRegExp as a linear matcher in this PR (2 commits)
- Revert to honest-text pragma on the 2 REFUTED, keep 1 commit, defer the ReDoS
- Delete the pragmas now and accept a red PR and a red main until a successor lands the fix

## Outcome

Option 1. The pin PR becomes TWO commits, not one -- this consciously supersedes item 3's "ONE commit" wording while still honoring 0034's real intent (the PR carries only the adjudication's own output, never main's backlog). COMMIT 1: pin bump 39e9e106 -> d9f73571, plus honest-text rewrites of the 2 CONTESTED-PREMISE pragmas (live-inject.mjs:233, live.mjs:216) to drop the false "caps bound backtracking" claim. COMMIT 2: replace globToRegExp with a linear matcher in run-engine.mjs and its byte-identical twin mitosis.js, DELETING both pragmas -- no dynamic RegExp means no pragma needed and no ReDoS, permanently. Accepted cost: glob semantics must be preserved exactly, so this carries real behavior risk and the scope-covers suite must be green before merge. Note scope-covers.test.mjs:32 asserts `globToRegExp(...) instanceof RegExp`, a return-type assertion the refactor necessarily breaks; per testing.md's change-detector prohibition it is retargeted to observable behavior rather than preserved. HARD GATE UNCHANGED: commit 1 cannot be written until the human re-runs the p/default curl and confirms d9f73571, because agents are denied Bash(curl:*) at settings.json:56.
