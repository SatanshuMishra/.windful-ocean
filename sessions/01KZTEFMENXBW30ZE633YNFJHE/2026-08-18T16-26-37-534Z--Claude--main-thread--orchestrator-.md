Second live run, and the user's ruling on how the next phase proceeds.

RUN 2: RESUME IS BROKEN (0571)
Re-ran cli.mjs with a byte-identical run document and the same run-id c28e0001, lock clear beforehand. Exit 3. Nothing opened, both units parked, pull request 2 untouched and no duplicate created (the done-oracle held). The journal went from five lines to one mid-run and ended with four lines of entirely new content, so run 1's built and ship deltas are permanently gone. resume.restarted read false while resume.pending listed both units and resume.shipped was empty, including the unit that had really shipped a pull request. Directly answered: a NeedsHuman park does NOT redispatch through remediation on a plain re-run.

THE TWO FAMILIES (the frame the next phase works from)
Family A, state that does not survive a phase or process boundary: the journal is rewritten rather than appended; shipped state is forgotten; the boundary gate compares base against base because nothing moves the repository checkout between Execute and Integrate; the prState probe queries before Ship creates the pull request.
Family B, status fields that report success-shaped values for non-success states: restarted false on a restart; ship.status all-shipped with a unit parked; exit 1 for an argument error; boundaryFixes 0 from a gate that never scanned.
Family B is what kept Family A hidden. Every discovery this session required going behind a status field to the underlying reality - reading the pull request from the GitHub API, counting journal lines, looking for census artifacts that were not there. An operator trusting the summaries would have concluded run 1 fully succeeded and run 2 resumed. Both readings are wrong.
A third thread runs underneath both: the boundary gate is hollow BECAUSE its reconciliation commands have zero live callers, which is the same defined-but-unwired class already measured at roughly a third of modules and over half of exports.

USER DIRECTIVE FOR THE FRESH SESSION (recorded as 0572)
Debrief first, then in a FRESH session dispatch thorough censuses and audits before any implementation. Understand the issues; understand ALL surfaces involved; identify the root cause or causes; judge whether the system is too fragile and too complex and whether it needs simplifying; judge where it departs from best practice. Determine the ENTIRETY of the solution for BOTH families before fanning out to implement. Explicitly: no further reviewer loop that never passes.

DURABLE ARTIFACTS
The session scratchpad is session-scoped and will not exist in the fresh session, so the substrate clone, worktrees, run store and run-engine.sh are gone with it. Preserved outside it at ~/.claude/projects/-Users-satanshumishra-Documents-DevLabs--windful-ocean/artifacts-2026-08-18-live-e2e/: run-document.json, run2-summary.json, run2-journal.jsonl (carries the reviewer's eight cited park findings), SPEC-toolkit-two-modules.md, run-engine.sh, substrate-branches.txt. What survives on GitHub: SatanshuMishra/mitosis-live-pr-harness with pull request 2 OPEN and unmerged, plus a _ledger branch the logbook plugin created there.

STATE OF THE CRITERIA
c28 ship-path half is proven and will not need redoing; its per-MSP and serialization half needs a second pull request, which needs the implementer briefing fixed (0566). c29 is blocked by 0571. c30 is blocked by divergence being unimplemented. c31 should encode a path that already works by hand, so it stays last.