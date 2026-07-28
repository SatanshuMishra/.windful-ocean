---
Status: accepted
Date: 2026-07-28T19:54:20.866Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0082. Leave the committed duplicate decision 0074 in place rather than deleting it

## Context

decisions/0074 is a committed duplicate of 0075 (HEAD-lock race), created by a race and left orphaned and unlinked from the PROJECT index. It had been carried as an open chore needing a ruling.

## Options

- Leave the file in place
- Delete the duplicate in its own chore commit
- Keep the file but mark its Status line superseded-by 0075

## Outcome

Leave it. Decision records are write-once by the ledger's own discipline, and deleting a committed one would set a precedent that the append-only log can be rewritten. Being orphaned and unlinked, it misleads no reader. This chore is now closed.
