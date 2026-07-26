---
Status: accepted
Date: 2026-07-26T21:10:11.451Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0012. Deterministic restack is BUILT in-engine; the checkpoint SHA plus rebase --onto the exact merge SHA is the algorithm

## Context

0010 required restack to become deterministic but left build-vs-delegate open. Three researchers ran. The auto-retarget lead from 0010 was VERIFIED and only PARTIALLY holds: GitHub does retarget an open PR when its base is merged-and-deleted (docs.github.com, changelog 2020-05-19), but squash-merge and rebase-merge rewrite the parent's SHAs, breaking the child's merge-base and forcing an explicit restack. Only a true merge commit leaves the child diff clean. Multi-hop cascade is undocumented with community reports of child auto-CLOSE. So restack determinism survives as required scope; the lead did not shrink the problem. The adoption-cost researcher recommended DELEGATING to ejoffe/spr; that recommendation is overridden on engine-specific grounds it was not given.

## Options

- Delegate to ejoffe/spr (MIT Go binary, GITHUB_TOKEN env auth, commit-trailer state) - REJECTED
- Hybrid: git-town for git mechanics plus hand-rolled PR-base sync - REJECTED as runner-up
- Graphite CLI - DISQUALIFIED outright
- Spike first against a real protected-branch repo, then decide - not taken
- BUILD the deterministic driver in-engine - CHOSEN (user-locked)

## Outcome

CHOSEN: BUILD in-engine. User-locked via explicit selection.

THE ALGORITHM (from the mechanics research, all four tools reduce to it). Persist per unit: parent, checkpoint_sha (parent tip at last successful restack), parent PR state. Then `git rebase --onto <new-base-sha> <checkpoint_sha> <branch>` - three concrete SHAs, no inference. TWO load-bearing refinements: (1) the RECORDED checkpoint supplies <oldbase>, which merge-base CANNOT safely re-derive once a parent is amended, because an amend IS a history rewrite - this is Graphite's parentBranchRevision. (2) Rebase onto the EXACT merge SHA from the GitHub API, never trunk's tip; then git's own defaults --empty=drop and --no-reapply-cherry-picks drop already-landed commits NATIVELY, so no bespoke patch-id logic is needed for the common case. Catching up to trunk is a SEPARATE second pass, keeping each conflict attributable to one cause. Conflicts are detected by inspecting .git/rebase-merge plus the exit code - git's own state, NEVER an agent self-report. The agent's role shrinks to resolving isolated hunks, after which the driver runs `git add` + `git rebase --continue`. Cross-branch queue state is NOT native to git (.git/rebase-merge describes one rebase) and must stay engine-owned.

WHY BUILD BEATS DELEGATE HERE. spr's own pre-mortem condition is met by this very architecture: it has open issues PANICKING on protected branches, merge queues, and CODEOWNERS (#424, #195, #98), and 0009 is definitionally building a ruleset-protected base with required reviews. The generic build-cost estimate assumed greenfield; this engine already owns 3 of the 5 expensive pieces - the task graph IS the topology store, manifest/park-checkpoint IS the queue, mitosis-git.mjs IS the GitHub bookkeeping, and builtAgainst is already a checkpoint seed. Delegating would add a SECOND source of truth for topology alongside the task graph. Graphite is disqualified regardless: closed-source since 2023, vendor telemetry with no documented opt-out, and documented worktree-cache corruption - fatal because mitosis fans out into concurrent worktrees. git-town was the strongest runner-up but its shipped-parent opcode AUTO-RESOLVES conflicts by a fixed heuristic, reintroducing precisely the silent judgment 0010 removes.

LIVE DEFECT FOUND, NOT YET FIXED. Both prose restack sites (mitosis.js:2964-2974 shepherd stage, mitosis.js:4452-4453 frontier-train; 0010's line numbers had drifted) use `git merge-base --is-ancestor` as their ONLY containment check. Under a squash merge the parent's commits are not ancestors of the squashed base, so the check returns false and the engine RE-APPLIES content that already landed. Correctness bug today, independent of the rewrite.

NEW CONSTRAINT FOR THE RUNBOOK. GitHub's auto-retarget fires pull_request activity type `edited`, which is EXCLUDED from the Actions default of opened/synchronize/reopened. A retargeted PR keeps displaying its stale check result - it can show green against a base it was never tested against. Workflows must opt into `edited` explicitly.
