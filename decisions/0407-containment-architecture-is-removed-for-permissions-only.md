---
Status: accepted
Date: 2026-08-13T23:56:56.966Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0407. The containment architecture is removed; autonomy is a permissions problem only

## Context

The thread's stated premise was that unattended autonomy needs containment and reversibility substituted for approval: Layer 0 OS sandbox, Layer 1 reversibility (per-worktree checkpoints, rm rewritten to Trash, hourly APFS snapshots), Layer 3 a PreToolUse gate, Layer 4 an audit log, plus a bespoke release/promote/cutover installer to deliver it. The user rejected that premise outright as over-engineering: the goal was only ever to remove permission denies and required asks so a long task can run unattended overnight. Commits, ledger writes and PRs already work; git already provides reversibility; the OS already provides a Trash. Evidence that the architecture was counterproductive is concrete - under Layer 0 an agent could not promote, could not sign a commit, and could not reach the GitHub API, so it manufactured new stop-and-ask-a-human events, and an installer failure silently disabled every gate at once. The criteria that encode the actual goal, c3 (prune deny, retire ask) and c4 (widen allow), are among those still not done after all the scaffolding.

## Options

- Keep the containment architecture and finish Layers 3 and 4 as planned
- Stop using the architecture but leave the machinery in place, dormant
- Strip it entirely and reduce the work to permissions configuration only

## Outcome

Strip it entirely, on the user's explicit instruction. Removed from tracked settings in 687c07e: the Layer 0 sandbox block and every architecture hook registration (both converge.mjs convergence hooks, protect-claude-config.sh, checkpoint-worktree.mjs, trash-rm.mjs); the PYTHONDONTWRITEBYTECODE env var goes with them, since it existed only to serve the release-tree immutability contract. Still to remove: scripts/config/ in full, .claude/lib/reversibility/, the three hook files and their tests, and the ~/.claude release topology (releases/, current, LIVE, local/), with the ten promoted entries re-pointed straight at the repo so edits are live with no install step. The remaining work is then only c3 and c4 - prune deny to genuine catastrophes, retire ask rules, widen allow. Merge gates are explicitly NOT part of the strip: gh pr merge and merge_pull_request stay denied by deliberate choice, as does the pr-create centralization. This decision supersedes the thread premise and every layer decision that depended on it. Discovered while executing: ~/.claude/settings.json is a real file written by promote.mjs, not a symlink, so it still carries the sandbox and the hooks; the sandbox is therefore self-protecting, because removing it requires writing the one file it denies, and only a human outside the sandbox can break that bootstrap.
