# Test Discipline — Design Spec

Date: 2026-06-11
Status: Approved design, pending user spec review
Sub-project: 1 of 4 (Testing -> Context -> Parallelization -> Code Quality)

## Context

Audit findings (2026-06-11, this session):

- `~/.claude/rules/common/testing.md` mandates 80% coverage, three test types for every change, and unconditional TDD. The superpowers `test-driven-development` skill enforces "no production code without a failing test first, no exceptions." No rule anywhere defines when NOT to write a test, requires deduplication before adding, or governs deletion/consolidation.
- Consequence observed in real projects (Pathfinder: 1,127 test files; same pattern reported in Swiftee): suites grow with every change, full-suite verification slows every task, and passing suites do not imply working features (role/permission failures, UI behavior failures slip through).
- `verification-discipline` routes to `/verify-<project> <scope>`, but no mechanism exists to create that command; projects with rich scoped runners (e.g. turbo per-package scripts) fall back to broad runs.
- Research basis: behavior-gated test admission (Beck Canon TDD, SWE at Google ch. 11-12), change-detector and over-mocked tests as named anti-patterns (Google Testing Blog), mutation-informed redundancy detection (Koochakzadeh & Garousi), diff-scoped test selection (Meta predictive selection, Nx affected, vitest --changed), deny-case authz testing (OWASP WSTG), LLM-generated tests measurably weaker (mutation score 0.546 vs 0.690) and smell-prone (~47%). Full citations in the session research report.

## Decisions (locked with user)

1. Scoped TDD: red-first remains the default for new behaviors and bug fixes; named exemptions never get tests unless explicitly requested. Blanket 80% coverage and three-test-types mandates are dropped.
2. Scope is global-only (`~/.claude`). No project-specific deliverables; Pathfinder, Swiftee, and future projects consume the same global machinery.
3. Approach B: rewritten rules plus two new global skills (`verify-setup`, `test-cleanup`). Mechanical enforcement hooks are deferred to sub-project 4 (its Stop-hook quality gate will check unjustified tests and over-complexity in one pass).

## Component 1: Replace `~/.claude/rules/common/testing.md`

The new file is short, binding, and structured as follows.

### Purpose statement

Tests exist to create trust that the code works. The health metric of a suite is trust, never test count or coverage percentage.

### Test admission gate

A new test may be created only when ALL of:

1. The change introduces or changes a behavior, fixes a bug, or defines a public contract.
2. A search of existing tests finds no coverage of that behavior. If a similar test exists, update or replace it; never duplicate.
3. The test will assert observable behavior through a public surface (API, rendered UI, returned state), not implementation details.

If the gate fails: no test, unless the user explicitly requests one.

### Exemptions (never tested by default)

Styling/visual tweaks, copy/text changes, configuration, generated code, pure refactors already covered by existing tests, throwaway prototypes.

### TDD stance

For changes that pass the admission gate: write the test first, observe it fail (red), implement, observe it pass (green). Bug fixes always start with a red test reproducing the bug. The red step is mandatory — a test that has never failed proves nothing.

### Placement and consolidation

- Place each test at the lowest layer that can express the behavior (unit > integration > E2E).
- When a new lower-level test covers what a higher-level test checked, delete the redundant higher-level test in the same change.
- One behavior, one home: a behavior is asserted at one layer, not several.

### Quality bar

- Maximum 1-2 test doubles per test; never mock types you don't own unless a contract/integration test covers that boundary elsewhere.
- No change-detector tests (tests that fail on any refactor without a behavior change).
- No assertion-weak tests (snapshot-everything, assert-not-null-only, copied-actual-into-expected).
- Deterministic: no sleeps, no real network, no shared mutable state between tests.

### Trust rules

- Any change touching authorization requires deny-case assertions: the roles that must NOT have access are asserted as denied, not just the happy-path role as allowed.
- Critical user journeys keep E2E coverage asserting user-visible behavior (role-based locators, not CSS internals).

### Verification

- Default verification is diff-scoped: run the project's `/verify-<project> <scope>` (affected tests, typecheck, lint on touched files).
- The full suite runs only at integration boundaries or pre-push, never as a per-change reflex.
- If `/verify-<project>` does not exist, suggest running the `verify-setup` skill once.

### Cleanup discipline

- Every test addition includes a local dedup pass: superseded or duplicated tests in the affected area are updated or deleted in the same change.
- Deep, suite-wide cleanup happens only via the `test-cleanup` skill, only on explicit user request.

### Precedence

This rule supersedes plugin-skill defaults, including the superpowers TDD skill's unconditional iron law (superpowers' own instruction-priority rules place user instructions above skills). Scoped TDD as defined here is the operative discipline.

### Consistency edits riding along

- `~/.claude/rules/common/git-workflow.md`: "Verify 80%+ coverage" in the Feature Implementation Workflow is replaced with "Verify via the admission gate and diff-scoped checks (see testing.md)". The "tdd-guide agent" references remain untouched (agent existence is a separate concern, out of scope).

## Component 2: New global skill `verify-setup`

Location: `~/.claude/skills/verify-setup/SKILL.md`

