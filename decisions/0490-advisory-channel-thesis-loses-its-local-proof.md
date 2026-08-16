---
Status: accepted
Date: 2026-08-16T23:50:16.590Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0490. The zero-compliance measurement was an instrumentation artifact; re-ground the channel thesis on documentation

## Context

The report's central architectural thesis - that obligations placed in rules files (the advisory channel) are not reliably obeyed, so load-bearing rules must move into each agent's body (the binding channel) - rested on one local measurement: the CAPABILITY-BLOCKED marker was recorded as emitted zero times across the telemetry corpus. Round 4 falsified it. At least 32 genuine emissions exist in the transcript corpus, spanning 2026-07-10 to 2026-08-16 across three or more projects, while the event ledger contains zero for all history. Zero of the 15 agent bodies carry the obligation; it lives only at .claude/rules/common/agent-roster.md:19-20, so every one of those 32 emissions came purely from the advisory channel. Three stacked detector defects explain the gap: the SubagentStop hook reads the parent's flat session transcript rather than the dedicated subagents/agent-ID.jsonl where the emission actually lives (dominant, accounts for all 32 alone); queued dispatch relays content as a plain string, tripping an Array.isArray guard at agent-run-analyzer.mjs:60; and the regex at agent-run-analyzer.mjs:63 breaks on any multi-word tool description, which would still lose 9 of the 32. Separately, the figure 15,573 was used as a compliance denominator in eight places when it counts all runs rather than blocked runs, ~76% of those rows are byte-identical re-scans, and a better proxy (177 subagent permission denials) is two orders of magnitude smaller.

## Options

- Keep citing the telemetry as proof of zero compliance - rejected, it is falsified
- Abandon the binding-channel thesis because its local proof failed - rejected, the documentary basis is independent and still holds
- Keep the thesis and the decisions it drove, re-ground the justification on Anthropic's documentation, and publish the counterexample

## Outcome

The thesis and the decisions it drove (0470, 0481, and report Decision 11 - load-bearing rules and the answer-format standard go in agent bodies) STAND, but their stated justification changes from "measured at zero compliance in this repository" to "documented by Anthropic as carrying no guarantee of compliance, and cheap to strengthen." Confidence drops accordingly and the counterexample is published rather than buried: an advisory-channel obligation produced compliance at least 32 times with zero reinforcement in any agent body. The compliance RATE remains unknown - the silent-non-compliance population was never established - so the report must not overcorrect into claiming the advisory channel works well. Two further consequences. First, section 11's observer rebuild gains a concrete verified failure mechanism it previously lacked: the observer reads the wrong file, and the new design must read the dedicated subagent transcript and handle both string and array content shapes or it inherits the same blindness. Second, the three-defect bug in agent-run-analyzer.mjs is FILED, NOT FIXED - this cycle's scope constraint forbids editing any agent, rule, hook or skill file.
