---
Status: accepted
Date: 2026-07-31T05:36:35.460Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0145. Four facts 0144 rested on were overturned by execution, including the plan's own B6 remedy

## Context

0144 settled B-6's counting rule and named mitosis-gate.mjs as the production caller, but it rested on facts derived by reading rather than by running. A dedicated spec-authoring pass was dispatched to turn 0144 into an implementable spec and was told explicitly that the established facts were hints, not authority, and that disagreement had to come with evidence. It overturned four of them, each by executing rather than reasoning, which is 0137's standing rule applied to 0137's own successor.

First, the sandbox census does not compile mitosis.js. derivedEngineIdentifiers tokenises the file and compiles a synthesised probe string; the claim that the real engine body is proven to compile inside the sandbox was never established by that test. Second, the normalization the tests use, replacing /^export const meta/m, breaks three existing gate tests when lifted into the gate — measured at 44 total, 41 passing, 3 failing — while the total per-line strip /^export /gm, the form mirror-guard.test.mjs already uses, returns 44/44. Third, the M4 characterization suite has a hole exactly where the refactor lands: the sites === 0 halt in resolveCallSitePhases has no test at all, grep for its error string across the 477-line gate test returns zero, so 0144's claim that the existing suite licenses the :455 refactor was true for the forwarding paths and false for the branch the refactor actually moves. Fourth, and most consequential, the governing plan's own named B6 remedy cannot discharge B6: it directs the engine reconstruction at frontier-train-e2e.test.mjs to route through compileWorkflow, but that is a test file, which the counting rule adopted in 0144 scores as zero callers. No production AsyncFunction path exists anywhere in the tree.

This is the third consecutive session in which a hand-written enumeration or citation in the two-track plan failed on contact with the live tree, after 0137 and after 0144's own findings.

## Options

- Accept 0144's facts and implement the spec as first drafted
- Re-derive every load-bearing fact by execution before implementing, and correct 0144 in a successor record
- Treat the plan's B6 remedy as authoritative and route the test-file AsyncFunction path through compileWorkflow

## Outcome

Second. The four corrections stand and the spec at docs/superpowers/specs/2026-07-31-b6-harness-liveness-implementation.md carries them with their evidence; it is UNTRACKED and must be committed by the fresh session. 0144's two central rulings survive unchanged — the counting rule and mitosis-gate.mjs as the caller — but three of its supporting claims are now corrected: use /^export /gm not /^export const meta/m, write the missing sites === 0 fixture before touching :455 rather than relying on the existing suite, and stop citing the census as proof that mitosis.js compiles.

The fourth correction closes the plan's B6 route entirely. Since its named remedy targets a test file that the adopted rule scores as zero, there is no version of the plan's step that discharges B6; the gate wiring is not an alternative to the plan's approach, it is the only approach. The plan's line-112 oracle should be read as superseded by 0144 plus this record, not as a route not taken.

Design of record, confirmed by running the fully patched tree and not only by simulation: a sandbox-compile precondition inside runMitosisGate under the existing phase-parity verb, a new GATE_COMPILE_EXIT of 44, compileWorkflow called for its parse and realm construction only and never invoked because invoking dispatches real agents, and the gate executed as one run step appended to the existing test job in test.yml. The dead list moves from [workflow-sandbox.mjs::compileWorkflow] to empty. The :455 replacement passes 44/44 in both loop orderings and removes the semgrep finding by construction rather than by suppression.

Two questions are left open for the implementing session rather than pre-judged here, because both are one-line edits whose right answer depends on evidence that session will hold: whether to de-regex :262 and :275 as well, which the spec recommends and which takes semgrep --error on the file to exit 0, versus accepting unverifiable shifted-line fingerprint behaviour on those two; and whether the M1 coverage row reads threatened or not-threatened, given that test.yml hosts the coverage job but the job itself is byte-unchanged.
