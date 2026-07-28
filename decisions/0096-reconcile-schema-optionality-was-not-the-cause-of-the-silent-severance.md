---
Status: accepted
Date: 2026-07-28T21:04:30.729Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0096. RECONCILE_SCHEMA optionality was not the cause of the silent severance, and requiring the key is actively harmful

## Context

A standing open risk asserted that the severance stayed silent because RECONCILE_SCHEMA declared boundaryPreflight optional and absent from `required`, so a verdict-less reconcile result validated cleanly. That hypothesis was TESTED this session by actually making the key required. It broke a legitimate path with a real test: "MSP-2 R3: the slug-read failure the reconcile prompt instructs is SCHEMA-EMITTABLE and reaches the clean reconcile halt" (tests/mitosis-scheduler.test.mjs:2650) failed with `<root>.boundaryPreflight: required but absent`. The reason is structural: recon prompt step 2 instructs an agent whose slug read fails to "STOP, run no further command" and return the failure shape, so that agent legitimately never reaches step 7 and has no verdict to report. The engine provably never reads the verdict on that path anyway - the mergedPRsAuthoritative halt at mitosis.js:3737 fires eleven lines before the boundary read at 3748.

## Options

- Require the boundaryPreflight key while keeping the value nullable, so a future severance is loud
- Leave the schema optional and rely on readBoundaryPreflightVerdict's fail-closed handling of an absent key

## Outcome

REFUTED and REVERTED; the schema at mitosis.js:1347 is unchanged. There is no engine-side JSON Schema validator on this path at all - the schema is only the agent-side output contract, which is why it could never have caught a deleted call site. readBoundaryPreflightVerdict (mitosis.js:130) already treats undefined and null identically and returns proven:false, so an absent verdict halts on the same precise reason as a null one. Restoring the CALL SITE is the entire hardening. Requiring the key would convert a clean, precisely-diagnosed halt into an opaque schema rejection plus a crashed reconcile. Do not re-attempt this; the intended idiom for a present-but-nullable field is ownerRepo/repoHost, which are required only because they are emittable on every branch.
