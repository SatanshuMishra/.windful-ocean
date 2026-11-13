---
name: writing-tests
description: Use whenever a code change needs tests - implementing a feature, fixing a bug, adding coverage, hardening or speeding up a suite, or judging whether a test should exist at all. Invoke before writing any test and before concluding a change needs none, including when the request never says the word test.
when_to_use: Invoke on requests phrased like add validation, fix this bug, implement this feature, make it handle X, add a test, add coverage, is this tested, should I test this, my tests are slow, CI takes too long, clean up the suite. Also invoke before creating, editing or deleting any file under test/, tests/ or __tests__/, or named *.test.* or *.spec.*, whichever planning or debugging skill led the task - this one sets the standard those tests must meet and composes with them rather than replacing them.
---

Tests exist to create trust that the code works. The health metric of a suite is trust, never test count and never coverage percentage.

A suite earns that trust with three kinds of check, and each has one job:

| Kind | Its one job | Where it runs |
|---|---|---|
| Behaviour test | one behaviour is right, checked on the part that owns it | inside the test runner's own process |
| Crossing test | two things that must agree do agree, including the product's front door and the parts behind it | through both sides for real, once per meeting point |
| Journey | the built product does what a person or calling program came for, start to finish | the product-test stage, on the built product |

A part is a unit of code with a public interface that other code calls: a function, a module, a package. The front door is where a person or another program enters the product - the installed command, the network port, the screen - together with what it hands to first: the dispatcher, the whole application object, the root screen.

## Admission gate

A new test is created ONLY when ALL of these hold:

1. The change introduces or changes a behaviour, fixes a bug, or defines a public contract.
2. A search of existing tests finds no coverage of that behaviour. If a similar test exists, update or replace it; never duplicate.
3. The test asserts observable behaviour through a public interface - a returned value, a written file, a rendered component, an API response - not an implementation detail.
4. You can name the change to shipped code that turns this test red. A test whose expected value is derived from the implementation rather than from the requirement has no such change, and a correct and an incorrect program are equally likely to pass it.

Gate fails, no test, unless the user explicitly requests one. Report which condition failed rather than writing the test anyway.

Never tested by default: styling and visual tweaks, copy changes, configuration, generated code, pure refactors already covered by existing tests, throwaway prototypes.

A database migration is not configuration. How it is written and rolled back is set by the `platform-engineer` skill; this gate does not decide that.

## Scoped TDD

For changes passing the gate: write the test first, watch it fail, implement, watch it pass. Bug fixes always start with a red test reproducing the bug. A test that has never failed proves nothing.

Every fix ships an acceptance test that is red on the parent commit and green on the fix. Before placing it, reproduce the symptom once as the reporter saw it and follow it to the part that produces it; after the fix, run that same reproduction once more. Those two runs are a check made in the task, not a test added to the suite; where the product cannot be started on this machine, say the symptom was not reproduced as reported. The test asserts the reported symptom - the wrong value, file or message itself, not a neighbouring effect - at the part the reproduction was followed to, placed by the rule below. Where what the reporter perceived is rendered - something not showing - the test reads the component that renders it, run with the real part that feeds it, never the fed data on its own; where those two cannot run together inside the test runner without entering at the front door, the test goes on the part at fault and the reproduction above is the reading of what the reporter perceived. It need not be observed through the front door. When the fault was in the path - the wrong part reached, a result lost on the way back - that test is a crossing test. The symptom as the reporter saw it is checked again on the built product at the product-test stage. The acceptance test ships alongside an inertness mutation: revert or empty the thing the fix added, and the assertion must turn red. A test that survives that mutation is not testing the fix.

## Placement and consolidation

Test each behaviour once, on the part that owns it, inside the test runner's own process.

The part that owns a behaviour is the smallest unit whose public interface promises it: the function that decides which interpreters cannot start, not the command that later prints the answer. Call that interface the way its real callers do, with its real collaborators, and assert on what it returns, writes or raises. Never go below a public interface. A private helper is tested through the part that uses it, and one that seems to need its own test is a part and gets an interface.

Never send a behaviour test through the front door, whether by starting the product or by calling the dispatcher, the whole application object or the root screen inside the test runner. Entered either way, the test depends on every part behind the door, so a change to any of them has to run it again and the suite can only ever be run whole. A test enters at the front door only for what the front door itself owns.

The path from the front door to the part is proven separately by crossing tests, once per meeting point and never once per behaviour (next section). A behaviour test and the crossing test for its way in together say what a front-door test of that behaviour would say, and only when that crossing test exists. Before relying on a behaviour test alone, find the crossing test for the way in the task is about, or where it names none, one way in that reaches the behaviour, and name it in the report. Where there is none, the change adds it.

