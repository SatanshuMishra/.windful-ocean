# review-round-churn: Cut pipeline review-round churn
Status: done
Updated: 2026-10-15T22:12:00.175Z
Next ids: c5 D20 R1 S1

## Goal

Make interphase specs complete enough that builders and reviewers never guess, and make pipeline review verify rows and route fixes without fix specs; measure against the 2026-10-11 baseline.

## Done when

- [x] c1 interphase 0.7.0 draft pull request is open with case tables, give-way orders, probed facts, the open-domain check, citations and amendments, and names no tool that consumes its output evidence: SatanshuMishra/interphase#40 was opened as a draft at 2026-10-12T23:57:01Z after one green review round (interphase suite 374 OK, gate 126 pass) and was merged by the user at 2026-10-13T00:02:27Z (gh pr view 40: MERGED, merge commit 66ce728f). Not observed: interphase 0.7.0 released or installed; the plugin cache holds 0.2.0 to 0.6.0.
- [x] c2 the replay of the two original requests with the branch interphase is graded against the 14 spec-origin blockers and reported with the kill criterion evidence: replay/grades.json holds all six runs graded by independent conformance-auditors against the 14 blockers: 25 of 42 gradings closed or designed out, 17 open, 0 of 6 runs meeting criterion 7.21 (B6 and B10 never closed; design check failed in all three pipeline runs). The report states each blocker's coverage across runs and the cause and rule behind each open one. Four contaminated first attempts were discarded and rerun under sandbox-exec; every run's transcript was scanned for reads outside its clone and web fetches of the user's repositories.
- [x] c3 the pipeline-side draft pull request is open: reviewers verify rows, fixes amend the original spec, the suite runs once per commit, and each run home's build script calls a check-run gate in place of the Bash-text run gate evidence: SatanshuMishra/.windful-ocean#325 was opened as a draft, reviewed green in round 2 and round 3 after amendment 2, and merged by the user at 2026-10-13T03:09:40Z (merge commit 14292959). Its pipeline tests pass: 1054 tests, 1053 pass at 367f899e, and in CI run 38335732334 on ubuntu-24.04 the 10.13 test passes; the one failure is the retired-roster test, which fails the same way on main. Not observed: the change live on this machine, since the user's checkout is still at f702607b.
- [x] c4 the final report lists each measured number of this run beside its baseline: 21 rounds, 16 specs, 22 spec reviews, 28 blockers, 539 probes, 49 suite reruns, 1.01B tokens evidence: U+007E/.mitosis/.windful-ocean/pipeline-review-round-churn/report.md pairs every baseline number with this run's: rounds 21 vs 4, specs 16 vs 2, spec reviews 22 vs 6, blockers 28 vs 1, probes 539 vs 73, suite reruns 49 vs 1, input tokens 1.01B vs 228M, wall clock 24h17m vs 3h40m, plus the replay's measurement cost of 476M input tokens.

## Where things stand

Converted from the old ledger.

## Next step

Finish the replay: when the four sandboxed runs (compaction-safe-continuity-3, pipeline-logbook-continuity-1 to 3) end, run grade_mech.py on all six, scan their transcripts for sandbox denials and any GitHub or web leak, dispatch the four remaining graders, write replay/grades.json, then write the final report against the baseline; meanwhile confirm the test workflow on 367f899e passes the 10.13 test on ubuntu-latest.

## Decisions in force

