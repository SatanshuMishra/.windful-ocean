---
Status: accepted
Date: 2026-08-17T23:29:51.240Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0545. The six audit fixes proceed under four user directives: no constants, no doubles, ordered ship, stacked by default

## Context

The live e2e audit returned a six-change minimum set to a first working run, two headline defects (unreachable ship git site, hardcoded green rendered as a Verified PR line) and a deferred design decision on whether one invocation should reach a pull request by re-snapshotting or by driving the phase loop to fixpoint. The user reviewed the findings and issued directives per change rather than accepting the audit's defaults.

## Options

- Accept the audit's minimum set as written, including the fake gh precondition patch and the cheap re-snapshot option A
- Implement under the user's four directives: delete the constant outright, purge tests that cannot fail for the reason the real system fails, design ship as a fixed ordered sequence with automatic PR stacking, and replace the fake GitHub with a live disposable repo
- Defer the ship work until a connectivity census lands first

## Outcome

Implement under the user's directives. (1) The hardcoded green constant is removed, not softened; any test that would pass unchanged on a build where the real system is broken for the reason its double papers over has zero value and is dropped or updated. (2) Ship becomes the most structured phase: a fixed, ordered, reliable command sequence, opening pull requests stacked automatically rather than manually on GitHub, with content composed only by the centralized pr-create tool, designed so a human can merge N stacked pull requests in order without conflict or manual retargeting. (3) The one-invocation decision is resolved on most-robust-plus-simple grounds and does not default to the cheap option; the loop-to-fixpoint option is admissible only if it is genuinely valuable without being fragile or complex. (4) No fake GitHub anything: the end-to-end proof runs against a real disposable repository created and cleaned up by the harness. The chapter 9 recommendations are recorded as successor tasks to follow these fixes, not folded into them.
