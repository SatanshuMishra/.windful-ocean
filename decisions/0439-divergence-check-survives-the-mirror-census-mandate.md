---
Status: accepted
Date: 2026-08-15T17:55:36.906Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0439. The mirror census MANDATE is retired while the divergence CHECK survives as G15's receipt

## Context

The apparatus removal had to separate two things that lived in one file. MIRROR_CENSUS carried a MANDATE - every new lib module appends a row, plus a STANDALONE class, 55 rows and a count tripwire - which was a per-MSP tax and a merge-conflict magnet on one literal. The same file also carries a divergence CHECK: it compares each .claude/lib/mitosis/*.mjs module against its inlined twin in .claude/workflows/mitosis.js, which is the path that actually executes since mitosis.js has zero imports. G15 is enforced agent-side and its required receipt is literally a test that goes red when one copy of a duplicated fact changes, so deleting the check would remove the artifact the gate demands rather than remove a home-grown mandate. The same question arose for workflow-sandbox-census.test.mjs, whose census is over the Node host global rather than over other verification code.

## Options

- Delete the whole mirror-guard file as apparatus, since the user asked for all four layers
- Keep MIRROR_CENSUS intact because it has caught real drift
- Retire the mandate and keep the divergence check, proven live - chosen

## Outcome

The row-per-module rule, the STANDALONE class, the 55 rows and the count tripwire are gone. The divergence check survives with 28 twin rows, proven live by appending an export to window.mjs (red) and reverting (green). prompt-divergence.test.mjs and the phase-parity verb survive on the same G15 grounds, and exec-allowlist survives as a real deny-by-default spawn-policy control with only its specimen-census sub-check removed. workflow-sandbox-census.test.mjs was assessed and kept: it holds the only assertions that bare constructor and __proto__ cannot reach host process, and its census is over an external surface, not over another census. Residual exposure, stated in PR #112 and carried as a risk: with the mandate gone a module newly inlined into mitosis.js gets no row automatically and is unchecked, so twins can drift only where NEW duplication is introduced. Existing twins remain checked. A live G15 hazard was found and deliberately not fixed in a removal pass - workflow-sandbox-census.test.mjs carries a hand-rolled maskLiterals duplicating js-scan.mjs's masker.
