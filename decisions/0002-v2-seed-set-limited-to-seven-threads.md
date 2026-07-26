---
Status: accepted
Date: 2026-07-26T08:28:21.936Z
Thread-Id: 01KYERGSD9QA9XC6QD4XPM8R37
---

# 0002. Three non-terminal v1 threads deliberately not carried into v2

## Context

Criterion 4 called for a v2 successor for every non-terminal v1 thread, of which there were ten at freeze time. Freezing the archive made v1 thread files read-only, so a finished thread can no longer be marked done in v1 - disposition now means deciding whether a successor is created at all. Three candidates looked complete or stale: vibesec-integration (idle 41 days, flagged undisposed by the staleness scan across three sessions, and with a genuinely EMPTY completion_criteria, so seeding it required inventing permanent criteria); claude-config-dotfiles-migration (spine says it carries no remaining action, and its follow-on thread claude-config-repo-native-architecture is already status done); mitosis-robustness-overhaul (spine says SPEC FULLY DELIVERED, but its criteria list still shows open broader sweeps including the 17 inline engine twins collapse).

## Options

- Seed all ten non-terminal threads to satisfy criterion 4 literally
- Seed eight, dropping only vibesec-integration and claude-config-dotfiles-migration (the assistant's recommendation)
- Seed seven, dropping all three
- Seed vibesec-integration with assistant-invented completion criteria

## Outcome

User chose to seed SEVEN and drop all three, overriding the recommendation to carry mitosis-robustness-overhaul. Criterion 4 is read as satisfied because the three dropped threads were dispositioned as not-carried by explicit user decision rather than left unhandled. Consequence accepted and recorded on the spine: the open items in those three threads - notably the inline-twin collapse and the VibeSec adoption question - now exist ONLY in the frozen archive, and no resume path will surface them. Recovering any of them means opening a fresh v2 thread and reading the archived file.
