---
Status: accepted
Date: 2026-08-23T06:12:43.029Z
Thread-Id: 01M0PHEKE1VMK3NREETGWVG57Z
---

# 0678. A scanner config ships as a tracked downgrade, because no honest in-suite test exists for it

## Context

The enforcer blocked the scanner-config pull request for carrying no acceptance test, because the project sets the receipt requirement to any source change, which the standard itself mandates. The testing rules exempt configuration from needing a test, so both rules behaved correctly and disagreed. No honest acceptance test is available either: proving a scanner configuration works means running the scanner, which means fetching a binary inside a test and breaking the determinism and no-network rules, while asserting the configuration file's own contents would be a change-detector proving nothing. The change is nonetheless genuinely verified out of band, by two full-history scans compared at fingerprint level rather than by count, exactly two findings removed and none added, reproduced, plus a positive control confirming a real key planted in the same directory is still caught. The downgrade tag and the receipt command are both read from the pull request body, and a body is never edited after creation, so the existing pull request could not be rescued in place.

## Options

- Manufacture an in-suite test that fetches and runs the scanner binary.
- Relax the project's receipt requirement so configuration changes are exempt.
- Supersede the pull request with one tagged unverified-reasoned carrying the out-of-band evidence.
- Abandon the fix and let the false positive recur.

## Outcome

Supersede with a pull request tagged unverified-reasoned whose body states what was proven instead, so the downgrade is legible rather than a black box. The ladder exists for exactly this: a gate that cannot be cleared yields a tracked status, never another review round and never a silent pass. Manufacturing the test was rejected because it buys a green gate by making the suite slower, network-dependent and flaky, which trades a higher pillar for a lower one. Relaxing the receipt requirement was rejected outright because the standard names that setting as required and an agent may propose a gap but never legislate one. Abandoning the fix was rejected because the trunk's current green is only the incremental scanner having lost sight of the commit, and the next recorded run reproduces the finding. Two consequences are accepted and must be reported as such: the resulting enforcer pass is a downgrade pass that short-circuits the re-run gates rather than a cleared gate, and the collision between the blanket receipt requirement and the configuration exemption is filed as a gap against the standard for the human to rule on.
