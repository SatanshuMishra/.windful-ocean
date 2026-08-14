---
Status: accepted
Date: 2026-08-14T18:56:59.025Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0425. ci-fact-extract lands in C4c rather than by amending C2's shipped branch

## Context

Run 3 established that a tenth judgment kind, ci-fact-extract, is required: receipts.yml emits no JUnit, JSON or artifact, so ship and ci-publish have prose-only inputs. This makes SPEC 2.3 ten kinds and leaves C2's shipped prompt registry needing a thirteenth prose body. C2's PR #102 was open and unmerged, so its branch could still take a commit.

## Options

- Amend C2's branch with the thirteenth body - rejected: forces a rebase of C3 and every C4 branch, and makes PR #102's immutable body false
- Land it in C4c - chosen
- Defer it to C7 - rejected: C7 is already being drained rather than loaded

## Outcome

ci-fact-extract lands in C4c. Amending C2 would have forced a rebase of C3 and every C4 branch beneath it, and PR #102's body already states twelve prose bodies as a measured figure. A PR title and body are fixed at creation and never rewritten, so amending the branch would leave the record asserting something the branch no longer does. An immutable record must not be made false by a later commit; the work moves instead.
