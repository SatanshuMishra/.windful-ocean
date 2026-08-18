---
Status: accepted
Date: 2026-08-18T17:57:29.513Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0577. Every specialist agent pins a model, so a tier incident kills all delegation while the main thread survives

## Context

Anthropic opened an incident at 16:20Z on 2026-08-18 for elevated errors on Claude Opus 5. Two audit leads and every worker they dispatched died on API 529 at their first call, through four resume attempts and three escalating backoffs plus a thirty-minute status poll that never cleared, while this main thread ran normally throughout. The asymmetry is the diagnostic: each file in ~/.claude/agents carries a model in its frontmatter, seven pinned to opus and six to sonnet, so a dispatch ignores whatever the session is running on and lands on the pinned tier.

## Options

- Keep resuming the failed agents and waiting out the incident; pass an explicit model override on every Agent dispatch and have leads route their own workers off the affected tier; stop delegating and do the work in the main thread

## Outcome

Pass an explicit model override on dispatch, and instruct any lead to route its own workers the same way, whenever a provider incident names a tier. Re-dispatching both leads on fable, with their workers on sonnet, succeeded immediately after an hour of failed resumes; no work product was lost because both leads had been instructed to write findings to disk incrementally. Two operating rules follow. First, a healthy main thread is not evidence the API is healthy for delegation, and repeated same-tier resumes are the wrong response to a 529 storm: check status.claude.com for a named tier before backing off. Second, in-flight resumes of a torn-down lead are worth at most one attempt; a fresh dispatch with a corrected model is cheaper than repeatedly reviving a large transcript into a degraded tier. Writing worker findings to disk before returning is what made the failure survivable and stays the default for any long fan-out.
