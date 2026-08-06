---
Status: accepted
Date: 2026-08-06T21:17:49.921Z
Thread-Id: 01KZC5TSBXJDM28F8ZCRXC9JQM
---

# 0274. SPEC A is implemented and shipped by a dedicated small dynamic workflow, with stacked PRs for blocking changes

## Context

SPEC B was approved on 2026-08-06, closing the re-spec thread at 6 of 6, and the user directed that a FRESH session dispatch a dedicated small dynamic workflow to fully implement and ship SPEC A, using stacked PRs where changes block each other. Four facts constrain how that instruction can be executed. First, SPEC A section 7 states the cutover is itself a hot swap and must run in a session doing nothing else: its units write into .claude/hooks, .claude/lib and .claude/workflows, all live-linked through 37 symlinks today, so a half-saved hook breaks every running session instantly including the one doing the work. Second, SPEC A's five preconditions in section 7 are genuinely independent of one another - closing the 64-file coverage gap, narrowing the unanchored *session* pattern at .gitignore:19, relocating graphify output out of hooks/ and rules/, adopting rules/context7.md, and placing the bootstrap outside releases/ - so they parallelize cleanly while the cutover does not. Third, the engine has NO stacked-PR machinery: merge-policy.mjs:15-17 returns HUMAN_GATED unconditionally, every PR opens with base = baseBranch at mitosis.js:5338, and pr.mjs:30 carries only pr-create, pr-close and compare. SPEC B Part IV designs that machinery but it is not built, and 0271 orders SPEC A to land BEFORE any SPEC B unit. Fourth, pr.mjs pr-create already accepts --base, so the decade-old stacking CONVENTION is available manually today even though the product path and the engine path are not.

## Options

- Dispatch one small dynamic workflow that parallelizes SPEC A's five independent preconditions and then runs the cutover as a single serial step, opening stacked PRs manually via pr.mjs pr-create --base <parent-branch> where a change blocks another.
- Dispatch a workflow across the whole of SPEC A including the cutover, letting subagents edit live-linked config concurrently. Fastest, but it is precisely the hot-swap hazard SPEC A exists to remove, and it can break the session running the workflow.
- Implement SPEC A sequentially in the main session with no workflow. Safest against the hot swap, but the user explicitly asked for a workflow and the five preconditions are genuinely independent, so it forfeits real parallelism for no correctness gain on the parts that are safe to parallelize.
- Build SPEC B Part IV's stacked-PR machinery first so the engine can stack natively, then implement SPEC A through it. Rejected as circular: 0271 orders SPEC A to land before any SPEC B unit, precisely because SPEC B's units rewrite the live-linked surfaces SPEC A exists to make safe.

## Outcome

Approved by the user on 2026-08-06: a fresh session dispatches a dedicated SMALL dynamic workflow to fully implement and ship SPEC A, using stacked PRs for blocking changes.

Executed as option 1, which is the only reading that satisfies the instruction without contradicting SPEC A's own safety section. The split is the point: the five preconditions in section 7 are independent and parallelize, while the cutover is serial, alone, and last. A workflow that fans out across the cutover would hot-swap the engine and its guard hooks underneath the session running the workflow, which is the exact hazard 0269 and SPEC A exist to remove.

Three consequences the next session carries. First, stacking is MANUAL and uses the convention, not the engine and not the gh-stack preview product: open a blocked child with node .claude/lib/git/pr.mjs pr-create --base <parent-branch>, since pr.mjs already accepts --base and the engine has no stacking. Second, deleteBranchOnMerge is false on this repository so GitHub's auto-retarget never fires, and each child must be retargeted explicitly once its parent merges; gh pr edit --base passes the bash gate today, which is exactly the accidental route around PR centralization that SPEC B section 5.5 closes with a pr-retarget verb. Third, per 0265 a dependent chain merges with merge-commit while rules/common/git/branching.md:5 still states squash-on-merge as the unqualified integration default, and SPEC B section 5.6 deliberately ships that amendment with Part IV rather than earlier - so a stacked chain landed for SPEC A runs ahead of its governing rule and the divergence must be named at merge time rather than resolved silently.
