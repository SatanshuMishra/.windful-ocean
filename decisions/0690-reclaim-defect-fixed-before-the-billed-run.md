---
Status: accepted
Date: 2026-08-23T20:11:27.114Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0690. The boundary reclaim defect is fixed before the billed run, not discovered by it again

## Context

The user approved a billed live run at roughly five dollars and seventeen minutes. Before spending, the previous billed run was traced to a named root cause rather than retried. That run, on 2026-08-23 at 04:17 against engine 6f93a781, cost 2.49 dollars and nineteen minutes and opened zero pull requests.

The cause is a race the harness induces on purpose. The live lane kills the first invocation to prove crash-resume, and it kills about 1.7 seconds after the journal records built. The boundary gate starts about 7 milliseconds after built. So the kill lands inside git worktree add and leaves a half-built worktree carrying git's own lock reason of initializing. On resume, boundary-worktree-reclaim.mjs refuses to reclaim any worktree whose lock is non-null, and git's marker is non-null. Collection returns before the head worktree is created, the gate cannot collect, the unit parks at Integrate, and Ship is handed zero candidates.

Neither end of that path changed on the trunk. boundary-worktree-reclaim.mjs has zero commits in 6f93a781..704861fa, and the harness kill point is unmoved. The boundary-gate park fix on the trunk makes the failure honest, reporting zero boundary fixes and a truthful refusal instead of a misleading spawn claude ENOENT, but both branches still return PARKED and both still open no pull request.

Two zero-cost checks were run first. The smoke lane crossed decompose, dispatch, journal, lock refusal, resume and ship in one second with four units all shipped and both proof flags true. The engine provenance probe pinned 704861fa, confirming a linked worktree is safe as the engine root and does not silently resolve the stale primary checkout through git commondir.

## Options

- Fix the reclaim defect first, then run the billed single lane
- Run the billed single lane now and accept a high-confidence repeat of the same park
- Run the never-measured four-unit full lane at roughly double the approved amount
- Bank the findings and defer the run to a later session

## Outcome

Fix first, then run. The user chose it against a stated recommendation.

The reclaim refusal is a genuine engine defect and not merely a harness artifact: today any crash during git worktree add leaves a boundary worktree that the engine can never recover, so the fix is worth making independently of what it unblocks. Spending 2.49 dollars to re-observe a failure already traced to path and line buys nothing, and the standing budget is one defect per billed run because each failure is terminal.

The fix is scoped to one behavioural change with a red-first test and a required inertness mutation, and it must find a discriminator that separates an abandoned add from a live one. Blanket-reclaiming every initializing lock would let one unit destroy a peer's in-flight worktree, which is worse than the bug being fixed; where the evidence is ambiguous the code refuses, because refusing costs a park while reclaiming wrongly corrupts a peer.

The harness kill point is deliberately left where it is. Moving it would hide the race rather than prove the engine survives it, and surviving a crash mid-add is the property the live lane exists to demonstrate.

Also settled for honest reporting against this criterion: the engine cannot merge, because gh is routed through a shim that refuses merges. The clause about reaching a merged trunk therefore always ends with a human hand on the button, and a green run may never be described as having merged anything itself.
