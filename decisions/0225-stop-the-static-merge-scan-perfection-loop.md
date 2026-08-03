---
Status: accepted
Date: 2026-08-03T18:58:18.762Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0225. Stop the static merge-scan perfection loop; the runtime chokepoint is what enforces merge abstinence

## Context

Round six of the review-fix sequence closed three demonstrated defects in the argv enumeration at no-self-merge-consent.test.mjs, and an independent adversarial pass then demonstrated a fourth: MITOSIS_GIT_STAGES is a hand-typed local list and the per-verb completeness guard only requires each verb to build at least one argv at SOME listed stage, so an existing verb such as pr-close with a second branch at an unlisted stage returning a computed merge argv passes all 232 tests. The reviewer recommended making the servable verb/stage pair set data, exported from mitosis-git.mjs, with buildGhArgv dispatching off it so an unenumerated stage becomes structurally impossible. That would be a production refactor of the sanctioned gh wrapper.

## Options

- Refactor buildGhArgv to dispatch off an exported verb/stage pair table so the test enumerates every servable pair by construction
- Keep the test as written and accept the demonstrated hole silently
- Keep the assertion, fix only its failure message to claim what it verifies, and record the stage axis as a named residual

## Outcome

Do NOT make the table-driven pair-enumeration change and do NOT modify production mitosis-git.mjs. Rationale, recorded verbatim: the merge-invocation pattern list is a denylist over an infinite string space and can never close; each round it caught only a new spelling (Automerge vs AutoMerge, then a computed ['me','rge'].join('')). What actually enforces merge abstinence is the runtime chokepoint: mitosis-git.mjs has exactly one spawnSync (:347) and ghExecTripwire(argv, classifyGhMerge) runs before it (:343), fail-closed. A reviewer called the exported execGh directly with 8 merge argv shapes, including both demonstrated attack argvs, and all were REFUSED. Completeness comes from the chokepoint being singular, not from enumerating what flows through it. Refactoring production dispatch so a redundant static test can echo a working runtime gate is real blast radius for marginal assurance - and rebuilding an over-claiming gate is precisely the assurance inflation that 0219/0220 deleted the preflight for. The single remaining edit is therefore a message correction: the merge-token assertion inside the buildGhArgv loop currently claims it catches merge tokens assembled at run time even though no scan of the source text can see them, which is false and was demonstrated. It is rewritten to claim only the enumerated verb/stage pairs, to state that the stage axis is a local list nothing keeps in sync with buildGhArgv, and to name where the property is actually enforced (ghExecTripwire at mitosis-git.mjs:343 before the single spawnSync at :347, fail-closed) and where the source-text ban lives (tests/mitosis-git.test.mjs:969). No new assertions, no production change. Coverage rows M2 and M3 record the stage axis as a named residual this change deliberately does not close, with this ruling as the reason.
