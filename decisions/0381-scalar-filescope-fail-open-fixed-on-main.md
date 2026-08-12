---
Status: accepted
Date: 2026-08-12T16:37:48.954Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0381. Scalar fileScope fail-open is fixed on main as a standalone PR, not inserted into the stack

## Context

A0 surfaced a live parallel-safety fail-open. planWaves (wave-planner.mjs:38) keeps t.fileScope unchanged when truthy, so a scalar string survives; scopesOverlap (:26-28) then iterates it character-by-character and pathsOverlap('s','src/a.js') is false through all three branches. Two overlapping tasks land in the same wave with no refusal — a safety gate failing OPEN. Both detection layers share the defect: derive-edges.mjs:1 imports the same scopesOverlap and calls it at :78, so the hardening layer never adds the serializing edge either. Reachability is real: plan-to-task-graph/SKILL.md has a MODEL author fileScope with no schema constraining it to an array and states there is no human review gate, and the same skill documents a clean wave-planner run as proof that no two fileScope-overlapping tasks share a wave. generate-run-script.mjs:55 is the only guard and is a different consumer.

## Options

- Standalone fix PR to main now, then reconcile the stack later - chosen by the user
- New MSP inside the stack after A0 - no merge conflict and A0's todo test flips straight to green, but main stays exposed until the release gate after D3
- Follow-up only, fixed after the stack - cheapest now, longest exposure, and A2 would build the ready_after readiness path on an un-fixed fail-open
- Fix it inside A0 - rejected outright: A0 is tests-only and its byte-identity of wave-planner.mjs is a verified property of the cut

## Outcome

The user ruled it fixed on main immediately as a standalone PR outside the stack, because the hole is live on main today and the stack does not reach main until after D3. One guard covers both layers, since derive-edges imports scopesOverlap from wave-planner. Binding constraints: fail CLOSED at both the planWaves ingestion boundary and inside scopesOverlap; the thrown message MUST match the regex /fileScope must be an array/, because A0 already ships a todo test asserting exactly that contract and matching it is what lets that test flip green at reconciliation; prove BOTH layers, including a derive-edges case; ship the fix with an acceptance test red on the parent commit and an inertness mutation. No existing stack branch is rebased — the collision between the fix's test file and A0's is documented as a reconciliation plan and resolved at the release gate. Inserting a nineteenth MSP into the 0374-approved stack was treated as a decomposition change belonging to the user, not to the orchestrator.
