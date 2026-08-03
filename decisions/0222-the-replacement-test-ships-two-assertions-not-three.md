---
Status: accepted
Date: 2026-08-03T17:01:00.679Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0222. The replacement test ships two assertions, not three, because the hook property was already covered

## Context

0220 sized the replacement at roughly fifteen lines asserting three things: mitosis.js carries no merge invocation, the three merge entries are present in permissions.deny, and the hook still matches the merge patterns. The user separately closed ask (a) by folding the replacement into the deletion PR as one MSP, so the test had to land in the same change rather than a follow-up. On inspecting the baseline suite output before dispatching, the runner was already emitting a family of tests named 'denies merge form: gh pr merge --squash 12', 'denies merge form: gh api --method PUT repos/o/r/pulls/1/merge' and similar, which suggested the third assertion was already paid for. The project's test admission gate forbids duplicating existing coverage: where a similar test exists it is updated or replaced, never parallelled.

## Options

- Ship all three assertions as 0220 specified - faithful to the decision's letter, but knowingly duplicates existing coverage and inflates the apparent strength of the new test
- Ship only the genuinely uncovered assertions and cite the existing coverage for the third - honours the admission gate, at the cost of visibly under-delivering against 0220's stated size
- Ship three and delete the pre-existing hook tests so coverage lives in one place - consolidates, but discards 15 thorough variations in a change whose subject is not the hook

## Outcome

TWO ASSERTIONS. The third was dropped as already covered: .claude/hooks/tests/block-destructive-bash.test.mjs:19-44 runs 15 merge-deny variations against the hook - case variants, backslash continuations, absolute binary paths, -X PUT and bare REST forms, and both GraphQL mutations - independently verified as thorough by the security review. Restating it would have been pure duplication. The test also found an existing home rather than a new file: no-self-merge-consent.test.mjs already asserted a static no-merge invariant on mitosis.js by reading it as text, which is the same shape and the same subject. Each shipped assertion was proven falsifiable against scratch copies before landing. Standing consequence: 0220's fifteen-line estimate was an upper bound written before the existing coverage was surveyed, and the delivered six lines are the honest figure - a smaller replacement is the correct outcome when the gate is applied, not a shortfall. Both reviewers subsequently found the two shipped assertions OVERCLAIM in other ways (file scope and raw-source grep), which is tracked as open risk rather than reopening this decision.
