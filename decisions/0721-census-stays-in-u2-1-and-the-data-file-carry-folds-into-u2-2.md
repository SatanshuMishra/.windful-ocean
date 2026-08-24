---
Status: accepted
Date: 2026-08-24T21:41:37.603Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0721. The census stays inside its unit and the data-file carry folds into the next one

## Context

Two structural questions came up while U2.1 was in flight. The census had grown far past its half-sentence in the brief — a redesigned detector, a tracked host oracle, an allowlist and forty tests, inside a unit whose headline is carrying six modules — which raised whether it should become its own numbered unit. Separately, a roster data file surfaced that the import had missed, and the question was whether it earned a unit number of its own. Both recommendations were made before round four returned, each with a stated condition that would flip it: split the census if round four left it unsettled while the carry stayed clean, and fold the data file into an existing unit if round four found exactly one instance of its class and no more. Round four settled the census against its criterion with a scope-locked oracle and forty-three passing tests, and surfaced no further member of the missing-data-file class.

## Options

- Split the census into its own numbered unit and give the data file another, matching how every other discovered item in this plan was handled
- Keep the census in the unit that built it and fold the data-file carry into the unit that follows
- Defer both until the whole extraction is further along

## Outcome

Neither is split. The census cannot merge independently of the carry — being red without it is the carry's own red-on-parent receipt — so the boundary could never be crossed in either order, which makes it a file split rather than a unit boundary; splitting would also have added a second human merge gate and a rebase against an enforcer that diffs the base tip, for no concurrency, since the two were always serial. The data file folds into the suite-executable unit as two added steps, carry it and remove its now-idle allowlist entry, because a unit created for a single JSON file is ceremony. Both flip conditions were stated in advance and neither fired, which is the only reason these are recorded as decisions rather than preferences.
