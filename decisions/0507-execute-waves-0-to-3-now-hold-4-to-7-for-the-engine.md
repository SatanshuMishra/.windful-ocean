---
Status: accepted
Date: 2026-08-17T05:35:12.321Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0507. Execute waves 0 through 3 next session; hold waves 4 through 7 until the mitosis engine lands

## Context

The SPEC at .claude/docs/specs/2026-08-17-agent-roster-rebuild.md decomposes the rebuild into 17 units across 8 waves. Its section 5a records the report's one hard external dependency: the new mitosis engine lands FIRST, because the rebuild targets that engine rather than the one being deleted. That engine is tracked on thread 01KZTEFMENXBW30ZE633YNFJHE, which stands at 8 of 15 criteria and whose own spine records that it failed its stated goal, reaching only checkpointed-and-green. Waves 0 through 3 - the telemetry archive, the three check mechanisms, the two missing skills, and the whole observer rebuild - touch neither the engine nor the roster.

## Options

- Wait for the engine before starting anything - rejected, waves 0 to 3 have no engine dependency and waiting wastes the interval
- Start everything and rebase the roster work when the engine lands - rejected, a roster built against the engine being deleted is wasted work
- Execute waves 0 to 3 now, hold 4 to 7 for the engine

## Outcome

Waves 0 through 3 execute in the next session, in wave order. Waves 4 through 7 do not start until the mitosis engine is merged to main, verified by ancestry rather than by a MERGED label.

Wave order within 0 to 3 is not arbitrary and must be honoured. U0.1 archives the telemetry, the only artifact in this work that cannot be regenerated. U1.1 comes before every other check because agentDefinitionDir resolves the roster relative to its own module path, and all 18 worktrees carry independent copies of both that module and the agent directory - so until it is fixed, any census can silently validate a stale worktree's roster and pass. U1.2 and U1.3 both depend on U1.1 for that reason. Wave 2's two authored skills precede their agents, because an agent with no Skill tool and no resolvable skills entry receives no procedure at all and surfaces no error. Wave 3 runs strictly U3.1 then U3.2 then U3.3 then U3.4, and only U3.4 is non-additive, which is why it is last.

Every unit ships as its own pull request through the centralized tool, human-merged, with acceptance declared before the unit starts: a check red on the parent and green on the unit, plus an inertness mutation and a no-collateral diff assertion.

One item is unresolved and blocks nothing in waves 0 to 3: "four backup profiles" in criterion c4 cannot be identified from any surviving artifact. It needs a definition or striking from c4 before wave 4, since an unidentifiable criterion item can be neither satisfied nor refuted.
