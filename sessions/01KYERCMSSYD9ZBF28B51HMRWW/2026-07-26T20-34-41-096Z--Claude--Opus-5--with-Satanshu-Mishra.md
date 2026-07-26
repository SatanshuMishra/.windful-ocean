Resumed via lift-off. Delivered the teaching task, then the user REJECTED the MSP-2 + MSP-3 architecture as complex and fragile and locked a teardown-and-replace direction. Nothing was built, applied, probed, or pushed.

DELIVERED
- The MSP-3b plain-language walkthrough the thread was parked on (what 3b is, the three reasons it is not done, why no agent can settle it, the honesty clause, the human probe, the fork). Teaching criterion satisfied.
- Fable researcher dispatched with a four-rival brief (A server boundary / B narrowed agent identity / C verify-after / D current design). Full report returned.

ROOT CAUSE, VERIFIED
`.claude/workflows/mitosis.js` is a sandboxed WORKFLOW SCRIPT, not a Node program: `export const meta` at :1, and ZERO occurrences of `spawnSync|execSync|child_process|require(|fs.` in 4,600 lines. Docs confirm ("No direct filesystem or shell access from the workflow itself"). Its only actuator is `agent(<English>)`. The engine computes every PR argument and then cannot use them - it must ask a subagent to type them. That is the structural cause of the whole MSP-2/MSP-3 saga.

DECISIVE FINDINGS
- G1 RESOLVED, and it DISSOLVES 3b rather than fixing it. Workflow-spawned subagents "always run in acceptEdits mode and inherit your tool allowlist, regardless of your session's mode" (code.claude.com/docs/en/workflows). Mitosis agents therefore NEVER run bypassPermissions - the exact mode 3b hedged against. With glob semantics confirmed (mid-string `*`, spans multiple args), the anchor grammar would most likely have WORKED. It simply stops being worth doing.
- The hook DENIED the researcher's own read-only `grep` mid-session because the pattern contained the merge literal. The false-denial storm is empirical, not hypothetical.
- The user's pr-opener idea is CONFIRMED FEASIBLE: per-agent `tools`/`disallowedTools`/`hooks` frontmatter is documented, and `agentType` dispatch is already in production at mitosis.js:1088-1094. One seam unprobed (does frontmatter `tools:` bind WORKFLOW-spawned agents - composed from two doc statements, needs a 2-minute probe). The skill-based variant was REJECTED (a static skill cannot carry run-specific interpolated args, so it relocates interpretation rather than removing it; skill invocation is a second model-mediated gate). Correction to an in-session claim: skills CAN carry `hooks` and `allowed-tools`, but `allowed-tools` only GRANTS and "does not restrict other tools", so it cannot narrow to a closed set the way agent `tools:` can.

LEAK SWEEP (run BEFORE relaying the researcher's "push main" step)
Repo is PUBLIC: SatanshuMishra/.windful-ocean. Flagged confidential codename: 0 hits in tracked files, 0 hits across the 35 unpushed commits on main, and `.claude/reports/` is NOT tracked (the prior caveat on the resilience thread is already resolved). Exactly ONE commit carries it - d57e233, on local branch `feat/mitosis-resilience` only, on NO remote, and NOT an ancestor of HEAD. So pushing main is CLEAN; pushing feat/mitosis-resilience would publish it. Scrub that branch before it ever goes up.

MID-SESSION SCOPE CHANGE (the report largely predates it)
The user clarified the real requirement: mitosis must produce a STACKED PR TRAIN for a TEAM environment - MSP-N opens a PR, MSP-N+1 starts from MSP-N's HEAD, humans review and merge asynchronously. "Never merge" is therefore the PRODUCT REQUIREMENT, not a safety compromise. This makes the server-side ruleset nearly free (a team repo needs required reviews anyway) and makes MSP-2's hook near-worthless.
The researcher's report does NOT cover: restack determinism, stack depth, O(N^2) CI cost, or build-vs-delegate against Graphite/ghstack/spr/git-town. That research is unstarted.

THE FINDING THAT RELOCATES THE PROBLEM
mitosis.js:2968-2972 dispatches the RESTACK as English prose - fetch origin base, fetch each unmerged parent checkpoint ref, then "Re-stack this MSP's own commits and each still-unmerged parent's commits onto <branch>, observe-then-converge (skip any that are already applied)" - returning ready/conflict booleans the agent asserts about ITSELF. Multi-step git surgery through the non-deterministic actuator. PR creation is the EASY case (one command, all args engine-computed, one JSON result). MSP-2 and MSP-3 hardened the wrong operation.

USER PUSHBACK, ACCEPTED
The user rejected the review-latency risk framing: per-MSP confidence is backed by DoD + e2e + CI green, not luck. Conceded, and the stack-depth cap was WITHDRAWN. Sharpened instead: the gates eliminate exactly the failures that would have been INDEPENDENT (bugs, regressions) and leave exactly the ones that are CORRELATED across a stack (requirements misread - tests written by the same agent that misread them pass green; design objections; cross-cutting context). More operative still: the driver is not rejection but AMENDMENT - "approved with one change" is the normal case in team review and moves the parent head anyway - plus teammates advancing trunk independently. Both force restacks on correctly-built, CI-green MSPs.

WHAT DID NOT HAPPEN
No teardown executed. Nothing deleted, reverted, or committed. The anchor probe was NOT run (now moot). Nothing pushed - main remains 35 commits ahead of origin/main. Working tree still dirty (4 modified, 3 untracked) and stash@{0} retained.

OPEN LEAD worth verifying next session: GitHub auto-retargets an open PR when its base branch is DELETED on merge. If it holds, the happy path (parent approved, merged, branch deleted) may need NO restack at all, narrowing the deterministic-restack requirement to the amended-parent and advancing-trunk cases only - a much smaller problem than the current shepherd solves.