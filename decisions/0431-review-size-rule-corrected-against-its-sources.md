---
Status: accepted
Date: 2026-08-14T23:48:01.667Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0431. The 200-400 review-size rule is tightened and one of its three citations retired

## Context

The orchestrator was told MSP size is the structural cost lever and that PORT and C7 should be split harder for speed. Two commissioned studies falsified the load-bearing half. Measuring all seven shipped MSPs: at n=7 the only relationship reaching p&lt;0.05 is stack position, not size, and size, position and gate-verb count are collinear at rho 0.857 and inseparable. Review is a FLAT cost - the review gap runs 34 to 54 minutes while size varies 9.6x, correlating at rho -0.252 - and is the largest single phase at 46.4% of measured time. Separately, the rule at rules/common/git/commits.md:19 cited three sources for "200-400 LOC, review effectiveness drops sharply", and checking them against primary texts found the SmartBear/Cisco breakpoint is ~200-250 with the 300-400 half an explicit hedged inference from reviewer fatigue, Google's own guidance is ~100 lines (stricter than the rule it was cited to support), and DORA measures delivery performance and makes no review-defect claim at all.

## Options

- Tighten to ~200 LOC with 400 as a hard ceiling, characterize the SmartBear study honestly, add Rigby and Bird 2013, and retire the DORA citation
- Leave the rule as written since the direction is right even if the number is weakly sourced
- Delete the numeric target entirely and keep only the qualitative small-diffs instruction

## Outcome

Tighten and re-cite, ruled by the user, shipped as PR #109 on branch docs/commits-review-size. The rewrite carries inline URLs for all four sources, adds Rigby and Bird ESEC/FSE 2013 (peer-reviewed, multi-organization, measured medians 11-44 lines), and states that DORA is not evidence for this rule. Edited through a worktree, never in place: ~/.claude/rules is a symlink into the primary checkout on main, so a direct edit would both commit to the default branch and rewrite the live rules mid-session. Two consequences to carry. First, the corrected rule is STRICTER, and the shipped MSPs at 2679-3764 insertions sit 13-19x above the new target. Second, combining the two studies, splitting an MSP does not divide review cost but multiplies it, since review is flat per MSP - so smaller MSPs are a QUALITY choice that costs wall-clock, never a speed optimization. The advice that PORT and C7 should be split harder for speed is retired as unsupported.
