---
Status: accepted
Date: 2026-08-21T22:29:10.947Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0666. The closed dispatch-kind set is twelve, and scope-fence is not one of them

## Context

The SPEC names the dispatch-kind set as the one place it knowingly stops short, assumes eight kinds, and warns that guessing would put an invented enum into a persisted record format. Two agents derived it independently. The authoritative source is prompt-registry.mjs's PROMPT_COMPOSERS, which throws on any other kind and is already pinned by an existing test against PROMPT_KINDS in prompt-contract.mjs.

## Options

- Implement against the SPEC's assumed eight
- Derive the set from the runtime-enforced composer registry and implement against that

## Outcome

The set is twelve: decompose, plan, plan-review, replan, implement, review, security, boundary-fix, ci-fix, diagnose, redispatch, ci-fact-extract. cassette.mjs validates against those twelve. scope-fence is an ISOLATION_MODES value, never a kind. Two call sites pass a computed kind rather than a literal, both provably closed because composePrompt throws otherwise. Prep-phase dispatches carry no unitId, so M1 records only the runUnit-level dispatches; that gap is filed.
