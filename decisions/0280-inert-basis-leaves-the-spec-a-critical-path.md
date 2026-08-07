---
Status: accepted
Date: 2026-08-07T15:31:19.825Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0280. The inert basis leaves this phase's critical path; it buys SPEC A's PRs nothing and is under an open BLOCK

## Context

0279 ordered the inert basis to ship as one atomic change carrying its evaluator, after reviewing the uncommitted checker edits and confirming their provenance. Both preconditions were then measured on 2026-08-07. PROVENANCE IS CONFIRMED, not assumed by resemblance as 0279 warned against: the working-tree edits to scripts/invariant-coverage-check.mjs and its test are byte-identical to artifacts/2026-08-06-c5-checker-mechanism.patch - a zero-line diff between the two, identical numstat - so they are the invariant-coverage-tax thread's c5 mechanism, deliberately produced and archived, not an implementer editing the checker after being told not to. THE MERITS REVIEW IS ALREADY WRITTEN AND IT IS A BLOCK. artifacts/2026-08-06-inert-glob-audit-BLOCK.md, authored after the patch and after 0278, states "Do not ship this data": the hand-authored glob sets at 369490f are unsound in both directions, and 8 of the 17 rows in feat-invariant-inert-registry.json become factually wrong once the checker joins the same branch. 0278 (accepted, on the invariant-coverage-tax thread, six hours before 0279) requires the declarable KIND to be enforced in the checker and the sets re-derived from that rule, deleting inert_when from G1-G5 and narrowing B1-B6 to docs/security/bash-gate-threat-model.md plus docs/invariants/coverage/*.json. THE ARITHMETIC THAT 0277 RESTED ON IS NOW VOID. A PR is inert only when EVERY changed path matches a declared glob. Under 0278's narrowing every SPEC A unit touches .sh, .mjs, .gitignore or settings.json, so not one of the seven PRs can ever be inert. The verdict-tax reduction that 0277 gave as the reason to land the basis before SPEC A's units is exactly zero for this phase.

## Options

- Defer the inert basis to the invariant-coverage-tax thread, park feat/invariant-inert-registry with no PR, and ship this phase paying prose coverage on all 17 ids per PR - ADOPTED
- Build 0278's checker kind rule now, re-derive the sets, rewrite the 8 wrong coverage rows and ship it as unit 1 as 0279's landing order implies. Rejected: it is a foreign thread's blocked work on this phase's critical path, and it returns zero verdicts to the seven PRs that would wait for it
- Open the PR for feat/invariant-inert-registry as built. Rejected outright by 0279 and by the BLOCK audit - it lands data the committed checker never evaluates
- Narrow the globs by hand and ship. Rejected by 0278 already: hand authorship is the demonstrated failure mode and a second hand pass has no reason to succeed where the first failed under review by two agents

## Outcome

Chosen on 2026-08-07 before dispatching the phase workflow. The inert basis leaves this phase's critical path and returns to the invariant-coverage-tax thread, where 0278's kind rule is the actual next move. feat/invariant-inert-registry stays at 369490f, pushed to origin but with NO pull request opened.

This honors 0279 rather than reversing it. 0279 forbids shipping the registry data alone; it does not compel shipping the basis now. Parking the branch with no PR satisfies the prohibition exactly, and the atomicity requirement - evaluator and data land together - still binds whenever that work resumes.

What it does revise is 0277's landing order, and only the middle item. The order becomes chore/config-drift, then SPEC A's units per 0275's three bands. 0277 inserted the inert basis between them for one stated reason, to cut the per-PR verdict tax before it was paid seven times; 0278's narrowing reduces that cut to nothing for these particular PRs, so the item no longer earns its place in the sequence. The cost accepted in exchange is the full seventeen-verdict prose tax on every PR in this stack, which is 0277's own fourth option and is now the cheaper path rather than the more expensive one.

The uncommitted working-tree edits stay uncommitted and stay in the tree. They are the c5 mechanism, they are sound per the audit's own carve-out - the audit states the checker mechanism itself is not implicated - and they belong beside the change that adds the kind rule. They are also preserved independently at artifacts/2026-08-06-c5-checker-mechanism.patch, so the tree copy is recoverable rather than load-bearing.

One lesson repeats from 0279 and is worth naming: 0279's own briefing premise, that the checker edits still needed a merits review, was already answered by an artifact written four hours earlier on a different thread. A decision that reaches across threads must read that thread's artifacts, not only its decision records.
