---
Status: accepted
Date: 2026-08-19T01:24:20.351Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0607. A retired agent's Lead status is judged by its tool grant at deletion, never by name lineage

## Context

Classifying the corpus required a rule for retired agent types. The hard cases are solution-architect, codebase-analyst and debugger: each is a name-predecessor of a current Lead, so lineage would read them as Lead, but none carried the Agent or Skill grant at the commit that deleted it, so capability reads them as not-Lead. The rule had to be fixed before its effect on the figure was visible.

## Options

- Lineage governs - a predecessor of a Lead is a Lead
- Capability governs - the tool grant at the deleting commit decides
- Refuse to classify retired types and let them halt

## Outcome

CAPABILITY governs, judged by the tool grant at the deleting commit. A Lead is a Lead because it can dispatch, not because a later agent inherited its role. Applied, this moved 25 groups OUT of the numerator, away from the bar, which is the less convenient direction; ruling lineage instead would have been the flattering answer. The classification ships as an ordered four-clause ladder, each branch pinned by a test: C1 named Lead, C2 current roster file and not a Lead, C3 declared fallback, C4 retired and judged by tool grant, then HALT. Three values across 10 groups still reach no clause - fork, bogus-agent and probe-agent - and the census hard-halts at exit 6 with empty stdout, naming each rather than bucketing it. A standing limit is filed with it: the ladder has no category for Claude Code built-ins, so any corpus containing one is guaranteed to halt.
