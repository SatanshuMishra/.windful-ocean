---
Status: accepted
Date: 2026-08-23T18:31:53.106Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0685. Dispatch recording lands before the billed run; cassette harvest is deferred until after it

## Context

Integrate and Ship make model dispatches that are recorded nowhere today: cli.mjs:293 passes any request without a unitId straight through, so the hard refusal at run-store.mjs:341 is never reached. A second, independent defect labels kinds by schema object identity with branches for only eight of the twelve kinds the code freezes at cassette.mjs:21-34, so the four unit-less kinds would be silently mislabelled implement or redispatch. The engine is about to make its first billed live run at roughly five dollars and seventeen minutes, and every prior run bought exactly one defect and stopped.

## Options

- Run first and add recording afterwards
- Build recording and the dispatches-to-cassette harvest together before the run
- Land recording plus correct kind labelling before the run, and defer the harvest

## Outcome

Land recording and correct kind labelling before the run; defer the harvest. Recording must exist at the time of the run or the money buys no replayable material, so it cannot follow the run. The harvest can run afterwards from the records the run leaves behind, so it does not gate anything and is filed rather than built. Correct labelling is inside the criterion, not above it: a record labelled implement for a ci-fix dispatch is not a record of a ci-fix. The Remediate-phase diagnose dispatch is a real fifth gap but sits above the stated four and is filed.
