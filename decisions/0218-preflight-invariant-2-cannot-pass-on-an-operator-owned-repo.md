---
Status: accepted
Date: 2026-08-03T15:02:47.268Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0218. Preflight invariant 2 is structurally unsatisfiable when the operator runs mitosis on a repo they own with their own credential

## Context

A mitosis run against SatanshuMishra/logbook halted at exit 30 with invariant 2 failing on both reads: the repository capability map and the collaborator read each report the authenticated identity as admin. Invariant 2 exists so the account the engine merges with cannot edit or delete the ruleset that constitutes the merge boundary. A GitHub repository owner is necessarily admin on it, so the credential that owns the repo can never satisfy this check. Grounded in merge-boundary-preflight.mjs:172, where admin !== false is the halt, and :188/:191, where the corroborating read refuses to read disagreement as a proven non-admin. NOT independently reproduced: this session never ran the preflight and never read the test files.

## Options

- Treat the halt as a misconfiguration to nudge — refuted, ownership implies admin and no setting removes that
- Relax or special-case invariant 2 for self-owned repos — rejected, it would delete the boundary the invariant exists to establish, and I4/I5/I6 rest on that boundary
- Provision a separate machine user with write-not-admin access as the engine's credential
- Accept that mitosis does not run against repos the operator owns under their own credential

## Outcome

Recorded as structural, not as a defect and not as a misconfiguration. Relaxing invariant 2 is rejected outright: it is the check that makes the engine's merge boundary non-self-editable, and M8's I4, I5 and I6 all assume that boundary holds. Two live paths remain, and they are not close substitutes: provision a separate machine user with write-but-not-admin access, or accept that mitosis does not run on this repo. Invariant 3 is independent of this and genuinely fixable — the base branch simply carries no pull_request rule with a required_approving_review_count. The bypass check is advisory by construction (invariant null, rendered "advisory" at :360) and always needs a human, because GitHub returns bypass_actors only to a caller with write access to the ruleset and granting that would let the engine edit its own boundary. No path was chosen this session; the decision is the framing, not the remedy.
