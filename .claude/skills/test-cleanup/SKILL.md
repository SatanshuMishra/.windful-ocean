---
name: test-cleanup
description: Use ONLY when the user explicitly asks to clean up, consolidate, or audit tests (e.g. "clean up tests", "/test-cleanup", optionally scoped to an area). Never proactive, never invoked by other skills. Inventories the suite, finds redundant and low-value tests with evidence, and applies deletions only in user-approved batches.
---

# Test Cleanup

Reduces a test suite to fewer, more trustworthy tests. Evidence first, approval always, revertible batches.

## Preconditions

- Explicit user request. If this skill was reached any other way, stop.
- Clean git working tree in the target project. If dirty, stop and tell the user.

## Phases

1. Inventory
   - Count test files and cases. Map each test file to a behavior area and layer (unit, integration, E2E) from naming, imports, and directory structure.
   - Collect per-file runtimes if the runner reports them.

2. Detect candidates
   - For suites over ~200 files, dispatch parallel read-only subagents, one per behavior area. Each returns candidates in the evidence format below.
   - Categories:
     - duplicate: same behavior asserted at the same layer as another test
     - shadowed: higher-level test fully covered by a lower-level test
     - change-detector: asserts implementation structure; fails on behavior-preserving refactors
     - assertion-weak: snapshot-everything, assert-not-null-only, expected values copied from actuals
     - over-mocked: asserts mock choreography rather than observable behavior
     - dead: permanently skipped, tests for removed features, unreferenced helpers

3. Evidence per candidate
   - `file:line`, category, proposed action (delete | merge into <named test> | rewrite assertions), and for duplicate/shadowed the surviving test that covers the behavior.
   - Confidence tier: `proven` (mutation spot-check passed) or `heuristic`.

4. Mutation spot-check (only if the project has Stryker, PIT, or mutmut configured)
   - For delete candidates: run mutation on the covered module with and without the candidate. Unchanged score → mark `proven`. Changed score → drop the candidate.

5. Approval and apply
   - Present candidates grouped by category and area. The user approves batches; default batch cap is 20 candidates.
   - Per approved batch: apply, run the affected tests (via /verify-<project> when available), one git commit per batch.
   - If a batch's test run fails: revert that batch, report it, continue with the next batch only on user confirmation.
   - After all batches: one full-suite run to prove green; write a ledger to `<project>/docs/test-cleanup-<date>.md` recording every removal and its evidence.

## Boundaries

- Nothing is deleted without explicit batch approval.
- Never weaken an assertion to make a test pass.
- Never touch production source; this skill edits test files only.
- Authorization deny-case tests are never candidates, whatever their smell profile.
