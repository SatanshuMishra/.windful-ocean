---
Status: accepted
Date: 2026-07-28T06:08:07.571Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0065. Redesign mitosis shipping via a fresh-session parallel Fable fan-out, under a simple-beats-complex constraint

## Context

The 2026-07-27 review found seven defects that make mitosis stop when a blocking MSP's PR is open but unmerged, plus a capability gap: nothing drives a red CI run back to green. The findings were produced inline by the main thread against a 4847-line orchestrator, at ~80% context, without running the test suite. Continuing the redesign in the same session would compound context pressure and inherit the reviewer's framing. The user also observed that prior mitosis hardening has tended toward accumulating mechanism (frontier-train, AIMD window, divergence probes, reconcile-only shepherd, saga compensation) rather than reducing it, and that the accumulated complexity is itself now a fragility source.

## Options

- Continue the redesign inline in the same session, reusing the loaded context
- Fresh session, single general-purpose agent does audit + research + design sequentially
- Fresh session, dedicated Fable subagents dispatched in parallel across audit / industry research / architecture design, under an explicit simple-beats-complex constraint
- Skip the audit and patch the seven findings individually as isolated fixes

## Outcome

Fresh session, dedicated Fable subagents in parallel. Their focus is threefold: audit and understand the current implementation and its flaws; research industry standards for this class of architecture; propose an improved architecture. The governing constraint is explicit and outranks capability: SIMPLE + ROBUST wins over FRAGILE + COMPLEX — a proposal that adds mechanism to reach the target behavior loses to one that reaches it with less. Target capability the architecture must deliver: mitosis handles a shipped MSP's CI/CD failures automatically until green, then continues into any blocked MSP without terminating the run. Patching the seven findings individually was rejected because finding 1 (PR-open gated on parent merge) is a design commitment, not a bug, and finding 5 (park cascade discarding frontier-built work) indicates the built/parked state model itself is wrong — both need a design answer, not a patch. The 2026-07-27 correction stands as a required input: optimistic BUILDING already exists (isBuildable admits unmerged parents), so the redesign must not re-solve it.
