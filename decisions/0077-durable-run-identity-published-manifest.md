---
Status: accepted
Date: 2026-07-28T19:30:51.965Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0077. Publish the MSP identity table to a durable ref so any clone can advance a run

## Context

Spec 3.1 derives every unit's STATUS from the forge and git checkpoint refs, but nothing recovers IDENTITY. The MSP table (id, dependsOn, fileScope, changeType, scope, title, rationale) is written once at decompose into the genesis line of .mitosis/run.json by a stage instructed never to commit it (mitosis.js:3900-3912); the engine says so itself at :4329, and nothing under .mitosis/ is tracked at HEAD. A checkpoint ref is a bare commit pointer carrying no metadata. So the durability claim the whole architecture rests on - any relaunch, by anyone, at any later time, resumes from durable facts - was true only on the originating machine. This is a correctness hole, not a convenience gap: the difference between resumable and appearing resumable.

## Options

- Publish the identity table to a mitosis-owned durable ref at genesis
- Weaken the tier-1 durability claim to name the originating machine
- Commit the run journal into the repository
- Leave it and accept single-machine resumption

## Outcome

Publish to refs/mitosis/RUNID/manifest at genesis; read at derivation. Four narrow rules: IDENTITY ONLY (never status, resumePoint, window or triedSet - publishing status would recreate the second authority 3.1 exists to delete); WRITE ONCE, FORWARD ONLY (a decompose that changes the table is a different logicalRunId and a different ref); PUBLISHED BEATS LOCAL on disagreement, logged; ABSENCE IS REPORTED not inferred, via a new continuation-block field identity of published or local-only. Cost is one ref write at genesis and one read at derivation - no new control flow. Lands as M6, which keeps its identifier from the deleted watcher MSP and is reordered to depend on M2 because it completes M2's derivation claim, and must precede M5 so the identity field is never written as a placeholder. Section 8 gains row 24; count recounted 22 to 14, net -8. Rejected weakening the claim: it guts the tier that makes the watcher deletable.
