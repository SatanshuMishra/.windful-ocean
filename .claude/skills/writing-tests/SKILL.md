---
name: writing-tests
description: Use when writing, adding, or hardening tests - adding coverage for untested behaviour, proving a bug fix red before green, building out a suite, or deciding whether a test should exist at all. Covers the admission gate, the entry point a test reaches its observable through, seam coverage where two surfaces must agree, test size budgets, scoped TDD, test placement, the batched red proof, inertness mutation, and the quality bar.
---

Tests exist to create trust that the code works. The health metric of a suite is trust, never test count and never coverage percentage.

## Admission gate

A new test is created ONLY when ALL of these hold:

1. The change introduces or changes a behaviour, fixes a bug, or defines a public contract.
2. A search of existing tests finds no coverage of that behaviour. If a similar test exists, update or replace it; never duplicate.
3. The test asserts observable behaviour through a public surface - an API response, rendered UI, returned state - not an implementation detail.
4. You can name the change to shipped code that turns this test red. A test whose expected value is derived from the implementation rather than from the requirement has no such change, and a correct and an incorrect program are equally likely to pass it.

Gate fails, no test, unless the user explicitly requests one. Report which condition failed rather than writing the test anyway.

Never tested by default: styling and visual tweaks, copy changes, configuration, generated code, pure refactors already covered by existing tests, throwaway prototypes.

## Scoped TDD

For changes passing the gate: write the test first, watch it fail, implement, watch it pass. Bug fixes always start with a red test reproducing the bug. A test that has never failed proves nothing.

Every fix ships an acceptance test that is red on the parent commit and green on the fix, and that asserts the reported symptom rather than a proxy for it. It ships alongside an inertness mutation: revert or empty the thing the fix added, and the assertion must turn red. A test that survives that mutation is not testing the fix.

## Placement and consolidation

Place each test at the lowest layer that reaches the observable through the same entry point the caller uses. Lowest layer that can EXPRESS the behaviour is the wrong rule: a renderer can be exercised as a function while the tool that calls it goes untouched, and a suite built that way passes while the product is broken.

The entry point carries part of the claim. Where a protocol returns a failure as a value, calling the handler directly throws instead, so a handler-level test asserts on an exception the caller never sees. A process, transport or serialisation boundary the caller crosses is a boundary the test crosses. Reaching the observable more cheaply than the caller does is legitimate only when nothing between the cheap door and the real one is under test, and that has to be true rather than assumed.

When a new lower-level test covers what a higher-level test checked, delete the redundant higher-level test in the same change. One behaviour, one home.

Every test addition includes a local dedup pass: superseded or duplicated tests in the affected area are updated or deleted in the same change.

## Seams

A seam is where two surfaces owned by different mechanisms must agree: a prompt or instruction file and the tool it names, a lifecycle hook and the state a tool wrote, a manifest and the loader that reads it, a client and the server it was generated against. Every seam a change touches gets at least one test that crosses it in one flow.

Surfaces tested only in isolation pass individually and contradict each other in production. Each side's test encodes its own half as correct and nothing compares them, so both stay green while the path a user actually takes is broken. Adding tests within either surface never closes this. The crossing test is the only thing that does.

Where the surfaces are co-owned, the crossing test belongs on the pre-merge gate. Where one side is an external provider standing behind a double, that is a contract test instead: it runs on the provider's change rhythm and its job is to catch the double drifting from the real thing. Do not conflate them - the first is about agreement, the second about drift.

## Size contract

Declare each test's size by the resources it may touch and hold it to that size's time budget. Small touches no network, no file system, no database, no threads and no sleeps. Medium may reach localhost and the disk. Large may reach anything. Size is a checkable fact about a test, not an opinion about what to call it, which is the whole reason to use it in place of the usual vocabulary.

A test that exceeds its own size's budget is a defect in the test, not a fact about the code. A pure computation running for minutes is a Small test breaking its contract, and the remedy is fixed inputs pinned at the boundaries rather than a search that rediscovers the same boundaries on every run.

Generated and exhaustive input sweeps go on a schedule, never on the gate. Keep a small deterministic sample pre-merge with the seed fixed, so a gate failure reproduces, and put the unbounded run in a separate job. A sweep on the gate is paid by every job that runs the suite, which is more often than it looks.

## Proving several tests red in one cycle

To show that several new tests fail before the fix, revert only the production files once, leave every test in place, run them all together, then restore and confirm the restore with a checksum. One cycle, N proofs. Never run a separate checkout-run-restore cycle per test.

That batching applies to the RUNS, never to the isolation. Mutation testing keeps one mutation at a time, because the claim carrying the value is that each mutation reddens its OWN test and no other. Reverting every fix at once and watching everything go red proves only that something mattered. A mutation that reddens only a fixture guard has shown a constant is load-bearing and nothing about the code under test - sharpen the mutation and go again.

An exit code alone cannot validate a mutation. A broken experiment exits non-zero and reads as a valid red. Quote the assertion that fired and confirm the mutation was observable.

## A check that reports everything at once is run once

When a check names every failing row in a single run, read the whole list, fix every row in one pass, then run it once to confirm. Never re-run it after each individual edit. Thirty run-fix-run cycles and one run-fix-run cycle prove the same thing, and only one of them costs half an hour.

## Measure through the project's own runner

Use the repository's existing test runner, fixtures and scripts. Never create a standalone harness, a scratch manifest, or a parallel project root to take a measurement or prove a behaviour. If the project's own runner genuinely cannot express what you need, stop and say so rather than building scaffolding.

Never pipe a verification command into a pager or a filter. The pipeline reports the last command's status, so a failing suite renders as exit code 0. Capture the exit code, then page separately.

## Quality bar

- Maximum 1-2 test doubles per test; never mock types you do not own unless a contract or integration test covers that boundary elsewhere.
- No change-detector tests, which fail on a refactor that preserved behaviour.
- Any gate that classifies tokens, identifiers or paths is a closed census that halts on the unclassifiable. A pinned count or a sampled allowlist is forbidden - both are change-detectors wearing a census costume.
- A census over the repository's own authored text - source files, documents, manifests, workflow configuration - is lint. It states a property of the tree rather than of the running product, so it cannot redden when the product breaks and does redden whenever a file is reworded. It belongs in a lint stage, off the test runner. The closed-census discipline above governs how to write one; it never makes one a test.
- A test whose subject is the test harness - a classifier, parser or fixture builder defined inside the test file - protects no shipped behaviour and no change to shipped code can redden it. If the helper is worth proving, it is production code and belongs in the tree the product ships.
- No assertion-weak tests: snapshot-everything, assert-not-null-only, expected values copied from actual output.
- Deterministic: no sleeps, no real network, no shared mutable state between tests.
- Authorization changes require deny-case assertions: roles that must NOT have access are asserted as denied, not just the allowed role as allowed.
- Critical user journeys keep end-to-end coverage asserting user-visible behaviour, using role-based locators rather than CSS internals.

## Verification scope

Default verification is diff-scoped. Derive the scope from the files the change actually touched, never from how large the unit feels.

Run the FIRST of these that exists in the project, and stop there: the project's scoped verify command; a scoped script the project already defines; the test runner pointed at the touched paths; typecheck plus lint on the touched files. A missing scoped verify command moves you one rung down, never up to the full suite.

Never re-run a check that passed on unchanged state. A second green over the same tree carries no information the first did not. A tree that has moved is different state: after a rebase, a merge, or a further edit, an earlier green no longer describes what you are holding.

Where the project declares an external verification standard, that standard sets the shape of the receipt and this section does not override it.
