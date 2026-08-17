---
Status: accepted
Date: 2026-08-17T06:39:51.307Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0512. Overnight autonomy: one CI fix attempt, and scoped destructive repair

## Context

The user went to bed asking whether M7 through M15 plus the unowned Prep-kinds MSP could complete unattended, arriving as open stacked pull requests. Two things would otherwise stall a linear stack overnight. First, the receipts enforcer can block a pull request after it is opened, most likely at G14's mutation referee, which has blocked three in a row on this repo; without a policy an agent either loops on it or abandons it silently. Second, a restack needs a force-push and sometimes a branch deletion, and because the stack is linear a single stall blocks every MSP behind it. Nothing merging overnight is what makes the rest safe: merges are what rewrite commits under in-flight branches, so an unattended night needs no restack at all in the normal case.

## Options

- Stall at any gate failure or destructive operation and wait for the morning; OR one fix attempt at a red gate then record honestly and move on, with destructive repair pre-authorised but scoped; OR fix every gate until green regardless of cost

## Outcome

The user granted both. A red receipts gate gets exactly ONE fix attempt; if it is still red the agent records the failure honestly on the pull request as a tracked downgrade rather than a false green, and the stack keeps moving, leaving triage for the morning with evidence in hand. Fix-until-green was rejected because a stubborn gate can burn hours and stall everything stacked behind it. Destructive git operations are pre-authorised, scoped to this stack's own branches, and each must be preceded by the same verification used on 2026-08-17: cherry-pick only the branch's own commit identified by patch-id through git log --cherry-pick --right-only, confirm the replayed diff is byte-identical to the original, and run the full suite plus the four gate verbs at the new tip before pushing. Every design call the remaining MSPs need is the orchestrator's to make and record rather than a reason to wake the user, including the Integrate phase body, the needs-human verdict channel, the dispatchedEpochs key change, the retry and replan bounds, and the scope of the unowned Prep-kinds MSP.
