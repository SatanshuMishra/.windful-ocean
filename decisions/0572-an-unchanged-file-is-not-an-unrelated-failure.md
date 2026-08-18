---
Status: accepted
Date: 2026-08-18T16:21:51.797Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0572. An unchanged file is not an unrelated failure, and the token census derives from the gate verbs

## Context

Pull request 211 had one failing test after the parallel-twin fix landed. Two agents in a row classified ci-escalation.test.mjs:92 as pre-existing and unrelated to wave 6, both reasoning from the same evidence: git diff over the wave-6 range shows neither ci-escalation.mjs nor its test was touched. The second agent went further and filed it above its ceiling as someone else's defect, which would have shipped wave 6 with a red suite and a written justification for why that was acceptable. The reasoning is true about the files and wrong about causation. ci-escalation.test.mjs:41-53 parses the verb matrix out of the live .github/workflows/receipts.yml, :67 turns each verb into a check name, and :92-104 asserts every derived leg name classifies as enforcer configuration - which requires CI_ENFORCER_CHECK_TOKENS at ci-escalation.mjs:12 to hold a matching token. U6.2 wired retirement-census into that matrix, so a sixth leg name came into existence that the hardcoded ten-token list did not carry. The test job was green on main at c8c4cad0, 94eaf17f and 639702a1, which settles it: the file was unchanged and the failure was caused.

## Options

- Rule it wave 6's break and fix it in wave 6, deriving the tokens from MITOSIS_GATE_VERBS
- Rule it wave 6's break and append the literal string retirement-census
- Accept the pre-existing classification and merge with a red suite
- File it as a separate item and merge, noting the red suite in the pull request

## Outcome

Ruled wave 6's break and fixed in wave 6 as 7c40edf3. A failure is attributed by causation, never by whether the failing file appears in the diff: a test that derives its expectations from another file inherits that file's changes without being edited. The fix DERIVES the gate-verb tokens by spreading MITOSIS_GATE_VERBS rather than appending a literal, adopted only after tracing the full 14-file transitive import closure of mitosis-gate.mjs to prove no cycle back to ci-escalation.mjs. That closes the class rather than the instance, and satisfies the project rule that a gate classifying tokens is a closed census rather than a hand-maintained allowlist - this drift is exactly what that rule exists to prevent. Appending the literal was the acceptable fallback and would already have been gated, since the test derives from the live workflow and caught this drift unaided. The two rejected options both rested on the same misattribution. Durable rule: when a child reports a failure as out of scope, check whether the scope claim rests on file identity rather than on causation, because that is the shape this error takes.
