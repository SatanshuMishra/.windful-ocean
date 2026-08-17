---
Status: accepted
Date: 2026-08-17T17:15:12.559Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0536. U3.3 answers four standing questions, refuses two loudly, and reports coverage rather than claiming disuse

## Context

The SPEC names six standing questions the audit skill must answer over the new log with DuckDB. Measured against the live log of 83 rows, only four have a source. Cost, tokens and turn counts are a platform ceiling per 0510 and are absent from every hook payload. The reason a dispatch fell back lives in the sidecar description, which the writer does not copy, and the fallback_reason event type 0524 names is emitted by nothing. Downgrade reasons have no field, no event type and no presence in this log at all; they live in pull request bodies and the enforcer run. Two further measurements bind the design: agent_type is null on 75 of 83 rows because the platform sidecar file is absent for exactly those rows, giving 9.6 percent attribution coverage, and DuckDB is installed nowhere on this machine and in no CI workflow.

## Options

- Ship all six questions as SQL, letting the two sourceless ones return empty forever and look like a zero answer
- Answer the four that have a source, refuse the two that do not with a distinct exit code naming the missing corpus, and file each as its own follow-up unit
- Defer the whole unit until the missing sources are built, stalling the chain behind two units nobody has scoped
- Hand-roll a Node reader instead of DuckDB, avoiding the install but contradicting the SPEC deliverable

## Outcome

Four questions ship as SQL; two refuse loudly. The fallback question ships its which half and refuses its why half; the downgrade question ships no SQL at all and exits with a distinct code naming the candidate corpora, so it can never return an empty result set that reads as a count of zero. Each refusal is filed as its own unit rather than folded in - U3.3c for the fallback-reason source, U3.3d for downgrade recurrence. The cost half of the first question is RENAMED to duration rather than answered with nulls, because a plausible-looking zero sourced from nothing is the failure this whole rebuild exists to end. The unused-agents question is the sharpest case: at 9.6 percent attribution coverage a zero-dispatch agent is labelled never-observed with its coverage percentage attached, never unused, and the exact label string is asserted. Three refusal paths are the unit's real engineering content - empty corpus, absent source, low coverage - not the SQL. The reader is pinned with an explicit column list and full-file sampling, because the capability extras sit on 0.018 percent of rows and default sampling would silently drop them; since an explicit column list also silently drops undeclared keys, a second inference-free key census halts on any shape outside the two declared ones. DuckDB is installed as a pinned CLI binary, locally and in CI; a check that runs on one laptop is not a re-runnable criterion, and a check that skips when its tool is missing is the same defect as a check over an empty log.
