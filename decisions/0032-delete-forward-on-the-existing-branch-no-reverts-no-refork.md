---
Status: accepted
Date: 2026-07-27T20:23:45.325Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0032. Delete forward on fix/pre-tool-use-guard; neither revert the 18 commits nor re-fork off b60ac56

## Context

0029 requires deleting the parser, but the branch topology for doing so was left undecided and blocking. Two options were carried in the spine: a fresh branch off b60ac56, or reverts on the existing branch. Both were checked against the actual history. fix/pre-tool-use-guard is at b21ab86, 22 commits ahead of origin. Diffstat of the post-b60ac56 commits shows three of them fix components that 0029 explicitly says to KEEP, not the parser: f95bdcb touches hooks/lib/hook-io.mjs for fail-closed on unreadable PreToolUse input, 3cb599d touches hook-io.mjs to resolve relative paths against the shell cwd, and 4b54a46 touches hooks/lib/ledger-roots.mjs to canonicalize symlinked paths before the root comparison, which is resolveLedgerRoots and the Write/Edit path deny. Re-forking off b60ac56 would silently drop all three. Separately, git revert is semantically wrong here: the state before the inversion was an allow-by-default Bash guard, so reverting restores a guard nobody wants, whereas 0029 specifies a third state, the tripwire.

## Options

- Fresh branch off b60ac56 - rejected, it drops f95bdcb, 3cb599d and 4b54a46, which harden the KEEP set rather than the parser
- Fresh branch off b60ac56 plus cherry-picks of the three keeper commits - rejected, it carries conflict risk and a chance of dropping a fix, and buys nothing under squash-on-merge
- Revert the 18 parser commits on the existing branch - rejected, revert restores the pre-inversion allow-by-default guard, which is a state 0029 does not want, and produces 18 noisy commits
- Delete forward on the existing branch in atomic commits - chosen

## Outcome

Stay on fix/pre-tool-use-guard and delete FORWARD in atomic commits. This keeps every fix made to the surviving components while removing only the parser, and it reaches the tripwire directly instead of passing through an allow-by-default state that no decision endorses. The 23 commits remain in the branch as the audit trail for why the parser died, complemented by decisions 0014 through 0029; nothing is discarded, satisfying the spine's do-not-discard-silently constraint. The branch is pushed to origin so that audit trail stops being local-only. House default of squash-on-merge is unaffected. The branch name still describes the work and is not changed.
