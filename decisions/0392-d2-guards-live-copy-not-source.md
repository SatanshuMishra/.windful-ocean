---
Status: accepted
Date: 2026-08-13T18:20:35.579Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0392. D2 guards the live installed copy, not version-controlled source

## Context

SPEC step 0 narrows protect-claude-config.sh to "the gate implementation and the deny list only" and converts ask to deny. D2 independently guards "edits to the gate implementation and the deny list". The SPEC never says whether that means the repo source or the live installed copy, though it establishes the two are distinct files (M6: repo and live block-destructive-bash.sh differ by inode). Read as repo paths, the guard denies building and then maintaining the gate itself - the same self-blocking trap step 0 exists to escape, one level down.

## Options

- Guard the live copy only: ~/.claude/current, ~/.claude/releases and the live settings deny list
- Guard repo source too, landing the clamp as the final merge after the gate is built
- Delete protect-claude-config.sh and implement D2 purely as deny rules on live paths

## Outcome

Guard the live copy only. Repo source under .claude/ stays freely editable, because disarming a control means changing what RUNS, and git history plus PR review already make source edits reviewable and revertible. The delivery path is explicit and is part of this decision: changes land on a branch, open a PR, merge into main, and reach live only through the release and promotion pipeline. The gate therefore stays buildable and maintainable while runtime disarming stays blocked, and the promotion pipeline becomes a first-class deliverable rather than an assumption - a change that merges but never promotes has not shipped.
