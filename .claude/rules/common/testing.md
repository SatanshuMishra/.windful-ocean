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

## Placement and Consolidation

- Place each test at the lowest layer that can express the behavior (unit before integration before E2E).
- When a new lower-level test covers what a higher-level test checked, delete the redundant higher-level test in the same change.
- One behavior, one home: a behavior is asserted at one layer, not several.

## Quality Bar

- Maximum 1–2 test doubles per test; never mock types you don't own unless a contract or integration test covers that boundary elsewhere.
- No change-detector tests (tests that fail on refactors that preserve behavior).
- No assertion-weak tests: snapshot-everything, assert-not-null-only, expected values copied from actual output.
- Deterministic: no sleeps, no real network, no shared mutable state between tests.

## Trust Rules

- Authorization changes require deny-case assertions: roles that must NOT have access are asserted as denied, not just the allowed role as allowed.
- Critical user journeys keep E2E coverage asserting user-visible behavior (role-based locators, not CSS internals).

## Verification

- Default verification is diff-scoped: run the project's `/verify-<project> <scope>`.
- The full suite runs only at integration boundaries or pre-push — never as a per-change reflex.
- If `/verify-<project>` does not exist, suggest running the `verify-setup` skill once for the project.

## Cleanup Discipline

- Every test addition includes a local dedup pass: superseded or duplicated tests in the affected area are updated or deleted in the same change.
- Suite-wide cleanup happens only via the `test-cleanup` skill, only on explicit user request.

## Precedence

This rule supersedes plugin-skill defaults, including the superpowers test-driven-development skill's unconditional "no production code without a failing test" law. User instructions outrank skills per superpowers' own instruction-priority order. Scoped TDD as defined here is the operative discipline.
