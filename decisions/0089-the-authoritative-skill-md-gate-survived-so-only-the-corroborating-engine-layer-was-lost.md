---
Status: accepted
Date: 2026-07-28T20:16:18.033Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0089. Only the corroborating engine layer was lost; the authoritative SKILL.md gate survived intact

## Context

0083 characterized the severed preflight as the check running nowhere, and the spine carried the consequence that a real run would never invoke the preflight. Verifying the fix required reading what else PR #5 installed, because c59ca79 touched .claude/skills/mitosis/SKILL.md (+19 lines) as well as the engine. Per 0026 the design is deliberately two-layer: the AUTHORITATIVE gate is the main thread running merge-boundary-preflight.mjs from a fixed absolute path in real process space and gating on its exit code, while the engine's reconcile-stage re-run is corroborating defense in depth reported by a subagent. Reading origin/main:.claude/skills/mitosis/SKILL.md shows the whole authoritative layer present and untouched by 7e2e7d7: the precondition at :14, the 'Prove the merge boundary' section at :33, the absolute gate path at :37, the never-delegate-it instruction, the four inline environment variables, 'ANY non-zero exit means the merge boundary is NOT in place' at :45, and 'Dispatch ONLY if the merge-boundary preflight exited 0' at :51.

## Options

- Leave 0083's severity as written and treat the boundary as wholly unguarded
- Record that only the corroborating layer was lost and state plainly what remains
- Treat the surviving instructional gate as sufficient and drop the engine restoration

## Outcome

QUALIFIES 0083 without superseding it: every engine-side fact 0083 measured is confirmed, but the blast radius is narrower than the spine implied. The bad merge deleted ONLY the corroborating engine layer; the authoritative main-thread gate in SKILL.md survives whole on origin/main. So a real run does still invoke the preflight, at the authoritative layer, and Build A was never wholly unguarded. What was lost is defense in depth: the deterministic engine-side backstop against a main thread that skips, fumbles, or is talked out of the SKILL.md instruction, plus the cross-checks that the attested repository, base branch and invocation path match the run's real target. That is a real and worth-fixing regression, since the surviving layer is INSTRUCTIONAL text an agent must choose to follow while the deleted one was a code path that halts. It is not, however, the total absence of a boundary check. The restoration is therefore still required for criterion 3, and this record exists so a future session does not overstate the exposure window that ran between 2026-07-27 22:43 and the fix.
