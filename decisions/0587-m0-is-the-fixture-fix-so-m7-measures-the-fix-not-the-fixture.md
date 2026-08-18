---
Status: accepted
Date: 2026-08-18T19:49:34.132Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0587. M0 is the fixture-topology fix, so M7 sequences after it and measures the fix rather than the fixture

## Context

M7's non-vacuous boundary verdict is correct and its own tests are green, but it takes the suite from 3080 pass zero fail to 3063 pass 24 fail: the gate now correctly refuses the e2e substrate's first unit, because that unit's base branch already contains the unit's own commit. Its lead committed the work, refused to push and refused to open a pull request on knowingly-red work, then named three re-sequencing options and declined to choose. Separately M0 had measured the same defect from the opposite direction, and the M0 ruling had been issued without knowing about the 24.

## Options

- Merge M7 into M8a
- Move M8a ahead of M7
- Fix the e2e fixture topology as a new unit
- Recognise that the fixture-topology unit already exists and is M0, and sequence M7 after it

## Outcome

None of the three offered options survived. Merging M7 into M8a is CIRCULAR, because M8a builds on M7's non-vacuous verdict shape; moving M8a first puts it at roughly 490 added lines, over the ceiling; and the third option - a new fixture-topology unit - already exists and is M0. Nobody saw that because M0 was scoped as substrate isolation rather than as what it actually is: the fixture fix that makes every boundary comparison non-vacuous. That is now its stated purpose. SEQUENCE: M0 in wave 1, then M7 in wave 2 alongside M2 and M12b-1, then M8a in wave 4 keeping its M7 dependency. The interaction runs in M0's favour and the order exploits it - M7's refusal fires on the unit's base already containing its own commit, and M0 removes that precondition by freezing main and using sibling branches, so measuring M7 against the unfixed topology would measure the FIXTURE rather than the FIX. M7's committed work is rebased, never discarded, and an escape hatch is named in advance: residual failures needing production changes outside boundary-gate.mjs become a new M7b at that moment rather than being folded in. TREE IDENTITY REPLACES COMMIT IDENTITY: a commit sha gets both edges wrong in opposite directions, since two commits with identical trees are genuinely vacuous but read as comparable, while one commit with uncommitted changes reads as vacuous but is genuinely comparable - the gate compares content censuses, so the instrument is HEAD^{tree}. PROGRAMME-LEVEL RISK ADDED: every unit in this stack is fixing vacuity, so every unit risks reproducing vacuity inside its own fix. M7 is the measured proof - an implementer shipped green over six tests against a guard that could not fire, and only a real-IO test caught it. The inertness mutation in every ceiling is therefore necessary rather than ceremonial, and that real-IO test is single-homed and load-bearing, so every unit touching it must state in its receipt that it is untouched and passing.
