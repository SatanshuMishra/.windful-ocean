# Choosing the population and the reading depth

Every row in the observer's event log belongs to exactly one of two populations, and they must
never share a denominator. This split is decision 0537.

## dispatch and internal

- **dispatch** - rows carrying a transcript path (the `agent_transcript_path` field is set).
  These are real dispatches someone made: a subagent was launched with a task and left a
  sidecar transcript behind.
- **internal** - rows with no transcript path, and therefore no sidecar. These are
  artifact-less internal subagent firings the platform makes on its own, not a dispatch a
  person or an orchestrator chose.

Measured on the live observer: of 55 rows logged, 52 were internal. In one session, 50 internal
rows arrived on a roughly 32-second cadence against 12 real dispatches. A rate computed over
all 55 rows is a rate over the noise, not over the roster.

Scoped to the dispatch population instead, `agent_type` is empty on 0.00 percent of 1749 rows.
That is the number worth reporting; the blended one is not.

## depth is three states, not two

`depth` null is a third state, never a synonym for `1`. 77 of 1747 sidecars carry no depth at
all. Any grouping by depth keeps null as its own bucket - folding it into `1` invents a reading
depth that nothing in the row actually asserts.

## never-observed is not "unused"

The roster question never labels an agent unused. It labels it `never-observed` and attaches
the coverage figure the label was computed against, because a zero-dispatch count measured
against partial attribution is not evidence the agent goes unused. It may only be evidence
that the log under-attributes it.
