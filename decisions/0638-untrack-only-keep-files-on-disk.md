---
Status: accepted
Date: 2026-08-20T04:52:05.349Z
Thread-Id: 01M0ER53SRDPTZF6K6R1TTBZBH
---

# 0638. Untrack the AI-generated documents without rewriting history or deleting them

## Context

The repository tracked 92 assistant-generated documents on the belief that other machines cloning it needed to read them. The user declared that premise false and asked for a repository holding actual configuration only. The question was how far the removal should go: tracking, disk, or history.

## Options

- Untrack with git rm --cached, keep every file on disk, add ignore rules, leave history alone
- Rewrite history to purge the blobs from past commits
- Delete the files from disk as well as from tracking

## Outcome

Untrack only, files stay on disk, history untouched. A rewrite would have forced a push that invalidates every existing clone and the roughly thirty live worktrees attached to this repository, buying only the removal of about four megabytes of dead text from old commits. Deleting from disk would have destroyed the working record while the assistant still uses those documents locally. The ignore rules carry the intent forward, so the trees cannot creep back without someone deliberately forcing them.
