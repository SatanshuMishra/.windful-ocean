---
Status: accepted
Date: 2026-08-17T09:31:04.866Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0515. The decomposer declares securityReviewRequired; it is never defaulted

## Context

MSP 7 made review and security compose at dispatch, but only for units whose spec carries a judgment record, and readJudgment refuses a record whose securityReviewRequired is absent or non-boolean. No such field exists anywhere: decompose-schema.mjs:37 fixes the MSP keys with additionalProperties false at id, title, rationale, changeType, scope, dependsOn and fileScope, and the only thing by that name is securityReviewRequired in the dead run-engine.mjs:133, which reads task.risk, task.edgeReasons and task.dependentCount, fields the decompose schema does not carry. The implementer declined to invent the policy and filed it. The end-to-end run then measured the consequence directly: three claude children for two units, one decompose plus one implement each, and no review at all, because decompose-emit emits no judgment record.

## Options

- Default securityReviewRequired to false when absent; OR derive it in the engine from fileScope path heuristics; OR make the decomposer declare it as a required boolean per MSP

## Outcome

The decomposer declares it. securityReviewRequired becomes a REQUIRED boolean on the MSP record, and the decompose prompt instructs setting it true when the MSP touches authentication, input handling, data access, secrets or external integrations, matching the trigger conditions the security-reviewer agent already declares, and false otherwise. Defaulting to false when absent was rejected outright: an optional security flag that defaults off is precisely the silent skip that readJudgment's refusal exists to prevent, and it would make a missing field indistinguishable from a considered no. Deriving it in the engine from fileScope path heuristics was rejected because the decomposer is the only party that has read the spec and knows what the MSP actually does, and a path heuristic would both miss a security change under an innocuous path and fire on an innocuous change under a sensitive one. Making the field required breaks existing fixtures; updating them is expected work rather than a reason to soften the contract.
