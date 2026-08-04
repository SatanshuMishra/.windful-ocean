---
Status: accepted
Date: 2026-08-04T16:00:23.571Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0235. A many-record two-document fold is authored in parallel as matched-pair patches and applied by a single agent

## Context

The marking found 39 bearing records absent from SPEC section 16 plus 10 misstated rows - roughly five times round 4's edit set, on a session that opened at 70% context. 0231 makes an edit set atomic when its correctness is a property of two documents agreeing, and the standing risk was explicit that splitting a defect's SPEC sites from its docket sites across two agents is how a pair gets half-applied. But six agents editing the same two files concurrently is a guaranteed race, and one agent doing all 91 edits serially would exhaust its own context mid-set - the exact failure 0231 forbids starting.

## Options

- One agent authors and applies everything, risking context exhaustion mid-set
- Six agents edit the two documents directly in parallel, racing on every shared anchor
- Six agents author patches in parallel, each owning BOTH documents for its records; one agent applies them in a declared order
- Partition by document - one SPEC agent, one docket agent - fast, but splits every matched pair

## Outcome

PARALLEL AUTHORING, SERIAL APPLICATION, PAIRS NEVER SPLIT BY DOCUMENT. Six agents each owned a coherent group of records and wrote a patch of exact FIND/REPLACE blocks covering BOTH documents for those records, grouped into declared PAIR sets. One applier snapshotted both files, applied D-A-B-C-E-F with a per-block occurrence check, and merged rather than skipped where an earlier patch had moved an anchor. Result: 91/91 applied, 0 failed, 27 pairs complete, 0 half-landed.

Three properties made it work, and they are the reusable part. First, the patch is a durable artifact: had the session died before application, round 6 would have opened at 39 authored pairs rather than at a finding list. Second, authors self-verified - every FIND grep-proved unique, every patch dry-run applied to copies, and PATCH-E dry-ran forward AND reverse to prove order-independence, which is what let the application order be set from evidence instead of guessed; PATCH-D separately proved D-before-A is the only order yielding correct number order at the 0130 boundary. Third, shared surfaces that all six would touch - the exhaustivity claim, the section 16 lead-in, the docket changelog - were deliberately left unowned by every author and reconciled once by the applier as a truth pass. Four agents independently flagged the same collision, which is the signal that a surface is shared rather than merely contested.

The cost is one extra hop and a reconciliation step no author could perform. Rejected: partitioning by document splits every pair and is the named failure mode; direct parallel editing races; single-agent-does-all reintroduces the context exhaustion that ended round 4 before it began.
