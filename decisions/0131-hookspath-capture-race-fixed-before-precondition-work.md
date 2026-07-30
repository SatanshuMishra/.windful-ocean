---
Status: accepted
Date: 2026-07-30T16:41:01.088Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0131. The hooksPath capture race is fixed before any precondition work in the next session, with fail-loud left as an open sub-decision carrying a bootstrap trap

## Context

PR 15 merged to main as 12053dc, so MSP-0 is landed and step 6 is at its re-plan point. The user directed that resolving the pre-commit hook issue be added to the next session's scope, and separately ruled that the rebuild spec branch sitting without a pull request is fine and no longer an open item. The defect: the session-continuity plugin repoints core.hooksPath at its own managed githooks dir and stores the previous value in continuity.priorHooksPath; its managed pre-commit is a chaining shim that exits 0 when the resolved prior path equals its own managed dir. It CAN capture its own dir as that prior value, in which case the shim self-references, exits 0, and .githooks/pre-commit - the full 1612-test npm suite - never runs. Observed dead at session start on 2026-07-30 and self-healed twice within the same session; config oscillated across three states while priorHooksPath stayed correct for the last two, so the misfire is conditional, not per-session. Currently HEALTHY with prior=.githooks: latent, not broken.

## Options

- Fold it into the continuity-plugin thread whose subject it properly is
- Fix it first in the next session before any precondition work
- Leave it to the user-started chip session to resolve independently
- Defer it as latent since the config is healthy right now

## Outcome

FIXED FIRST in the next session, ahead of choosing or funding any precondition. The ordering is not arbitrary: the pre-commit suite is the only automatic gate on this repo, and this repo IS the live global Claude config (~/.claude symlinks into it), so a commit landing unguarded here degrades every project on the machine. A gate that can silently disappear is a gate on the work, not a task parallel to it. Deferring on "it is healthy right now" is exactly the reasoning that lets an intermittent fault ship - it already fired once this session. NOTED but overridden: its natural home is the continuity-plugin-realworld-test thread; it is carried here because the user scoped it here and this thread's next session is the one that will commit. Scope, three parts. (1) Close task_70509bf0, started against the now-stale premise that the gate is dead, folding it into task_21df6527. (2) Make the capture logic incapable of recording a managed dir as priorHooksPath and incapable of overwriting an already-good value. (3) Resolve the fail-loud question. THE OPEN SUB-DECISION, stated so the next session need not rediscover it: 6d19499 set a fail-loud precedent in this repo, and a silently skipped suite is worse than a blocked commit - but making the shim exit non-zero on self-reference creates a BOOTSTRAP TRAP, blocking the very commit that would fix the config. Candidates are hard-fail with a documented --no-verify escape, or exit 0 with a prominent stderr warning that makes the skip observable. That trade is the decision to make; it is not pre-decided here. Verify by reproduction, not inspection: recreate the self-referencing state, confirm the gate no longer silently passes, then restore.
