---
Status: accepted
Date: 2026-08-10T21:30:07.277Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0320. The LIVE receipt records the primary checkout as repo_root, never a disposable worktree

## Context

install-bootstrap.mjs reads scripts/config from disk, and the primary checkout sits on a feature branch that does not carry that directory, so reinstalling the live bootstrap required a temporary worktree at main. The obvious simplification was to pass that same worktree as --repo-root to promote. But promote writes repo_root into the LIVE receipt, and rollback() refuses outright when existsSync(receipt.repo_root) is false, because it must recompute the settings the target release declares before moving the pointer back. A receipt naming a scratchpad path would therefore strand the config with no rollback the moment the session temp directory is cleaned - and nothing at promote time would warn about it.

## Options

- Pass the primary checkout as --repo-root to promote, and use the temporary main worktree only for install-bootstrap, which persists nothing - ADOPTED
- Pass the temporary main worktree as --repo-root to both. Simpler and one fewer path to reason about, but it writes a disposable path into the LIVE receipt and silently destroys rollback
- Create a permanent second checkout at main to serve as repo_root. Durable, but adds a standing working tree that must itself be kept current, and a stale one would build the wrong release

## Outcome

Adopted 2026-08-10 and exercised on the first live promote. The receipt records /Users/satanshumishra/Documents/DevLabs/.windful-ocean, verified to still resolve after the temporary worktree was removed. promote needs nothing from repoRoot on disk except a .claude directory - it reads the release through git archive, git show and git ls-tree at the sha - so the checked-out branch is irrelevant and the primary checkout always qualifies. The rule for every future promote: only install-bootstrap may run from a throwaway worktree, because it records nothing; promote's --repo-root must be a checkout that will still exist when a rollback is needed. Note separately that this first release carries previous null, so rollback has no target regardless; recovery from this one is the settings backup plus removing the current symlink.
