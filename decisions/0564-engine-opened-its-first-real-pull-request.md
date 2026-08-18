---
Status: accepted
Date: 2026-08-18T05:55:21.592Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0564. The engine reached Ship on a live run and opened a real pull request

## Context

First live end-to-end run against the disposable harness repo, two edge-free units, engine at 94eaf17f. One invocation ran all eight phases in a single OS process and opened pull request 2 on SatanshuMishra/mitosis-live-pr-harness through the centralized pr-create tool. Verified by reading the pull request back from GitHub, not from the engine summary: title feat(objects): add pick and omit object helpers, base main, body carrying Why, What, Verification and Provenance, and an honest Not verified line for the receipts enforcer. The shipped branch respected its fence exactly, two files and 79 insertions. The engine emitted mergeOrder position 1 with deleteAfterMerge false and merged nothing.

## Options

- Treat the prior belief that the ship git site is unwired as still true
- Retire that belief on the evidence of a live pull request

## Outcome

Retired. Two long-standing beliefs are contradicted by evidence and are withdrawn: that the engine structurally cannot open a pull request, and that one invocation advances only one stage. Also withdrawn is the claim that the unit green flag is a hardcoded literal rendered as a Verified line: the Verified line is emitted only for a genuinely INTEGRATED unit, and the run produced an honest Not verified line for the check that did not run.
