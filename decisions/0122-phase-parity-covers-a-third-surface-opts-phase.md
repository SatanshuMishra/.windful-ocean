---
Status: accepted
Date: 2026-07-30T06:38:37.646Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0122. Phase parity covers a third surface: the opts.phase literals in agent dispatches

## Context

0121 made the parity rule two-directional over meta.phases and phase() call sites, and made it a tier-1 universal gate. Writing the step-6 spec required specifying what the checker actually extracts. A census taken this session found a third surface the decision did not enumerate: the Workflow tool contract also assigns an agent to a progress group via opts.phase, where the same string means the same group box. mitosis.js carries 45 such literals over 13 distinct titles, including phase: 'Shepherd' at :2887, :2994 and :3033 alongside the phase('Shepherd') call at :2906 - all four undeclared. 'Final review' has zero opts.phase occurrences, which independently confirms 0121's finding that it is wholly inert.

## Options

- Implement the checker over exactly the two surfaces 0121 names, treating opts.phase as out of scope
- Widen the checker to all three surfaces, since an undeclared opts.phase produces the same defect the rule exists to prevent
- Leave opts.phase for a follow-up decision and ship a partial gate now

## Outcome

WIDENED to three surfaces: declared titles, phase() call arguments, and opts.phase literals. This sharpens 0121 rather than extending scope - an undeclared opts.phase creates exactly the unnamed progress surface 0121 exists to prevent, so a two-surface checker would pass a tree carrying the very defect class the rule names. The Shepherd case proves it: three of its four appearances are opts.phase, so a two-surface checker catches one quarter of one defect. IMPLEMENTATION SHAPE, fixed here: the checker is a PURE function over three extracted sets; the gate applies it to live source; the failability proof is a unit test over the two recorded defects as FIXTURES, never over live source - that preserves both the proof and the green-branch invariant, since a gate proven failable against live source would by construction fail on main. FALSIFIER per 0112 rule 3: if opts.phase literals cannot be enumerated statically without evaluating the source, the third surface is not statically decidable and this reopens as a decision rather than proceeding as a rule. Flagged to the user in-session as a judgment call rather than implemented silently.
