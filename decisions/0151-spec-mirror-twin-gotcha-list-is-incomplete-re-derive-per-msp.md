---
Status: accepted
Date: 2026-07-31T16:56:25.947Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0151. The spec's mirror-twin gotcha list is incomplete; every MSP re-derives its own twin set

## Context

Spec section 10 carries a "structural gotcha that affects M3, M4, and M7", naming the window block and planReconcile as the inlined lib copies policed by the byte-identity mirror guard. M0 is not in that list. While preparing M0's dispatch the target symbol was checked anyway: applyBuiltTransition is defined BOTH at .claude/lib/superpowers-parallel/recovery.mjs:170 and inline at .claude/workflows/mitosis.js:509, and mirror-guard.test.mjs:19 lists 'recovery.mjs' among 21 twins it asserts byte-identical minus export/import. A one-sided edit would have failed the guard. The implementer confirmed by execution that the guard asserts whole-file containment, so the failure would have been certain rather than probable.

## Options

- Trust spec section 10's gotcha list, which names M3, M4 and M7 as the mirror-affected MSPs
- Treat that list as unreliable and re-derive the twin set per MSP against mirror-guard.test.mjs
- Rewrite section 10's gotcha list to be exhaustive as a standalone effort

## Outcome

Section 10's gotcha list is treated as INCOMPLETE, not authoritative, and every remaining MSP re-derives its own twin set before editing: grep the target symbol against the 21-entry twin list at mirror-guard.test.mjs:19, and if it appears in any listed .mjs, the edit lands in both copies in the same commit. This is the 0137/0144/0145 hand-enumeration failure class recurring inside a spec that is otherwise accurate at its own baseline, which is precisely why 0148 refused to trust hand lists over execution. Declined to rewrite the list as a standalone effort, on the same reasoning 0148 used to refuse rewriting the 78 anchors: a hand-corrected enumeration would reintroduce the defect it repairs. The check is cheap, mechanical and per-MSP, so it belongs at the point of use.
