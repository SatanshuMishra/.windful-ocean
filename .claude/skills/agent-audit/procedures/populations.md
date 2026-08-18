# Choosing the population and the reading depth

Every row in the observer's event log belongs to exactly one of two populations, and they must
never share a denominator. This split is decision 0537's intent, not its measurement: 0537's
worked numbers are refuted by decision 0580, which the rest of this document follows.

## dispatch and internal

Both labels resolve at dispatch grain, not row by row. A grain here just means the group you
sort rows into before deciding anything: every row sharing the same `session_id` and the same
`agent_id` - a start row and its matching stop row together - is one group, and the whole group
gets one label. This is decision 0580, called predicate E in the ledger.

- **dispatch** - a group where at least one row carries a transcript path
  (`agent_transcript_path`), a depth (`depth`), or a parent agent id (`parent_agent_id`). Every
  row in that group is dispatch, the start row included, even though the start row itself almost
  never carries any of those three fields on its own.
- **internal** - a group where no row carries any of those three signals anywhere in it. These
  are artifact-less internal subagent firings the platform makes on its own, not a dispatch a
  person or an orchestrator chose.

Transcript presence is a stop-phase artifact, not a population signal. The sidecar transcript is
written only once a run finishes, so `agent_transcript_path` sits null on every start row and
holds a real path on every stop row of the same dispatch - the pattern holds across every row
pair in `.claude/lib/observer-audit/fixtures/events/2026-08.jsonl`. A rule that read that one
field on a single row, instead of across the whole group, would call one dispatch's own start row
internal and its own stop row dispatch. Measured on the real 2479-row event store, exactly that
row-level test read 0 percent of start rows as carrying a transcript against 100 percent of stop
rows - so it mislabeled all 295 of 295 real start rows as internal, and the count of real
dispatches came back zero.

The predicate deliberately never reads `agent_type`. `agent_type` falls back to the value the
hook itself reported whenever the platform sidecar has nothing to say
(`.claude/hooks/observer/_observer.mjs:76`), so a genuinely internal row can still carry a
payload-sourced `agent_type`. Letting the predicate read `agent_type` would count that row as
dispatch, inflating the very denominator this split exists to define.

**Residual limit.** A signal-free unpaired start - no transcript path, no depth, no parent agent
id anywhere in its group - forms a group of one with nothing left to rescue it, so it is reported
under internal. That is a limit of what the data can resolve, not a defect in the predicate.

Measured on the live observer: of 55 rows logged, 0 lack a transcript, not 52. Decision 0537's
original count for this sample is refuted by decision 0580, which ran the query against the
real store. Whether this store carries any artifact-less internal population at all is, per
0580, an open question rather than a settled count - the illustrative cadence and dispatch
numbers from 0537 are dropped here rather than restated with a figure this document cannot
source.

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
