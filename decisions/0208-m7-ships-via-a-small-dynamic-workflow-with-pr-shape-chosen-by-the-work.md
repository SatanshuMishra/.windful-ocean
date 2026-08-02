---
Status: accepted
Date: 2026-08-02T19:28:06.135Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0208. M7 ships via a dedicated small dynamic workflow, with PR shape chosen by the work

## Context

User directive given at hand-off on 2026-08-02: in the FRESH session, dispatch a dedicated small dynamic workflow to fully plan, implement and ship M7. The user first said to use stacked PRs, then clarified: use stacked PRs ONLY if necessary, and shipping M7 as a single PR (or another shape) is acceptable. The clarification matters because 0207 was recorded this same session after a stacked PR (34) merged into its declared feature base and split M4 in half.

## Options

- Stacked PRs by default - rejected as the default: 0207 shows the upper PR of a stack merges into its feature base, not main, unless retargeted first
- Single PR by default, stacking only when M7 genuinely splits into more than one independently shippable unit
- Ad-hoc subagent loop instead of a workflow - rejected, spec-decomposition routes multi-task work through mitosis and the user asked for a workflow

## Outcome

A dedicated SMALL dynamic Workflow plans, implements and ships M7 end to end. PR shape is chosen by the work, not fixed in advance: default to a SINGLE PR, and stack only if M7 genuinely decomposes into more than one independently shippable unit that each leave main green. If a stack is used, the 0207 guard is mandatory - retarget the upper PR to main BEFORE merge, or plan to land it by cherry-pick. Keep the workflow small per the session's medium size guideline (under 15 agents). M7 is 'single divergence predicate, two states' (spec 2026-07-28-mitosis-quiescent-advance.md:309), whose only declared dependency M4 is now shipped on main.
