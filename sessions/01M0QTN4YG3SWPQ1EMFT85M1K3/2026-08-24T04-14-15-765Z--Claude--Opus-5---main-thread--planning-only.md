Planned the extraction. No code changed, no repository created, no engine run.

SHIPPED

1. Read the 1,603-line extraction SPEC in full and verified its measured basis against the live tree. Every Appendix A figure holds: 343 tracked engine files, 274 source, 211 tests, exactly two gitleaks findings at the stated lines, git-filter-repo and timeout both absent, the target repository name free, the substrate private with default branch main. Two facts the SPEC did not record: actions/setup-node at node-version 26.x is ALREADY proven working on hosted runners in this repository's own CI, which closes the SPEC's Node 26 risk; and the only engine tests reaching outside the engine directory are six, of which two are already on the delete list, so no unlisted coupling survives the move.

2. Produced the implementation plan at artifacts-2026-08-23-mitosis-extraction/PLAN.md, 1,400 lines, eleven sections. Sixteen SPEC units become twenty-two MSPs shipping as twenty-two pull requests.

3. Closed 22 gaps where the SPEC is silent, self-contradictory or not executable. Three were structural and would have stalled a unit mid-flight: U1 must build its gate inside a repository U2 creates and must clear a host-path violation U3 fixes, so U1 cannot run first as the SPEC's graph says; U15 needs the INSTALLED plugin, which needs a published repository, so U15 depends on U16 and the SPEC's graph has no such edge; and no unit owned the 36-script out-of-repo harness import, the live-lane directory, or the test-tree relocation and its import rewrite. Remaining gaps cover the missing npm test bootstrap, the U5 split, the U9 row-12 contradiction, the gh replay scripting that cassette rule 7 forbids, the unspecified gitignore and receipt shape, and the unnamed substrate and forbidden-terms variables.

4. Settled four decisions, then superseded two of them.

FAILED, AND WHY

5. The original D1 was wrong and the user corrected it. It adopted an Anthropic API key because the SPEC chose --bare for the contract capture. That let a constraint from an optional sub-component of the TEST architecture gate the entire migration, including units that never depended on it. The engine has never needed a key - it spawns the CLI through its exec allowlist on subscription authentication, which is how the live forge lane passed the first time. A key was created and stored in the Keychain during that error; it authenticated (HTTP 400 credit balance, not 401) and is now unused. Deleting it is the user's call and was not done.

RE-ARCHITECTED AFTER THE CORRECTION

6. Measured, not assumed: --bare with a key and no credit fails on billing; --bare with no key reports Not logged in; CLAUDE_CODE_SIMPLE=1, the variable --bare sets, carries the same auth restriction on its own; plain claude -p with no key succeeds. Hermeticity and subscription authentication are mutually exclusive in this CLI. Narrowing flags reduce loaded local configuration from 77,902 to 63,238 tokens, which helps and does not isolate.

7. Replaced hermeticity with declared reproducibility. Every contract fixture carries an environment fingerprint - CLI version, discovery mode, a content hash of the configuration surface, and the measured context size from the usage block - and check:contract attributes a mismatch to vendor drift or to local configuration drift with distinct exit codes, instead of conflating them.

8. Two contract facts found by measurement that the --bare design would have missed, both of which would have produced a false red: the payload key set is outcome-dependent, with ttft_ms, ttft_stream_ms and time_to_request_ms present only after a successful round trip, so 22 keys on success and 19 on an api_error envelope; and total_cost_usd is notional under a subscription, reporting 1.5581 for a reply-with-ok prompt because it prices the whole loaded context at API rates. No money moved. Every cost figure is now recorded as a notional estimate and never as a spend claim.

9. D2 collapsed as a consequence. No credential can exist for a hosted runner, so SPEC open decision O1 resolves to option (b) by force: captures run locally, fixtures are committed, CI verifies only freshness and the diff. Net gain - zero secrets in a repository that becomes public.

10. Derived parallelizability from the plan's own ownership declarations rather than asserting it. Critical path is 9 layers, not the 19 waves the first ordering implied. Zero files are owned by two MSPs, which is the invariant that matters, but seven are edited by more than one and package.json by seven of them. The census also caught a defect in the plan itself: U3 edited package.json without declaring it, now fixed. Found one non-obvious hard edge: U5a is vacuous without U3 and U4, because its criterion is that a mutation makes the lane exit non-zero and against a red baseline that proves nothing. Found four places the first ordering was too strict, of which U16 is the biggest lever - it needs only U1, and publishing early unblocks the host lane about nine merges sooner.

NOT DONE, DELIBERATELY

11. The publish-early choice is left to the user. It moves an irreversible action earlier, so it is recorded as a choice rather than folded in.

12. No implementation started. Per decision 0693 the migration is executed by delegated agents by hand, and the engine does not run it.