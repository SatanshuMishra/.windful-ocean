---
Status: accepted
Date: 2026-08-17T04:38:20.075Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0500. Re-ground the decision set: preload confirmed, three citations stale, two records narrate unexecuted state

## Context

Before writing a SPEC on top of 18 decision records, each record's load-bearing factual premise was checked against the live system rather than re-read. The check was prompted by two spot-finds - 0480 resting on an untested mechanism and 0488 pinning an agent count the live gate contradicts - and it returned 8 HOLDS, 4 not-fact-dependent, 5 MOVED and 1 UNTESTED. Decision records are write-once after acceptance, so a moved premise cannot be corrected in place; 0490 already established the instrument, which is a new record that re-grounds the old one. The alternative - leaving a SPEC author to reconcile 18 records against reality themselves - pushes a known defect downstream to the reader least equipped to catch it.

## Options

- Amend the affected records in place - refused, records are write-once after acceptance and only the Status line may change
- Leave reconciliation to whoever writes the SPEC - rejected, it hands a known defect to the reader least able to detect it
- Record one re-grounding decision that the SPEC cites alongside the originals

## Outcome

Four corrections, and one confirmation that reverses an open verdict.

1. 0480 is CONFIRMED, not untested. The sweep marked it UNTESTED correctly, because its brief forbade answering that question; a binary trace of 2.1.233 run in parallel settled it. An agent declaring `skills:` frontmatter receives each named skill's entire SKILL.md body inlined at spawn, with no Skill tool required and no tool gate on the preload block. This grounds 0480 and unblocks its four dependents - 0481, 0482, 0483 and 0487 - all of which presuppose that a non-Lead agent can obtain full procedure by preload. A tighter interlock came with it: the skill INDEX is itself gated on the Skill tool, so an agent lacking both the tool and a `skills:` field receives no skill content at all. That is the live state of all 15 current agents today.

2. The figure "zero compliance across 15,573 runs" is disproven and appears in THREE records, not the two 0490 named. 0490 re-grounded 0470 and 0481 and report Decision 11. It missed 0479, which cites the same figure at line 33 to reject leaving the rule as prose. 0479's ruling survives - it rests primarily on a direct user ruling - but its stated reasoning carries a number this thread has already disproven. Anything inheriting 0479's rationale verbatim inherits the false statistic.

3. 0488's agent count was stale when it was WRITTEN, not later. It pins 7 schema-capable dispatchable agents by restating historical commit d9911cf4. Commit c6ff5345 dropped the legacy workflow file as a census root roughly 16 hours BEFORE 0488 was recorded, removing debugger and solution-architect; the live test asserts 5. The defect is method, not drift: the record restated a remembered pin instead of re-deriving against HEAD. A SPEC sizing work against 7 schema-capable agents is wrong today - it is 5. 0488 belongs to thread 01KZTEFMENXBW30ZE633YNFJHE and is not amended from here.

4. 0495 narrates its own outcome in the past tense for an edit that has not landed. All four confirmation lines are still present verbatim in the live files. The execution is real - PR 155, open and unmerged, with a closed census red on the parent at 16 findings and green on the fix - but 0495 cites no PR, unlike every other executed change in this set, and reads as though the deletion were already applied. Same defect as 0488 in the opposite direction: an intended state recorded as accomplished. It becomes accurate on merge; until then, any reader assuming those files are clean is wrong on contact.

5. Ledger store divergence, found incidentally and load-bearing for every future session. Two stores exist at the equivalent path. logbook-inline holds all 18 records; logbook-logbook is missing 0495 and 0496. logbook-inline is the source of truth for this thread. Two agents in one prior day already reported records missing by reading the wrong path; a stale second store makes that failure silent rather than obvious, because the wrong path now returns a plausible near-complete answer instead of nothing.
