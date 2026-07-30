---
Status: accepted
Date: 2026-07-30T06:39:07.446Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0124. The resume envelope cap is derived at 16 KB from a row budget, and the over-cap fallback is a gate rather than a comment

## Context

0119 fixed the resume envelope's contents (run id, spec pointer and content hash, per-MSP status and PR number, frontier states, gate manifest hash, prompt-text hashes for the replayable prefix) and required a HARD CAP declared explicitly, with an over-cap fallback to a pointer plus exactly one bootstrap agent() call that 0108 already permits. It deliberately left the number open. 0109's standing lesson is that an unvalidated constant is the failure mode: the old speculation ceiling of 8 landed with no derivation from its own design's range and was re-confirmed only on not-a-new-number grounds.

## Options

- Pick a round number as a tuned constant
- Derive the cap from an explicit row budget and show the arithmetic
- Leave the cap to implementation discretion

## Outcome

DERIVED, not tuned: 64 MSP rows at a 160-byte row budget is about 10 KB, plus a 2 KB header, rounded to 16 KB of serialized JSON, with hashes truncated to 12 hex characters. At roughly 4k tokens paid once per relaunch, the envelope is strictly cheaper than the bootstrap dispatch it replaces, which is the whole reason 0119 chose the launcher-passes-args path. THE CAP IS A GATE, not a documented intention: the launcher verb refuses to emit an over-cap envelope and falls back to pointer-plus-one-bootstrap, and that refusal ships with a fixture over cap so it is proven failable per 0117. This is 0107's first law applied - the cap is encoded in a gate, and the prompt may only describe it. FALSIFIER per 0112 rule 3: if a realistic 6-MSP envelope exceeds 16 KB, the row budget is wrong and the bootstrap fallback becomes the DEFAULT rather than the exception, which is a materially different design and reopens 0119's zero-bootstrap-dispatch claim.
