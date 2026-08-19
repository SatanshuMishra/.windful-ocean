Trunk repair merged and the green MEASURED on main, not inferred.

PR 244 merged at 195ae602 (2026-08-19T16:59:00Z). Zero pull requests now open. The test workflow on main at 195ae602 polled to "completed success"; the immediately prior main commit a8d603c4 is "completed failure". That pair is the evidence the red trunk is closed: same workflow, same branch, adjacent commits, opposite conclusions.

CONSEQUENCE FOR EVERY REMAINING UNIT: G9 is a working gate again. The blanket ruling of 0621 - that a G9 block is an inherited false red and takes a tracked downgrade - is now SPENT. A G9 block on a Session 2 or Session 3 unit means a real full-suite regression until proven otherwise, and downgrading one by reflex would be exactly the false assurance the gate exists to prevent. Measure the parent commit's failing set as always, but expect it to be empty in CI now.

One caveat that survives: the enforcer still short-circuits on a non-source diff, so a workflow-or-test-only unit will still get a fast PASS that re-runs none of the eight gates. Elapsed time remains the tell - about 20 seconds for a short-circuit against over a minute for a real run.

The local failing set is unchanged and still disjoint from CI: mitosis-gate.test.mjs:529 censuses absolute paths in the PRIMARY CHECKOUT, so its verdict tracks whichever branch that checkout sits on. It was never evidence about a branch and is not evidence now. Undiagnosed, filed, outside every ceiling.

Session closed here at the user's instruction for a fresh session. Sessions 2 and 3 continue from the refreshed spine.