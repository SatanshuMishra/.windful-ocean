---
Status: accepted
Date: 2026-08-17T20:01:05.509Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0544. Nine shell tests have no runner at all, and the enforcer will select and die on them the moment source changes alongside

## Context

U3.4 declined to fix a stale assertion in settings-wired.test.sh, reasoning that touching the file would make the receipts enforcer select a .sh as a receipt test and block on a load error, since node --test parses shell as JavaScript and dies. That reasoning was a prediction and was never measured. Measuring it against the exact pinned enforcer settles both halves. For a TEST-ONLY diff the prediction does not hold: verify.js computes changedSource by excluding doc and test paths, early-exits with a PASS when that set is empty, and never reaches receipt selection, so the shell file was never selected and CI returned a byte-identical PASS. For a diff that also touches production source it holds exactly as feared: a control commit touching the observer alongside the same test selected it and returned BLOCK, because RUNNABLE_TEST_EXT includes sh while the configured test command is node --test. Underneath both sits the real defect: npm test's glob covers only .claude/hooks/tests/*.test.mjs, excluding both the .sh extension and the agent-ledger subdirectory, so nine shell tests run only when a human types bash by hand.

## Options

- Accept U3.4's prediction and leave the assertion stale, which is what left a red check sitting on main
- Measure the prediction, fix the assertion now that it is proven safe, and file the latent trap separately
- Fix the assertion and the enforcer dispatcher together, folding an infrastructure change into a one-line test repair

## Outcome

The assertion is fixed and shipped as PR 202, and both discovered defects are FILED rather than folded in. The transferable lesson is the shape of the original refusal: a named mechanism that is real but unreachable on the diff in question reads exactly like a valid reason to not act, and only a measurement separates the two. The prior unit was not wrong about the mechanism, only about its reachability, and that distinction is invisible without running the enforcer. Two filed items follow. First, the latent trap: any future pull request touching production source alongside one of the nine shell tests will select it and BLOCK, and the fix shape is a test_command dispatcher routing sh to bash and mjs to node --test. Second, and the actual reason this assertion rotted unnoticed, those nine tests have no automated runner in any glob or workflow. A third finding closes a question rather than opening one: this particular test can NEVER be meaningfully green in CI, because it asserts against the user's real global settings file, which is a real file rather than a symlink into the repository and therefore does not exist on a runner. It is host-only by nature, and adding it to a CI glob would be actively harmful rather than an improvement.