A part whose only public interface is its own process - a hook, a shell script - is called through that interface: run that one script alone, with its input and environment set, and assert its exit code, its output and the files it wrote. That is a behaviour test of the script and is Medium; it never starts the program that would call the script.

The same rule in the common shapes of product:

| Product | A behaviour test calls | Crossed at the front door |
|---|---|---|
| Command-line tool | the function that decides, with values; the command's own function only for what the command itself owns - the order of its steps, its exit code, the text it returns - one test per outcome the command itself distinguishes, never one per case of a decision it calls, a fix's acceptance test excepted | the dispatcher handed one command; one real start of the installed command for arguments arriving, exit code and output streams |
| Network service | the function that decides | one route through the in-process test client for what routing, validation or access control produce; a real server on localhost once: serialisation, middleware order, the error shape on the wire |
| App with a screen | the state holder; one screen or component rendered on its own, never the root app | the root app handed one route inside the test runner: the route and its redirects resolve and the screen's control reaches its state holder; at the product-test stage: start-up and one real navigation |
| Library | its public functions | none in the suite; the build job installs the built package and imports it once |
| Script with no functions | the script itself, run alone | its caller, once: where the caller is the product's own code, that code running the real script; where it is an outside program such as a harness, the registration resolved to the script and one recorded real input, with the live call left to the product-test stage |

Where the only way to the logic a change edits is the front door, move the lines the change edits, and only those, into a function, test that function and say so. That is the one restructuring a change makes unasked.

When a new behaviour test covers what a front-door test checked, cut the front-door test in the same change: delete it where another crossing test already crosses the same path of that way in - the same success, failure kind or guard; where it was the only one for that path, reduce it to that crossing, through the dispatcher inside the test runner wherever it can be called there. One behaviour, one home; each path through a way in crossed once.

Every test addition includes a local dedup pass: superseded or duplicated tests in the affected area are updated or deleted in the same change.

This standard governs the tests a change adds or edits. An existing test stays where it is until a change touches the behaviour it checks or the user asks for a clean-up. In a repository the user does not own, that project's written test policy sets placement, or where it has none, the placement its existing tests use, and nothing there is restructured unasked. In the user's own repositories this standard sets placement, and a project document that disagrees is reported, not followed.

## Meeting points

A meeting point is where two surfaces owned by different mechanisms must agree: the entry point and the part it hands to, a prompt or instruction file and the tool it names, a lifecycle hook and the state a tool wrote, a manifest and the loader that reads it, a client and the server it was generated against. Every meeting point a change touches gets at least one crossing test: one flow that goes through both sides for real.

A change touches a meeting point when it changes what passes across it: an argument, a return shape, a failure kind, a guard, or a name one side looks up on the other.

Each side's test encodes its own half as correct and nothing compares them, so both stay green while the path a user takes is broken. Adding tests within either surface never closes this; only the crossing test does.

The front door is the meeting point every product has:

- A way in the change adds is crossed once on its success path and once on a failure path, through the dispatcher, inside the test runner's process wherever the dispatcher can be called there.
- A failure kind or a guard the change adds to any way in, new or existing, is crossed once, asserting what the caller receives - the status, the exit code, the error value - not what the part raised. Each role that must be denied is asserted as denied at the way in it is denied from.
- A rule that must hold for every way in - a failure comes back as a value and never as a stack trace - is proven on the one place that enforces it: hand the dispatcher a throwaway command or route that raises, and assert what comes out. That every way in goes through that place is a property of the tree and belongs to lint. Never a test that runs every command or route.
- The product is started for real once for each kind of thing only a real start shows: the arguments arriving, the exit code or status, the output streams, start-up, a signal. Where a real start needs a device, an emulator, a browser or a package build, it belongs to the product-test stage or the build job, not the suite.

A crossing test is the smallest size its two sides allow and never Large. The scoped run includes it whenever the change edits code on either side of its meeting point, whether or not what passes across changed, and CI runs it on every pull request.

For a prompt, instruction or skill file and the tool it names, the crossing is this: every command, flag and tool name in the file is resolved by the tool's real parser or registry. No model is run. Because it runs the parser it is a test, not lint, and it is the one test whose subject is that file.

Co-owned surfaces: the crossing test goes on the pre-merge gate. One side an external provider behind a double: that is a contract test instead, run on the provider's rhythm to catch the double drifting. Agreement and drift are different problems - do not conflate them.

## Size contract

