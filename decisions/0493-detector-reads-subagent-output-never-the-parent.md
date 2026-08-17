---
Status: accepted
Date: 2026-08-17T01:46:32.533Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0493. Read the capability marker from the subagent's own output; scanning the parent transcript over-counts 52x

## Context

The user lifted this cycle's scope bar to fix the observer bug immediately. Three symptoms were known: the hook read the parent transcript, an Array.isArray guard skipped string content, and the needed= regex broke on multi-word capability descriptions. The fix was dispatched against an INVARIANT rather than that list - exactly one capability_blocked event per run whose own output carries a well-formed marker - because a prior series of fix rounds in this repository each cleared a finding list and each introduced a new defect on an unnamed path. That framing paid for itself. Fixing symptom two as literally stated, by handling string content in the parent transcript, would have turned 33 real emissions into roughly 1,705 events: parent transcripts accumulate every subagent's relay, and across the 25 parents holding a marker there were 1,705 stop firings, median 32 and max 318. It would also have raced, since the relay is written about 2.3 seconds AFTER the subagent stops and is usually absent at hook time. The dispatch premise that the subagent's own transcript might be unaddressable was also false: the shipped binary builds agent_id, agent_type, agent_transcript_path and last_assistant_message unconditionally on every SubagentStop.

## Options

- Scan the parent transcript once string content is handled - rejected, it races the relay write and over-counts 52x
- Scan the session's subagents directory - rejected, it cannot identify which file just stopped and races under parallel fan-out
- Read last_assistant_message, falling back to the final assistant message of agent_transcript_path

## Outcome

Detection reads last_assistant_message and falls back to the final assistant message of agent_transcript_path, first match wins, which makes at-most-one-event-per-run true by construction rather than by deduplication. The needed= capture is lazy to the first task= so multi-word capabilities parse whole, and the parent-transcript scan is deleted outright. Recall from the final message alone equals scanning all assistant text at 33 of 33. Shipped as PR 153 with a receipt: 7 tests red on the parent commit and 11 green on the fix, two independent inertness mutations turning 6 and 3 red, and a replay over 710 real subagent runs moving 0 of 33 to 33 of 33 with zero duplicates and agent_run preserved. The root cause is the transferable part and is now corrected in the design spec: the original assumption was recorded as VERIFIED by a proxy - agent_run.tokens non-null - that a parent transcript satisfies just as well, so the probe discriminated nothing and could not fail. Pin the claim itself, never a downstream symptom of it. Three residuals are named rather than silently carried: repeat SubagentStop firings are unguarded because no hook here blocks on that event, no live firing was captured so the payload contract rests on the binary plus replay, and the 33 historical emissions are not backfilled.
