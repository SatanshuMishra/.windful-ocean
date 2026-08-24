---
Status: accepted
Date: 2026-08-24T07:07:51.200Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0708. U2 reuses the existing empty private repository instead of creating one

## Context

Precondition P6 asserts the target repository name is free, measured 2026-08-23 when gh repo view SatanshuMishra/mitosis did not resolve. It now resolves: created 2026-08-24T04:31:01Z, PRIVATE, isEmpty true, no default branch ref. U2 step 1 as written runs gh repo create, which would fail against an existing name.

## Options

- Delete the empty repository so U2 step 1 can create it exactly as written
- Reuse the existing empty private repository and skip U2 step 1's create
- Create the repository under a different name

## Outcome

Reuse it. The repository is empty, private and correctly named, so it already satisfies everything U2 step 1 exists to produce, and deleting it to recreate it buys nothing while spending a destructive operation. U2 step 1's gh repo create is skipped; every later step of U2 is unchanged, and publication remains U16's alone. P6 as written can no longer be true, so it is superseded by this record. The SPEC and the PLAN are frozen and neither file is edited.
