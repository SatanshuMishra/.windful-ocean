---
Status: accepted
Date: 2026-07-30T06:12:12.669Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0121. Final review is deleted from the phase declaration and the parity rule is made two-directional: Shepherd is declared as Resume

## Context

0115 listed the already-inert Final review title (mitosis.js:15) among the removals but treated it as a footnote. The user asked on 2026-07-30 to confirm it is genuinely being cleaned up, since it still shows up in the workflow as a phase even though it is inert. Verified directly this session rather than taken from the 0115 audit: Final review appears at mitosis.js:15 in meta.phases and NOWHERE else - there is no phase('Final review') call and no dispatch under it. The same grep found the mirror-image defect: phase('Shepherd') is called at mitosis.js:2906 inside runReconcileOnlyAdvance but is absent from meta.phases. Per the Workflow tool contract a phase() call with no matching meta entry gets its own progress group, so the two defects are opposite halves of one drift.

## Options

- Delete the Final review line only, as 0115 implies
- Make declaration and call sites agree in BOTH directions and add the parity check
- Leave Shepherd undeclared since it renders anyway

## Outcome

CONFIRMED AND WIDENED. Final review is DELETED from meta.phases - one line, no other site, nothing else references it. The cleanup is widened because deleting only that line fixes one half of a two-directional drift and leaves the mechanism that produced it intact. THE RULE: meta.phases and the phase() call sites must agree EXACTLY, in both directions. A declared title that is never entered is a false progress signal that names no work - waste by the 0112 test, since it cannot change a decision. A called title that is never declared is an unnamed surface in the progress tree, which is how Final review's twin escaped the 0115 audit. SHEPHERD IS DECLARED, under the honest name RESUME: runReconcileOnlyAdvance is the reconcile-only advance path, which under 0111's end-and-relaunch IS the relaunch entry point, so the phase already exists in code for the trigger decided alongside this one - no new phase is invented and the name stops describing a mechanism nobody outside the engine recognizes. REMEDIATE IS KEPT, declared and called at :3304, because it is the exception path 0106 preserves - deterministic executor on the happy path plus LLM diagnostician on failure. RESULTING DECLARED SET after the collapse: Probe, Decompose, Prep, Execute, Integrate, Ship, Resume, Remediate. That is eight declared titles against the six-phase happy path plus two entered only on relaunch or on failure, and every one of them has a phase() call. VERIFIED MAPPING of the current thirteen declarations: Reconcile and Prepare merge into Probe; Decompose becomes Decompose plus Cut; Plan, Plan review, Parallelize and Branch are deleted per 0115; Waves becomes Execute; Boundary folds into Integrate as gate-lint; Ship and Remediate keep their names; Final review is deleted; Shepherd is renamed and declared. ENFORCEMENT: the parity check is a universal gate in 0117 tier 1 terms - a deterministic assertion over the engine's own source that the declared set and the called set are identical - so this class of drift cannot silently return. It is cheap, it can fail, and it is proven failable by the two defects found today.
