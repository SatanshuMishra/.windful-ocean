---
Status: accepted
Date: 2026-07-30T23:48:58.768Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0138. The invariant-coverage gate binds only a PR whose head carries it, forcing a merge order

## Context

Wave 0 landed the invariant registry, the coverage-census script and the CI job on its own branch feat/invariant-coverage-gate off origin/main. GitHub runs a pull_request workflow from the PR HEAD, so a branch that does not carry the workflow file is not gated by it. feat/workflow-sandbox-harness was cut before Wave 0 existed and does not carry it.

## Options

- Merge the Wave 0 gate first, then merge main into the sandbox branch so its PR is gated
- Open both PRs now and accept that the sandbox PR is ungated by the census
- Duplicate the gate artifacts onto the sandbox branch so both PRs carry it independently

## Outcome

Merge order is load-bearing and must be honored: feat/invariant-coverage-gate merges FIRST, then origin/main merges into feat/workflow-sandbox-harness, which then adds its own coverage entry under docs/invariants/coverage/. Opening the sandbox PR before the gate lands produces a PR the census cannot gate - precisely the false assurance M1 exists to prevent. No PR was opened this session; three branches are pushed and unproposed (docs/two-track-invariant-plan @ 987aa105, feat/invariant-coverage-gate @ 7eea60d, feat/workflow-sandbox-harness @ 3e59d05). The repo is public, so publication needs an explicit go; the user's "proceed as recommended in the fresh session" directed the recommended sequence to the next session but did not separately authorize publishing - confirm once, cheaply, before opening.
