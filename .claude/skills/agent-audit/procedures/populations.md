# Choosing the population and the reading depth

Every row in the observer's event log belongs to exactly one of two populations, and they must
never share a denominator. This split is decision 0537's intent, not its measurement: 0537's
worked numbers are refuted by decision 0580. The predicate the rest of this document describes
is the one decision 0590 later pinned as final.

## dispatch and internal

Both labels resolve at dispatch grain, not row by row. A grain here just means the group you
sort rows into before deciding anything: every row sharing the same `session_id` and the same
`agent_id` - a start row and its matching stop row together - is one group, and the whole group
gets one label. Decision 0580 first resolved this at dispatch grain as predicate E, testing
`agent_transcript_path` OR `depth` OR `parent_agent_id`; decision 0590 later narrowed that test
to `depth` alone, which is the predicate that ships today. The query implements that grain as a
window function scoped to the whole group at once, not row by row:
`bool_or(depth IS NOT NULL) OVER (PARTITION BY session_id, agent_id ROWS BETWEEN UNBOUNDED
PRECEDING AND UNBOUNDED FOLLOWING)` (`.claude/lib/observer-audit/reader.mjs:27`). The explicit
frame matters: it forces the check to cover every row in the group regardless of order, so a
start row's label depends on what its own stop row carries too, not only on rows that came
before it in the file.

- **dispatch** - a group where at least one row carries a non-null `depth`
  (`.claude/lib/observer-audit/reader.mjs:27`). Every row in that group is dispatch, the start
  row included, even when the start row itself carries no depth of its own.
- **internal** - a group where every row has `depth` null. These are artifact-less internal
  subagent firings the platform makes on its own, not a dispatch a person or an orchestrator
  chose.

`depth` is a number the harness sidecar carries - a small JSON metadata file the harness (the
Task-dispatch machinery that spawns a subagent) leaves at
`<transcript-dir>/subagents/agent-<agent-id>.meta.json`, but only when it actually spawns that
subagent through the Task tool (`.claude/hooks/observer/_observer.mjs:34-40`). The hook reads
that file off disk and falls back to nothing if the read fails for any reason, sidecar missing
included (`.claude/hooks/observer/_observer.mjs:42-52`), so a row only gets a non-null `depth`
when a real sidecar was there to read (`.claude/hooks/observer/_observer.mjs:79`). That is what
makes `depth IS NOT NULL` a genuine dispatch signal: it is present only when the harness itself
recorded that this was a real dispatch, never for a firing the platform made on its own.

**Depth null does not always mean internal.** A group where every row has `depth` null is
reported as internal, but the predicate cannot always tell why the rows look that way. It might
genuinely be an internal firing the platform made on its own - the case the label describes. Or
it might be a real dispatch whose sidecar write failed and left nothing behind for the hook to
read, so that row looks exactly like a genuine internal firing. Both land under internal,
indistinguishable from each other in this data. This is a known blind spot in the predicate,
filed separately and not fixed by this document
(`.claude/lib/observer-audit/questions.mjs:22`).

`agent_transcript_path` is not part of this test, even though it looks like the natural
candidate. It is a stop-phase marker, not a population signal: the hook copies it straight out
of whatever the incoming payload said, on every stop event, and never checks that the file at
that path exists (`.claude/hooks/observer/_observer.mjs:77`) - contrast that with `depth`, which
only gets a value when the code has actually opened a real sidecar file off disk. A row's
transcript path tracks which phase it is in (start vs. stop), not which population it belongs
to: in the fixture corpus, agent pair `s1`/`a-fb-2` has `depth` null on both its rows (so its
group is internal) and still carries a real transcript path on its stop row
(`.claude/lib/observer-audit/fixtures/events/2026-08.jsonl:3-4`). Reading it would tell you
whether a row is a stop row - something the `event` column already says directly - and nothing
about whether the row's group is a real dispatch. Start rows carry it 0 times out of 461 in the
corpus this predicate is measured against.

`parent_agent_id` was also considered and dropped, but for a different reason: it is not wrong,
it is redundant. It comes from the very same sidecar read as `depth` - `meta.parentAgentId` and
`meta.spawnDepth` are read off the same `meta` object in the same function
(`.claude/hooks/observer/_observer.mjs:78-79`) - so any group that has a `parent_agent_id` value
already has a `depth` value too. Measured on the corpus: 156 groups carry a parent agent id, and
all 156 of those already carry a depth. Adding `parent_agent_id` as a second OR term would not
rescue a single group that `depth` alone misses; it would only repeat a decision `depth` has
already made.

The predicate deliberately never reads `agent_type`. `agent_type` falls back to the value the
hook itself reported whenever the platform sidecar has nothing to say
(`.claude/hooks/observer/_observer.mjs:76`), so a genuinely internal row can still carry a
payload-sourced `agent_type`. Letting the predicate read `agent_type` would count that row as
dispatch, inflating the very denominator this split exists to define.

**Residual limit.** An unpaired start - a start row with no matching stop row yet in the log -
that also carries no depth forms a single-row group with nothing else in it to rescue it, so it
is reported under internal. That is a limit of what the data can resolve, not a defect in the
predicate.

## counting dispatches, not rows

Two questions - `fell-back` and `failed` - count at dispatch grain too, the same
`(session_id, agent_id)` grouping the population label itself uses, not by counting raw rows. A
dispatch that shows up as a start row and a stop row is one dispatch, not two, wherever either
question counts it (`.claude/lib/observer-audit/questions.mjs:54-64`,
`.claude/lib/observer-audit/questions.mjs:92-96`).

The `failed` question adds one more fold on top of that grouping: when a `(session_id, agent_id)`
group carries more than one start row, the group collapses to its latest start, so a start that
is still healthy is never misreported as a failure just because an older row happens to share its
agent id. That fold is not free of doubt, though. If a group is really N distinct dispatches that
happened to reuse the same agent id - rather than one dispatch that was retried - neither the
latest start nor the earliest start is the single correct reading for it. This document does not
resolve that ambiguity, and neither does the audit: it is carried forward unsettled
(`.claude/lib/observer-audit/questions.mjs:188`).

## depth is three states, not two

`depth` null is a third state, never a synonym for `1`. 77 of 1747 sidecars carry no depth at
all. Any grouping by depth keeps null as its own bucket - folding it into `1` invents a reading
depth that nothing in the row actually asserts.

## never-observed is not "unused"

The roster question never labels an agent unused. It labels it `never-observed` and attaches
the coverage figure the label was computed against, because a zero-dispatch count measured
against partial attribution is not evidence the agent goes unused. It may only be evidence
that the log under-attributes it.
