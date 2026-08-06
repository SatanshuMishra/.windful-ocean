---
Status: accepted
Date: 2026-08-06T21:48:39.786Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0277. chore/config-drift is the stack root and the inert basis lands before SPEC A's units

## Context

Two execution-order facts were measured on 2026-08-06 and neither was known when 0274 and 0275 were written. FIRST, SPEC A does not exist on main. It lives only on chore/config-drift, which is unpushed (no origin/chore/config-drift), unmerged, and carries no open PR - the repository has zero open PRs. That branch also already deletes the Bash(ln -sfn:*) grant that SPEC section 3 names as the wrong form to be corrected, scopes the node permissions, and carries SPEC B. Meanwhile docs/invariants/registry.json requires every entry to cite a spec path, and feat/invariant-coverage-gate landed "cite the tracked spec path in every registry entry" - so an invariant entry citing SPEC A cannot be recorded while SPEC A is untracked. SECOND, the invariant tax is larger than 0274 or 0275 accounted for: registry.json declares 17 invariants (B1-B6, M1-M6, G1-G5) and scripts/invariant-coverage-check.mjs:392 fails any pull_request event that adds or modifies no file under docs/invariants/coverage/. At roughly seven PRs that is about 119 written verdicts, most of them about a vm sandbox that config-promotion work never touches. The checker ALREADY implements an inert basis - INERT_WHEN_FIELD, INERT_PATHS_FIELD, compileGlob and a basis field whose only allowed value pairs with not-threatened - but registry.json carries inert_when on zero of its 17 entries, so the machinery is live and unused. Closing that gap is exactly criterion c5 of the paused invariant-coverage-tax thread, which 0273 already ordered.

## Options

- Land chore/config-drift as the stack root PR, then land the registry inert basis, then base SPEC A's units on that. Makes SPEC A citable and cuts the per-PR verdict tax with a machine-checked basis before the tax is paid seven times.
- Cherry-pick only the two SPEC docs onto a docs-only branch as the stack root and leave the settings capture, .zshrc and sounds behind. Cleanest atomic PR, but defers the ln -sfn correction that SPEC section 3 requires.
- Base every unit on main and ignore chore/config-drift. Simplest stacking, but SPEC A stays untracked so no invariant entry can cite it, and the wrong ln -sfn grant survives in the repo copy.
- Pay the full 17-verdict tax on all seven PRs with no reordering. Honors the choice to resume SPEC A immediately and adds no machinery, at substantial token and time cost.
- Collapse SPEC A into three or four larger PRs to cut the number of coverage files. Reduces the tax without new machinery, but pushes diffs past the 200-400 LOC reviewable target.

## Outcome

Chosen by the user on 2026-08-06: option 1 for the base, and the inert basis lands before SPEC A's units.

The landing order is therefore chore/config-drift, then the registry inert basis, then SPEC A's units stacked per 0275's three bands. This inserts one unit ahead of SPEC A that belongs to a DIFFERENT thread - invariant-coverage-tax c5, ordered by 0273 - so that thread is worked briefly from here rather than resumed in full; its remaining criteria stay untouched and it stays paused.

This does not disturb 0271's ordering. 0271 orders SPEC A before any SPEC B unit; the inert basis is neither, it is invariant-coverage machinery that already exists in the checker and merely lacks registry data.

Two constraints the next session carries. Stacking is manual per 0274: node .claude/lib/git/pr.mjs pr-create --base <parent-branch>, and because deleteBranchOnMerge is false on this repository GitHub never auto-retargets, so each child is retargeted explicitly once its parent merges. And per 0265 a dependent chain merges with merge-commit while rules/common/git/branching.md:5 still states squash-on-merge as the unqualified default, so the divergence is named at merge time rather than resolved silently.

Note against 0274: its claim that the five preconditions parallelize cleanly was already falsified by 0275, and its assumption that SPEC A was available to implement from main is falsified here.
