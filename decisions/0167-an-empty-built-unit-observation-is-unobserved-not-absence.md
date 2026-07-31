---
Status: accepted
Date: 2026-07-31T22:17:43.639Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0167. An empty built-unit observation is unobserved, not evidence of absence; only a populated one may withhold a ref

## Context

D3 of 0166 required an explicit ruling on the third state. selectResumeBuilt (parking.mjs:114/120 at 9e36674) coerced builtUnits to an empty Set whenever it was neither a Set nor an Array, collapsing a MISSING observation, an UNUSABLE one and a genuinely EMPTY one into one value that withheld the checkpoint ref from every built unit. The value originates at mitosis.js:3821-3822 from mergePaginated over recon.checkpointRefPages, and the reconcile agent prompt at mitosis.js:3766 instructs verbatim: return checkpointRefPages=[] if there is no remote or no such ref. An empty array is therefore the documented return for unobserved, definitionally indistinguishable from observed-and-empty.

## Options

- Treat empty as observed-empty and gate on it, accepting that a short or empty listing parks every built unit
- Treat empty as unobserved and fall back to the deterministic ref, gating only on a populated observation
- Change the agent contract so [] can be distinguished from no-remote, then gate on the sharpened fact

## Outcome

Only a POPULATED observation may withhold a ref. Three states are now discriminated in selectResumeBuilt and its mitosis.js WHOLE-class twin (landed b7b54b0): observation absent or unusable falls back to the deterministic ref, observation present and empty ALSO falls back, observation present and non-empty gates on membership. This is the honest H-B fix stripped of the H-C error class 0159 refuted - absence from an incomplete listing is not evidence of non-existence, with checkpoint-ref pagination in place of the 200-item PR cap. The parking test that blessed the failure mode was rewritten and is receipted red at dcb1a46. Two limits recorded rather than papered over. FIRST, state 1 is UNREACHABLE in production: reconcileBuiltSet (reconcile.mjs:35-48) returns an Array unconditionally, so the live discriminator is only empty-vs-populated; state 1 guards direct library callers alone. SECOND, option 3 was NOT taken and remains the sharper fix available later - teaching the reconcile agent to distinguish no-remote from remote-listed-zero-refs would make an empty observation genuinely informative and let it gate honestly. That is an agent-contract change, out of P2's scope and already over budget at 484 changed lines. selectPreservedBuilt (parking.mjs:141/146) carries a similar-looking coercion and is deliberately UNTOUCHED: 9e36674 never modified it, and its semantic is the conservative direction - a unit it drops is rebuilt, not parked for a human.