- D1 Record through a project-rooted logbook relay because the session logbook is rooted in a non-git scratch workspace: Relay through ~/.mitosis/.windful-ocean/pipeline-review-round-churn/lb.zsh; reported to the user as a deviation.
- D2 Definition of done: two draft pull requests, a graded replay, and a report against the baseline: Done requires the interphase 0.7.0 draft pull request, the graded replay of the two original requests, the pipeline-side draft pull request, and a report pairing every measured number with its baseline.
- D3 Hand-off: interphase closed-contracts spec goes to the build after two spec reviews: Build now: the remaining fixes were literal and verified by rerunning every check; the build's review with unchanged briefs is the measurement.
- D4 Build result: interphase closed-contracts round 1 committed, gate 126 of 126 pass: Review round 1 with today's briefs unchanged: the review count is the measurement the definition of done requires.
- D5 Pipeline spec design: the build script checks its own arguments, reviewers verify rows, a looping round amends the original spec: Delete the lexer and Bash bindings and gate in run.zsh with check-run; reviewers verify rows against one recorded suite run and reproduce only what they found by reading; a looping round amends the original spec and builds the amendment on the MSP branch with a copy of run.zsh.
- D6 Round verdict: interphase closed-contracts round 1 green, ship the draft pull request: Ship now: no finding blocks, and advisory findings never reopen the loop; C1, C2 and A1 go to the comment and the final report.
- D7 Ship: interphase closed-contracts opened as draft pull request SatanshuMishra/interphase#40: Opened draft pull request SatanshuMishra/interphase#40, assigned SatanshuMishra, advisory comment with C1, C2 and A1 posted; the replay grades the plugin pinned at 7d42273 independently, so it does not need to hold the pull request.
- D8 Hand-off: pipeline-review-round-churn spec handed off after two spec reviews, build with mitosis: Hand off and build: both reviews' issues are settled, the second pass found only one issue in the changed parts, and a build-time miss is caught by the round-1 review. Top risks for the report: .claude/settings.json and .claude/CLAUDE.md have uncommitted user edits and the build uses the committed files; a subagent's run is indistinguishable for check-run; a run script without the check-run line is unchecked; Loop back needs interphase 0.7.0 installed.
- D9 Build result: pipeline-review-round-churn committed on mitosis/review-round-churn, review round 1: Review round 1 with today's briefs unchanged, as the second live measurement; the six inert tests are the Unchanged criterion's, which go to the report as unchanged-behaviour checks.
- D10 Round verdict: pipeline-review-round-churn round 1 loop on S1, amend the original spec: Amend the original spec as amendment 1 and build it with amend-1.zsh on mitosis/review-round-churn, then review round 2. A held lock exits 2 without waiting; hook writes keep no lock, a pre-existing pattern recorded as an accepted risk.
- D11 Hand-off: amendment 1 of pipeline-review-round-churn, an exclusive lock in check-run, build on mitosis/review-round-churn: Build now: the reviewer verified the lock design, every interleaving and both failing-before rows by running the planned change, and the four fixes are direct.
- D12 Build result: amendment 1 of pipeline-review-round-churn committed and merged into mitosis/review-round-churn, review round 2: Review round 2 with today's briefs unchanged: code-reviewer, security-reviewer and conformance-auditor on 9b388529..4d90d309, with S1 carried to the validator as a P id; the inert 10.13 test goes to the report as an unchanged-behaviour check.
- D13 Round 2 verdict: pipeline-review-round-churn MSP review-round-churn green, ship: Ship: the verdict is green and C1 is an advisory LOW that goes to the pull-request comment, never into the loop.
- D14 Ship: pipeline-review-round-churn opened as draft pull request SatanshuMishra/.windful-ocean#325: Report the pull request and rerun the four tainted replays in a sandbox that denies the original run material, then grade all six.
- D15 Hand-off: amendment 2 of pipeline-review-round-churn, the 10.13 test fails the state write with a zero file-size limit so it runs on Linux CI, build on mitosis/review-round-churn: Build amendment 2 now through the pipeline: the reviewer verified the EFBIG path on both platforms against the code, and a hand edit would skip the gate and the review the rule requires.
- D16 Build result: amendment 2 of pipeline-review-round-churn committed as ce42bba4, merged into mitosis/review-round-churn, review round 3: Merge, run the suite once and review round 3: the rule reviews every round's diff, and this round's diff is one test, so it is cheap.
- D17 Round 3 verdict: pipeline-review-round-churn green after amendment 2, ship to update pull request 325: Ship now: C1 and A1 are test strength, which the review bar rates LOW and advisory, so they go to the pull-request comment and do not reopen the loop; the Linux half of 10.13 is proven by the repository's CI after the push.
- D18 Ship: amendment 2 of pipeline-review-round-churn pushed to pull request SatanshuMishra/.windful-ocean#325 at 367f899e: Pushed 367f899e as a fast-forward: every commit it adds passed the gate, the suite and round 3, and a fresh mitosis run would rebuild work that is already reviewed.
- D19 Replay result: interphase 0.7.0 closes or designs out 25 of 42 blocker gradings across six runs, and no run meets criterion 7.21: Report 7.21 as not met with the causes; the follow-on interphase spec waits for the user's go-ahead, since the user asked to finish the replay and the report.

## Open risks

## Settled, do not reopen

## Where the details live

- interphase closed-contracts spec: /Users/satanshumishra/Documents/DevLabs/interphase/docs/specs/closed-contracts.md
- interphase closed-contracts record: /Users/satanshumishra/Documents/DevLabs/interphase/docs/specs/closed-contracts.record.json
- closed-contracts run home: /Users/satanshumishra/.mitosis/interphase/closed-contracts
- replay harness and rubric: /Users/satanshumishra/.mitosis/interphase/closed-contracts/replay
- Old ledger record: thread 01M4S4Q26ZSHFMFDX4BDPX998F in refs/logbook/archive/ledger
