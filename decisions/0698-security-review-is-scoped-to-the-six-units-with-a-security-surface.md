---
Status: accepted
Date: 2026-08-24T03:44:25.839Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0698. Security review runs on six of twenty-two units, not on all of them

## Context

Every unit of the extraction gets a code review. The open question was whether a security review runs alongside it everywhere or only where there is something to threat-model. This had to be pinned before work started, because it changes the dispatch brief for every unit and the acceptance bar cannot be renegotiated mid-run.

## Options

- Security review on the six units with an actual security surface
- Security review on all twenty-two units

## Outcome

Option 1. The six are secret scanning and the leak allowlist, the import itself deciding what crosses into a soon-to-be-public tree, the replay driver whose path handling is replaced rather than prepended and which carries the stub-identity guard, plugin loading, the duplicated execution allowlist and merge deny, and publication. The remaining sixteen are a test runner, a manifest schema, a freshness check and similar, with nothing for a threat model to bite on. The cost of the wider option is not tokens but noise: a reviewer dispatched where there is nothing to find returns speculative findings, and speculative findings generate fix rounds, which is the failure this plan is shaped to avoid.
