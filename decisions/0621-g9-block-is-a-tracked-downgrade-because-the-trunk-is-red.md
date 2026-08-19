---
Status: accepted
Date: 2026-08-19T05:06:51.852Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0621. M8a's G9 block is a tracked downgrade; the red trunk is surfaced, not fixed in flight

## Context

M8a shipped as PR 239 against main. Its receipts run was real (1m57s, headSha f5861947) and BLOCKed on G9 full-scope green. G9's premise is false here: main's own test workflow already fails at bc3b9bce, at observer-audit/tests/retired-roster-derivation.test.mjs:57,:59 and skills/conformance-auditor/tests/skill-shape.test.mjs:183,:212. PR 239 fails at the same four sites and no others, and its diff touches neither area. G14 is clean (12 tried, 0 survived). The remedy G9 names is a downgrade tag in the PR body, which is unavailable twice over: bodies are immutable after creation, and a ladder tag in the body short-circuits all eight re-run gates.

## Options

- Rule it a tracked downgrade and keep shipping - the RUNBOOK stop-condition table assigns an unclearable gate to the orchestrator, never to another review round
- Fix the trunk first as a 25th unit - forbidden here, the stack is frozen at 24 and only the user moves the ceiling
- Put the downgrade tag in the PR body - forbidden, it disables the enforcer eight re-run gates, and the body is immutable anyway

## Outcome

Tracked downgrade, unverified-reasoned, recorded to the orchestrator and never in the PR body. Every remaining unit inherits the same G9 block until the trunk is green, so this is a recurring downgrade reason, which is the aggregate capability gap G17 says to surface to the human rather than stall on. The trunk red is surfaced to the user as a ceiling move only they can authorize; it is not fixed in flight and becomes no unit.
