---
Status: accepted
Date: 2026-07-26T21:49:08.012Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0017. 0012's deterministic restack is BUILT as a mitosis-git.mjs verb; mitosis.js has no exec primitive and never could run git

## Context

0012 locked "BUILD the deterministic driver in-engine" with the algorithm `git rebase --onto MERGE_SHA CHECKPOINT BRANCH`, conflicts read from .git/rebase-merge rather than self-reported. The code map shows that is not implementable as written. mitosis.js has ZERO import/require statements and ZERO child_process/spawnSync calls; from line 3297 down it is top-level script code executed by the Workflow harness, which injects only agent(), phase(), log(), parallel(), and args. Every git and gh command the engine appears to "run" is prose inside an agent() prompt, executed by a separate LLM-driven subagent that self-reports JSON. So the engine cannot shell out at all, and "in-engine" as 0012 phrased it describes a capability that does not exist. Meanwhile mitosis-git.mjs already IS the out-of-process execution layer: spawnSync with argv arrays and no shell, a fail-closed ghExecTripwire, strict allowlisted flag parsing, validateRefToken/validateRepoIdentity/inertText input gates, and - critically - it is NOT in the mirror-guard twin list, so it can grow without doubling every edit into a .mjs twin.

## Options

- Add a restack verb to mitosis-git.mjs - CHOSEN (user-locked)
- Keep prose delegation but pin it to one exact command sequence with schema-validated output - REJECTED: the result is still an LLM self-report of what git did, which is precisely what 0012 rejected
- Treat the missing exec primitive as invalidating 0012 and re-open build-vs-delegate - REJECTED: 0012's intent survives intact, only its location was wrong

## Outcome

CHOSEN: build the driver as a new verb in mitosis-git.mjs. User-locked via explicit selection. This AMENDS 0012's letter, not its intent: build rather than delegate, and never trust a self-report, both survive - only the claim that the build lands inside mitosis.js was wrong. The agent's role shrinks to invoking one command; rebase mechanics and conflict detection live in tested Node code that reads git's own exit code and .git/rebase-merge state.

FOUR IMPLEMENTATION FACTS THE NEXT SESSION MUST NOT REDISCOVER.
1. `failedRun` DOES NOT EXIST. The halt constructor is `fatalReport(stage, detail, mspCount, opts)` at mitosis.js:121-124; callers `return fatalReport(...)` and that object becomes the Workflow's final report. A preflight halt is `return fatalReport('preflight-boundary', reason, 0)` with no crashed flag - a verification failure is not a crash.
2. THE PREFLIGHT SEAT MOVES. Before phase('Reconcile') at mitosis.js:3591 the repo slug does not exist yet - targetOwnerRepo/targetRepoHost are derived INSIDE the Reconcile agent via `gh repo view` and only assigned at mitosis.js:3625-3631. Seat the gate immediately AFTER 3631. This is safe: Reconcile is read-only, so no mutation precedes the gate, which is the property that actually matters.
3. MERGE-SHA PLUMBING GAP at restack site 1. The parent's exact merge SHA IS captured - recon.mergedPRs[].mergedSha via mergeCommit.oid, and buildReconcileLiveSignals().mergedShas - but reconcileShippedSet (mitosis.js:334-351) keeps only {prUrl, mergedAt} and DROPS mergedSha, and reconciledShippedMeta is what runReconcileOnlyAdvance actually receives. liveSignals.mergedShas sits in scope at mitosis.js:3695 unused. Thread it through or the driver has nothing to rebase onto.
4. THE TWO SITES ARE NOT SYMMETRIC. Site 1 (shepherd, runReconcileOnlyAdvance at 2884, restack loop 2940-2977) uses a bare agent() with NO schema, NO retry, NO compensation, and parks via shepherdPark(stage 'ship'); it also registers no effect for its `git branch -f`. Site 2 (frontier-train, runUnit at 4171, block 4437-4473) uses full supervisedDispatch with FRONTIER_BRANCH_SCHEMA, retry, remediation, compensation, parks via parkUnit(stage 'branch'), and must keep producing builtAgainst for applyBuiltTransition. One driver can serve both sets of git mechanics, but the calling contracts differ and cannot be unified without touching surrounding control flow.

FOUR merge-base --is-ancestor sites exist, not two: mitosis.js:1175 (wave-merge, squash-safe - local branch vs local HEAD), 2971 and 4452 (BOTH squash-blind, the live defect), and 4593 (ship sibling-advance, partially exposed).

TEST HAZARDS. mirror-guard.test.mjs requires byte-identical twins for anything edited inside mitosis.js that mirrors a .mjs module - mitosis-git.mjs is exempt. The existing restack tests (frontier-train-e2e.test.mjs, run-engine.test.mjs:286-292) are PROMPT-SNAPSHOT tests asserting the literal prose the engine emits, so replacing that prose breaks them by construction. No test in the 46-file suite spins up a real git repo, so the driver's fixture pattern has no template - closest analogs are mitosis-git.test.mjs and checkpoint.test.mjs.
