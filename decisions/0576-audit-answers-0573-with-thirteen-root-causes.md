---
Status: accepted
Date: 2026-08-18T17:57:17.553Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0576. The 0573 audit is complete and both families reduce to thirteen named root causes

## Context

Directive 0573 bound the next phase to a bounded audit: understand the issues, understand every surface, name the root causes, judge fragility and complexity, and produce the entire solution before any fan-out. Two dedicated audit leads ran read-only over origin/main ffb6103f, each fanning out five workers, and produced two complete reports with closed censuses, path:line evidence and labelled candidate remedies. The audit half of the charter is discharged; the judgment and whole-solution half is not.

## Options

- Treat the reports as the settled input and design the whole solution against them; re-audit or extend the census before designing; start fixing the individually named defects one at a time

## Outcome

The two reports are the settled factual basis and are not re-derived. Family 1 reduces to six root causes: the resume settled-hole that re-implements shipped-but-unmerged and parked units from zero; the unconditional journal rewrite at every process boundary; the absent NeedsHuman remediation path; the boundary gate scanning a tree the unit's diff never reaches; the prState probe that gates nothing; and process hygiene (lock never auto-recovered, relative journal path refused only after paid work). Family 2 reduces to seven: no single terminal-state function behind six independent outcome derivations; statuses named for a population they do not cover; a last-write-wins fold with a precedence guard in only one writer; vacuous passes over empty or self-comparing domains; shipped meaning PR-opened while consumed as landed; a decompose boundary with no representation for no-work; and an attestation proved against a stand-in rather than the real reader. The two families are not independent: Family 1's RC1 and RC2 combine with Family 2's RC-3 to make the loss permanent, since a park demotes a shipped status that reconcile then never sees. The next phase designs one whole solution against these thirteen, and does not open another audit or a reviewer loop. All candidate remedies in the reports are labelled candidates and none is adopted by this record.
