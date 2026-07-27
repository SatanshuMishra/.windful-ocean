---
Status: accepted
Date: 2026-07-27T20:12:15.577Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0030. Non-git recoverability replaces guard hardening as the actual protection work

## Context

selectDriver returns GitRefDriver only when the project is a git worktree; otherwise LocalDriver, whose commit() and sync() are literal no-op stubs returning committed:false / synced:false (local-driver.mjs:183-189). Non-git projects therefore hold plain JSON and markdown with no history, no remote and no recovery - the only store where rm -rf is permanent. It has received none of the 23 commits of guard work, while the fully recoverable git-backed store received all of them. Since protection now comes from recoverability rather than prevention (0029), a store with no recoverability is the real exposure.

## Options

- Leave LocalDriver as-is and accept permanent loss for non-git projects - rejected, it is the only genuinely unprotected store
- Give LocalDriver history via a private git repo under its data dir - preferred, it reuses GitRefDriver's proven commit-per-mutation pattern and keeps one mental model
- Timestamped snapshots or a rotating backup dir - simpler to write but invents a second recovery model and a retention policy

## Outcome

Non-git recoverability is the highest-value remaining work and replaces the third hardening round. Give LocalDriver real history, preferring a private git repo under the data dir so the commit-per-mutation pattern already proven in GitRefDriver is reused rather than a second model invented. Also document sandbox.filesystem.denyWrite in the README as the opt-in hard mode for users who want OS-enforced protection - it blocks writes at the syscall level regardless of how a command is spelled, and does not sandbox hooks or MCP servers, so the plugin can still write its own store.
