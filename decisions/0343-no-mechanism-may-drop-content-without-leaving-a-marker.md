---
Status: accepted
Date: 2026-08-11T18:53:59.206Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0343. No mechanism may drop content without leaving a marker that content was dropped

## Context

The same failure appeared INDEPENDENTLY in both candidate mechanisms, which is what promotes it from a bug to an invariant. Logbook's caps reject over-cap content and no code path demotes it with a pointer, despite the continuity-ledger documentation promising exactly that; nothing records what a spine refresh dropped. The run-log fold swallows a malformed or truncated line via try { JSON.parse } catch { continue } at run-log.mjs:85-89, so a crash mid-append leaves a partial trailing line that vanishes with no exception and no signal - verified as fail-safe but silent. A two-tier design (compact record plus full journal as backup) only functions if the successor KNOWS to consult the backup, and a summary that drops a fact also drops the evidence that the fact existed. Research found this genuinely under-studied: the only shipped omission-marker in the ecosystem is Anthropic's context-editing placeholder, which covers mechanically-cleared tool output rather than model-authored narrative, and roughly six targeted searches surfaced no measured work on retrieval-triggering. The dominant documented mechanism elsewhere - MemGPT/Letta - is the model deciding for itself to query archival memory, for which no precision or recall figure is published, so silent under-retrieval is structurally undetectable from outside.

## Options

- Require an omission marker on every drop - chosen
- Rely on the successor querying the deep store on its own judgment
- Retain everything verbatim and never drop anything
- Accept silent loss as the cost of compaction

## Outcome

An invariant binding on EVERY mechanism the SPEC specifies: content may not leave a channel without a marker recording that something left. Concretely - the Tier 2 fold fails loud, or emits a gap record, on an unreadable or truncated line rather than skipping it silently; any cap that rejects content records where the rejected content went. This is precisely what makes the backup tier REACHABLE, and without it the two-tier design is decorative. It is stated as a cross-cutting invariant rather than a property of one component because it failed independently in two unrelated mechanisms built by different authors for different purposes, which is the signature of a systemic blind spot rather than a local defect.
