---
Status: accepted
Date: 2026-07-28T04:35:48.548Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0064. Live end-to-end PR verification is waived; criterion 5 closes on static evidence

## Context

Criterion 5 required the new PR path be "verified LIVE end to end AND every old PR-creation implementation verified removed". The removal half was verified statically on 2026-07-28: the only ['pr','create',...] argv construction is inside the centralized tool at mitosis-git.mjs:281; all three PR-opening paths in mitosis.js (3030, 4122, 4655) shell out to `mitosis-git.mjs pr-create`; every --body-line and `mitosis: ` title-prefix match is a regression test asserting removal rather than residual code; mitosis.js sanitizeStage is resume-point handling, unrelated to PR body composition. The LIVE half was never performed. It cannot be performed without opening a real pull request, which this thread's own out_of_scope forbids - so the criterion as written was unsatisfiable, and the Definition-of-Done gate refused the close, correctly. Completion criteria are the human's to define; the gate exists to stop the agent closing silently, not to stop the owner ruling.

## Options

- Authorize one real PR through mitosis-git.mjs pr-create to obtain the live proof, then close on complete evidence
- Waive the live half and close criterion 5 on the static verification, deferring live proof to the first genuine PR opened through the path
- Split the live proof into a successor thread and close this one, keeping the outstanding work visible in the roster

## Outcome

Waived by explicit user instruction on 2026-07-28 after the contradiction and all three options were presented. Criterion 5 is marked done on the static evidence ALONE. Recorded plainly so no future reader mistakes this for a completed live test: the new PR path has NEVER been exercised end to end against a real repository. The first PR opened through `node .claude/lib/superpowers-parallel/mitosis-git.mjs pr-create` is therefore still the first live exercise of this code, and should be treated as such - watch it rather than assume it. Everything proven about the gate to date is static or session-level: the deny names were pinned by diffing the endpoint tools/list (47) against the exposed session toolset (43), and the hook suites are green at 1415 passing.
