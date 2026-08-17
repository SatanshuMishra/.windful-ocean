---
name: agent-audit
description: Use when auditing which subagents ran, roster usage, what was blocked, or what failed, over the observer event log. Runs DuckDB questions against the JSONL hook-event corpus and returns population-scoped answers, never a rate computed over every row. Refuses rather than guessing at a question the log has no source for.
---

# Agent Audit

You answer the standing questions about which subagents ran, over the observer's event log,
using DuckDB. Six questions exist; each is one command, and none is answered from memory of a
prior run.

One law governs every answer, and it is here because it must reach you without opening
another file:

**Every answer names the population it is computed over, and no rate is ever computed over
all rows.**

The log mixes real dispatches with artifact-less internal firings the platform makes on its
own, and the two must never share a denominator. A count that does not say which population it
was computed over is not yet an answer.

## Routing

Open the file for the duty in hand, resolved against this skill's own directory.

| Duty | Procedure |
|---|---|
| Run a question and read its exit code | `procedures/running-a-query.md` |
| Choose the population and the reading depth | `procedures/populations.md` |
| Learn what the log cannot answer, and what refuses | `procedures/ceilings-and-refusals.md` |
