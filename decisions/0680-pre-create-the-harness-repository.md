---
Status: accepted
Date: 2026-08-23T17:44:05.618Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0680. Pre-create the harness repository instead of granting repository-creation rights

## Context

The live lane's only failure in CI run 32654935845 was creating its own repository: the token was refused createRepository. Two corrections to the prior understanding came out of reading the code. First, the harness provisioning function early-returns when it can already see the repository, so creation is reached only on a first run. Second, the live token is NOT absent as the ledger recorded; the secret exists on the repository, reached the runner, and the workflow's policy step resolved the live mode. Twelve of the thirteen tests passed and only the live test failed.

## Options

- Mint a token carrying Administration write so the lane can create its own repository each time
- Create the harness repository once by hand, initialized with a README, and grant the existing token access to it
- Make the repository name configurable and point the lane at a repository that already exists

## Outcome

Create it once, private, README-initialized, carrying the sentinel description byte-for-byte. The README is functional rather than cosmetic: it makes the default branch exist, which sends the harness down its already-seeded path, so it never pushes the fixture's workflow files and the token never needs Workflows write. The required permissions collapse to Contents write, Pull requests write and Metadata read, with Administration dropped entirely. Repository-creation rights are rejected as strictly more dangerous for no gain, since the creation branch is unreachable once the repository exists. Making the name configurable is rejected as an engine change that buys nothing here — the name is a module constant and the sentinel check, not the name, is what guards the repository.
