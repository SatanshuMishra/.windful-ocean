# Running a question

Every question is one command:

```
node .claude/lib/observer-audit/run.mjs <question-id> [--log-root PATH] [--roster PATH] [--horizon-ms N]
```

The question id is one of six, exactly: `ran-and-duration`, `fell-back`, `blocked`, `failed`,
`never-observed`, `downgrade-recurrence`. There is no seventh. A question not on this list has
no command, and it is never answered by approximating it from one that looks close.

`--log-root` overrides the default corpus location. `--roster` points at the list of agents
the roster question checks coverage against. `--horizon-ms` sets how long after its start an
unpaired dispatch still counts as in-flight rather than failed, measured against the latest
timestamp in the corpus rather than the wall clock; omit it and the default applies.

## Reading the exit code

The exit code is part of the answer, not a wrapper around it. A caller that reads only stdout
and ignores the code can mistake a refusal for a result.

| Exit code | Meaning |
|---|---|
| 0 | the question was answered |
| 2 | usage error - bad arguments, not a bad corpus |
| 3 | the DuckDB binary is not resolvable (the failure names the install command to run) |
| 4 | the corpus is absent or empty |
| 5 | no source exists in this log for this question |
| 6 | the key census halted on an event shape it does not declare |

Codes 4, 5 and 6 are not failures to work around. Each names a state where returning a number
would be worse than refusing, because the number would read as an answer nobody asked a
question to get.

## The DuckDB binary

Resolution order: the `OBSERVER_AUDIT_DUCKDB` environment variable first, then `duckdb` on
`PATH`. If neither resolves, the command exits 3 and names the install command for the pinned
version, `v1.5.5`.

It never skips when the binary is absent. A skipped check over a missing tool is the same
defect as a check that quietly runs over an empty log: both leave silence where a reader
expects an answer, and neither says so.
