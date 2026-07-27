---
Status: accepted
Date: 2026-07-27T23:13:42.583Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0050. Git invocations split into four scopes rather than one blanket isolation, because network operations need the user's config

## Context

0043 authorised applying the LocalDriver env hardening to GitRefDriver. Implementing it exposed that a single blanket policy is wrong: the driver's git calls do not all want the same treatment. Ledger writes must not be redirected and must not read user hooks or fsmonitor. Network operations, by contrast, depend on the user's global config for credential helpers, url.*.insteadOf, core.sshCommand and proxy settings - nulling global config there would break authentication against real remotes while still passing every test, because the sync tests only exercise local-path remotes. Read-only questions about the user's own branches are a third case: clearing the location variables fixes the redirect, but pinning or isolating would change what the question means. The audit also found the spec's call-site list incomplete: #ensureFetchRefspec wrote the fetch refspec into the ambient repo's config, sync's fetch/push/remote ran unscoped, the assert and observe helpers read the ambient repo, mintLedgerRoot's commit-tree wrote the root object into the ambient GIT_DIR, and src/drivers/select.mjs:8 isGitWorkTreeSync reported a non-repo directory as a work tree under a bare ambient GIT_DIR, which would have become a hard resolveGitDir throw once the rest landed. --no-verify was confirmed weaker than assumed: it fails to suppress post-checkout from worktree add, post-merge, reference-transaction from update-ref and commit, and core.fsmonitor.

## Options

- One blanket isolation policy across every gitExec call - rejected, it silently breaks authenticated fetch and push while every local-path-remote test still passes
- Four scopes routed through one scopedExec choke point - chosen
- Pin GIT_WORK_TREE alongside GIT_DIR - rejected, with GIT_DIR explicit and cwd at the top level git already resolves the work tree, and forcing it breaks a bare host repo
- Inject safe.directory as a wildcard, or restore global config wholesale, to survive differing-ownership repos - rejected, both loosen protection more than the problem requires; a per-directory exact-path injection is the narrow form

## Outcome

Four scopes in src/util/git-scope.mjs behind a single scopedExec choke point. DISCOVERY: location cleared, config isolated, safe.directory injected - one call per target directory, cached, and the only call still performing repository discovery. ISOLATED: GIT_DIR pinned, global and system config nulled, core.hooksPath pointed at an absent directory, core.fsmonitor false - every ledger read and write on both the repo and the worktree, including update-ref and worktree add specifically because they fire reference-transaction and post-checkout which --no-verify does not cover. NETWORK: GIT_DIR pinned and hooks suppressed, but the USER'S CONFIG IS DELIBERATELY PRESERVED - fetch, push, remote, and the fetch-refspec config read/write, because credential and transport settings live in global config. HOST: location cleared only - read-only queries about the user's branches, where pinning buys no correctness and isolation would change the meaning of the question. Two honest limits recorded rather than papered over. First, safe.directory injection is PROVEN load-bearing only on the discovery call; on git 2.55.0 an explicit GIT_DIR skips ownership validation entirely, so on the isolated operations it is defence in depth and unproven, pinned only by an argv-contract test. Second, ledger commits are now unsigned - confirmed, and desirable per the security review since the identity is synthetic and nothing verifies a signature - but the drift-signals gpg flake is REDUCED, NOT FIXED: test/e2e/helpers/fixtures.mjs still sets no commit.gpgsign false, so the suite's own project commits still invoke real gpg. Do not treat that flake as closed.
