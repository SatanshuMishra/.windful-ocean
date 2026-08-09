---
Status: accepted
Date: 2026-08-09T01:48:11.069Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0297. The fsmonitor hardening is kept on all four git sites even though measurement showed none of them invoke it

## Context

The design pass recorded that whether git worktree list, ls-tree or show trigger the fsmonitor hook was NOT run, and applied the hardening regardless. The step-9 implementer measured it on git 2.55.0 under darwin: with the fsmonitor setting in a scratch repo local config wired to a script appending to a sentinel log, rev-parse, ls-tree, show and archive each invoked it zero times; a git status control invoked it once, and dropped to zero once the neutralizing flag was prepended. The same pass found no git worktree list call anywhere under scripts, so the artifact Not-verified note named a subcommand this codebase does not contain. A second measured fact points the other way and is why the invocation hardening still earns its place: a malformed gitconfig reached through the global or system config environment variables aborts all four subcommands with a fatal parse error, and neutralizing both variables prevents it. Ambient config being read at all is observable through the public surface; fsmonitor, here, is not.

## Options

- Keep the flag on all four sites and treat the measurement as narrowing F5 rather than settling it - ADOPTED
- Drop the flag as measured-unnecessary - rejected, since one git version and one fsmonitor configuration is not every configuration, and the flag costs nothing while removing a config-driven exec surface on a receipt-named path
- Assert the flag with a test that inspects the argument vector - rejected as an implementation-detail test

## Outcome

Adopted. All four git invocations in release.mjs go through one hardened runGit, and no test asserts the fsmonitor flag through the argument vector. What is tested behaviorally is the ambient-config axis, which is observable: release.test.mjs exercises a malformed gitconfig through resolveRef, declaredSettings and buildRelease. F5 is narrowed, not closed; the honest statement is that four subcommands did not invoke fsmonitor on one git version with one hook configuration. The lesson, and the reason this is a record rather than a code change alone: an unverified claim in a design artifact is a debt, not a permanent condition. Measuring it changed both what could be tested and what may be said, and the right response to a measurement saying the threat did not fire here is to keep cheap defence-in-depth while refusing to upgrade the claim - not to delete the guard, and not to pretend it was proven necessary. One consequence is named rather than buried: neutralizing the ambient global gitconfig also discards a user's global safe.directory entries, so a checkout owned by a different uid that the user had whitelisted globally is now refused by git's own ownership check.
