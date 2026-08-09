---
Status: accepted
Date: 2026-08-09T01:48:30.901Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0298. I6 guards releases and current as whole prefixes rather than the contract's narrower per-release subtree list

## Context

The contract states I6 as adding CUTOVER, LIVE, the pre-cutover aside namespace, and the four named subtrees under a release to both gates. Implementing it literally leaves three holes the same finding class covers. A release also carries CLAUDE.md, which is live steering content and is the identical F12 defect. The current alias reaches the same files by a second path. And the bare current pointer is itself the highest-value target, because replacing that one symlink swaps the entire live configuration in one operation. The literal form also embeds a sha shape in the hook, which must then stay in step with the pattern that lives in paths.mjs, creating a silent drift hazard between two files that no test binds together. The widening is monotone: it can only add confirmation prompts, never refuse a deployment, and the namespace it covers is one nothing hand-edits.

## Options

- Guard releases and current as whole prefixes in both gates - ADOPTED
- Implement the contract's literal text, guarding only the four named subtrees under a release - rejected, since it leaves the live CLAUDE.md inside a release unguarded, leaves the bare current pointer unguarded, and couples the hook to a sha format that lives in paths.mjs
- Widen further by adding the link-creating verb to the destructive-bash verb set - rejected as outside step 8, and reported as an open residual instead

## Outcome

Adopted. Both gates guard releases and current as whole prefixes, and the destructive-bash path pattern is now composed from a single shared name list so the two gates enumerate the same surface and cannot drift. The cost is confirmation prompts on a namespace nothing hand-edits. Two limits are stated rather than implied. First, I6 remains porous defence-in-depth: the verb set matches redirection, tee, in-place sed, mv, cp, rm, chmod, truncate, in-place perl and git checkout or restore, so an interpreter one-liner that opens a file for writing still slips past both gates, and I1 through I3 must never lean on I6 holding. Second, and more concretely, the link-creating verb is absent from that verb set, so re-pointing the current symlink at an attacker-chosen release passes unremarked; adding current to the guarded path list does not close that, because the gate never examines the command. Only a verb-set change would, and that is outside step 8 and is carried as an open residual. The general shape worth keeping: when a contract names specific instances of a defect class, implement the class if doing so is monotone, and say plainly which instances the contract named and which you added.
