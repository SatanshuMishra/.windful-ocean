---
Status: accepted
Date: 2026-07-28T19:30:27.502Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0076. The invoker is one idempotent command with three callers; the out-of-process alternative is closed, not deferred

## Context

0069 ruled the advance is a command rather than a resident watcher, leaving open only who invokes it. Research priced the alternatives. A forge-side workflow invoker would buy overnight CI wall-clock but costs a credential, an idempotency contract, a conflict-park path, and - decisively - it converts the PR-format gate from something the agent cannot bypass into a voluntary convention, because the local deny-list and PreToolUse hook are harness features that a cloud runner never sees. Meanwhile every local push mechanism needs a resident process, which is exactly what 0069 deleted. And the merge is already durably recorded by the forge, so any later invocation learns everything an immediate one would: the alternative buys promptness, not knowledge and not correctness.

## Options

- Three in-process callers only: the engine loop, the session agent, and any later relaunch
- Add an out-of-process forge-side invoker now
- Keep an out-of-process invoker as a deferred future option
- Local webhook tunnel to a resident process on the machine

## Outcome

Three callers, and that set is COMPLETE AND CLOSED. Recorded as spec 3.6 with the three properties that make it sufficient: idempotence (an over-eager caller is harmless, a late caller is still correct), no waiting state (merges are picked up at loop iteration boundaries because every iteration re-reads facts), and liveness never assumed (quiescence is reported with status, waitingOn, and the exact relaunch argv). User ruled explicitly that the out-of-process alternative is removed from consideration entirely - NOT deferred, NOT mentioned as future work - so the spec contains no reference to it in any section including the pre-mortem. The residual cost is stated plainly instead of engineered around: a quiescent run advances when a human next acts, which is wall-clock only, and M5 must instrument that latency rather than assume it.
