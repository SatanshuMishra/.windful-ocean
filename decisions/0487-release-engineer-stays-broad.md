---
Status: accepted
Date: 2026-08-16T22:37:14.548Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0487. Keep release-engineer broad; the real problem is per-duty procedure loading

## Context

Report Decision 12 ruled that release-engineer be renamed (candidates: branch-steward, integration-engineer) because report section 4g found that "release" in this repository reduces to a single action - opening a gated pull request. Merging is human-only and artifact publishing does not exist here. Open item 4 asked only WHAT to rename it to. The user rejects the premise. The rename narrows the agent to match today's smallest surface, and narrowing is the wrong move for a role that should absorb release work as it arrives. The user's original objection was never about the name: it was that the report had release-engineer PRELOAD the pr skill, which biases a multi-duty agent toward one duty and does not scale as duties are added. Under Decision 10 only the four Leads hold the Skill tool, so a non-Lead agent can obtain procedure only by preloading it in full on every dispatch - meaning N duties cost N skill bodies on every single dispatch, whether or not the dispatch needs them.

## Options

- Rename to match the one duty that exists today (report Decision 12, now rejected)
- Keep the name and preload one skill per duty - rejected, cost scales with duty count on every dispatch
- Keep the name and solve per-duty procedure loading as its own architectural problem

## Outcome

release-engineer keeps its name and its broad scope. Decision 12 is superseded and open item 4 (the replacement name) is withdrawn rather than answered. The question that replaces both: how does a subagent with several distinct duties obtain the procedure for the duty at hand without carrying every duty's procedure on every dispatch. Candidate mechanisms to be evaluated by research, not assumed: one skill whose lean entry point routes to per-duty side files loaded on demand; executable scripts in the skill folder that are run rather than read into context; procedure supplied in the dispatch work order; granting this agent the Skill tool as a carve-out from Decision 10. This is a scope INCREASE to the thread, and the user has stated it is the final one - later sessions resolve ambiguity in existing decisions only.
