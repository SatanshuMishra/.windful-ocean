---
Status: accepted
Date: 2026-08-03T15:02:32.998Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0217. Transcribing into the ledger session log is the working recovery route for ephemeral scratchpad content

## Context

The spine carried a standing risk that M8's workflow artifacts are unrecoverable because they live in a /private/tmp session scratchpad a fresh session cannot reach, with the remedy stated as "re-derive from code at 4fd03c2". This session tested that: I1-I10 are a PLAN artifact (design intent), not derivable from code alone, so re-derivation would have recovered mechanisms but not the ten statements. The prior session had pre-empted this by transcribing all ten verbatim into a durable index inside the _ledger git ref, which cost one git show to retrieve.

## Options

- Accept the spine's stated remedy — re-derive everything from code — which recovers mechanisms but cannot recover plan-level intent
- Track scratchpad artifacts in git so they survive — rejected, they are per-run working files and the repo is not their home
- Ratify the prior session's practice: transcribe anything plan-level and durable into the ledger session log at hand-off, and search the _ledger ref first on recovery

## Outcome

Ratified the transcription practice, now proven by use. Anything plan-level whose only other home is the scratchpad gets copied into the ledger session log at hand-off; recovery searches the _ledger ref BEFORE attempting re-derivation. The search form for a session that does not know the filename: iterate `git ls-tree -r --name-only _ledger` and grep each `git show "_ledger:$f"` for a distinctive token. The standing spine risk is narrowed rather than cleared: it remains true for artifacts nobody transcribed (plan-audit.md, implementation.md, remediation.md, receipts.md, ship.md), and false for anything a prior session deliberately carried across. This session applied the same practice to the merge-boundary preflight grounding.
