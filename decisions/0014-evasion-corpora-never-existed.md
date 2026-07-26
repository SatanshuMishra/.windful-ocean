---
Status: accepted
Date: 2026-07-26T21:18:21.896Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0014. The 12-evasion and 41-command corpora are planning targets, not existing artifacts

## Context

Predecessor decision 0011 and this thread's criterion 2 both speak of "the 12 verified evasions" and "the 41-command read-only corpus" as if they were committed fixtures. A full sweep of continuity-ledger-plugin found neither. The only guard test file is test/unit/hooks/pre-tool-use.test.mjs - 23 test blocks, 51 assert.equal calls, scenario-grouped rather than table-driven, and no shell-tokens.test.mjs exists at all. The nearest textual match in the ledger archive is a findings doc for a DIFFERENT guard (windful-ocean's .claude/hooks/block-destructive-bash.sh), which is unrelated to the ledger-store guard.

## Options

- Treat the two counts as satisfied by whatever tests already exist - rejected: nothing in the repo asserts those cases, so the criterion would be met on paper and not in fact
- Silently substitute new corpora and report the criterion met at 12 and 41 - rejected: it manufactures provenance for numbers that never had a basis
- Build both corpora as real table-driven fixtures, treat 12 and 41 as coverage floors rather than provenance, and report measured counts honestly - adopted

## Outcome

Both corpora will be authored fresh as table-driven fixtures. The numbers 12 and 41 are treated as minimum coverage floors, not as references to prior artifacts. Whatever counts land will be reported as measured, with an explicit note that the predecessor's figures were unbacked. Criterion 2 is read as "both directions proven by committed tests covering at least those cases", not as "locate and re-run two pre-existing files". Separately: the existing 51 assertions encode the old allow-unless-destructive direction and will need their expected verdicts rewritten, not merely extended.
