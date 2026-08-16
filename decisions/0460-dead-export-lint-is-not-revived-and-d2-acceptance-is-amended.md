---
Status: accepted
Date: 2026-08-16T06:23:23.511Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0460. dead-export-lint is not revived; D2's acceptance is amended by a G0 ceiling document

## Context

D2's acceptance at SPEC :555 requires "dead-export-lint is green". The lint does not exist in this tree. It was deliberately retired at commit 80de7fa9 on 2026-08-15, an ancestor of base c067cfce, with the commit body stating it "is a project-local verification mandate over the codebase, mapping to no receipts gate, and the pinned count is the change-detector testing.md forbids". The SPEC is dated 2026-08-12 and named the lint three days before the repository removed it on principle. The SPEC mentions the string exactly once, with no definition, sketch, behavior description or rationale anywhere. The lint's documented history is: proposed 2026-07-17 as a caller-count check against mitosis.js, found unable to detect a real dead symbol 2026-07-28, found to pass vacuously 2026-07-30, rewritten 2026-07-31, retired 2026-08-15. Separately the SPEC's own admission gate at :28 is unmet for D2: line count drifted 5,515 to 5,762, test counts 35 to 160, and CI_ENFORCER_CHECK_TOKENS 2264 to 2500. The concern behind the lint is nonetheless real: deleting mitosis.js orphans lintCoarseScope, a tested lib check whose only production caller is mitosis.js:4478.

## Options

- Write dead-export-lint so :555 can be satisfied literally
- Strike only the dead-export-lint clause and leave D2's other acceptance clauses as written
- Amend D2's acceptance through a G0 ceiling document following the C7 precedent, replacing the retired lint with a bounded closed check

## Outcome

Amend through a G0 ceiling document, .claude/docs/specs/2026-08-16-d2-scope-and-ceiling.md, following the precedent of 2026-08-15-c7-scope-and-ceiling.md. The dead-export-lint clause is struck: reviving it would reverse decision 0438 and criterion c17, both already merged to main, and would violate the closed-set rule in receipts.md that an agent may propose a gap but never promote a finding into a project-local verification mandate. The concern is discharged instead by a CLOSED enumeration over the modules mitosis.js imports or inlines, asserting no lib export whose sole caller is mitosis.js is left without one. That is bounded and halts on the unclassifiable, where the retired lint was a pinned count over a whole-tree sweep. The ceiling document also corrects the four drifted SPEC citations and is authoritative for D2 over the SPEC.