Trigger: user invokes it ("set up verify for this project", `/verify-setup`), or `verification-discipline` finds no `/verify-<project>` command and suggests it. Run once per project; idempotent (re-running refreshes the mapping).

Behavior:

1. Detect the project: name, repo root, build system and test runners. Inspect `package.json` (scripts, workspaces), `turbo.json`, `nx.json`, `vitest.config.*`, `jest.config.*`, `pyproject.toml`/`pytest.ini`, `Cargo.toml`, `Makefile`.
2. Discover native scoped capabilities, preferring what the project already has: `turbo run <task> --filter=<pkg>`, `nx affected`, `vitest --changed` / `vitest related`, `jest --findRelatedTests`, `pytest-testmon` or `pytest -k`, `cargo test -p <crate>`, per-workspace scripts.
3. Build a scope routing table mapping scope names to commands: `typecheck`, `lint` (touched files), `unit:<area>`, `integration:<area>`, `e2e:<journey>`, `full`.
4. Write the project-local command `<project>/.claude/commands/verify-<project>.md`: a slash command accepting `<scope>` arguments with the routing table inline, in the format `verification-discipline` and the `verification-strategist` agent already expect.
5. Validate: execute the cheap scopes once (typecheck, lint, one unit scope) to confirm the commands work; record measured runtimes in the routing table as guidance.
6. Report to the user: scopes created, runtimes, and any gaps.

Error handling:

- No recognizable runner: write a minimal command containing only typecheck/lint plus explicit TODO entries naming what could not be discovered. Never invent package scripts that don't exist.
- A discovered command fails during validation: include it commented-out in the routing table with the failure noted; surface it to the user rather than silently dropping it.
- Monorepo with heterogeneous runners: one routing table, scoped per workspace.

## Component 3: New global skill `test-cleanup`

Location: `~/.claude/skills/test-cleanup/SKILL.md`

Trigger: ONLY explicit user request ("clean up tests", `/test-cleanup`, optionally scoped to an area or path). Never proactive, never auto-triggered, never invoked by other skills.

Phases:

1. Inventory: count test files and cases; map each test to a behavior area and layer (from naming, imports, and directory structure); collect runtimes where the runner reports them.
2. Detect candidates — for large suites, parallel read-only subagents per behavior area, each hunting:
   - duplicates: same behavior asserted at the same layer
   - shadowed tests: higher-level tests fully covered by lower-level ones
   - change-detectors: tests asserting implementation structure
   - assertion-weak: no meaningful assertions, snapshot-everything, tautological expected values
   - over-mocked: tests asserting mock choreography rather than observable behavior
   - dead: permanently skipped, unreferenced helpers, tests for removed features
3. Evidence: every candidate carries file:line, category, the surviving test that covers the behavior (for duplicates/shadowed), and a proposed action: delete, merge into named test, or rewrite assertions.
4. Mutation spot-check (optional tier): if the project has a mutation tool configured (Stryker, PIT, mutmut), verify the mutation score is unchanged without the candidate before recommending deletion; such candidates are marked proven-redundant. Without a tool, candidates are marked heuristic-confidence.
5. Approval and apply: the user approves in batches (by category or area). Per approved batch: apply changes, run affected tests, one git commit (revertible unit). After all batches: one full-suite run to prove green, plus a written ledger (in the project, e.g. `docs/test-cleanup-YYYY-MM-DD.md`) recording what was removed and why.

Safety rules:

- Nothing is deleted without explicit batch approval.
- Batch size capped (default 20 candidates per batch) so review stays meaningful.
- The skill works on a clean working tree only; refuses to start otherwise.
- If any batch's affected-test run fails, the batch is reverted and reported, not patched silently.

## Cross-cutting integration

- `~/.claude/skills/verification-discipline/SKILL.md`: add one line — when `/verify-<project>` is missing, suggest running `verify-setup` (instead of silently falling back to broad checks).
- Both new skills follow the existing user-skill conventions in `~/.claude/skills/` (SKILL.md with name/description frontmatter).

## Out of scope

- Any project-side work (Pathfinder, Swiftee): running verify-setup or test-cleanup there happens later, as normal usage.
- Enforcement hooks for unjustified test additions (deferred to sub-project 4).
- Context sentinel, parallelization changes, code-quality automation (sub-projects 2-4).
- Editing plugin-owned files (superpowers skills remain untouched; precedence is asserted from user rules).

## Verification plan (for the implementation phase)

1. testing.md: re-read for internal consistency; grep `~/.claude/rules` for contradicting mandates (80%, "all required", proactive tdd-guide) and confirm none remain.
2. verify-setup: dry-run against a small fixture project (temp dir with a package.json + vitest) and confirm it generates a working verify command; confirm idempotent re-run.
3. test-cleanup: dry-run detection phases against a fixture with planted duplicates/assertion-weak tests; confirm candidates are found with correct evidence and nothing is modified without approval.
4. verification-discipline edit: confirm the suggestion line appears and the skill still parses.

## Success criteria

- A change that fails the admission gate produces zero new tests without prompting.
- A project after verify-setup runs scoped verification in seconds, full suite only at boundaries.
- test-cleanup on a bloated suite produces an evidence-backed reduction proposal and applies only approved batches, ending green.
