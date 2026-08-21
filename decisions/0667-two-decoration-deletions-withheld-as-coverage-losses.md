---
Status: accepted
Date: 2026-08-21T22:29:17.683Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0667. Two decoration deletions are withheld because they are the only bar on a billed spawn

## Context

M6's census classified 130 test files and found three decorations. Two of them, dispatch-binding-guard and e2e-sandbox-dispatch, hold the suite's only two independent defences against a test call site forgetting to bind a fake dispatcher and silently spawning the real billable binary, since cli.mjs falls back to the real dispatcher when deps.dispatch is omitted. The MSP's own guard states that a deletion leaving a real behaviour uncovered is a coverage loss to be reported, not performed.

## Options

- Delete all three to satisfy the acceptance clause literally
- Delete only the one whose behaviour is independently covered and report the other two

## Outcome

Deleted only retry.test.mjs, whose module has zero importers and whose named behaviour is asserted against the live implementation in saga.test.mjs. The other two are recorded on the honesty ladder as reverted, with the coverage they hold named. Separately, the acceptance clause's literal command node --test over a directory exits 1 before reaching any test on Node v26.4.0 here, recorded as unverified-reasoned with the repository's own glob form substituted and green.
