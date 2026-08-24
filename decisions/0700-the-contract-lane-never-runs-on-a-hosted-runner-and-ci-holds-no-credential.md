---
Status: accepted
Date: 2026-08-24T04:02:59.480Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0700. The contract lane runs locally on the subscription and CI verifies only freshness and the committed diff

## Context

This supersedes decision 0696. That record planned to put two credentials into repository secrets and settle the hosted-runner question by dispatching the workflow once. Under the ruling that no spend may occur outside the subscription there is no credential to place: subscription authentication reads the local keychain, which a hosted runner does not have, and the minimal CLI mode that would accept a key is unavailable because no key exists. The open question the extraction SPEC raised about whether a hosted runner can authenticate the CLI is therefore not answered by experiment; it is removed, because the only authentication path available is machine-local.

## Options

- Place credentials in repository secrets and test a hosted runner
- Run captures locally on the subscription, commit the fixtures, and have continuous integration verify only fixture freshness and the committed diff
- Drop the contract lane

## Outcome

Option 2, by force rather than by preference. The contract workflow never invokes the model and needs no secret. Its authority is unaffected: it was always the freshness check in the replay lane that enforced a capture had happened, not the location of the capture. Two consequences are net gains. No credential exists in a repository that becomes public, so the secret-exposure question disappears instead of being mitigated, and one risk row and one open decision leave the plan entirely. The billed workflow keeps its explicit confirmation input, reworded so it names plan usage rather than money, since no dollar figure in this work represents a charge.
