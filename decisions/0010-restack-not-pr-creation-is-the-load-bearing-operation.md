---
Status: accepted
Date: 2026-07-26T20:35:21.459Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0010. Restack, not PR creation, is the load-bearing operation; the stack-depth cap is withdrawn

## Context

The user clarified the requirement mid-session: mitosis must produce a STACKED PR TRAIN for a TEAM environment - MSP-N opens a PR, MSP-N+1 starts from MSP-N's HEAD, humans review and merge asynchronously. I initially framed the risk as review-latency vs build-velocity and proposed a stack-depth cap. The user rejected that framing: per-MSP confidence rests on DoD + thorough e2e + CI green + meeting the MSP's requirements, not luck. That objection is correct and the framing was wrong.

## Options

- Cap stack depth so mitosis stops opening PRs on an unreviewed foundation - WITHDRAWN, the user's objection defeats it
- Continue hardening PR creation (the MSP-2/MSP-3 path)
- Make RESTACK deterministic and let stack depth stop mattering - CHOSEN

## Outcome

CHOSEN: fix restack; withdraw the depth cap. Depth is only dangerous BECAUSE restack is prose.

THE ASYMMETRY THAT SURVIVES THE OBJECTION. The gates eliminate exactly the failures that would have been INDEPENDENT across a stack (bugs, regressions). They leave exactly the ones that are CORRELATED: requirements misread (tests authored by the same agent that misread the requirement encode the misreading and pass green - CI proves internal consistency, not fidelity to intent), design objections, and cross-cutting team context. Stack risk is therefore a correlated tail, not n*p. A tail does not justify a depth cap.

THE OPERATIVE DRIVER IS AMENDMENT, NOT REJECTION. "Approved with one change" is the NORMAL case in team review and moves the parent head anyway; teammates advancing trunk move it independently again. Both force restacks on correctly-built, CI-green MSPs, so the gates do not reduce restack frequency at all.

WHY THAT IS DANGEROUS TODAY. mitosis.js:2968-2972 dispatches restack as English prose - fetch base, fetch each unmerged parent checkpoint ref, "Re-stack ... observe-then-converge (skip any that are already applied)" - returning ready/conflict booleans the agent asserts about itself. Multi-step git surgery, agent-decided skips, self-reported success. PR creation is the easy case by comparison: one command, every argument engine-computed, one JSON result. MSP-2 and MSP-3 spent weeks hardening the easy case.

CONSEQUENCE FOR SCOPE. Deterministic restack joins the server boundary as the second half of the replacement architecture. Any proposal that hardens PR creation while leaving restack as free-form prose does NOT satisfy the stated requirement.

LEAD TO VERIFY FIRST (could shrink the problem sharply): GitHub auto-retargets an open PR when its base branch is DELETED on merge. If true, the happy path needs NO restack, narrowing the requirement to the amended-parent and advancing-trunk cases only.
