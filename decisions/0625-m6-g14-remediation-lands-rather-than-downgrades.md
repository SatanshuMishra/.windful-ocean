---
Status: accepted
Date: 2026-08-19T19:34:08.165Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0625. M6's G14 remediation lands as its own pull request rather than a downgrade

## Context

M6 shipped as PR 245 and the human merged it at 18:34:47Z over a red receipts check. That check was a real 137s run whose G14 verdict was "6/12 mutant(s) SURVIVED" at merge-policy.mjs:50,:51,:52, all inside describeValue, new code in M6's own diff. The lead had already killed all six locally and pushed the fix as 97372c74 at 18:35:40Z, 53 seconds after the merge. A merged PR's head never advances, so that commit reached origin but never reached main and no CI run could ever see it. The lead returned unverified-reasoned and asked whether to open a second PR.

## Options

- Accept the unverified-reasoned downgrade and move on, honoring one-PR-per-unit
- Land 97372c74 as a fresh branch off main and a second PR for the same unit
- Fold the assertions into a later unit that touches merge-policy.mjs

## Outcome

Land it. A gate that CAN be cleared is cleared, never downgraded, and this is M6's own receipt strength rather than a new unit or a widened ceiling, so the one-PR-per-unit convention yields. Shipped as PR 246 off a fresh branch, 73 added lines across two test files, byte-identical to 97372c74, each of the six mutants re-killed with a quoted AssertionError and the test count held at 63 to prove the kills were not parse failures. A structural finding survives and is filed: the receipts enforcer short-circuits test-only diffs with "no production source changed - nothing to re-verify", so the gate that demands stronger assertions can never referee the assertions that satisfy it. The G14 verdict on a head carrying them stays unverified-reasoned for that reason alone, and only a future PR touching merge-policy.mjs alongside production source will re-draw it.
