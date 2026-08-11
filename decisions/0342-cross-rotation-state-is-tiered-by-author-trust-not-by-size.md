---
Status: accepted
Date: 2026-08-11T18:53:49.593Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0342. Cross-rotation state is tiered by who can be trusted to author it, not by size

## Context

The diagram page already said at :634-635 that decisions, constraints and failures cross verbatim while narrative may be summarized - the instinct was right - but nothing assigned content to classes, named the artifacts, or specified a schema. Research settled the surrounding facts. arXiv:2606.22528 verified EXACTLY as 0336 cites it: compaction raises pooled constraint violation to 30% (range 0-59% across seven model families, 1,323 episodes), restored to 0% by verbatim pinning at roughly 47 tokens. Anthropic's compaction documentation makes NO preservation guarantee and pushes the burden to the developer; its memory tool auto-injects "ASSUME INTERRUPTION - your context window might be reset at any moment, so you risk losing any progress that is not recorded in your memory directory"; its long-running-agent harness guidance names GIT COMMITS as the recovery mechanism; and its multi-agent lead agent writes its plan out to memory BEFORE hitting the limit rather than summarizing at teardown. A run-log audit found foldRunManifest/applyRunDelta deterministic, total, and ADDITIVELY EXTENSIBLE - proven live by an orphaned {"kind":"window"} record in fireplace/.mitosis/run.json that no current code constructs and the fold correctly ignores.

## Options

- Four tiers split by author trust - chosen
- A single model-written handoff brief
- Full transcript replay via the Agent SDK resume contract
- Retrieval over a stored transcript corpus

## Outcome

Four tiers, split by WHO CAN BE TRUSTED TO AUTHOR each, not by size. Tier 0: anything externally visible is NOT carried at all - it is re-derived at successor startup from git and GitHub, extending mitosis's existing reconcile-first rule that the manifest is a hint that can lie, never an authority. Tier 1: constraints, decisions and failures cross VERBATIM, re-injected every rotation, never rewritten - the ~47-token pinning result. Tier 2: findings (file:line), tried-and-failed notes and step results are emitted as TYPED RECORDS AT LEARNING TIME by the orchestrator and folded by CODE, not summarized at teardown. Tier 3: narrative, and only narrative, may be summarized. The consequence is the whole point: by the time rotation fires there is nothing left to summarize, and the handoff brief is COMPUTED by the supervisor from the log rather than AUTHORED by a dying agent - converting the riskiest judgment call in the design into a projection. run-log.mjs's record shape and fold semantics are ADOPTED as the Tier 2 substrate; its durability layer is NOT, and four gaps are new work: fail-loud-or-mark on an unreadable record, real O_APPEND atomicity, a normalised dedup key (today only ci-attempt dedupes, on short controlled tokens, and free-text park diagnoses are never deduped), and a cross-machine channel (.mitosis/ is gitignored; refs/mitosis/ carries a commit pointer only; refs/mitosis-manifest/ is write-once and deliberately strips the mutable fields a handoff needs). Two of the four are SANDBOX ARTIFACTS that 0325's Node host dissolves. Accepted counter-evidence, recorded rather than buried: arXiv:2601.00821 measured verbatim transcript chunks beating LLM-extracted structured artifacts by 15.9-22.0 points, which cuts against ANY structuring step including this fold - so Tier 2 is additive over Tiers 0 and 1, never a replacement, and the raw log is retained. Reliability evidence for every pattern surveyed is DESCRIBED, not MEASURED.
