---
Status: accepted
Date: 2026-08-23T17:59:26.861Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0683. The repeated creation error now means token visibility, not a missing repository

## Context

The harness repository was created on 2026-08-23, verified private, carrying a default branch and a description matching the source sentinel exactly at 147 characters. The live lane was then re-triggered as CI run 32656517961 and failed with a byte-identical message to the previous run: could not create the repository, resource not accessible by personal access token. Twelve tests passed and only the live test failed, as before. The code explains the collision: the function that looks the repository up returns the same empty result when the repository does not exist and when the caller's token cannot see it, so an unauthorized token falls straight into the creation branch and dies there. The repository is confirmed present, so the only surviving explanation is that the credential carried by CI cannot see it.

## Options

- Read the identical error as evidence the repository was never really created and create it again
- Read it as a token-visibility failure and grant the existing credential access to the repository
- Point the credential at a repository it can already see by making the repository name configurable

## Outcome

Read it as visibility. The repository's existence is directly verified, so a second creation attempt would be chasing a phantom. The remaining blocker is a single human action that no API can perform: the credential stored as the live token must be granted access to the harness repository, with contents read and write, pull requests read and write, and metadata read. Administration is deliberately not required, because the creation branch is now unreachable. Making the name configurable is rejected again as an engine change that buys nothing, since the sentinel description rather than the name is what guards the repository. Recorded because the identical wording across two runs with two different causes is exactly the trap that sends a fresh session to re-create a repository that is already there.
