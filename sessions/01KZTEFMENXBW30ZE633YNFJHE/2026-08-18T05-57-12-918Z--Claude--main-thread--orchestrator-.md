First live end-to-end run of the mitosis engine. The engine opened a real pull request.

WHAT SHIPPED
- Fast-forwarded the primary checkout from 28 behind to origin/main at 94eaf17f, and confirmed PR 209's content is live in the working tree by grepping the file rather than trusting the MERGED label.
- Established that a local live run needs NO dedicated token: authentication is ambient gh CLI. MITOSIS_LIVE_GH_TOKEN exists only as a GitHub Actions secret name and is read nowhere in engine source. The gh on PATH resolves uniquely to /opt/homebrew/bin/gh.
- Staged the disposable substrate: cloned SatanshuMishra/mitosis-live-pr-harness (private, main only, no open PRs, 28 tests green, .mitosis already gitignored) into the session scratchpad, verified every path segment is symlink-free.
- Wrote a two-unit spec and ran decompose-emit, which produced a clean run document: two units, two clusters, dependsOn and prereqs empty on both, disjoint edit scopes, per-MSP integrationBranch, unit verdict schema attached, scopes within the 16-char cap.
- Reviewed both request.prompt values verbatim before executing, per the standing rule that the run document is the entire blast radius. Blast radius was contained: worktree add from main, cd, node_modules symlink, npm test, commit. No pushes and no destructive git in the child prompts.
- Drove cli.mjs once. It ran all eight phases in one process and opened pull request 2 on the harness repo through the centralized pr-create tool. Verified by reading the PR back from GitHub: correct Conventional Commits title with scope, body carrying Why / What / Verification / Provenance, and an honest "Not verified: receipts enforcer - not run". The shipped branch respected its fence exactly, two files, 79 insertions, nothing else touched. The engine emitted mergeOrder position 1 with deleteAfterMerge false and merged nothing.

WHAT FAILED
- Exit 3, incomplete. The second unit (predicates-value-guards) parked with diagnosis NeedsHuman after the review lens returned fail with eight cited findings: it edited package.json, index.mjs and README.md (all outside its fence and forbidden by name in the spec), inverted the isEmpty contract to return false where a throw was specified, shipped no assert.throws, and pinned the wrong behaviour in its tests. The park is CORRECT behaviour; the review machinery worked. The root cause is that the implementer is briefed with the MSP's one-sentence rationale instead of the requirements (0566).
- A first launch died at exit 1 twelve minutes in because --journal must be absolute while the operator doc's own example is relative (0567). The engine released its lock cleanly, so no forced retirement was needed.
- An earlier launch was aborted deliberately five seconds in because I had launched it detached without capturing its exit code; the exit code is the load-bearing signal for this criterion. Lock retired, relaunched through a runner script that records it.

DEFECTS FILED, NONE FIXED (all above this unit's declared ceiling)
0565 prState probe is ordered before Ship and reports "no pull requests found" for the PR the run then creates.
0566 implementer briefed with rationale, not spec; first dispatch structurally cannot carry the plan it is told to follow.
0567 journal flag rejected late and misclassified as an unclassified throw rather than a usage rejection.
0568 boundary gate produced no per-unit census and reported zero fixes.
Also observed: ship.status reads "all-shipped" while a unit is parked, meaning every INTEGRATED unit shipped. The exit code tells the truth; the status string does not.

STATE LEFT ON DISK
Substrate clone, worktrees and the working invocation (run-engine.sh) are under the session scratchpad at .../scratchpad/live. Run key 643e9346256237f3d00b78b88ff575e285539d8d23e996c69086fe08b348fb22, attempt 3, lock released, journal at .mitosis/run.jsonl. PR 2 is OPEN and unmerged on the harness repo, and a _ledger branch has appeared there from the logbook plugin.