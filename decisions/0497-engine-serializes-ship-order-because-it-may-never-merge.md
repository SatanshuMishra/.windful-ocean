---
Status: accepted
Date: 2026-08-17T04:34:43.768Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0497. The engine serializes ship order and hands off; it never merges

## Context

c28 reads "the engine opens one pull request per MSP through the centralized pr-create tool on a real run, and serializes merges so the shared branch stays green". Scoping established that merge is refused at four independent layers, deliberately: pull-requests.md:5; the settings.json:78-87 deny list; block-destructive-bash.sh:120-123; and the engine's own gh-merge-shim.mjs, which exits 13 on every merge spelling and is enforced pre-spawn by exec-policy.mjs:34-36 and again in the child, because resolveSpawn:39-43 rewrites every gh spawn to run under the shim. The exec-allowlist gate verb fails if that pre-spawn refusal is removed. The SPEC calls this the second-largest risk of the OS-process move: the old sandbox made merging structurally impossible, and a supervisor that can exec is the one process that must never merge. So c28 cannot mean the engine performs merges.

## Options

- Read c28 literally and give the engine a merge capability, weakening the shim and the allowlist gate
- Read c28 as serialized SHIP ORDER plus a blocked-pending-approval handoff, with merge left to the human
- Defer c28 until the merge-gating architecture is revisited

## Outcome

c28 is satisfied by serialized SHIP ORDER, not by engine-performed merges. Ship walks MSPs in topological order over msp.dependsOn; for an MSP whose prerequisite PR is not MERGED per the read-only reconcile probe at gh-commands.mjs:118, the engine records awaitingApprovalOutcome (merge-policy.mjs:20), parks that MSP's transitive dependents with request.kind AWAITING_UPSTREAM_KIND and diagnosis BLOCKED_PENDING_APPROVAL (merge-policy.mjs:9,:13), keeps shipping every independent MSP, and reports computeMergePolicyStatus as awaiting-approval. The vocabulary already exists in merge-policy.mjs and is merely unreachable. The human reviews, merges, and re-invokes with the same spec. Two consequences follow: every engine-opened MSP pull request targets manifest.baseBranch (the trunk) and never a sibling MSP branch, which sidesteps GitHub's retarget-only-on-base-deletion trap entirely; and the engine's network surface stays read-only apart from pushing its own branches and spawning node pr.mjs pr-create, which needs no allowlist widening because node is already allowlisted and resolveSpawn:44 leaves it unshimmed.
