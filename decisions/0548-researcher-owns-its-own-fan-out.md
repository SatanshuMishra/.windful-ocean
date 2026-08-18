---
Status: accepted
Date: 2026-08-18T01:19:14.735Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0548. The main thread dispatches one researcher; the researcher owns the fan-out inside its question

## Context

U5.2 promotes researcher from a read-only worker that cannot delegate to a Lead holding the Agent tool. Six routing instructions were written against the old contract - research.md lines 7, 9, 12, 13 and 17, and CLAUDE.md line 13 - and all silently reach an agent with a materially wider grant the moment the unit merges. The token-budget ladder in research.md prescribes 1 researcher for a fact-find, 2 to 4 for a comparison, and a hard cap of 6 for breadth-first work, written throughout as instructions to the ORCHESTRATOR about how many researchers to run. A researcher that can itself dispatch makes the subject of every one of those rungs ambiguous.

## Options

- Keep the orchestrator as the fan-out owner and forbid researcher from dispatching researchers
- Move fan-out ownership into the researcher and retarget the ladder to passes within one question
- Leave the ladder ambiguous and let each caller interpret the rungs
- Abandon the researcher promotion and ship the Lead under a new name

## Outcome

Fan-out ownership moves into the researcher. The orchestrator dispatches exactly one researcher, always; that researcher decomposes and fans out inside its own question. The reason is that the sub-questions are PRODUCED BY the plan step, which happens inside the researcher - the old ladder had to be a prescriptive table of guesses precisely because the split had to be made before any planning existed. N sibling researchers dispatched by the orchestrator also have no shared synthesis: each returns its own conclusion and the merge lands on an orchestrator that is not doing research, whereas a Lead runs disconfirm and verify over the whole evidence set. Delegation-discipline is untouched - the main thread still never researches inline; only the how-many moved, and it moved to where the evidence is. The cost bar and the cap of 6 are preserved verbatim and now bind the researcher. Four references were amended and two confirmed, one verdict each. The deep-research prohibition was confirmed unchanged but is now MORE load-bearing, not less: a researcher holding Agent can build the exact unbounded fan-out that caused the 3M-token incident, so the prohibition and its reasoning were carried into the generated agent BODY rather than left in a rules file, because a rule reaches a subagent tagged may-or-may-not-be-relevant while the body is the binding channel.
