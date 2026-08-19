---
Status: accepted
Date: 2026-08-19T02:57:28.153Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0617. Every remaining unit branches off main and merges to main; the stacked-PR topology is retired

## Context

Verified against origin/main by content, not by SHA ancestry: unit-state.mjs is present and the progress lattice is referenced in run-log.mjs, so waves 1 through 3 have genuinely landed on the trunk. The stacked topology existed only because those units were shipping onto an unmerged base, feat/mitosis-os-process. With the base content on main, the reason for stacking is gone. Stacking has been expensive here in a way that is now measurable: six pull requests merged into dead bases in one evening and had to be reopened as 232 through 237, because GitHub retargets a child only when its base branch is DELETED. The enforcer also diffs two-dot from base.sha, so a green child turns red through no fault of its own whenever its parent branch moves, forcing CI re-runs that carry no information.

## Options

- Keep the stacked topology on feat/mitosis-os-process for the remaining units
- Branch every remaining unit off main and merge each to main directly

## Outcome

Every remaining unit branches off origin/main and merges to origin/main. No stacked bases, no restacking, no base-deletion ordering, and no re-running a child's CI because a parent moved - that entire failure class is structurally unreachable. Serialization now comes only from real file overlap, per the design's fan-out map, which is the only thing that ever justified it. The two surviving base branches on origin, feat/mitosis-os-process and feat/mitosis-append-only-journal, are retired as bases; they are not deleted while M8a is still in flight against the journal base, and M8a is retargeted to main before any branch deletion. Proof of arrival stays content-based: assert the content is on the trunk, never infer it from a MERGED label or a pre-merge SHA, since a squash rewrites commits and correctly fails an ancestry check on a merge that lost nothing.
