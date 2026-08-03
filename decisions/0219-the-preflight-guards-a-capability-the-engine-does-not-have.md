---
Status: accepted
Date: 2026-08-03T15:34:31.526Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0219. The merge-boundary preflight guards a capability the engine does not have, and 0218's machine-user path is withdrawn

## Context

0218 recorded that mitosis cannot run on SatanshuMishra/logbook because a repo owner is necessarily admin, and framed two live paths: provision a write-but-not-admin machine user, or do not run mitosis there. That framing accepted the gate's premise - that a server-side boundary is needed because the engine might merge its own unreviewed work. The user rejected all three invariants as unsatisfiable for their dominant workflow: solo repos where they are the sole owner, where a second bot account exists purely as ceremony. Investigation tested the premise rather than the invariants.

## Options

- Provision a write-but-not-admin machine user per repo (0218 path 1) - accepts the premise, costs a second account and a review ruleset per repo, and on a solo repo still deadlocks because GitHub forbids self-approval
- Do not run mitosis on owner-held repos (0218 path 2) - excludes the majority of the user's projects
- Relax the invariants to a lower threshold - keeps a gate proving a weaker version of an irrelevant property
- Refute the premise: establish whether the engine can merge at all, and let that govern

## Outcome

PREMISE REFUTED. mitosis.js contains ZERO merge invocations - grep for `gh pr merge`, pulls/*/merge, mergePullRequest, enablePullRequestAutomerge and --squash returns nothing. Merging is independently denied at three local layers: permissions.deny in settings.json (Bash(gh pr merge:*) and both GitHub MCP merge tools), block-destructive-bash.sh:46-49 (gh pr merge, the pulls/*/merge REST endpoint, both GraphQL mutations), and the engine itself, which has no merge call to deny. The hook's deny message states the design in words: "mitosis never merges PRs ... a human merges via the PR after review." The preflight therefore proves a server-side boundary against a capability that does not exist, and gates the WRONG EVENT: SKILL.md gates DISPATCH on exit 0, blocking the start of work because finishing it might be unsafe, when the engine never finishes it. It is also strictly weaker than the deny layers it duplicates - the hook works on every repo including solo ones at zero setup cost. Both 0218 paths are WITHDRAWN; neither was ever necessary. 0218 is superseded by this record. Separately: invariant 3 on a solo repo demands a configuration that deadlocks the human too, since GitHub forbids self-approval, leaving a bypass actor as the only escape - the one thing the gate declares unverifiable. That deadlock claim rests on the self-approval constraint, which was NOT verified against GitHub docs and must be confirmed before it is built on.
