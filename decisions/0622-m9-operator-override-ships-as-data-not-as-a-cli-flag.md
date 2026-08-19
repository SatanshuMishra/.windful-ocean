---
Status: accepted
Date: 2026-08-19T07:05:29.769Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0622. M9's operator override ships as data on the run spec; the CLI flag belongs to a cli.mjs-owning unit

## Context

M9's ceiling contradicts itself. whole-solution.md line 403 requires that a unit parked NeedsHuman reaches the remediation loop only when --remediate names it, which is a CLI flag; line 406 states M9 uses only existing ports and therefore does not touch cli.mjs, where the flag set is closed at cli.mjs:63-73 and unknown flags are rejected. Both cannot hold. Amendment D ruling 3 says the operator override on a needs-human park is IN as already specified, so dropping it was not available either. The M9 lead did not invent a flag: it built the override as plain data read from request.spec.remediate, the one seam that already reaches a phase body unvalidated, wired and tested, with nothing filling it in production yet.

## Options

- Accept the override as data on the run spec and leave the CLI surface to a cli.mjs-owning unit - honours ruling D3, keeps M9 concurrent with M5, invents nothing
- Let M9 add the flag to cli.mjs - breaks the concurrency guarantee that kept M5 and M9 in the same wave, and takes a file another unit owns
- Drop the override - refused by Amendment D ruling 3, which already settled that it is IN

## Outcome

Accepted as built. The mechanism is wired and tested at the phase body; the flag that fills it in production is a backlog line for whichever cli.mjs-owning unit reaches it (M6 or M11), never a new unit. The SPEC's self-contradiction is noted as an inaccuracy under ruling 8.1, not designed around. M9 also took tests/unit-state.test.mjs, one file outside its declared list, additively and to clear G14, which no concurrent unit owns; accepted.
