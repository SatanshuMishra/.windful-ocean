---
Status: accepted
Date: 2026-08-17T05:32:46.120Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0504. The G11 live tripwire is disabled here; the enforcer gate stays armed

## Context

An implementer was refused permission to add an assertion to tests/phase-model.test.mjs by the receipts plugin's PreToolUse G11 live tripwire (pre-gates.mjs:205-241), which claimed a test there had been seen failing with no passing run since. It ran the file green, 4 of 4, and the guard still blocked. Diagnosis established three compounding defects. First, the tripwire keys on a fail token and a filename co-occurring on one PHYSICAL line of any tool result, and this session's own logbook preflight briefing arrives as a single 14384-character JSON line on which the word FAILED, describing a ledger thread, sits 2575 characters from a refs pointer naming that test file. Second, the clearing path requires the filename on the same line as a pass token, but node --test names a file only in failure stack traces, so no green under this repo's runner can ever clear it; the same red and edit ALLOW under jest-shaped green and DENY under real node --test green, proven through the hook binary. Third, it cannot distinguish adding an assertion from weakening one, so both escapes it offers require a false statement: test-removal claims a removal that did not happen, and RECEIPTS_ACK demands a reason the test is wrong when it is not. The blob is also poisoning dead-export-lint.test.mjs and dispatch.test.mjs. Eleven remaining MSPs each add or update tests.

## Options

- Leave it armed and let each MSP create a new test file rather than updating the natural one
- Disable the live tripwire in this repository's receipts.config.json
- Patch pre-gates.mjs upstream before continuing the stack
- Use one of the in-band escapes

## Outcome

The user ruled DISABLE. receipts.config.json gains agent.tripwires.g11_live off, read at pre-gates.mjs:100-104 and honored at :304-305. This is a configuration decision and therefore costs no honesty, unlike the two in-band escapes. The distinction that makes it safe: this PreToolUse tripwire is a pre-edit heuristic and is NOT the G11 gate itself. The receipts ENFORCER re-runs G11 at the pull request with gates.G11.mode block, so deleted, skipped and focused tests are still caught at the gate that actually governs. Nothing about the verification standard changes; a broken heuristic in front of it is switched off. The in-band escapes are recorded as unusable for an additive edit, which is a finding against the plugin rather than a failure of the agent that refused them. The plugin defect is filed separately: the minimal upstream fix is to allow a strictly additive edit, where new_string contains old_string and so cannot be a weakening, plus a proximity requirement between the fail token and the filename. Note that neither upstream fix would help a subagent anyway, because the hook reads the parent session transcript in which a subagent's test run never appears.
