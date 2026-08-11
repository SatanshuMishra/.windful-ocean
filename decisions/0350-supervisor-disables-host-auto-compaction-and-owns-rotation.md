---
Status: accepted
Date: 2026-08-11T21:34:02.966Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0350. The supervisor disables host auto-compaction and owns rotation below the 167,000-token threshold

## Context

The whole four-tier design of 0342 exists to avoid compaction, because arXiv:2606.22528 measured compaction raising pooled constraint violation to 30% (0-59% across seven model families, 1,323 episodes), restored to 0% by verbatim pinning at roughly 47 tokens. Until now nobody had checked whether the intended host compacts on its own. The 2026-08-11 probe measured that it does. Query.getContextUsage() reports isAutoCompactEnabled true by default with autoCompactThreshold 167,000 against maxTokens 200,000 - so the host would compact the orchestrator at roughly 84% fill, unbidden. Auto-compaction is NOT a top-level Options field: grep of the Options body for "ompact" returns nothing. It reaches a session through Options.settings plus Settings.autoCompactEnabled (sdk.d.ts:6884) or Settings.autoCompactWindow (:6661), or mid-session via Query.applyFlagSettings(). The disable path was verified rather than assumed - passing settings {autoCompactEnabled:false} flipped isAutoCompactEnabled to false and the threshold disappeared. The compaction event itself is observable on the normal message stream as SDKCompactBoundaryMessage (sdk.d.ts:3108), subtype compact_boundary, carrying trigger manual-or-auto, pre_tokens, post_tokens and a preserved_segment of head/anchor/tail uuids. It was NEVER observed firing in this probe - grep count 0 - because max context reached was 89,025, well under the threshold.

## Options

- Disable host auto-compaction and rotate on the supervisor's own trigger - chosen
- Leave auto-compaction on and treat it as the rotation mechanism
- Leave it on as a safety net beneath a lower supervisor trigger

## Outcome

The supervisor DISABLES host auto-compaction explicitly via settings {autoCompactEnabled:false} and owns rotation itself on its own trigger, which must fire below 167,000 tokens. Leaving it on was rejected because it silently imports the exact 30% constraint-violation failure the four-tier design exists to prevent, and it would fire on the host's schedule rather than at a point the supervisor chose. Leaving it on as a safety net beneath a lower trigger was rejected too: a net that fires only when the primary mechanism has already failed is a net that is never exercised, and its firing would be indistinguishable from correct operation unless the host also watches for it. The disable is not sufficient on its own and carries two obligations. The supervisor MUST assert isAutoCompactEnabled false by reading getContextUsage() at session start rather than trusting that it passed the setting, since the setting travels by a different path than the rest of Options. The supervisor MUST also treat any compact_boundary message arriving on the stream as a hard fault and record it, because under this decision such a message can only mean the disable did not take. The threshold 167,000 and window 200,000 are confirmed for claude-haiku-4-5-20251001 only and must be re-derived for whichever model the orchestrator actually runs.
