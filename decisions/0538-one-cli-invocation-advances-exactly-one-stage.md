---
Status: accepted
Date: 2026-08-17T17:28:02.626Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0538. One cli.mjs invocation advances exactly one stage, contradicting the skill's single-dispatch contract

## Context

The live run exited 0 having built three units while integrating and shipping nothing. The cause is not disposition routing: Done maps to done, engine.mjs:177 has CHECKPOINTED as done plus built, recordBuilt fired for all three, and the journal shows status built with green true. Built is in fact never constructed anywhere in production code. The real cause is phase sequencing. integratePhase consumes resumed.built, the Resume phase snapshot taken BEFORE Execute ran in that same invocation, and nothing re-reads Resume after Execute inside one runPhases call. A unit that goes pending to built within one invocation is therefore invisible to that same invocation's Integrate and Ship. Proven by a third invocation on the same run-id that dispatched nothing and integrated all three. SKILL.md:85-98 meanwhile prescribes exactly one Bash call and instructs the caller to do nothing else until it returns.

## Options

- Treat the empty ship as caused by the GitHub 503 observed on the done-oracle
- Record that one invocation advances one stage and that the skill's single-dispatch contract is wrong
- Change the phase driver to re-read Resume after Execute

## Outcome

Record the sequencing characteristic as the cause and the skill contract as wrong. The 503 was real and independently verified but incidental: Integrate was already empty upstream of Ship, so shipping had nothing to do regardless of forge health. The consequence for a user is severe and quiet, because following the documented single-dispatch flow yields a run that builds and then stops with exit code 0, and nothing in that exit code says a further invocation is required. This compounds the separately filed defect that exit zero is computed over unit state rather than over shipping. No engine change is made here; the acceptance ceiling for this work is a test, so the fix is filed with its reproduction rather than applied in flight.
