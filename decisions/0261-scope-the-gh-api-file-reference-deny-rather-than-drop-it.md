---
Status: accepted
Date: 2026-08-06T16:46:20.846Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0261. Scope the gh api file-reference deny to the pull-request surface rather than drop it

## Context

The clause `ghapi &amp;&amp; ghfileref` denied any `gh api` call carrying `-f key=@file` with the PR-centralization reason and no endpoint check at all, so `gh api -f body=@notes.md /repos/o/r/issues` was refused for creating a pull request it does not create. Dropping the clause looked correct on paper, since ghfileref is a subset of postish and the neighbouring `pullsep + postish` clause would appear to subsume it. The implementer measured otherwise: pullsep is boundary-anchored and does not match `repos/o/r/pulls/12/comments`, so dropping it (or scoping it with pullsep) would have downgraded two existing fixtures — @file forms on pulls/N/comments and pulls/N/reviews — from deny to a G5 ask.

## Options

- Drop the clause — clean, but releases two measured @file forms on the pull-request surface from deny to ask
- Scope it with the existing boundary-anchored pullsep — same release, because pullsep does not match the sub-resource paths
- Scope it with a new unanchored pulls-base match — keeps the sub-resource forms denying and lets the issues endpoint out

## Outcome

Scoped with a new pulls-base match derived from the existing endpoint regexes. The three must-deny forms were re-probed and still deny; the issues-endpoint form is silent. One existing fixture was deleted rather than weakened, because it asserted the false positive itself. The incidental /etc/passwd coverage that scoping dropped was restored at the correct layer as a G5 ask, not left as a G3 deny naming the wrong goal.
