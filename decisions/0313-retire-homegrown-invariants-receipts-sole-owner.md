---
Status: accepted
Date: 2026-08-10T05:34:07.876Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0313. The homegrown invariant system is retired whole and the receipts plugin becomes the only owner of invariant checking

## Context

Seven rounds went into the invariant machinery and it never converged. Three consecutive review rounds returned BLOCK on the cutover unit. The round-6 census admission gate, built to implement 0304's two clauses, was reported by its own review pass to contain a demonstrated live false exclude: gh-merge-shim.mjs:171 emits a kind discriminant through a ternary so only 'file' registers as a member, while :178 branches on 'stdin', so the gate excluded a genuinely-branched vocabulary while printing a plausible reason. That finding is as reported by the review subagent and was not independently verified before this reversal, because the reversal does not depend on it.

What it demonstrates is decisive regardless: 0301's green-signal-measuring-the-wrong-thing defect reappeared inside the very tool built to detect it, and the repo's own doctrine requires a classifying census to halt on the unclassifiable rather than exclude it. This matches the standing observation that five prior fix rounds each introduced a new defect on a path nobody had named.

The user's directive is to stop, retire the system whole, and redesign the invariants individually in a dedicated future thread rather than continue patching a design that keeps failing in the same shape.

## Options

- Retire the whole homegrown invariant system and make the receipts plugin the sole owner of invariant checking - ADOPTED, per explicit user directive
- Fix the census false-exclude and continue round 6 - rejected, six rounds each closed one finding and opened another, and the failure has now recurred inside the tool built to prevent it
- Keep the registry present but inert with CI still wired - rejected, invariant-coverage-check treats an empty coverage directory as a hard failure, and a half-live system is precisely the drift surface the exercise existed to remove
- Delete everything with no recovery path - rejected, a dedicated redesign thread is planned and needs the prior art
- Strike criterion c10's independent-review gate along with the machinery - rejected, c10 is the safety gate standing in front of a live config cutover and is needed more now, not less

## Outcome

All homegrown invariant machinery leaves the repo: docs/invariants/ (registry and coverage receipts), the scripts/invariant-*.mjs family, every CI gate that invokes them, and every invariant-only test. Removal targets origin/main and not merely the unmerged branch, because most of the machinery is already merged; leaving it on main would keep a broken gate enforcing.

The receipts plugin's Gates skill becomes the only authority for invariant and fix-verification checking until a redesign lands.

Two things are deliberately KEPT. First, the three retired invariant sentences relocated into rules/common/testing.md and commits.md last session stay as ordinary prose rules: they are guidance, not machinery, and 0312's relocation was already their chosen disposition. Second, criterion c10's independent-review gate survives the teardown, since the next action is a cutover that rewrites live config under running sessions and that is the wrong moment to drop a review gate.

Recovery path is git history plus the out-of-repo artifacts directory, both untouched. The redesign is per-invariant, in its own thread, and nothing partial stays wired in the meantime.
