---
Status: accepted
Date: 2026-08-24T21:41:49.377Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0722. The census keeps per-site allowlist entries rather than growing more suppression rules

## Context

Widening the host oracle to the full archived scope grew the census allowlist from 6 entries to 42. Thirty-six of the new entries share one root cause: the oracle answers presence by comparing basenames, so a file this repository only ever writes at run time collides with an unrelated host file carrying the same name. Read on its own, the earlier decision that the census classifies by rule rather than by entry argues for turning that collision class into new rules. The four sub-shapes are not one predicate, though — runtime write targets, substring literals inside test assertions, the census tool's own scope metadata, and one plugin path — so it would take roughly four new suppression rules. Code review had already demonstrated that every terminal-pass rule in this census was an escape route, finding four of them, one live in the tree.

## Options

- Add roughly four suppression rules and take the allowlist back toward single digits, consistent with a literal reading of the classify-by-rule decision
- Keep the thirty-six per-site entries, file the root cause with its real fix, and accept a larger but auditable allowlist
- Narrow the host oracle again so the collisions stop appearing

## Outcome

Keep the per-site entries. The classify-by-rule decision was about 1440 entries where 3 did work and a predicate was doing an allowlist's job; here the population is 42, heterogeneous, and readable in full, so the trade has inverted. A suppression rule is fail-open by construction and each one is a fresh way for a real gap to pass, while a per-site entry is fail-closed, auditable, and expires by itself when its site goes away. Narrowing the oracle is rejected outright: that hole is exactly what round four existed to close. The real fix, comparing by a layout-mapped path instead of a basename, is filed in the unit's brief for whoever hardens the guard later, to be revisited when the population stops being small enough to read.
