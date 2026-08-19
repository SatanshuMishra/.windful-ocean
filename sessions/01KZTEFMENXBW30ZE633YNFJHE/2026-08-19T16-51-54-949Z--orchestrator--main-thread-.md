Session 1 of the RUNBOOK 2026-08-19 amendment is COMPLETE, plus one user-authorized trunk repair. Trunk moved c730a610 -> a8d603c4.

SHIPPED AND MERGED (all five units, each off origin/main with --base main; stacking retired per Amendment A):
- M8a #239. Re-derived from git: its own two commits (40e9188d, f5547344) replayed onto main off the retired stacked base 6c37180e, backups at refs/backup/m8a-pre-retarget and -wip. The reviewer BLOCKed on a reproduced CRITICAL: an existing head worktree was reused with no check it sat at headRef, so on a run's second invocation the gate censused the PREVIOUS tree and returned clean - the exact silent pass M8a exists to remove, reintroduced on the resume path. Fixed with its own red-green-red proof.
- M12b-3 #240. handoff.mjs and status-facts.mjs deleted with their tests; zero-importer census closed. Count delta reconciles exactly: -26 -24 +2 = -48 expected, -48 observed.
- M5 #241. Both inert fields (prState, green) deleted as one subject, each half proven independently.
- M8b #242. INTEGRATE git site deleted from all four registries: 5 insertions against 97 deletions.
- M9 #243. Remediate was a stub returning two empty lists; now planned, wired, tried-set carried, attempts recorded, run budget capped at 3.

TRUNK REPAIR #244 - open, 17/17 checks SUCCESS, mergeStateStatus CLEAN, NOT merged (human-gated). Two independent causes, proven independent by a 2x2 environment matrix (one tracks clone depth only, the other HOME only):
1. .github/workflows/test.yml:17 - actions/checkout with no fetch-depth, so depth 1. The roster test shells git log --diff-filter=D and read 0 bytes where a full clone returns 355 bytes / 10 lines.
2. skills/conformance-auditor/tests/skill-shape.test.mjs:80 - an absent plugins manifest returned an EMPTY inventory, reporting "I looked and found nothing" when the truth was "I could not look". One early return produced both halves of the failure, which is why its message read as self-contradictory.

WHAT FAILED, AND WHY:
- G9 could not be cleared on ANY Session 1 unit. Every one carried an unverified-reasoned downgrade whose premise was the inherited trunk red. Ruled once for the whole stack (0621) rather than re-litigated per unit.
- G9 could not be MEASURED on #244 itself. Its diff is workflow-plus-test only, so receipts short-circuited on a non-source diff: a 20-second PASS with none of the eight gates re-run. Recorded as a tracked downgrade, never as a cleared gate.
- M8b hit a FALSE G11 naming a test file it never had. Cause: the enforcer diffs the BASE BRANCH TIP, not the merge base, and #240 merged mid-flight adding that file. Merging current main cleared it. Tell: 11s for the false run against 1m8s for the real one.

FOUR OF MY OWN BRIEF'S CLAIMS WERE MEASURED WRONG BY THE LEADS:
- It was two failing tests, not four assertion sites; I had quoted declaration lines beside assertion lines.
- G9 never saw the shallow-clone red at all - receipts.yml already carried fetch-depth: 0, so every G9 block this session came from the skill-shape false red alone.
- wave-planner.test.mjs:137 never failed anywhere; it is a TODO in both environments.
- The settings.json route for the skill-liveness claim is dead: that file declares PLUGINS, never SKILLS.

THREE SPEC INACCURACIES, noted under ruling 8.1 and filed, never designed around:
- M8b: A10's "pure removal of code no caller reaches" is FALSE. No production caller reaches it, so the unit was implementable, but the removal carries behaviour - a probe had to be re-pointed, a parser row deletion was forced, and a test row was REHOMED rather than deleted because its subject survives. Also a namespace trap: 82 of 100 case-insensitive "integrate" hits are an unrelated PHASE name, so a census on the identifier finds 2 hits and wrongly concludes the site is inert.
- M5: the green sites are at four line numbers, none of them the two the SPEC named; and the surviving done-oracle caller is the CONSUMER, not the construction site.
- M9: the ceiling contradicts itself - line 403 requires a --remediate flag, line 406 forbids touching cli.mjs where the flag set is closed. Ruled in 0622.

LEAD JUDGMENTS I ACCEPTED: M5 took journal-fixtures.mjs, journal-store.test.mjs and e2e-substrate*.mjs beyond its declared list as reader-side necessity (they pin the built wire format this change alters); M9 took tests/unit-state.test.mjs additively to clear G14. No concurrent unit owned any of them.

Roughly 48 backlog lines filed across the six units. Nothing fixed in flight. Nothing merged by any session - every merge this session was the user's.

STILL UNDIAGNOSED, out of every ceiling: local and CI failing sets are disjoint and stable within each environment. The local failure is mitosis-gate.test.mjs:529, which censuses absolute paths in the PRIMARY CHECKOUT, so its verdict tracks whatever branch that checkout happens to sit on.

The primary checkout was never switched; it remains on fix/lead-agent-stopping-condition. Worktrees ws-m5, ws-m8b, ws-m9, ws-m8a, ws-m12b3 and trunk-repair are left in place.