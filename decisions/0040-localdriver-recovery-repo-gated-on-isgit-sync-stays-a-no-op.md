---
Status: accepted
Date: 2026-07-27T21:32:31.095Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0040. The LocalDriver recovery repo is gated on isGit(), scoped per store, and does not extend to sync()

## Context

0030 ratified giving LocalDriver a private git repo under its data dir, reusing GitRefDriver's commit-per-mutation pattern, but left four implementation-level questions open. Mapping the driver layer before dispatch surfaced the decisive fact 0030 did not have: GitRefDriver EXTENDS LocalDriver (git-ref-driver.mjs:150, super(worktreeDir)), overriding only isGit, init, commit, sync and the git-only observe methods while inheriting every file read/write method for its worktree. A naive addition of git machinery to LocalDriver.init() would therefore run git init INSIDE GitRefDriver's already-git worktree. Three further facts constrain the design: isGit() means "attached to the host project's git repo", not "backed by git", and src/drift/reconcile.mjs:18-23 plus src/util/active-thread.mjs:17-26 branch hard on it; commitAndReindex (src/tools/shared.mjs:10-14) rebuilds the index immediately before every driver.commit(), so an unignored index/ would put churn in every commit; and production code sets commit.gpgsign nowhere, so a from-scratch repo inherits the user's global setting, against a suite that already has a live "gpg: signing failed: Cannot allocate memory" failure mode.

## Options

- Add the git machinery to LocalDriver.init()/commit() unconditionally - rejected, GitRefDriver inherits it and would nest a repo inside its own worktree
- Gate the recovery repo on !this.isGit() - chosen, isGit() is exactly the discriminator, is already pinned false for LocalDriver by three tests, and neutralises the inheritance trap regardless of whether GitRefDriver.init() calls super.init()
- Discriminate on constructor identity or a subclass flag - rejected, encodes the class hierarchy rather than the semantic distinction and reads as a workaround
- One repo per store at <ledgerRoot>/.git - chosen, the direct reading of 0030, mirrors GitRefDriver's one-repo-per-project model, smallest blast radius
- One repo at the CLAUDE_PLUGIN_DATA root spanning every project store - rejected, couples unrelated projects into one history and widens blast radius
- Give sync() a remote and real push semantics - rejected, a private local repo has no remote and ledger-cli sync is already out of scope on this thread
- Invent extra keys on the commit() return to describe degradation - rejected, 0030's one-mental-model clause argues for the exact {committed, sha, empty} shape GitRefDriver already returns

## Outcome

Four rulings, all narrowing 0030 rather than superseding it. (1) The recovery repo is created and used only under a !this.isGit() gate; LocalDriver.isGit() keeps returning false, since the private repo is an internal recoverability mechanism and deliberately invisible to the isGit() contract. (2) One repo per store at <ledgerRoot>/.git. (3) commit() returns the exact {committed, sha, empty} shape GitRefDriver returns, with git-unavailable expressed as {committed:false, sha:null, empty:false} - distinguishable from nothing-to-commit, which is empty:true. sync() is NOT touched and stays {synced:false}: 0030 asked for history, not publication. (4) The repo disables commit and tag signing in repo-local config at creation and ships a .gitignore of index/ mirroring GitRefDriver's GITIGNORE. Neither init() nor commit() may ever reject because git is missing or failed - both gitExec failure modes (a string-.code ENOENT spawn error, and a wrapped non-zero-exit Error) are handled, and degradation latches per instance so repo creation is not re-attempted on every mutation. The inheritance trap is pinned by a regression test asserting GitRefDriver.init() creates no nested repo in its worktree.
