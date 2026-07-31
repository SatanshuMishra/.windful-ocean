---
Status: accepted
Date: 2026-07-31T01:29:54.866Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0142. The coverage verdict domain stays two-valued; B6 on the sandbox PR is not-threatened

## Context

Authoring the sandbox branch's coverage entry raised what looked like a schema defect: ALLOWED_VERDICTS is threatened/not-threatened only, and on feat/workflow-sandbox-harness the B6 invariant (the harness has a real production caller) is not merely at risk, it is known false, since B-6 has not landed. The apparent conclusion was that an honest author had no legal truthful value and the domain needed a third one. Re-deriving against the tracked spec docs/superpowers/specs/2026-07-30-two-track-invariant-plan.md reversed that. Line 121 fixes the two-value domain deliberately. Lines 196 and 207 show the intended semantics in the spec's own worked verdicts: B6 is marked not threatened all through the sandbox work and becomes the subject only at the wiring step. A verdict answers whether the CHANGE bears on the invariant, not whether the invariant currently holds. Line 124 already records the residual as a permanent human gate: CI proves the table exists and is total, never that a verdict is true. This is the thread's central lesson recurring in a new costume - the wrong answer came from reasoning over the schema instead of re-deriving from the source of truth the registry now cites.

## Options

- Add a third verdict such as violated or deferred, with a required remediation field, shipped as its own PR after the gate lands
- Rename the domain to not-applicable/holds/violated while exactly one coverage entry exists and migration is cheapest
- Keep the spec's two-value domain and carry the unsatisfied-and-scheduled distinction in the row's check text

## Outcome

Keep the two-value domain. The sandbox PR's B6 row is not-threatened, with a check that states plainly that no production caller exists, that B6 is unsatisfied, and that it is the subject of the later wiring step. Adding a third value would diverge scripts/invariant-coverage-check.mjs from the spec every registry entry now cites, and would not buy truthfulness, which line 124 already fences as a human gate by nature. A corollary that constrains future work: a PR's scope is frozen at creation, because pr-create composes the body and post-creation body edits are denied, so new behavior never gets appended to an open PR - it ships as its own PR with its own body.
