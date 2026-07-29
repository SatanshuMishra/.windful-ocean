---
Status: accepted
Date: 2026-07-29T18:08:13.236Z
Thread-Id: 01KYN9FH92YP5BPNG7ECCV9PJS
---

# 0102. The write window's crash-safety guarantee is a next-session audit-and-reseal, not the trap

## Context

0101 ratified chmod -R a-w with the refresh briefly restoring write, which leaves one sharp hole: a death between chmod -R u+w and the reseal leaves the install writable and the safeguard silently gone - the same silent-degradation class this thread has now recorded three times. A trap on EXIT HUP INT TERM closes the window on every ordinary exit path but CANNOT survive SIGKILL, which may include the harness's own hook-timeout kill (signal unverified). An independent design pass ranked refresh-by-replace (immutable snapshot trees plus atomic symlink swap) higher on crash-atomicity, but 0100 ratifies a persistent detached worktree and 0101 ratifies the narrow window; the records win. Design work for all four steps is complete and captured at docs/superpowers/specs/2026-07-29-install-pin-safeguards.md.

## Options

- Rely on the EXIT/signal trap alone - rejected, cannot survive SIGKILL, and its failure mode is silent
- Refresh-by-replace with atomic symlink swap - rejected, contradicts 0100's ratified persistent-worktree shape and churns worktree registrations next to ~12 live ones
- Trap plus an unconditional next-session window audit that reseals before anything else - chosen
- Periodic launchd audit to close the no-subsequent-session gap - deferred on simplicity grounds, recorded as a known residual

## Outcome

The trap is the fast path; the GUARANTEE is phase 1 of the next session's freshness check, which runs unconditionally before all else, probes for any writable entry under the install root, and on finding one with no live lock treats it as a crashed refresh: takes the lock, reseals, re-runs the cleanliness check and reports loudly (row I, exit 2). This imports refresh-by-replace's one essential property - a crash never yields a SILENTLY degraded state - without contradicting the ratified shape. Locking is mkdir-based in ~/.claude/state (outside the sealed root, outside any tracked tree, or it recreates the very bug step 1 removes), with liveness by kill -0 plus a 600s age cap and race-free stale claim by rename. Reseal happens BEFORE lock release inside one trap installed BEFORE the window opens, so no session can observe lock-free-and-writable. Two consequences recorded honestly: the chmod layer buys nothing against a deliberate same-uid actor - the hook proves this daily by chmod-ing the tree writable itself - it only turns every ACCIDENTAL write from any process into a loud EACCES; and the step-3 deny silently upgrades ask to deny for the ~/.claude symlink paths post-pin, because every entry then realpaths into the install root, making the everyday edit flow checkout, PR, merge, auto-refresh. Also surfaced: step 4 must write a ~/.claude/state/install-pin-applied marker, without which an absent install root cannot be distinguished between pre-pin (calm) and destroyed (catastrophic).