Declare each test's size by the resources it may touch and hold it to that size's time budget. Small touches no network, no file system, no database, no threads and no sleeps. Medium may reach localhost and the disk. Large may reach anything. Size is a checkable fact, not an opinion about what to call the test.

Write the smallest size that can hold the test, and no smaller: a behaviour whose result is a written file is tested on a real temporary directory, not a pretend file system. A behaviour test is Small or Medium and never starts the product; a part whose only interface is its own process is run alone, which is Medium. Journeys are Large.

A test over its own size's budget is a defect in the test, not a fact about the code. A pure computation running for minutes is a Small test breaking its contract; pin fixed inputs at the boundaries rather than searching for the same boundaries on every run.

Generated and exhaustive sweeps go on a schedule, never on the gate. Pre-merge keeps a small sample with the seed fixed so a failure reproduces; the unbounded run goes in a separate job. A sweep on the gate is paid by every job that runs the suite.

## Code that can be tested in part

Tests can only be as narrow as the code lets them be. These hold for the code a change writes:

- The entry point only hands off. It passes the arguments to one function, writes what comes back and exits with the code that function returned. That function takes its arguments, environment, streams and clock as parameters, so a test can call it without starting the product.
- Decisions take values and return values, so most of them can be tested without the disk. The code that reaches a remote service, the clock or randomness is thin and sits at the edge, where a test can replace it.
- Parts depend one way. No part imports the entry point or the dispatcher, and no two parts import each other. A lint stage enforces this; review does not.
- A file every release touches - a version number, a changelog, a README, a skill or prompt file - is read only by the one test or lint whose subject it is. Any other test that reads it runs on every change and fails on every release.
- A shared test helper builds inputs. A helper that starts the product turns every test that uses it into a front-door test.

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

- Inside the process, use the real collaborators. A program that runs locally and gives the same result every time is one of them: git on a temporary repository, the product's own database engine in a disposable local instance whose schema is built by applying the project's migrations, never from a second definition, the file system in a temporary directory; such tests are Medium. Replace only what cannot run that way - a remote service, a paid or networked session, the clock, randomness - and replace it at the edge where it leaves the process: never a function inside the code under test, and never the store whose query or policy the behaviour depends on. A stub stands in for a local program only to produce a condition the real one cannot be made to produce. Maximum 1-2 test doubles per test; never mock types you do not own unless a contract or integration test covers that boundary elsewhere.
- No change-detector tests, which fail on a refactor that preserved behaviour.
- Any gate that classifies tokens, identifiers or paths is a closed census that halts on the unclassifiable. A pinned count or a sampled allowlist is forbidden - both are change-detectors wearing a census costume.
- A census over the repository's own authored text - source files, documents, manifests, workflow configuration - is lint. It states a property of the tree rather than of the running product, so it cannot redden when the product breaks and does redden whenever a file is reworded. It belongs in a lint stage, off the test runner. The closed-census discipline above governs how to write one; it never makes one a test.
- A test whose subject is the test harness - a classifier, parser or fixture builder defined inside the test file - protects no shipped behaviour and no change to shipped code can redden it. If the helper is worth proving, it is production code and belongs in the tree the product ships.
- No assertion-weak tests: snapshot-everything, assert-not-null-only, expected values copied from actual output.
- Deterministic: no sleeps, no real network, no shared mutable state between tests.
- Authorization changes require deny-case assertions: roles that must NOT have access are asserted as denied, not just the allowed role as allowed.
- Critical user journeys are proven on the built product at the product-test stage, asserting user-visible behaviour, using role-based locators rather than CSS internals. In a project with no product-test stage they are Large tests on a job of their own, outside the scoped run.

## Verification scope

Default verification is diff-scoped. Derive the scope from the files the change actually touched, never from how large the unit feels.

Run the FIRST of these that exists in the project, and stop there: the project's scoped verify command; a scoped script the project already defines; the test runner pointed at the touched paths; typecheck plus lint on the touched files. A missing scoped verify command moves you one rung down, never up to the full suite.

Inside a task run the scoped run is the last check you make; the whole suite is CI's job on the pull request. Run the whole suite yourself only in a project with no CI workflow that runs it, once, before the pull request opens. When a change touches a file every test depends on - the runner's configuration, a lock file - no scoped run stands in for the whole suite: say so, run the first rung that exists, and leave the whole suite to CI. An addition to a shared file that no existing test uses selects only the tests that use the addition.

Never re-run a check that passed on unchanged state. A second green over the same tree carries no information the first did not. A tree that has moved is different state: after a rebase, a merge, or a further edit, an earlier green no longer describes what you are holding.

Where the project declares an external verification standard, that standard sets the shape of the receipt and this section does not override it.
