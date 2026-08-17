---
Status: accepted
Date: 2026-08-17T04:34:52.608Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0498. ci-fix is kept and wired, which makes ci-fact-extract a needed kind

## Context

c27 requires every prompt kind the flow needs to be reachable from the entry point on a real run, or explicitly retired with a recorded reason. Scoping found the registry holds thirteen kinds and zero are reachable. The user ruling excluding the fix pipeline clearly retires the fix kind, and the thread already records that. It does not by its terms reach ci-fix, whose owning loop is CI-to-green rather than the fix pipeline: the engine watching CI on a pull request it opened itself. The C7 inventory left ci-fact-extract as dispatch-it-or-retire-it, noting that dropping its two fields makes the CI loop escalate on every red run deliberately rather than by default.

## Options

- Retire ci-fix with a recorded reason, so a red CI run escalates to the human immediately
- Keep ci-fix and build a bounded CI-to-green loop as an additional MSP

## Outcome

The user ruled KEEP AND WIRE. The engine watches CI on its own pull requests and dispatches a bounded ci-fix on red. This resolves C7-T5 in the same stroke: ci-fact-extract becomes a NEEDED kind rather than a retirement candidate, because it is what feeds facts to the ci-fix dispatch. The stack therefore grows from fourteen MSPs to fifteen, with the CI-to-green loop landing last so it can reuse the end-to-end substrate built for c31. M14 now retires only the fix kind, leaving twelve live kinds. The loop stays read-only against GitHub apart from pushing commits to the engine's own branch; it never merges, and it is bounded so a persistently red run escalates rather than looping.
