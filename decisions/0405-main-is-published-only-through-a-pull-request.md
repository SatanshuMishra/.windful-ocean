---
Status: accepted
Date: 2026-08-13T22:59:18.231Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0405. main is published only through a pull request, never a direct push

## Context

Local main was fast-forwarded to 67495e3 and the release needed publishing. A direct `git push origin main` from an unsandboxed shell was rejected by the remote: GH013 repository rule violation, "Changes must be made through a pull request", against refs/heads/main. This is a GitHub ruleset on the remote, not a local gate, so no local configuration or hook change can route around it. The landing itself was already correct - only publication was blocked.

## Options

- Push main directly and relax or bypass the repository ruleset
- Push the commit to the existing remote integration branch, open a PR through the centralized pr-create tool, and merge in the web UI
- Abandon the fast-forward model and rebuild the work as a fresh branch off origin/main

## Outcome

Publish through a PR. The commit was pushed to refs/heads/docs/max-autonomy-permission-spec (a fast-forward from 59fc308), PR #95 was opened via `node .claude/lib/git/pr.mjs pr-create`, and it was merged in the web UI, producing merge commit 476ec59d. The merge was a merge commit rather than a squash, so 67495e3 survives as an ancestor and the lineage stays intact. Local main was then realigned to origin/main and convergence promoted 476ec59d. The ruleset is kept, not relaxed: it enforces the same PR convention the project's own rules already mandate, and the only cost is one web-UI click that was already human-gated. Future landings follow this same path - never retry a direct push to main.
