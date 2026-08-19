---
Status: accepted
Date: 2026-08-19T02:57:14.885Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0616. Why 37,647 lines of tests caught none of the thirteen root causes, and the two-tier rule that fixes it

## Context

Measured on main: 37,647 lines of tests and fixtures against 22,384 lines of engine source, a 1.68:1 ratio that is unremarkable by itself. That suite caught NONE of the thirteen root causes the audit later found by reading the code. A gate that collected both comparison sides from the base branch, and a hardcoded literal standing in for a measurement, both survived the full suite. So the defect is not test volume and the remedy is not more tests. Four distinct mechanisms let a test pass over broken code here. One, substrate infidelity: the e2e substrate never reproduced per-unit tree isolation, so the base-against-base bug was literally unreachable from a test. Two, vacuous pass: a verdict computed as blocking.length === 0 over a domain that can be empty. Three, a literal standing in for a measurement, so nothing ever observed the real value. Four, change-detector tests asserting source text - censuses, fixture tables, inertness probes - which pass forever and prove nothing. Roughly 1,900 lines filed as source are in fact fixture scaffolding, inflating both sides of the ratio.

## Options

- Add more tests and raise coverage until confidence returns
- Build a project-local verification system that checks the tests themselves
- Two tiers: exactly one load-bearing end-to-end test whose green means the app works, plus per-unit tests that prove only their own unit

## Outcome

Two tiers, and no new verification system. TIER 1, exactly one test: the end-to-end run (M16), decompose through pull request against the disposable substrate, running in CI, made a REQUIRED status check by user ruling, and RED on a build whose engine cannot reach Ship. That last property is what makes it load-bearing - a suite-level inertness proof - and it is the ONLY test whose green may ever be cited as evidence that mitosis works. TIER 2, everything else: proves its own unit and nothing more, and is never cited as evidence the system works. The four mechanisms get four specific defeaters, every one of them already in the existing standard so that nothing new is legislated. Substrate infidelity is defeated by the substrate reproducing the production property under test (M0, shipped). Vacuity and standing-in literals are defeated by evidence-typed measurement, where a verdict carries the size of the domain it judged and a measured field is carried from the verdict rather than authored (S4). Change-detectors are defeated by the existing admission gate: observable behaviour through a public surface. Per unit, the existing rule is actually RUN rather than asserted: red on the parent commit, green on the fix, asserting the reported symptom, plus an inertness mutation that must turn the assertion red - and that mutation is run LOCALLY before push, because the CI mutation gate emits no token either way here and short-circuits on non-source diffs, so a green CI check proves nothing about it. Explicitly NOT done: no new census, probe, parity or control module whose purpose is to verify other verification code. That accretion is a cousin of the thirteen root causes and is forbidden. The one genuine gap - the standard has no gate for assertion-domain vacuity at the SUITE level - is filed as a proposed gap and stays parked; S4 fixes vacuity inside the engine and is a different thing. Honest limit, stated so it is not later mistaken for a promise: green will mean "works" only for the property M16 exercises, and a NEW class of failure is still found by a real run, never by a suite - which is why the live run is a recurring instrument, not a one-time gate.
