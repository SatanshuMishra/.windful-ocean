---
Status: accepted
Date: 2026-07-30T08:25:51.354Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0130. MSP-0 shipped as PR 15, but the gate's first draft had three reproduced false-clean paths and one tautological test

## Context

MSP-0 (phase parity gate plus honest declarations) was the only cleared step-6 work. Implemented on feat/phase-parity-gate off origin/main 6d19499, commit 3806be0, opened as PR 15. The question was whether the first implementation could be trusted as a gate, given that a gate returning a false clean verdict is worse than no gate.

## Options

- Accept the first draft: it satisfied every acceptance criterion in the spec and npm test was green
- Review adversarially and fix what the review reproduced before merging
- Defer the gate and land only the declaration rename

## Outcome

Reviewed adversarially, and the review paid for itself. The lexical scanner (nested templates, interpolated object literals, regex-vs-division, escapes) survived attack, but the regex layer consuming the masked text had THREE reproduced false-clean paths, each demonstrated with a probe fixture rather than argued: (1) the extractor recognized exactly one spelling per surface, so `{ 'phase': 'X' }`, a computed key, `ctx.phase('X')` and object shorthand were invisible - not halted, not counted; the member-call form is one refactor away from existing, since `phase` is destructured out of `ctx` at mitosis.js:1030 and handed back at :4632. (2) Any `phase: 'X'` literal ANYWHERE marked X used, so a dead `const NEVER_USED = { phase: 'Final review' }` made the gate return clean on defect #1, the very defect it exists to catch; a ternary was also miscollected as an assignment. (3) The declared set came from the FIRST `phases: [` in the file, unanchored to `meta`, so an unrelated array above `export const meta` silently became the declared set. Sitting exactly where a reviewer would look for the guarantee was a TAUTOLOGICAL assertion, `literal + destructuring + forwarded === total`, identically true on every ok path and structurally blind to (1) while its message claimed the opposite. Fixed by a CLOSED TOKEN CENSUS - every `\bphase\b` token in the masked source classifies into key, call or bare-identifier, and an unclassifiable token halts - chosen over the reviewer's suggested allowlisted count of 2, because a pinned count is the change-detector testing.md forbids. Census on live source: 62 = 47 keys + 13 calls + 2 bare. Two further bugs were caught by the fix pass's own new tests, including a spread-reference miss that would have produced FALSE VIOLATIONS. Final: 1612 pass / 0 fail; gate exit 0 on post-change source, exit 41 naming both directions on pre-change source. NAMED RESIDUAL LIMIT, not covered: a key assembled by concatenation (`['pha'+'se']`) still reads clean, because no text-based gate sees it without constant folding; the literal `['phase']` form does halt. Also decided: Resume stays at meta.phases index 10 rather than execution order (display-only, MSP-13 owns Resume); the CLI having no in-repo caller is accepted, since enforcement is the test file under npm test. THE SPEC OMITTED A REQUIRED EDIT - frontier-train-e2e.test.mjs:489 asserted on the old Shepherd phase name and would have left the branch red; found by grep before dispatch, not by the spec. 0128 was vindicated: every one of the spec's five MSP-0 line anchors was wrong and was re-derived against the live tree.
