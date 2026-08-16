---
Status: accepted
Date: 2026-08-16T17:59:07.160Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0473. One real engine run precedes the c7 ruling, rather than ruling the merge on an unevaluable falsifier

## Context

c6 closed as a tracked unverified-reasoned downgrade under 0466 and c7 is the only criterion left open. The base feat/mitosis-os-process sits at 2b9e8f0c, 291 commits ahead of main with main fully folded in, 211 files and +31400/-16124 against main, and no open pull requests. The release gate at SPEC :567 admits a merge to main only if D3 clears the 10-dispatch-per-shipped-MSP falsifier, and D3 returned UNEVALUABLE because no .mitosis run directory has ever existed anywhere in the repository, so the ratio has no denominator. The gate's text covers cleared and falsified and not this. One fact discovered while framing the ruling is load-bearing and was not visible from the briefing: .claude/workflows/mitosis.js, the legacy engine, still exists on origin/main and is deleted only on the base, so a genuine pre-move versus post-move comparison remains physically possible until the merge and becomes permanently unmeasurable the moment it lands. D3 had already disqualified the written 2026-07-17 baseline as a code-read cost model rather than a billing export, which leaves the live legacy engine as the only remaining source for that arm of c6.

## Options

- Rule that unevaluable permits the merge, amend c7 to say so, and file the first engine run as a new item
- Commission one real engine run against the now-wired envelope from a worktree on the base, then rule c7 on evidence
- Commission that run plus a paired legacy-engine run from main, capturing the pre-move baseline before the merge deletes it
- Hold c7 open and take no action on the base this session

## Outcome

One real engine run is commissioned before c7 is ruled. The gate is answered by evidence rather than by a ruling over an absent denominator, which is the one thing 0466 named as making c6 genuinely closable. The merge to main is deferred until that run exists, which as a side effect keeps the pre-move baseline recoverable: the paired legacy run of the declined third option stays available for as long as the base is unmerged, so choosing this path forecloses nothing. The run must target a unit unrelated to this stack, because 0378 prohibits mitosis as the engine of its own replacement, and it must be executed from a worktree rather than the primary checkout, because ~/.claude rules, CLAUDE.md and skills are symlinks into that working tree. Its cost figures carry the fixed quality assertion D3 declared, the per-MSP CI check matrix, so that a token win hiding a quality regression cannot read as a success. Ruling that unevaluable permits the merge was rejected as answering an evidence question by fiat while permanently destroying the only remaining route to the baseline.
