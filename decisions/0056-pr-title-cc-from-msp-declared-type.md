---
Status: accepted
Date: 2026-07-28T03:18:32.711Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0056. PR titles use Conventional Commits with an MSP-declared change type

## Context

The engine titled PRs "mitosis: <id>", which fails the Conventional-Commits PR-title lint the engine itself deploys to target repos via receipts.yml — a latent defect, since "mitosis" is not in the allowed type list. GitHub squash-merge seeds the squash commit subject from the PR title, so the title is load-bearing beyond the PR page.

## Options

- Keep the mitosis: prefix and loosen the CI lint to accept it
- Derive the change type automatically from the changed file paths
- Have the MSP declare its own change type at decomposition time

## Outcome

The MSP declares type and scope at decomposition; the tool validates and FAILS CLOSED on a missing or invalid type rather than guessing one. Chosen because the decomposer already knows what kind of change it is planning, making the declaration explicit rather than inferred. Resolves the latent lint defect in the same stroke.
