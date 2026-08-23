---
Status: accepted
Date: 2026-08-23T05:33:16.085Z
Thread-Id: 01M0PHEKE1VMK3NREETGWVG57Z
---

# 0677. The node_modules bootstrap is hidden in the git exclude file, not in the tracked ignore file

## Context

The composed implement prompt instructs a symlink named node_modules inside the unit worktree. A tracked ignore file written with the trailing-slash form matches directories only, and git does not resolve the symlink for that match, so the symlink shows as untracked and the implementing child can commit it into a real pull request. The fix had to hide the symlink without leaving any second artifact, and without editing the target repository's tracked ignore file, since a modified ignore file is itself committable and merely moves the defect.

## Options

- Write a non-slash node_modules entry into the target repository's tracked ignore file.
- Seed the worktree-local git exclude file, resolved through git rev-parse --git-path.
- Set core.excludesFile through the per-worktree git config.

## Outcome

Seed the exclude file, resolved at run time through git rev-parse --git-path rather than a hardcoded path, because in a linked worktree the .git entry is a file and a hardcoded path is wrong. The exclude file lives inside the git directory, never in the working tree, so it can never appear in a status listing and can never be committed. The per-worktree config option was rejected because it first requires enabling a repository-wide extension, which is a larger and less standard side effect than a one-line ignore rule. One trade-off is accepted and recorded rather than solved: the exclude file is shared across every worktree of a repository, not per-worktree, so concurrent unit worktrees all append the same line. The command is idempotent, each append is short and atomic, and duplicate lines are inert, so the race is harmless. The prompt's existing symlink and fresh-worktree instructions are unchanged, which keeps the harness's two presence guards firing.
