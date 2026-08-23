The live GitHub lane passed for the first time, and the trunk went green.

WHAT SHIPPED

Pull request 287, merged: the boundary-fix, ci-fix and ci-fact-extract dispatches now attach their unit id and an explicit kind to the request, and the recorder reads that explicit kind in precedence over schema-identity inference. Two defects were closed together — cli.mjs returned early on any request without a unit id so nothing was written, and the kind tracker had branches for only eight of the twelve kinds the code freezes, so these four would have been mislabelled implement or redispatch. Proven red on the parent commit and by an inertness mutation on each half independently.

Pull request 288, merged: one assertion in unit-verdict-sha.test.mjs corrected from seven spawned children to six. No engine change.

Both merges verified as ancestors of origin/main, and the file content on the trunk was read back rather than inferred from the MERGED label. The three kind constants were confirmed defined and exported, because a mistyped one would be a ReferenceError reachable only on the boundary-fix and CI-fix paths — that is, only during a real run, surfacing as a crash mid-billed-run rather than as a test failure.

THE LIVE LANE

After the human re-scoped the fine-grained token, run 32659379769 on trunk 704861fa completed successfully. Checked for vacuity rather than trusted: the credential policy step resolved with the token present, the end-to-end opt-in was the exact string the gate requires, and the run reported eighteen tests passed with none skipped and none todo, the live subtest alone taking fourteen seconds of wall clock. It pushed a head branch and read it back independently of the push exit code, opened a real pull request through the centralized tool, re-read it through a separate call, rejected a pull request requested for a head deliberately never pushed, and left the repository in its known base state.

WHAT FAILED, AND WHAT WAS WITHDRAWN

A wave-planner crash was briefed to an implementer and does not exist. wave-planner.test.mjs:137 is todo-marked; it appears in the failed-log view without counting toward the verdict, and run 32657068524 reported fail 1, not 2. The dispatch was stopped and retasked before any code was changed. A memory was written so the instrument is not misread again.

The decompose dispatch could not be made recordable. It runs as its own process with no run store, and openRun requires a run key computed from the fully-decomposed plan, which decompose is what produces. Giving it a scope would have meant fabricating a synthetic run and a key, so the implementer reported CAPABILITY-BLOCKED rather than inventing architecture. c2 therefore stands at three of four kinds and was NOT marked done.

A dead-subsystem-absence-census failure seen in a local full-suite run does not reproduce in CI, which reports fail 1. It is a local-only artifact, most likely the user's untracked README files tripping a filesystem census.

VERIFICATION HONESTY

Neither merged pull request actually had the mutation referee run against it, for two different reasons, both tracked and neither hidden. 287's receipts check cleared in twelve seconds as a downgrade pass — the word reverted in an inertness verification line matched a ladder tag and short-circuited all eight re-run gates. 288's cleared because a tests-only diff skips that gate by design. The underlying evidence was produced directly in both cases.
