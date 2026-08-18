---
Status: accepted
Date: 2026-08-18T23:15:12.211Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0601. Decision 0592's window cannot be reconstructed after 6bcce4f4, so only same-predicate comparisons hold

## Context

0592 pinned 164 of 270 start rows and 43 of 147 against a corpus read through the pre-repair predicate. Re-reading today, 165 groups occurs at 225 start rows rather than 270, because commit 6bcce4f4 changed the population predicate to resolve on sidecar depth.

## Options

- Treat the old and new figures as comparable
- Declare the old window unreconstructable and forbid cross-predicate comparison
- Rebuild the old predicate to reproduce the old figures

## Outcome

The 0592 window is NOT reconstructable from the present bytes and its two figures do not reproduce. Marked unverified-reasoned rather than reconciled. Going forward only same-predicate comparisons are valid, and any future reading that cites 0592's numbers alongside a post-6bcce4f4 figure is comparing two different populations. Frozen snapshots are hashed and pinned for any figure that must be re-checked, because the corpus is append-live and moves during a unit.
