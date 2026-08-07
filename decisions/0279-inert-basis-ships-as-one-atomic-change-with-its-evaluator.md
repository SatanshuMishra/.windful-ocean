---
Status: accepted
Date: 2026-08-07T05:43:13.191Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0279. The inert basis ships as one atomic change carrying its evaluator, never as registry data alone

## Context

0277 ordered the invariant inert basis to land before SPEC A's units, and an implementer was briefed on 2026-08-06 to add inert_when to docs/invariants/registry.json as DATA ONLY, explicitly forbidden from changing checker semantics. That briefing rested on a false premise. The premise came from grepping scripts/invariant-coverage-check.mjs in the WORKING TREE, which carries INERT_WHEN_FIELD, INERT_PATHS_FIELD, INERT_BARRED_IDS, INERT_BASIS and compileGlob, and reading that as committed code. It is not committed: git show main:scripts/invariant-coverage-check.mjs contains zero occurrences of INERT_WHEN_FIELD, and no branch carries them. The implementation exists only as uncommitted working-tree edits to that file and to .claude/lib/superpowers-parallel/tests/invariant-coverage-check.test.mjs. The delivered branch feat/invariant-inert-registry at 369490f is therefore self-consistent but inert in the wrong sense: it adds registry data that the committed checker never evaluates. CI stays green because the branch does not touch the checker, so the gate silently accepts the data without reading it. A further fact makes the working-tree edits themselves untrustworthy as-is: the tree was verified CLEAN at session start, so those edits appeared DURING the session and are unattributed - possibly the paused invariant-coverage-tax thread's c5 work, possibly the implementer editing the checker after being told not to.

## Options

- Ship checker and registry data as ONE atomic change, after reviewing the uncommitted checker edits on their merits and confirming their provenance. The basis is evaluated the moment it exists.
- Open the PR for feat/invariant-inert-registry as built, landing registry data now and the checker later. Rejected: it creates a window in which a PR can write basis inert rows that the committed checker accepts without evaluating any glob, which weakens the gate for every change in that window.
- Commit the working-tree checker edits as they stand to make the data live immediately. Rejected: the edits are unreviewed and unattributed, and they sit in the gate that guards every pull request in this repository, so committing them on an assumption is the precise failure this decision exists to prevent.
- Abandon the inert basis and pay the full seventeen-verdict tax on all seven SPEC A PRs. Rejected: it discards a correct branch and a checker implementation over a sequencing problem that costs one review to resolve.

## Outcome

Locked on 2026-08-06 after verifying the contradiction rather than accepting the implementer's report at face value. Option 1: the evaluator and the data land together, in one atomic change, and only after the uncommitted checker edits are reviewed and their provenance confirmed.

The governing principle is that a basis nothing evaluates is worse than no basis at all. An absent basis costs prose; a dormant one is a gate that reports a machine-checked verdict it never computed, and it degrades silently rather than failing loudly. That asymmetry is what makes shipping the data alone unacceptable even though it is green.

This does not disturb the 0277 landing order - inert basis, then chore/config-drift, then SPEC A's units. It changes only the CONTENT of the first unit, which is now checker plus registry data plus the coverage record, not registry data alone. feat/invariant-inert-registry at 369490f is retained rather than discarded: its glob sets, its barred-id analysis (M3, M4 and M5 assert how a change was made rather than where it landed, so path-disjointness can never prove them) and its coverage record are sound and were independently checked.

Two notes for whoever picks this up. The unattributed working-tree edits are reviewed on their merits and are NOT assumed to be the invariant-coverage-tax thread's c5 work merely because they resemble it. And a briefing premise drawn from a working-tree grep is re-derived against the committed tree before it constrains a subagent, which is the reading error that produced this decision.
