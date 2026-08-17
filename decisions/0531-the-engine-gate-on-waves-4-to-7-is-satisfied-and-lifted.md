---
Status: accepted
Date: 2026-08-17T16:52:40.681Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0531. The engine gate on waves 4 to 7 is satisfied and lifted; the SPEC section 6 table wins over section 5a

## Context

The SPEC contradicts itself. Section 5a at line 161 says no unit in wave 3 or later may start until the mitosis engine is on main; the section 6 table at lines 236 to 243 gates only wave 4 and says waves 0 to 3 may proceed now. Wave 3 has already begun regardless, with U3.1 merged. Evidence gathered at main 8f7248c2 against both instruments: all sixteen engine pull requests 172 to 187 are ancestors of origin/main by both head SHA and merge commit, the stack base feat/mitosis-os-process is itself merged, zero pull requests are open, and the engine source is physically present. Section 5a rests on two premises that were true when written and are false now: that the engine is in flight on a feature branch, and that the engine thread's spine records a failed goal at checkpointed-and-green, which decision 0494 superseded. The engine thread holds 35 completion criteria with 31 done, not the 15 the SPEC and the roster both cite; the source of that denominator is unknown and the derived index directory is empty.

## Options

- Honour section 5a literally and halt waves 4 to 7 until every engine criterion clears, which would also have forbidden the wave 3 work already merged
- Rule that the section 6 table governs, because section 5a's stated gate - the engine on main - is itself satisfied on the evidence
- Defer the ruling until the engine thread reaches 35 of 35, treating unmet runtime criteria as a proxy for the gate

## Outcome

The section 6 table governs and the engine gate is LIFTED for waves 4 to 7. Section 5a's own stated condition, the engine on main, is met on both ancestry instruments, so honouring 5a literally and honouring it on its merits give the same answer. The four unmet engine criteria, numbers 30 to 33, are exclusively RUNTIME proofs - that the engine opens a pull request per MSP on a real run, exercises Integrate and Resume, settles a graph with a dependency edge and a poisoned lock, and covers decompose through pull request in CI. No wave 4 to 7 unit invokes any of them: every one authors files and runs a static gate or census that is already on main, and per 0378 and 0530 those waves execute by plain fan-out dispatch, never by the engine itself. The three confirmed engine defects in 0525, 0526 and 0529 are likewise all runtime and all still live on main, so they bear on any future decision to RUN the engine and not on authoring the roster against it. Two items are filed rather than folded in: U6.1 names only the decompose-emit literal while a second live codebase-analyst literal sits in the e2e substrate test, and two stale engine-named remote branches outside the 172 to 187 set have no established disposition. This ruling does not authorise executing waves 4 to 7; the standing order scopes this session to phases 0 through 3.
