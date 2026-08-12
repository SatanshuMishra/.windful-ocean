---
Status: accepted
Date: 2026-08-12T06:08:32.662Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0371. MSP means independently reviewable and green, not independently usable; the stack releases as one

## Context

Four cutover seams were offered for the re-architecture (strangler by phase, strangler by effector class, un-twin then big-bang, parallel engine behind a flag). The user rejected the premise behind all four: MSP is ONLY for shipping, and nothing is RELEASED until the mitosis engine changes are fully completed - PRs are stacked and opened, not merged, or merged but not released. This resolves the tension that forced a strangler: the green-branch invariant applies to the stack's own base branch, not to end-to-end engine capability at every commit.

## Options

- Strangler seam keeping both engines usable at every step - rejected: requires seam adapters and risks the two drifting
- Clean bottom-up rebuild as a stack of PRs on a dedicated base branch, released as one - chosen
- Parallel engine behind a flag - rejected: doubles maintenance until the flip

## Outcome

The work is a clean bottom-up rebuild on base branch feat/mitosis-os-process. Each MSP is a PR stacked on the previous. Per-MSP green is defined as node --test passes, lints pass, and the new gate verbs pass - NOT that the engine runs a spec end-to-end. End-to-end capability is deliberately absent from A1 through C6 and returns at C7; the SPEC must state this so no reviewer treats its absence as a regression. The release gate is explicit: the base branch merges to main only after D2 lands and D3's measured comparison clears its falsifier. A consequence worth naming: the old engine dies by deletion, not incremental refactor, so the 2,932 lines of inlined twins are not a refactoring target and Part III's generator and byte-identity proof become unnecessary rather than unmooted.
