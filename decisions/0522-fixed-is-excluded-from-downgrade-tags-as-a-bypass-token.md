---
Status: accepted
Date: 2026-08-17T15:34:30.471Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0522. The fixed tag is excluded from downgrade_tags because the enforcer treats it as a body-wide bypass token

## Context

The global receipts rule instructs that claim.downgrade_tags be set to the four ladder tags, which reads as fixed, unverified-reasoned, speculative and reverted. Configuring the disposable substrate repo surfaced that the enforcer does not treat this array as a status vocabulary. verify.js:567-569 builds a case-insensitive regex per entry and tests it against the ENTIRE pull request body, and any single match emits PASS with the receipt requirement satisfied. Since fixed is the ladder's non-downgrade status and an extremely common English word in a pull request body, including it would let almost any body bypass the receipt demand that require_receipt_for any-source-change exists to impose.

## Options

- Configure literal four-tag parity with the rule's wording, accepting that fixed becomes a bypass token
- Configure the three genuine downgrade tags and file the discrepancy as a proposed gap against the standard
- Rewrite the global rule locally to match what the enforcer does

## Outcome

The substrate configures three tags, unverified-reasoned, speculative and reverted, and omits fixed. The discrepancy is filed as a PROPOSED gap against receipts/gates@1.1 rather than fixed by editing the standard, because the closed-set rule reserves the gate set to the user and forbids an agent promoting a finding into a verification mandate. The rule's wording and the enforcer's implementation genuinely disagree here, and the enforcer is what runs, so the safe reading wins in configuration while the wording question goes upstream.
