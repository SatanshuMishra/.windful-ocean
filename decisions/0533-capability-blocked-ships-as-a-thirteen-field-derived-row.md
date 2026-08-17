---
Status: accepted
Date: 2026-08-17T16:59:11.530Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0533. capability_blocked ships as a thirteen-field derived row with a bounded tail fallback, and moves ahead of U3.3

## Context

Decision 0493 detects the capability marker from last_assistant_message, falling back to the final assistant message of agent_transcript_path. Decision 0524 budgets the new observer for no transcript reading beyond one bounded sidecar read, and rules that a source is derived at audit time when durable and copied at write time only when ephemeral and O(1). Those two read as a conflict. A measured scan of the retained corpus of 1748 subagent transcripts settles it: the payload field is a pure O(1) read and conflicts with nothing, so the conflict is confined to the fallback alone. Transcripts run p50 365 KB and max 28.1 MB, but the distance from end-of-file back to the final assistant text is p99.9 264 KB and max 615 KB, and every one of the 28 genuine markers sits within 36.1 KB of the end. Separately, 112 of 1748 files contain the raw marker string while only 28 are genuine - 42 are the convention quoted verbatim from the agent roster rule, and 2 carry it only outside assistant text, which is the relay path that once over-counted 52 times.

## Options

- Payload only, deleting the shipped fallback and its test on an assumption 0493 explicitly refused to make
- Payload first, then a bounded 1 MiB tail read of the transcript walked backwards to the first assistant text
- Port 0493 verbatim with a full file read and split, which is O(filesize) inside a per-stop hook against a 28 MB observed maximum
- Write capability rows to a sibling stream rather than the shared events log

## Outcome

Payload first, then a bounded 1 MiB positional tail read walked backwards to the first assistant message with text. A 1 MiB cap is a constant, so it APPLIES 0524's O(1) rule rather than amending it, and it captures the final assistant text on 1746 of 1746 observed files with 28 times headroom over the worst real marker. It amends only the subordinate mechanism sentence, from one bounded exception to two - both fail-to-null, both at payload-derived paths, both in the directory the sidecar read already visits. Payload-only is rejected because it deletes a shipped tested behaviour under a blocking gate on deleted tests, on an assumption 0493 named as unmeasured; it gets a retirement PATH instead, through a detected_from field that turns the assumption into a scheduled measurement. The record is the ten shared fields unchanged plus needed, task and detected_from, written to the same monthly log discriminated by event, because a sibling stream makes a zero-emission month an absent file and a check over absent input passes while looking like success. The capability row and its stop row share one timestamp, one sidecar read and one append call, so the pair cannot tear across a month boundary. At-most-one-per-run stays true by construction through four structural facts, never by deduplication. Backfilling the historical emissions is rejected as a reconstructed record wearing a measured record's shape; a replay script importing the SAME detector answers the question on demand, and is also the only instrument that can tell a blind detector from a genuine absence. SEQUENCING IS REVISED, superseding 0530: the chain is U3.2 then U3.3b then U3.3 then U3.4. Shipping the query skill first would leave its own what-was-blocked question answered either against the ledger about to be deleted or against a fixture with no such rows, which is the vacuous pass the SPEC's closed-census rule forbids, and it would force U3.3b to reach back into the skill. File scope permits either order; semantics do not.
