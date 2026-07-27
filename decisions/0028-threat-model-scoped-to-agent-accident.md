---
Status: accepted
Date: 2026-07-27T20:11:45.843Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0028. Threat model scoped to agent accident; the user's own deletion is explicitly out of scope

## Context

The guard was being designed against an implicit, unbounded threat model that included a determined adversary, which is what made the attack surface open-ended and every review round produce new holes. The user ruled the scope explicitly on 2026-07-27: the job is to ensure the ledger and any agents do not ACCIDENTALLY delete something; it is not to babysit the user's own deliberate deletion. Research confirmed the four actors are genuinely different problems and that the user-deletes-their-own-files argument holds only for the human actor, not for agent accident or prompt injection.

## Options

- Unbounded threat model including a determined same-uid adversary - the implicit prior scope, and the reason the parser surface never closed
- Agent accident only - the user's ruling; a command that accidentally destroys the store names the store, so a parse-free check suffices
- Agent accident plus prompt injection - rejected as the design target because research showed filtering-style guardrails are unreliable against injection and capability removal (OS sandbox) is the only sound answer, which is a user-level opt-in not a plugin control

## Outcome

Scope is AGENT ACCIDENT. In scope: the plugin and any agent destroying ledger state by accident or overzealous cleanup. Out of scope and not to be defended against: the user deliberately deleting their own files; a determined adversarial same-uid agent (undefendable for the _ledger ref inside .git, since the agent must retain normal git rights over that directory - replicas, not prevention, are the only lever). This scope is what makes a simple solution correct rather than a compromise: accidents name their target, so a substring check is sufficient and shell parsing is unnecessary. Any future proposal that reintroduces parsing must first show the threat model changed.
