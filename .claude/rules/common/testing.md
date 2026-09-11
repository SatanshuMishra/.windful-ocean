# Testing Discipline

Tests exist to create trust that the code works. The health metric of a suite is trust, never test count or coverage percentage.

## Test Admission Gate

A new test may be created ONLY when ALL of these hold:

1. The change introduces or changes a behavior, fixes a bug, or defines a public contract.
2. A search of existing tests finds no coverage of that behavior. If a similar test exists, update or replace it; never duplicate.
3. The test asserts observable behavior through a public surface (API response, rendered UI, returned state) — not implementation details.

Gate fails → no test, unless the user explicitly requests one.

## Exemptions (never tested by default)

Styling and visual tweaks, copy/text changes, configuration, generated code, pure refactors already covered by existing tests, throwaway prototypes.

## TDD (scoped)

For changes that pass the admission gate: write the test first, watch it fail (RED), implement, watch it pass (GREEN). Bug fixes always start with a red test reproducing the bug. A test that has never failed proves nothing.

Every fix ships an acceptance test that is red on the PARENT COMMIT and green on the fix, and that asserts the reported symptom rather than a proxy for it. It ships alongside an inertness mutation: revert or empty the thing the fix added, and the assertion must turn red. A test that survives that mutation is not testing the fix.

## Placement and Consolidation

- Place each test at the lowest layer that can express the behavior (unit before integration before E2E).
- When a new lower-level test covers what a higher-level test checked, delete the redundant higher-level test in the same change.
- One behavior, one home: a behavior is asserted at one layer, not several.

## Quality Bar

- Maximum 1–2 test doubles per test; never mock types you don't own unless a contract or integration test covers that boundary elsewhere.
- No change-detector tests (tests that fail on refactors that preserve behavior).
- Any gate that classifies tokens, identifiers or paths is a closed census that halts on the unclassifiable. A pinned count or a sampled allowlist is forbidden — both are change-detectors wearing a census costume.
- No assertion-weak tests: snapshot-everything, assert-not-null-only, expected values copied from actual output.
- Deterministic: no sleeps, no real network, no shared mutable state between tests.

## Trust Rules

- Authorization changes require deny-case assertions: roles that must NOT have access are asserted as denied, not just the allowed role as allowed.
- Critical user journeys keep E2E coverage asserting user-visible behavior (role-based locators, not CSS internals).

## Verification

- Default verification is diff-scoped. Derive the scope from the files the change actually touched (`git diff --name-only` against the base), never from how large the unit feels.
- Run the FIRST of these that exists in the project, and stop there: the project's `/verify-<project> <scope>`; a scoped script the project already defines (a `test:unit`, `lint:changed` or equivalent); the test runner pointed at the touched paths (`npx vitest run <paths>`, `npx jest <paths>`, `pytest <paths>`, `go test ./<pkg>`); typecheck plus lint on the touched files.
- A missing `/verify-<project>` is not a reason to fall back to the full suite. It moves you one rung down the list above. The full suite is the last rung, taken only when nothing narrower can be run, and taken while saying that is why.
- The full suite runs at most twice per unit of work: once if it is the only runnable check, and once before hand-off or push. Never as a per-change reflex.
- Never re-run a check that passed ON UNCHANGED STATE. A second green over the same tree carries no information the first did not, and "for determinism" is not a reason — a test that passes then fails is a flaky test, which is a defect to file rather than a reason to run it a third time. A tree that has moved is different state: after a rebase, a merge, or a further edit, an earlier green no longer describes what you are holding, and re-running is required rather than wasteful.
- Where the project declares an external verification standard, that standard sets the shape of the receipt that proves a unit, and this section does not override it. Under `receipts`, the full-scope green on head that G9 requires IS the one pre-hand-off full run allowed above — it is that run, not an extra one, and the two rules agree rather than compete. Propose a gap in a declared standard; never narrow one from here.
- If `/verify-<project>` does not exist, suggest running the `verify-setup` skill once for the project. That is a follow-up, never a substitute for verifying the change in hand.

## Cleanup Discipline

- Every test addition includes a local dedup pass: superseded or duplicated tests in the affected area are updated or deleted in the same change.
- Suite-wide cleanup happens only via the `test-cleanup` skill, only on explicit user request.

## Precedence

This rule supersedes plugin-skill defaults across EVERY clause in this file, not only its TDD section. Three named collisions, all resolving the same way.

The superpowers `test-driven-development` skill's unconditional "no production code without a failing test" law yields to scoped TDD as defined above.

The superpowers `verification-before-completion` skill yields to the Verification section above on three specific points: its freshness law ("If you haven't run the verification command in this message, you cannot claim it passes") does not require re-running a check whose result you already read on unchanged state; its "Partial proves nothing" rule does not promote a diff-scoped run to a full one, because a scope chosen to cover what the change touched is not a partial run; and its per-test revert-and-restore regression cycle yields to the batched red-proof, which reverts the production files once for all of the tests at issue.

The superpowers `verification-before-completion` skill yields a third time, on trusting a returned result. It names "Trusting agent success reports" as a red flag and prescribes checking an agent's diff independently after it reports success. That loses to `delegation-discipline`: a check an executing agent ran and returned with its exit code is READ, not re-run, because a re-verification round adds a second error source rather than confidence. Where a result genuinely cannot be trusted, the defect is the hand-off and the remedy is a re-runnable acceptance check, never another review pass.

User instructions outrank skills per superpowers' own instruction-priority order.
